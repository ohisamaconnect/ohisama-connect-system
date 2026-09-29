/**
 * OC-OS INBOX Manual Conflict Cleanup - M02813 Stage B PREVIEW
 * 2026-09-29
 *
 * READ ONLY. Finds the M02813 chain by Stable Source Key and verifies
 * the approved keep/archive proposal before any staged cleanup.
 *
 * Proposal to verify (NO WRITE here):
 *   KEEP current corrected revision : INB3236
 *   KEEP one historical old revision: INB3210
 *   ARCHIVE duplicate old revision  : INB2944
 */

const OCOS_M02813_STAGE_B_PREVIEW = Object.freeze({
  COLLECTOR: 'official-news',
  URL: 'https://www.hinatazaka46.com/s/official/news/detail/M02813',
  REVISION: 'SOURCE_REVISION',
  KEEP_OLD: 'INB3210',
  ARCHIVE_OLD: 'INB2944',
  KEEP_CURRENT: 'INB3236'
});

function previewM02813ManualConflictStageB() {
  console.log('========================================');
  console.log('OC-OS INBOX M02813 MANUAL CONFLICT CLEANUP - STAGE B PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');

  const state = loadV127DuplicateCleanupState_();
  const stableKey = stableSourceKeyV127P_({
    collector: OCOS_M02813_STAGE_B_PREVIEW.COLLECTOR,
    url: OCOS_M02813_STAGE_B_PREVIEW.URL
  });
  const rows = (state.byStableKey.get(stableKey) || []).slice();

  console.log(`STABLE_KEY = ${stableKey}`);
  console.log(`PHYSICAL_ROWS = ${rows.length}`);

  const byInboxId = new Map(rows.map(r => [r.inboxId, r]));
  const keepOld = byInboxId.get(OCOS_M02813_STAGE_B_PREVIEW.KEEP_OLD);
  const archiveOld = byInboxId.get(OCOS_M02813_STAGE_B_PREVIEW.ARCHIVE_OLD);
  const current = byInboxId.get(OCOS_M02813_STAGE_B_PREVIEW.KEEP_CURRENT);

  rows.forEach((row, i) => {
    console.log('----------------------------------------');
    console.log(`${i + 1}. ${row.inboxId || '-'} | page=${row.pageId}`);
    console.log(`   title=${row.title}`);
    console.log(`   detectedAt=${row.detectedAt || '-'}`);
    console.log(`   Decision=${row.decision || '-'} / Status=${row.status || '-'}`);
    console.log(`   Event=${relationKeyV127DC_(row.eventIds) || '-'}`);
    console.log(`   Source=${relationKeyV127DC_(row.sourceIds) || '-'}`);
    console.log(`   Processed=${row.processedAt || '-'}`);
    console.log(`   Processor_Error=${row.processorError || '-'}`);
  });

  const checks = [];
  checks.push(['EXACTLY_3_PHYSICAL_ROWS', rows.length === 3]);
  checks.push(['KEEP_OLD_EXISTS', Boolean(keepOld)]);
  checks.push(['ARCHIVE_OLD_EXISTS', Boolean(archiveOld)]);
  checks.push(['KEEP_CURRENT_EXISTS', Boolean(current)]);

  if (keepOld && archiveOld && current) {
    checks.push(['OLD_TWO_SAME_SEMANTIC_TITLE', normalizeSourceTitleLooseV127P_(keepOld.title) === normalizeSourceTitleLooseV127P_(archiveOld.title)]);
    checks.push(['CORRECTED_DIFFERS_FROM_OLD', normalizeSourceTitleLooseV127P_(current.title) !== normalizeSourceTitleLooseV127P_(keepOld.title)]);
    checks.push(['CURRENT_PROCESSED', current.status === '処理済' && Boolean(current.processedAt)]);
    checks.push(['CURRENT_HAS_EVENT', current.eventIds.length > 0]);
    checks.push(['CURRENT_HAS_SOURCE', current.sourceIds.length > 0]);
    checks.push(['OLD_ROWS_NO_EVENT', keepOld.eventIds.length === 0 && archiveOld.eventIds.length === 0]);
  }

  console.log('========================================');
  console.log('GUARDS');
  let failed = false;
  checks.forEach(([name, ok]) => {
    if (!ok) failed = true;
    console.log(`${name} = ${ok ? 'PASS' : 'FAIL'}`);
  });

  if (!failed) {
    console.log('----------------------------------------');
    console.log('PROPOSAL');
    console.log(`KEEP CURRENT CORRECTED = ${current.inboxId} | ${current.pageId}`);
    console.log(`KEEP OLD REVISION HISTORY = ${keepOld.inboxId} | ${keepOld.pageId}`);
    console.log(`ARCHIVE CANDIDATE = ${archiveOld.inboxId} | ${archiveOld.pageId}`);
    console.log('Reason: preserve corrected current version and exactly one physical observation of the old semantic version; remove only the redundant same-content old row.');
    console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
  }

  console.log('----------------------------------------');
  console.log(`RESULT = ${failed ? 'BLOCKED: CURRENT STATE DIFFERS' : 'SAFE PREVIEW'}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}
