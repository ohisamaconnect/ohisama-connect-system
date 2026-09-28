/**
 * OC-OS INBOX Duplicate Cleanup Stage A v1.2.7 - COMMIT BATCHES
 * 2026-09-28
 *
 * Purpose:
 * - Execute ONLY the previously approved SAFE Stage A duplicate cleanup.
 * - Move duplicate INBOX pages to Notion trash in batches of at most 10.
 * - Re-validate the staged target and keeper immediately before each batch.
 * - Never touch the 2 MANUAL_REVIEW rows.
 *
 * Dependencies in the same Apps Script project:
 * - oc_os_inbox_duplicate_cleanup_stage_a_v1.2.7_stage_only.gs
 * - ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 * - ohisama_inbox_crawler_v1.2.7_production_runner.gs
 * - ohisama_inbox_crawler_v1.2.6
 */

const V127_SAFE_CLEANUP_A_COMMIT = Object.freeze({
  VERSION: '1.2.7-safe-cleanup-a-commit',
  APPROVED_STAGE_HASH: 'bb58d2922da56eb97086d97e2f4277b3d1687de30e1d795d8a7cd376a8e97cd2',
  EXPECTED_STAGE_ROWS: 54,
  BATCH_SIZE: 10,
  PROGRESS_KEY: 'OCOS_V127_SAFE_DUP_CLEANUP_A_PROGRESS'
});

function previewV127SafeDuplicateCleanupACommitGate() {
  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 SAFE DUPLICATE CLEANUP A - COMMIT GATE');
  console.log('NOTION WRITE = NONE');
  console.log('========================================');

  const ctx = loadV127SafeCleanupACommitContext_();
  const remaining = remainingV127SafeCleanupA_(ctx.stage, ctx.progress);
  const batch = remaining.slice(0, V127_SAFE_CLEANUP_A_COMMIT.BATCH_SIZE);

  let ready = 0;
  let blocked = 0;

  console.log(`APPROVED_STAGE_HASH = ${V127_SAFE_CLEANUP_A_COMMIT.APPROVED_STAGE_HASH}`);
  console.log(`STORED_STAGE_HASH = ${ctx.stage.stageHash}`);
  console.log(`TOTAL_STAGE_ROWS = ${ctx.stage.safeArchiveRows.length}`);
  console.log(`ALREADY_COMMITTED = ${ctx.progress.completedPageIds.length}`);
  console.log(`REMAINING = ${remaining.length}`);
  console.log(`NEXT_BATCH = ${batch.length}`);
  console.log('----------------------------------------');

  batch.forEach((entry, i) => {
    try {
      const result = validateV127SafeCleanupAEntry_(entry);
      ready++;
      console.log(
        `${i + 1}. READY | ${entry.inboxId || '-'} | page=${entry.pageId} | keep=${entry.keeperPageId} | ${entry.title}`
      );
      console.log(`   target=${summarizeProtectedStateV127DC_(result.targetRow)}`);
      console.log(`   keeper=${summarizeProtectedStateV127DC_(result.keeperRow)}`);
    } catch (err) {
      blocked++;
      console.error(
        `${i + 1}. BLOCKED | ${entry.inboxId || '-'} | page=${entry.pageId} | ${err.message || err}`
      );
    }
  });

  console.log('----------------------------------------');
  console.log(`READY = ${ready}`);
  console.log(`BLOCKED = ${blocked}`);
  console.log('========================================');
  console.log('COMMIT GATE COMPLETE / NOTION WRITE = NONE');
  console.log('========================================');
}

function commitV127SafeDuplicateCleanupABatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Another script is running. Commit aborted.');
  }

  try {
    console.log('========================================');
    console.log('OC-OS INBOX v1.2.7 SAFE DUPLICATE CLEANUP A - COMMIT BATCH');
    console.log(`MAX WRITE = ${V127_SAFE_CLEANUP_A_COMMIT.BATCH_SIZE}`);
    console.log('========================================');

    const ctx = loadV127SafeCleanupACommitContext_();
    const remaining = remainingV127SafeCleanupA_(ctx.stage, ctx.progress);
    const batch = remaining.slice(0, V127_SAFE_CLEANUP_A_COMMIT.BATCH_SIZE);

    if (!batch.length) {
      console.log('No remaining Stage A rows. Nothing written.');
      return;
    }

    // All-or-nothing preflight for this batch: no Notion write until all targets pass.
    const validated = batch.map(entry => ({
      entry,
      validation: validateV127SafeCleanupAEntry_(entry)
    }));

    console.log(`PREFLIGHT_READY = ${validated.length}`);
    console.log('----------------------------------------');

    let committedNow = 0;

    validated.forEach((item, i) => {
      const entry = item.entry;
      const result = notionRequest_(
        `/v1/pages/${entry.pageId}`,
        'patch',
        { in_trash: true }
      );

      if (!(result && (result.in_trash === true || result.is_archived === true))) {
        throw new Error(`Notion trash confirmation failed: ${entry.pageId}`);
      }

      ctx.progress.completedPageIds.push(entry.pageId);
      ctx.progress.updatedAt = nowJstIso_();
      saveV127SafeCleanupAProgress_(ctx.progress);
      committedNow++;

      console.log(
        `${i + 1}. TRASHED | ${entry.inboxId || '-'} | page=${entry.pageId} | keep=${entry.keeperPageId} | ${entry.title}`
      );

      Utilities.sleep(OCOS.NOTION_WRITE_INTERVAL_MS);
    });

    const remainingAfter = remainingV127SafeCleanupA_(ctx.stage, ctx.progress);

    console.log('----------------------------------------');
    console.log(`COMMITTED_THIS_BATCH = ${committedNow}`);
    console.log(`COMMITTED_TOTAL = ${ctx.progress.completedPageIds.length}`);
    console.log(`REMAINING = ${remainingAfter.length}`);
    console.log('========================================');
    console.log('COMMIT BATCH COMPLETE');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function previewV127SafeDuplicateCleanupAProgress() {
  const ctx = loadV127SafeCleanupACommitContext_();
  const remaining = remainingV127SafeCleanupA_(ctx.stage, ctx.progress);

  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 SAFE DUPLICATE CLEANUP A - PROGRESS');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(`STAGE_HASH = ${ctx.stage.stageHash}`);
  console.log(`TOTAL = ${ctx.stage.safeArchiveRows.length}`);
  console.log(`COMMITTED = ${ctx.progress.completedPageIds.length}`);
  console.log(`REMAINING = ${remaining.length}`);
  console.log(`UPDATED_AT = ${ctx.progress.updatedAt || '-'}`);
  console.log('========================================');
}

function loadV127SafeCleanupACommitContext_() {
  const props = PropertiesService.getScriptProperties();
  const rawStage = props.getProperty(V127_SAFE_CLEANUP_A_STAGE.PROPERTY_KEY);

  if (!rawStage) {
    throw new Error('Stage A payload is missing. Do not restage without a new review.');
  }

  const stage = JSON.parse(rawStage);
  const recalculatedHash = sha256V127AStage_(JSON.stringify(stage.safeArchiveRows || []));

  if (stage.version !== V127_SAFE_CLEANUP_A_STAGE.VERSION) {
    throw new Error(`Unexpected stage version: ${stage.version}`);
  }

  if ((stage.safeArchiveRows || []).length !== V127_SAFE_CLEANUP_A_COMMIT.EXPECTED_STAGE_ROWS) {
    throw new Error(`Stage row count changed: ${(stage.safeArchiveRows || []).length}`);
  }

  if (stage.stageHash !== recalculatedHash) {
    throw new Error('Stored stage hash does not match stage contents.');
  }

  if (stage.stageHash !== V127_SAFE_CLEANUP_A_COMMIT.APPROVED_STAGE_HASH) {
    throw new Error('Stage hash is not the approved 2026-09-28 Stage A hash.');
  }

  let progress = {
    version: V127_SAFE_CLEANUP_A_COMMIT.VERSION,
    stageHash: stage.stageHash,
    completedPageIds: [],
    updatedAt: ''
  };

  const rawProgress = props.getProperty(V127_SAFE_CLEANUP_A_COMMIT.PROGRESS_KEY);
  if (rawProgress) {
    progress = JSON.parse(rawProgress);
    if (progress.stageHash !== stage.stageHash) {
      throw new Error('Progress belongs to a different stage hash.');
    }
  }

  progress.completedPageIds = Array.from(new Set(progress.completedPageIds || []));

  return { stage, progress };
}

function remainingV127SafeCleanupA_(stage, progress) {
  const done = new Set((progress && progress.completedPageIds) || []);
  return (stage.safeArchiveRows || []).filter(x => !done.has(x.pageId));
}

function saveV127SafeCleanupAProgress_(progress) {
  PropertiesService.getScriptProperties().setProperty(
    V127_SAFE_CLEANUP_A_COMMIT.PROGRESS_KEY,
    JSON.stringify(progress)
  );
}

function validateV127SafeCleanupAEntry_(entry) {
  const targetPage = notionRequest_(`/v1/pages/${entry.pageId}`, 'get');
  const keeperPage = notionRequest_(`/v1/pages/${entry.keeperPageId}`, 'get');

  if (!targetPage || !targetPage.id) {
    throw new Error('Target page could not be retrieved.');
  }
  if (!keeperPage || !keeperPage.id) {
    throw new Error('Keeper page could not be retrieved.');
  }
  if (targetPage.in_trash === true || targetPage.is_archived === true) {
    throw new Error('Target is already in trash but progress does not record it.');
  }
  if (keeperPage.in_trash === true || keeperPage.is_archived === true) {
    throw new Error('Keeper is in trash.');
  }

  const targetRow = pageToCleanupRowV127ACommit_(targetPage);
  const keeperRow = pageToCleanupRowV127ACommit_(keeperPage);

  if (targetRow.pageId !== entry.pageId) throw new Error('Target page ID drift.');
  if (keeperRow.pageId !== entry.keeperPageId) throw new Error('Keeper page ID drift.');

  if (stableSourceKeyV127P_(targetRow) !== entry.stableKey) {
    throw new Error('Target Stable Source Key drift.');
  }
  if (stableSourceKeyV127P_(keeperRow) !== entry.stableKey) {
    throw new Error('Keeper Stable Source Key drift.');
  }

  if (normalizeSourceTitleLooseV127P_(targetRow.title) !== entry.contentKey) {
    throw new Error('Target semantic content drift.');
  }
  if (normalizeSourceTitleLooseV127P_(keeperRow.title) !== entry.contentKey) {
    throw new Error('Keeper semantic content drift.');
  }

  if (String(targetRow.fingerprint || '') !== String(entry.fingerprint || '')) {
    throw new Error('Target fingerprint drift.');
  }

  const pairPlan = planContentVersionV127DC_([targetRow, keeperRow]);
  if (pairPlan.manualReviewRequired) {
    throw new Error(
      'Protected field conflict appeared after staging: ' +
      pairPlan.conflicts.map(x => x.field).join(', ')
    );
  }

  if (!pairPlan.keep || pairPlan.keep.pageId !== entry.keeperPageId) {
    throw new Error('Keeper selection changed after staging.');
  }

  return { targetRow, keeperRow, pairPlan };
}

function pageToCleanupRowV127ACommit_(page) {
  const p = (page && page.properties) || {};
  return {
    pageId: (page && page.id) || '',
    inboxId: notionUniqueIdV127DC_(p.Inbox_ID),
    title: notionTitleV127DC_(p.Inbox_Title),
    url: notionUrlV127DC_(p.URL),
    collector: notionTextV127DC_(p.Collector),
    fingerprint: notionTextV127DC_(p.Fingerprint),
    detectedAt: notionDateStartV127DC_(p.Detected_At),
    publishedAt: notionDateStartV127DC_(p.Published_At),
    eventDateHint: notionDateStartV127DC_(p.Event_Date_Hint),
    detectedSnippet: notionTextV127DC_(p.Detected_Snippet),
    discoveryTerms: notionTextV127DC_(p.Discovery_Terms),
    decision: notionSelectV127DC_(p.Decision),
    status: notionSelectV127DC_(p.Status),
    memo: notionTextV127DC_(p.Memo),
    eventIds: notionRelationIdsV127DC_(p.Event),
    sourceIds: notionRelationIdsV127DC_(p.Source),
    suggestedDecision: notionSelectV127DC_(p.Suggested_Decision),
    suggestedEventIds: notionRelationIdsV127DC_(p.Suggested_Event),
    suggestionConfidence: notionSelectV127DC_(p.Suggestion_Confidence),
    suggestionReason: notionTextV127DC_(p.Suggestion_Reason),
    processedAt: notionDateStartV127DC_(p.Processed_At),
    processorVersion: notionTextV127DC_(p.Processor_Version),
    processorError: notionTextV127DC_(p.Processor_Error)
  };
}
