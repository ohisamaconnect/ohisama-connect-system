/**
 * OC-OS INBOX Duplicate Cleanup Stage A v1.2.7 - STAGE ONLY
 * 2026-09-28
 *
 * WRITE = NONE to Notion.
 * SAFE duplicate candidates only are staged into Script Properties.
 * Manual Review candidates are excluded.
 *
 * Dependencies:
 * - v1.2.7 duplicate cleanup preview helpers
 * - v1.2.7 production runner helpers
 */

const V127_SAFE_CLEANUP_A_STAGE = Object.freeze({
  VERSION: '1.2.7-safe-cleanup-a-stage',
  PROPERTY_KEY: 'OCOS_V127_SAFE_DUP_CLEANUP_A_STAGE',
  EXPECTED_DUPLICATE_STABLE_KEYS: 56,
  EXPECTED_PHYSICAL_EXTRA_ROWS: 59,
  EXPECTED_REVISION_EXTRA_ROWS: 3,
  EXPECTED_SAFE_ARCHIVE_ROWS: 54,
  EXPECTED_MANUAL_ARCHIVE_ROWS: 2
});

function stageV127SafeDuplicateCleanupA() {
  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 SAFE DUPLICATE CLEANUP A - STAGE');
  console.log('NOTION WRITE = NONE');
  console.log('========================================');

  const plan = buildSafeCleanupPlanV127AStage_();
  assertSafeCleanupPlanV127AStage_(plan);

  const payload = {
    version: V127_SAFE_CLEANUP_A_STAGE.VERSION,
    stagedAt: nowJstIso_(),
    duplicateStableKeys: plan.duplicateStableKeys,
    physicalExtraRows: plan.physicalExtraRows,
    revisionExtraRows: plan.revisionExtraRows,
    safeArchiveRows: plan.safeArchiveRows,
    manualArchiveRows: plan.manualArchiveRows
  };

  payload.stageHash = sha256V127AStage_(
    JSON.stringify(payload.safeArchiveRows)
  );

  PropertiesService.getScriptProperties().setProperty(
    V127_SAFE_CLEANUP_A_STAGE.PROPERTY_KEY,
    JSON.stringify(payload)
  );

  console.log(`STAGED_AT = ${payload.stagedAt}`);
  console.log(`STAGE_HASH = ${payload.stageHash}`);
  console.log(`SAFE_ARCHIVE_ROWS = ${payload.safeArchiveRows.length}`);
  console.log(`MANUAL_REVIEW_ARCHIVE_ROWS_EXCLUDED = ${payload.manualArchiveRows.length}`);
  console.log('----------------------------------------');

  payload.safeArchiveRows.forEach((x, i) => {
    console.log(
      `${i + 1}. ${x.inboxId || '-'} | page=${x.pageId} | keep=${x.keeperPageId} | ${x.title}`
    );
  });

  console.log('========================================');
  console.log('STAGE COMPLETE / NOTION WRITE = NONE');
  console.log('========================================');
}

function previewV127SafeDuplicateCleanupAStage() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    V127_SAFE_CLEANUP_A_STAGE.PROPERTY_KEY
  );

  if (!raw) {
    console.log('No Stage A plan stored.');
    return;
  }

  const stage = JSON.parse(raw);
  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 SAFE DUPLICATE CLEANUP A - STORED STAGE');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(`VERSION = ${stage.version}`);
  console.log(`STAGED_AT = ${stage.stagedAt}`);
  console.log(`STAGE_HASH = ${stage.stageHash}`);
  console.log(`SAFE_ARCHIVE_ROWS = ${(stage.safeArchiveRows || []).length}`);
  console.log(`MANUAL_REVIEW_ARCHIVE_ROWS_EXCLUDED = ${(stage.manualArchiveRows || []).length}`);
  console.log('========================================');
}

function clearV127SafeDuplicateCleanupAStage() {
  PropertiesService.getScriptProperties().deleteProperty(
    V127_SAFE_CLEANUP_A_STAGE.PROPERTY_KEY
  );
  console.log('Stage A plan cleared. Notion WRITE = NONE.');
}

function buildSafeCleanupPlanV127AStage_() {
  const state = loadV127DuplicateCleanupState_();
  const duplicateGroups = [];

  state.byStableKey.forEach((rows, key) => {
    if (rows.length > 1) duplicateGroups.push({ key, rows });
  });

  let physicalExtraRows = 0;
  let revisionExtraRows = 0;
  const safeArchiveRows = [];
  const manualArchiveRows = [];

  duplicateGroups.forEach(group => {
    physicalExtraRows += group.rows.length - 1;

    const versions = groupRowsBySemanticContentV127DC_(group.rows);
    revisionExtraRows += Math.max(0, versions.length - 1);

    versions.forEach(versionRows => {
      const plan = planContentVersionV127DC_(versionRows);
      const contentKey = normalizeSourceTitleLooseV127P_(
        (plan.keep && plan.keep.title) || ''
      );

      (plan.archiveRows || []).forEach(row => {
        const entry = {
          pageId: row.pageId,
          stableKey: group.key,
          contentKey,
          keeperPageId: plan.keep ? plan.keep.pageId : '',
          inboxId: row.inboxId,
          title: row.title,
          detectedAt: row.detectedAt,
          fingerprint: row.fingerprint
        };

        if (plan.manualReviewRequired) {
          manualArchiveRows.push(entry);
        } else {
          safeArchiveRows.push(entry);
        }
      });
    });
  });

  safeArchiveRows.sort(compareV127AStage_);
  manualArchiveRows.sort(compareV127AStage_);

  return {
    duplicateStableKeys: duplicateGroups.length,
    physicalExtraRows,
    revisionExtraRows,
    safeArchiveRows,
    manualArchiveRows,
    rowsWithoutStableKey: state.rowsWithoutStableKey
  };
}

function assertSafeCleanupPlanV127AStage_(plan) {
  const checks = [
    ['duplicateStableKeys', plan.duplicateStableKeys, V127_SAFE_CLEANUP_A_STAGE.EXPECTED_DUPLICATE_STABLE_KEYS],
    ['physicalExtraRows', plan.physicalExtraRows, V127_SAFE_CLEANUP_A_STAGE.EXPECTED_PHYSICAL_EXTRA_ROWS],
    ['revisionExtraRows', plan.revisionExtraRows, V127_SAFE_CLEANUP_A_STAGE.EXPECTED_REVISION_EXTRA_ROWS],
    ['safeArchiveRows', plan.safeArchiveRows.length, V127_SAFE_CLEANUP_A_STAGE.EXPECTED_SAFE_ARCHIVE_ROWS],
    ['manualArchiveRows', plan.manualArchiveRows.length, V127_SAFE_CLEANUP_A_STAGE.EXPECTED_MANUAL_ARCHIVE_ROWS],
    ['rowsWithoutStableKey', plan.rowsWithoutStableKey, 0]
  ];

  let failed = false;
  checks.forEach(x => {
    const ok = x[1] === x[2];
    if (!ok) failed = true;
    console.log(`${x[0]} = ${x[1]} / expected=${x[2]} ${ok ? 'OK' : 'NG'}`);
  });

  if (failed) {
    throw new Error('Stage A guard failed. Current INBOX differs from approved preview.');
  }
}

function compareV127AStage_(a, b) {
  return `${a.stableKey}|${a.detectedAt}|${a.pageId}`.localeCompare(
    `${b.stableKey}|${b.detectedAt}|${b.pageId}`
  );
}

function sha256V127AStage_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b =>
    ('0' + ((b + 256) % 256).toString(16)).slice(-2)
  ).join('');
}
