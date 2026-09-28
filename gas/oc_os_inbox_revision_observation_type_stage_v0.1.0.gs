/**
 * OC-OS INBOX Revision Observation Type STAGE v0.1.0
 * 2026-09-29
 *
 * Purpose:
 *   Revision chain と判定された INBOX 行を SOURCE_REVISION backfill 候補として
 *   Previewし、その正確な9行スナップショットを Script Properties に Stage 保存する。
 *
 * Safety:
 *   - NOTION WRITE = NONE
 *   - SCHEMA WRITE = NONE
 *   - Script Properties への Stage 保存のみ
 *   - Observation_Type はこの段階では変更しない
 *   - Stage対象は semantic content version が2つ以上ある Stable Source chain の全 physical rows
 *   - 同一contentの単純重複は Stage対象外
 *
 * Dependencies in same Apps Script project:
 *   - ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *       loadV127DuplicateCleanupState_()
 *       groupRowsBySemanticContentV127DC_()
 *   - ohisama_inbox_crawler_v1.2.7_production_runner.gs
 *       notionRequest_() or equivalent is NOT used here
 */

const OCOS_REVISION_STAGE_010 = Object.freeze({
  VERSION: '0.1.0',
  TARGET_VALUE: 'SOURCE_REVISION',
  EXPECTED_REVISION_KEYS: 4,
  EXPECTED_ROWS: 9,
  META_KEY: 'OCOS_REVISION_OBSERVATION_STAGE_010_META',
  CHUNK_PREFIX: 'OCOS_REVISION_OBSERVATION_STAGE_010_CHUNK_',
  CHUNK_SIZE: 7000
});

/**
 * Revision chainを再計算し、対象行をPreviewしてからScript PropertiesにStage保存する。
 * Notionは変更しない。
 */
function previewAndStageInboxRevisionObservationTypeV010() {
  console.log('========================================');
  console.log('OC-OS INBOX REVISION OBSERVATION TYPE STAGE v0.1.0');
  console.log('NOTION WRITE = NONE');
  console.log('SCHEMA WRITE = NONE');
  console.log('STAGE WRITE = SCRIPT_PROPERTIES_ONLY');
  console.log('========================================');

  const state = loadV127DuplicateCleanupState_();
  const revisionGroups = [];

  state.byStableKey.forEach((rows, stableKey) => {
    if (!rows || rows.length < 2) return;
    const versions = groupRowsBySemanticContentV127DC_(rows);
    if (versions.length > 1) {
      revisionGroups.push({ stableKey, rows, versions });
    }
  });

  revisionGroups.sort((a, b) => a.stableKey.localeCompare(b.stableKey));

  const stageRows = [];
  let rowsAlreadyTypedRevision = 0;
  let rowsUnexpectedType = 0;
  let semanticVersions = 0;

  revisionGroups.forEach(group => {
    semanticVersions += group.versions.length;

    group.rows.forEach(row => {
      const observationType = String(row.observationType || '').trim();
      if (observationType === OCOS_REVISION_STAGE_010.TARGET_VALUE) {
        rowsAlreadyTypedRevision++;
      } else if (observationType) {
        rowsUnexpectedType++;
      }

      stageRows.push({
        stableKey: group.stableKey,
        pageId: row.pageId,
        inboxId: row.inboxId,
        title: row.title,
        detectedAt: row.detectedAt || '',
        decision: row.decision || '',
        status: row.status || '',
        eventIds: row.eventIds || [],
        sourceIds: row.sourceIds || [],
        suggestedDecision: row.suggestedDecision || '',
        currentObservationType: observationType,
        targetObservationType: OCOS_REVISION_STAGE_010.TARGET_VALUE
      });
    });
  });

  stageRows.sort((a, b) => {
    const ka = `${a.stableKey}|${a.detectedAt}|${a.pageId}`;
    const kb = `${b.stableKey}|${b.detectedAt}|${b.pageId}`;
    return ka.localeCompare(kb);
  });

  console.log(`STABLE_TARGET_ROWS = ${state.targetRows}`);
  console.log(`STABLE_KEYS = ${state.byStableKey.size}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${state.rowsWithoutStableKey}`);
  console.log('----------------------------------------');
  console.log(`TRUE_REVISION_STABLE_KEYS = ${revisionGroups.length}`);
  console.log(`REVISION_SEMANTIC_VERSIONS = ${semanticVersions}`);
  console.log(`STAGE_ROWS = ${stageRows.length}`);
  console.log(`ALREADY_SOURCE_REVISION = ${rowsAlreadyTypedRevision}`);
  console.log(`UNEXPECTED_NONBLANK_OBSERVATION_TYPE = ${rowsUnexpectedType}`);
  console.log('----------------------------------------');

  stageRows.forEach((row, i) => {
    console.log(
      `${i + 1}. ${row.inboxId || '-'} | page=${row.pageId} | ${row.title || '-'}`
    );
    console.log(
      `   stableKey=${row.stableKey} / currentObservationType=${row.currentObservationType || '(blank)'} / ` +
      `target=${row.targetObservationType}`
    );
    console.log(
      `   Decision=${row.decision || '-'} / Status=${row.status || '-'} / ` +
      `Event=${(row.eventIds || []).join(',') || '-'} / Source=${(row.sourceIds || []).join(',') || '-'} / ` +
      `Suggested=${row.suggestedDecision || '-'}`
    );
  });

  console.log('----------------------------------------');

  const blockingErrors = [];
  if (revisionGroups.length !== OCOS_REVISION_STAGE_010.EXPECTED_REVISION_KEYS) {
    blockingErrors.push(
      `Expected revision keys=${OCOS_REVISION_STAGE_010.EXPECTED_REVISION_KEYS}, actual=${revisionGroups.length}`
    );
  }
  if (stageRows.length !== OCOS_REVISION_STAGE_010.EXPECTED_ROWS) {
    blockingErrors.push(
      `Expected stage rows=${OCOS_REVISION_STAGE_010.EXPECTED_ROWS}, actual=${stageRows.length}`
    );
  }
  if (rowsUnexpectedType > 0) {
    blockingErrors.push(`Unexpected nonblank Observation_Type rows=${rowsUnexpectedType}`);
  }

  if (blockingErrors.length > 0) {
    console.log('STAGE NOT SAVED');
    blockingErrors.forEach(x => console.log(`BLOCKED: ${x}`));
    console.log('========================================');
    console.log('PREVIEW COMPLETE / WRITE = NONE');
    console.log('========================================');
    return;
  }

  const meta = saveRevisionObservationStageV010_(stageRows, {
    revisionKeys: revisionGroups.length,
    semanticVersions,
    stableTargetRows: state.targetRows,
    stableKeys: state.byStableKey.size
  });

  console.log(`STAGE_ID = ${meta.stageId}`);
  console.log(`STAGE_ROWS = ${meta.count}`);
  console.log(`STAGE_SHA256 = ${meta.sha256}`);
  console.log(`STAGED_AT = ${meta.createdAt}`);
  console.log('NOTION WRITE = NONE');
  console.log('SCHEMA WRITE = NONE');
  console.log('========================================');
  console.log('STAGE COMPLETE / Review this exact snapshot before Commit');
  console.log('========================================');
}

