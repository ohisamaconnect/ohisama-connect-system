/**
 * OC-OS INBOX M02813 Manual Conflict Cleanup - Stage B / STAGE ONLY
 * 2026-09-29
 *
 * Notion WRITE = NONE.
 * Stores exactly one approved archive candidate (INB2944) in Script Properties
 * after re-validating the current three-row M02813 state.
 *
 * Canonical proposal:
 *   KEEP current corrected     = INB3236
 *   KEEP old revision history = INB3210
 *   ARCHIVE candidate         = INB2944
 *
 * Dependencies:
 *   ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *   ohisama_inbox_crawler_v1.2.7_production_runner.gs
 */

const OCOS_M02813_STAGE_B = Object.freeze({
  VERSION: 'm02813-stage-b-v0.1.0',
  PROPERTY_KEY: 'OCOS_M02813_MANUAL_CONFLICT_STAGE_B',
  COLLECTOR: 'official-news',
  URL: 'https://www.hinatazaka46.com/s/official/news/detail/M02813',
  KEEP_CURRENT_INBOX_ID: 'INB3236',
  KEEP_OLD_INBOX_ID: 'INB3210',
  ARCHIVE_INBOX_ID: 'INB2944'
});

function stageM02813ManualConflictStageB() {
  console.log('========================================');
  console.log('OC-OS INBOX M02813 MANUAL CONFLICT CLEANUP - STAGE B');
  console.log('NOTION WRITE = NONE');
  console.log('========================================');

  const plan = buildM02813StageBPlan_();
  assertM02813StageBPlan_(plan);

  const payload = {
    version: OCOS_M02813_STAGE_B.VERSION,
    stagedAt: nowJstIso_(),
    stableKey: plan.stableKey,
    keepCurrent: minimalM02813StageBRow_(plan.keepCurrent),
    keepOldRevision: minimalM02813StageBRow_(plan.keepOldRevision),
    archiveCandidate: minimalM02813StageBRow_(plan.archiveCandidate)
  };

  payload.stageHash = sha256M02813StageB_(JSON.stringify({
    stableKey: payload.stableKey,
    keepCurrent: payload.keepCurrent,
    keepOldRevision: payload.keepOldRevision,
    archiveCandidate: payload.archiveCandidate
  }));

  PropertiesService.getScriptProperties().setProperty(
    OCOS_M02813_STAGE_B.PROPERTY_KEY,
    JSON.stringify(payload)
  );

  console.log(`STAGED_AT = ${payload.stagedAt}`);
  console.log(`STAGE_HASH = ${payload.stageHash}`);
  console.log(`STABLE_KEY = ${payload.stableKey}`);
  console.log('----------------------------------------');
  console.log(`KEEP CURRENT CORRECTED = ${payload.keepCurrent.inboxId} | ${payload.keepCurrent.pageId}`);
  console.log(`KEEP OLD REVISION HISTORY = ${payload.keepOldRevision.inboxId} | ${payload.keepOldRevision.pageId}`);
  console.log(`ARCHIVE CANDIDATE = ${payload.archiveCandidate.inboxId} | ${payload.archiveCandidate.pageId}`);
  console.log('----------------------------------------');
  console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
  console.log('STAGE COMPLETE / NOTION WRITE = NONE');
  console.log('========================================');
}

function inspectM02813ManualConflictStageB() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    OCOS_M02813_STAGE_B.PROPERTY_KEY
  );
  if (!raw) {
    console.log('No M02813 Stage B snapshot stored.');
    return;
  }

  const stage = JSON.parse(raw);
  console.log('========================================');
  console.log('OC-OS INBOX M02813 MANUAL CONFLICT CLEANUP - STORED STAGE B');
  console.log('WRITE = NONE');
  console.log(`VERSION = ${stage.version}`);
  console.log(`STAGED_AT = ${stage.stagedAt}`);
  console.log(`STAGE_HASH = ${stage.stageHash}`);
  console.log(`KEEP CURRENT = ${stage.keepCurrent.inboxId} | ${stage.keepCurrent.pageId}`);
  console.log(`KEEP OLD = ${stage.keepOldRevision.inboxId} | ${stage.keepOldRevision.pageId}`);
  console.log(`ARCHIVE = ${stage.archiveCandidate.inboxId} | ${stage.archiveCandidate.pageId}`);
  console.log('========================================');
}

function clearM02813ManualConflictStageB() {
  PropertiesService.getScriptProperties().deleteProperty(
    OCOS_M02813_STAGE_B.PROPERTY_KEY
  );
  console.log('M02813 Stage B snapshot cleared. Notion WRITE = NONE.');
}

function buildM02813StageBPlan_() {
  const state = loadV127DuplicateCleanupState_();
  const stableKey = `${OCOS_M02813_STAGE_B.COLLECTOR}|${OCOS_M02813_STAGE_B.URL}`;
  const rows = (state.byStableKey.get(stableKey) || []).slice();

  return {
    stableKey,
    rows,
    keepCurrent: rows.find(r => r.inboxId === OCOS_M02813_STAGE_B.KEEP_CURRENT_INBOX_ID) || null,
    keepOldRevision: rows.find(r => r.inboxId === OCOS_M02813_STAGE_B.KEEP_OLD_INBOX_ID) || null,
    archiveCandidate: rows.find(r => r.inboxId === OCOS_M02813_STAGE_B.ARCHIVE_INBOX_ID) || null
  };
}

function assertM02813StageBPlan_(plan) {
  const oldA = plan.keepOldRevision;
  const oldB = plan.archiveCandidate;
  const current = plan.keepCurrent;

  const checks = [
    ['EXACTLY_3_PHYSICAL_ROWS', plan.rows.length === 3],
    ['KEEP_CURRENT_EXISTS', Boolean(current)],
    ['KEEP_OLD_EXISTS', Boolean(oldA)],
    ['ARCHIVE_OLD_EXISTS', Boolean(oldB)],
    ['OLD_TWO_SAME_SEMANTIC_TITLE', Boolean(oldA && oldB && normalizeSourceTitleLooseV127P_(oldA.title) === normalizeSourceTitleLooseV127P_(oldB.title))],
    ['CORRECTED_DIFFERS_FROM_OLD', Boolean(current && oldA && normalizeSourceTitleLooseV127P_(current.title) !== normalizeSourceTitleLooseV127P_(oldA.title))],
    ['CURRENT_PROCESSED', Boolean(current && current.status === '処理済' && current.processedAt)],
    ['CURRENT_HAS_EVENT', Boolean(current && (current.eventIds || []).length === 1)],
    ['CURRENT_HAS_SOURCE', Boolean(current && (current.sourceIds || []).length === 1)],
    ['OLD_ROWS_NO_EVENT', Boolean(oldA && oldB && (oldA.eventIds || []).length === 0 && (oldB.eventIds || []).length === 0)]
  ];

  let failed = false;
  checks.forEach(([name, ok]) => {
    if (!ok) failed = true;
    console.log(`${name} = ${ok ? 'PASS' : 'FAIL'}`);
  });

  if (failed) {
    throw new Error('M02813 Stage B guard failed. Current INBOX differs from approved preview.');
  }
}

function minimalM02813StageBRow_(row) {
  return {
    pageId: row.pageId,
    inboxId: row.inboxId,
    title: row.title,
    detectedAt: row.detectedAt,
    decision: row.decision,
    status: row.status,
    eventIds: (row.eventIds || []).slice(),
    sourceIds: (row.sourceIds || []).slice(),
    processedAt: row.processedAt,
    processorError: row.processorError || ''
  };
}

function sha256M02813StageB_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
