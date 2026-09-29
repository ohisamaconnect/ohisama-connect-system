/**
 * OC-OS INBOX M02813 Manual Conflict Cleanup - Stage B / GUARDED COMMIT
 * 2026-09-29
 *
 * Purpose:
 *   Commit the already-staged M02813 manual conflict cleanup plan.
 *
 * Approved proposal represented by Stage B:
 *   KEEP current corrected     = INB3236
 *   KEEP old revision history = INB3210
 *   ARCHIVE only               = INB2944
 *
 * Safety:
 *   - preview function is READ ONLY
 *   - commit requires an existing Stage B snapshot
 *   - Stage hash is recomputed and must match
 *   - live M02813 three-row state must exactly match the staged snapshot
 *   - only archiveCandidate is PATCHed with { in_trash: true }
 *   - keeper rows are never PATCHed
 *   - Decision / Event / Source / Status / Suggested_* are never modified
 *
 * Dependencies:
 *   oc_os_inbox_manual_conflict_m02813_stage_b_stage_only.gs
 *   ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 */

function previewM02813ManualConflictStageBCommit() {
  const check = validateM02813StageBCommitState_();

  console.log('========================================');
  console.log('OC-OS INBOX M02813 MANUAL CONFLICT CLEANUP - STAGE B COMMIT PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(`STAGED_AT = ${check.stage.stagedAt || '-'}`);
  console.log(`STAGE_HASH = ${check.stage.stageHash}`);
  console.log(`STAGE_HASH_VALID = ${check.hashValid ? 'PASS' : 'FAIL'}`);
  console.log(`LIVE_STATE_MATCHES_STAGE = ${check.liveMatches ? 'PASS' : 'FAIL'}`);
  console.log(`KEEP CURRENT = ${check.stage.keepCurrent.inboxId} | ${check.stage.keepCurrent.pageId}`);
  console.log(`KEEP OLD REVISION = ${check.stage.keepOldRevision.inboxId} | ${check.stage.keepOldRevision.pageId}`);
  console.log(`ARCHIVE ONLY = ${check.stage.archiveCandidate.inboxId} | ${check.stage.archiveCandidate.pageId}`);
  console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
  console.log(`RESULT = ${check.hashValid && check.liveMatches ? 'SAFE TO COMMIT AFTER EXPLICIT HUMAN APPROVAL' : 'BLOCKED'}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function commitM02813ManualConflictStageB() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; M02813 Stage B commit skipped.');
    return;
  }

  try {
    const check = validateM02813StageBCommitState_();
    if (!check.hashValid) throw new Error('Stage hash mismatch. Commit aborted.');
    if (!check.liveMatches) throw new Error('Live M02813 state differs from Stage B. Commit aborted.');

    console.log('========================================');
    console.log('OC-OS INBOX M02813 MANUAL CONFLICT CLEANUP - STAGE B COMMIT');
    console.log(`STAGE_HASH = ${check.stage.stageHash}`);
    console.log('WRITE = ARCHIVE ONE INBOX ROW ONLY');
    console.log(`KEEP CURRENT = ${check.stage.keepCurrent.inboxId} | ${check.stage.keepCurrent.pageId}`);
    console.log(`KEEP OLD REVISION = ${check.stage.keepOldRevision.inboxId} | ${check.stage.keepOldRevision.pageId}`);
    console.log(`ARCHIVE TARGET = ${check.stage.archiveCandidate.inboxId} | ${check.stage.archiveCandidate.pageId}`);
    console.log('========================================');

    // Final immediate guard on the archive target.
    const targetPage = notionRequest_(
      `/v1/pages/${check.stage.archiveCandidate.pageId}`,
      'get'
    );
    if (!targetPage || !targetPage.id) {
      throw new Error('Archive target page could not be reloaded. Commit aborted.');
    }
    if (targetPage.in_trash || targetPage.archived) {
      throw new Error('Archive target is already trashed/archived. Commit aborted.');
    }

    const targetCurrent = rowFromM02813CommitPage_(targetPage);
    const targetStaged = check.stage.archiveCandidate;
    if (JSON.stringify(targetCurrent) !== JSON.stringify(targetStaged)) {
      throw new Error('Archive target changed after validation. Commit aborted.');
    }

    const result = notionRequest_(
      `/v1/pages/${check.stage.archiveCandidate.pageId}`,
      'patch',
      { in_trash: true }
    );

    if (!result || !result.id || !(result.in_trash || result.archived)) {
      throw new Error('Notion did not confirm archive state.');
    }

    // Verify keepers are still present and not trashed. No write is performed.
    const keepCurrentPage = notionRequest_(
      `/v1/pages/${check.stage.keepCurrent.pageId}`,
      'get'
    );
    const keepOldPage = notionRequest_(
      `/v1/pages/${check.stage.keepOldRevision.pageId}`,
      'get'
    );

    if (!keepCurrentPage || keepCurrentPage.in_trash || keepCurrentPage.archived) {
      throw new Error('Post-commit verification failed: current corrected keeper is unavailable/trashed.');
    }
    if (!keepOldPage || keepOldPage.in_trash || keepOldPage.archived) {
      throw new Error('Post-commit verification failed: old revision keeper is unavailable/trashed.');
    }

    const committedStage = Object.assign({}, check.stage, {
      committedAt: nowJstIso_(),
      committedArchiveInboxId: check.stage.archiveCandidate.inboxId,
      committedArchivePageId: check.stage.archiveCandidate.pageId
    });
    PropertiesService.getScriptProperties().setProperty(
      OCOS_M02813_STAGE_B.PROPERTY_KEY,
      JSON.stringify(committedStage)
    );

    console.log(`[ARCHIVED] ${check.stage.archiveCandidate.inboxId} | ${check.stage.archiveCandidate.pageId}`);
    console.log(`[KEEP VERIFIED] ${check.stage.keepCurrent.inboxId}`);
    console.log(`[KEEP VERIFIED] ${check.stage.keepOldRevision.inboxId}`);
    console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
    console.log('COMMIT COMPLETE');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function validateM02813StageBCommitState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    OCOS_M02813_STAGE_B.PROPERTY_KEY
  );
  if (!raw) throw new Error('No M02813 Stage B snapshot stored.');

  const stage = JSON.parse(raw);
  if (stage.version !== OCOS_M02813_STAGE_B.VERSION) {
    throw new Error(`Unexpected Stage B version: ${stage.version}`);
  }

  const expectedHash = sha256M02813StageB_(JSON.stringify({
    stableKey: stage.stableKey,
    keepCurrent: stage.keepCurrent,
    keepOldRevision: stage.keepOldRevision,
    archiveCandidate: stage.archiveCandidate
  }));
  const hashValid = expectedHash === stage.stageHash;

  const plan = buildM02813StageBPlan_();
  assertM02813StageBPlan_(plan);

  const live = {
    stableKey: plan.stableKey,
    keepCurrent: minimalM02813StageBRow_(plan.keepCurrent),
    keepOldRevision: minimalM02813StageBRow_(plan.keepOldRevision),
    archiveCandidate: minimalM02813StageBRow_(plan.archiveCandidate)
  };
  const stagedComparable = {
    stableKey: stage.stableKey,
    keepCurrent: stage.keepCurrent,
    keepOldRevision: stage.keepOldRevision,
    archiveCandidate: stage.archiveCandidate
  };

  const liveMatches = JSON.stringify(live) === JSON.stringify(stagedComparable);
  return { stage, hashValid, liveMatches, live };
}

function rowFromM02813CommitPage_(page) {
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