/**
 * 現在Stageされているsnapshotを表示するだけ。
 */
function inspectInboxRevisionObservationTypeStageV010() {
  const stage = loadRevisionObservationStageV010_();
  console.log('========================================');
  console.log('OC-OS INBOX REVISION OBSERVATION TYPE STAGE INSPECT v0.1.0');
  console.log(`STAGE_ID = ${stage.meta.stageId}`);
  console.log(`STAGE_ROWS = ${stage.meta.count}`);
  console.log(`STAGE_SHA256 = ${stage.meta.sha256}`);
  console.log(`CREATED_AT = ${stage.meta.createdAt}`);
  console.log(`TARGET_VALUE = ${stage.meta.targetValue}`);
  console.log(`REVISION_KEYS = ${stage.meta.revisionKeys}`);
  console.log(`SEMANTIC_VERSIONS = ${stage.meta.semanticVersions}`);
  console.log('----------------------------------------');
  stage.items.forEach((row, i) => {
    console.log(`${i + 1}. ${row.inboxId || '-'} | ${row.pageId} | ${row.title || '-'}`);
  });
  console.log('========================================');
}

function saveRevisionObservationStageV010_(items, stats) {
  clearRevisionObservationStageV010_();

  const json = JSON.stringify(items);
  const chunks = [];
  for (let i = 0; i < json.length; i += OCOS_REVISION_STAGE_010.CHUNK_SIZE) {
    chunks.push(json.slice(i, i + OCOS_REVISION_STAGE_010.CHUNK_SIZE));
  }

  const stageId = Utilities.formatDate(
    new Date(),
    'Asia/Tokyo',
    'yyyyMMdd_HHmmss'
  ) + '_' + Utilities.getUuid().slice(0, 8);

  const meta = {
    version: OCOS_REVISION_STAGE_010.VERSION,
    stageId,
    createdAt: new Date().toISOString(),
    count: items.length,
    chunks: chunks.length,
    sha256: sha256RevisionObservationStageV010_(json),
    targetValue: OCOS_REVISION_STAGE_010.TARGET_VALUE,
    revisionKeys: stats.revisionKeys,
    semanticVersions: stats.semanticVersions,
    stableTargetRows: stats.stableTargetRows,
    stableKeys: stats.stableKeys
  };

  const props = PropertiesService.getScriptProperties();
  chunks.forEach((chunk, index) => {
    props.setProperty(`${OCOS_REVISION_STAGE_010.CHUNK_PREFIX}${index}`, chunk);
  });
  props.setProperty(OCOS_REVISION_STAGE_010.META_KEY, JSON.stringify(meta));
  return meta;
}

function loadRevisionObservationStageV010_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(OCOS_REVISION_STAGE_010.META_KEY);
  if (!metaRaw) throw new Error('No Revision Observation Stage v0.1.0 exists.');

  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const value = props.getProperty(`${OCOS_REVISION_STAGE_010.CHUNK_PREFIX}${i}`);
    if (value === null) throw new Error(`Missing revision stage chunk: ${i}`);
    parts.push(value);
  }

  const json = parts.join('');
  const items = JSON.parse(json);
  const hash = sha256RevisionObservationStageV010_(json);

  if (hash !== meta.sha256) throw new Error('Revision Stage SHA256 mismatch.');
  if (!Array.isArray(items) || items.length !== Number(meta.count)) {
    throw new Error('Revision Stage item count mismatch.');
  }

  return { meta, items };
}

function clearRevisionObservationStageV010_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (
      key === OCOS_REVISION_STAGE_010.META_KEY ||
      key.indexOf(OCOS_REVISION_STAGE_010.CHUNK_PREFIX) === 0
    ) {
      props.deleteProperty(key);
    }
  });
}

function sha256RevisionObservationStageV010_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
