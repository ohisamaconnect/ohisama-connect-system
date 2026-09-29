/**
 * OC-OS INBOX M02812 Manual Conflict Cleanup - Stage C / GUARDED COMMIT
 * 2026-09-29
 *
 * Purpose:
 *   Commit the already-staged M02812 duplicate cleanup plan.
 *
 * Approved proposal represented by Stage C:
 *   KEEP    INB3212 + canonical EVENT (has DateTime)
 *   ARCHIVE INB1866 + duplicate EVENT (DateTime blank)
 *
 * Safety:
 *   - preview function is READ ONLY
 *   - commit requires an existing Stage C snapshot
 *   - Stage hash is recomputed and must match
 *   - live M02812 INBOX/EVENT state must exactly match the staged snapshot
 *   - duplicate EVENT must be referenced by exactly the archive INBOX among live INBOX rows
 *   - archive order: duplicate INBOX first, then duplicate EVENT
 *   - keeper INBOX/EVENT are never PATCHed
 *   - no Relation/property mutation other than in_trash=true on the two archive targets
 *
 * Dependencies:
 *   oc_os_inbox_manual_conflict_m02812_stage_c_stage_only.gs
 *   oc_os_inbox_manual_conflict_m02812_stage_c_preview.gs
 *   ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 */

function previewM02812ManualConflictStageCCommit() {
  const check = validateM02812StageCCommitState_();

  console.log('========================================');
  console.log('OC-OS INBOX M02812 MANUAL CONFLICT CLEANUP - STAGE C COMMIT PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(`STAGED_AT = ${check.stage.stagedAt || '-'}`);
  console.log(`STAGE_HASH = ${check.stage.stageHash}`);
  console.log(`STAGE_HASH_VALID = ${check.hashValid ? 'PASS' : 'FAIL'}`);
  console.log(`LIVE_STATE_MATCHES_STAGE = ${check.liveMatches ? 'PASS' : 'FAIL'}`);
  console.log(`ARCHIVE_EVENT_LIVE_INBOX_REFERENCES = ${check.archiveEventInboxRefs.length}`);
  console.log(`ARCHIVE_EVENT_REFERENCED_ONLY_BY_ARCHIVE_INBOX = ${check.archiveEventRefSafe ? 'PASS' : 'FAIL'}`);
  console.log('----------------------------------------');
  console.log(`KEEP INBOX = ${check.stage.keepInbox.inboxId} | ${check.stage.keepInbox.pageId}`);
  console.log(`KEEP EVENT = ${check.stage.keepEvent.pageId} | DateTime=${check.stage.keepEvent.dateTime || '-'}`);
  console.log(`ARCHIVE INBOX ONLY = ${check.stage.archiveInbox.inboxId} | ${check.stage.archiveInbox.pageId}`);
  console.log(`ARCHIVE EVENT ONLY = ${check.stage.archiveEvent.pageId} | DateTime=${check.stage.archiveEvent.dateTime || '-'}`);
  console.log('No Relation / property mutation other than archive targets during Commit.');
  const safe = check.hashValid && check.liveMatches && check.archiveEventRefSafe;
  console.log(`RESULT = ${safe ? 'SAFE TO COMMIT AFTER EXPLICIT HUMAN APPROVAL' : 'BLOCKED'}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function commitM02812ManualConflictStageC() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; M02812 Stage C commit skipped.');
    return;
  }

  try {
    const check = validateM02812StageCCommitState_();
    if (!check.hashValid) throw new Error('Stage hash mismatch. Commit aborted.');
    if (!check.liveMatches) throw new Error('Live M02812 state differs from Stage C. Commit aborted.');
    if (!check.archiveEventRefSafe) {
      throw new Error('Duplicate EVENT has unexpected live INBOX references. Commit aborted.');
    }

    console.log('========================================');
    console.log('OC-OS INBOX M02812 MANUAL CONFLICT CLEANUP - STAGE C COMMIT');
    console.log(`STAGE_HASH = ${check.stage.stageHash}`);
    console.log('WRITE = ARCHIVE ONE DUPLICATE INBOX + ONE DUPLICATE EVENT');
    console.log(`KEEP INBOX = ${check.stage.keepInbox.inboxId} | ${check.stage.keepInbox.pageId}`);
    console.log(`KEEP EVENT = ${check.stage.keepEvent.pageId}`);
    console.log(`ARCHIVE INBOX TARGET = ${check.stage.archiveInbox.inboxId} | ${check.stage.archiveInbox.pageId}`);
    console.log(`ARCHIVE EVENT TARGET = ${check.stage.archiveEvent.pageId}`);
    console.log('ARCHIVE ORDER = INBOX -> EVENT');
    console.log('========================================');

    // Immediate pre-write recheck of the two archive targets.
    const archiveInboxPage = notionRequest_(`/v1/pages/${check.stage.archiveInbox.pageId}`, 'get');
    const archiveEventPage = notionRequest_(`/v1/pages/${check.stage.archiveEvent.pageId}`, 'get');

    if (!archiveInboxPage || !archiveInboxPage.id || archiveInboxPage.in_trash || archiveInboxPage.archived) {
      throw new Error('Archive INBOX target unavailable/already archived. Commit aborted.');
    }
    if (!archiveEventPage || !archiveEventPage.id || archiveEventPage.in_trash || archiveEventPage.archived) {
      throw new Error('Archive EVENT target unavailable/already archived. Commit aborted.');
    }

    const currentArchiveInbox = rowFromM02812StageCCommitInboxPage_(archiveInboxPage);
    const currentArchiveEvent = eventFromM02812StageCCommitPage_(archiveEventPage);
    if (JSON.stringify(currentArchiveInbox) !== JSON.stringify(check.stage.archiveInbox)) {
      throw new Error('Archive INBOX target changed after validation. Commit aborted.');
    }
    if (JSON.stringify(currentArchiveEvent) !== JSON.stringify(check.stage.archiveEvent)) {
      throw new Error('Archive EVENT target changed after validation. Commit aborted.');
    }

    // Safer partial-failure order: remove duplicate INBOX from active flow first.
    const inboxResult = notionRequest_(
      `/v1/pages/${check.stage.archiveInbox.pageId}`,
      'patch',
      { in_trash: true }
    );
    if (!inboxResult || !inboxResult.id || !(inboxResult.in_trash || inboxResult.archived)) {
      throw new Error('Notion did not confirm duplicate INBOX archive state.');
    }
    console.log(`[ARCHIVED INBOX] ${check.stage.archiveInbox.inboxId} | ${check.stage.archiveInbox.pageId}`);

    const eventResult = notionRequest_(
      `/v1/pages/${check.stage.archiveEvent.pageId}`,
      'patch',
      { in_trash: true }
    );
    if (!eventResult || !eventResult.id || !(eventResult.in_trash || eventResult.archived)) {
      throw new Error('Notion did not confirm duplicate EVENT archive state. INBOX is already archived; manual review required.');
    }
    console.log(`[ARCHIVED EVENT] ${check.stage.archiveEvent.pageId}`);

    // Keeper verification only; no writes.
    const keepInboxPage = notionRequest_(`/v1/pages/${check.stage.keepInbox.pageId}`, 'get');
    const keepEventPage = notionRequest_(`/v1/pages/${check.stage.keepEvent.pageId}`, 'get');
    if (!keepInboxPage || keepInboxPage.in_trash || keepInboxPage.archived) {
      throw new Error('Post-commit verification failed: keeper INBOX unavailable/trashed.');
    }
    if (!keepEventPage || keepEventPage.in_trash || keepEventPage.archived) {
      throw new Error('Post-commit verification failed: keeper EVENT unavailable/trashed.');
    }

    const keepInboxNow = rowFromM02812StageCCommitInboxPage_(keepInboxPage);
    const keepEventNow = eventFromM02812StageCCommitPage_(keepEventPage);
    if (JSON.stringify(keepInboxNow) !== JSON.stringify(check.stage.keepInbox)) {
      throw new Error('Post-commit verification failed: keeper INBOX changed.');
    }
    if (JSON.stringify(keepEventNow) !== JSON.stringify(check.stage.keepEvent)) {
      throw new Error('Post-commit verification failed: keeper EVENT changed.');
    }

    const committedStage = Object.assign({}, check.stage, {
      committedAt: nowJstIso_(),
      committedArchiveInboxId: check.stage.archiveInbox.inboxId,
      committedArchiveInboxPageId: check.stage.archiveInbox.pageId,
      committedArchiveEventPageId: check.stage.archiveEvent.pageId
    });
    PropertiesService.getScriptProperties().setProperty(
      OCOS_M02812_STAGE_C.PROPERTY_KEY,
      JSON.stringify(committedStage)
    );

    console.log(`[KEEP VERIFIED] ${check.stage.keepInbox.inboxId}`);
    console.log(`[KEEP EVENT VERIFIED] ${check.stage.keepEvent.pageId}`);
    console.log('No keeper Relation / property was modified.');
    console.log('COMMIT COMPLETE');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function validateM02812StageCCommitState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    OCOS_M02812_STAGE_C.PROPERTY_KEY
  );
  if (!raw) throw new Error('No M02812 Stage C snapshot stored.');

  const stage = JSON.parse(raw);
  if (stage.version !== OCOS_M02812_STAGE_C.VERSION) {
    throw new Error(`Unexpected Stage C version: ${stage.version}`);
  }

  const expectedHash = sha256M02812StageC_(JSON.stringify({
    stableKey: stage.stableKey,
    keepInbox: stage.keepInbox,
    archiveInbox: stage.archiveInbox,
    keepEvent: stage.keepEvent,
    archiveEvent: stage.archiveEvent
  }));
  const hashValid = expectedHash === stage.stageHash;

  const plan = buildM02812StageCPlan_();
  assertM02812StageCPlan_(plan);

  const live = {
    stableKey: plan.stableKey,
    keepInbox: minimalM02812StageCInbox_(plan.keepInbox),
    archiveInbox: minimalM02812StageCInbox_(plan.archiveInbox),
    keepEvent: minimalM02812StageCEvent_(plan.keepEvent),
    archiveEvent: minimalM02812StageCEvent_(plan.archiveEvent)
  };
  const stagedComparable = {
    stableKey: stage.stableKey,
    keepInbox: stage.keepInbox,
    archiveInbox: stage.archiveInbox,
    keepEvent: stage.keepEvent,
    archiveEvent: stage.archiveEvent
  };
  const liveMatches = JSON.stringify(live) === JSON.stringify(stagedComparable);

  const archiveEventInboxRefs = findLiveInboxRefsToM02812StageCEvent_(stage.archiveEvent.pageId);
  const archiveEventRefSafe =
    archiveEventInboxRefs.length === 1 &&
    archiveEventInboxRefs[0].pageId === stage.archiveInbox.pageId;

  return {
    stage,
    hashValid,
    liveMatches,
    live,
    archiveEventInboxRefs,
    archiveEventRefSafe
  };
}

function findLiveInboxRefsToM02812StageCEvent_(eventPageId) {
  const refs = [];
  let cursor = null;
  do {
    const body = {
      page_size: 100,
      filter: {
        property: 'Event',
        relation: { contains: eventPageId }
      }
    };
    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );
    (result.results || []).forEach(page => {
      if (page.in_trash || page.archived) return;
      const p = page.properties || {};
      refs.push({
        pageId: page.id || '',
        inboxId: notionUniqueIdV127DC_(p.Inbox_ID),
        title: notionTitleV127DC_(p.Inbox_Title)
      });
    });
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return refs;
}

function rowFromM02812StageCCommitInboxPage_(page) {
  const p = (page && page.properties) || {};
  return {
    pageId: page.id || '',
    inboxId: notionUniqueIdV127DC_(p.Inbox_ID),
    title: notionTitleV127DC_(p.Inbox_Title),
    detectedAt: notionDateStartV127DC_(p.Detected_At),
    decision: notionSelectV127DC_(p.Decision),
    status: notionSelectV127DC_(p.Status),
    eventIds: notionRelationIdsV127DC_(p.Event),
    sourceIds: notionRelationIdsV127DC_(p.Source),
    processedAt: notionDateStartV127DC_(p.Processed_At),
    processorError: notionTextV127DC_(p.Processor_Error) || ''
  };
}

function eventFromM02812StageCCommitPage_(page) {
  const p = (page && page.properties) || {};
  return {
    pageId: page.id || '',
    title: notionTitleV127DC_(p.Event_Title),
    humanStatus: notionSelectV127DC_(p.Human_Status),
    dateTime: notionDateStartV127DC_(p.DateTime) || '',
    sourceIds: notionRelationIdsV127DC_(p.Sources),
    originInboxIds: notionRelationIdsV127DC_(p.Origin_Inbox)
  };
}
