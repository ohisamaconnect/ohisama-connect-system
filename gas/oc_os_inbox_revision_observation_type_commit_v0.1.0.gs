/**
 * OC-OS INBOX Revision Observation Type COMMIT v0.1.0
 * 2026-09-29
 *
 * Purpose:
 *   Human-reviewed Revision Observation Stage v0.1.0 の exact snapshot だけを使い、
 *   INBOX.Observation_Type = SOURCE_REVISION を backfill する。
 *
 * Safety:
 *   - Approved Stage ID / SHA256 / row count を固定。
 *   - Gate は READ ONLY。
 *   - Commit 前に9行すべてを再GETし、Stage時の human-owned / canonical state を再検証。
 *   - 1件でも BLOCKED があれば一切書き込まない。
 *   - Commit が変更するのは Observation_Type のみ。
 *   - 既に SOURCE_REVISION の行は idempotent に ALREADY_COMMITTED として扱う。
 *   - Decision / Event / Source / Status / Suggested_* は変更しない。
 *
 * Dependencies:
 *   - oc_os_inbox_revision_observation_type_stage_v0.1.0.gs
 *       loadRevisionObservationStageV010_()
 *   - ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *       notionTitleV127DC_(), notionUrlV127DC_(), notionTextV127DC_(),
 *       notionDateStartV127DC_(), notionSelectV127DC_(), notionRelationIdsV127DC_(),
 *       relationKeyV127DC_()
 *   - ohisama_inbox_crawler_v1.2.7_production_runner.gs
 *       stableSourceKeyV127P_()
 *   - v1.2.6 main crawler
 *       notionRequest_()
 */

const OCOS_REVISION_COMMIT_010 = Object.freeze({
  VERSION: '0.1.0',
  APPROVED_STAGE_ID: '20260929_023512_c5499711',
  APPROVED_STAGE_HASH: '9a751889981847516f2ead950a25bcf73e99572ae39da868900377af1111e9d6',
  EXPECTED_ROWS: 9,
  TARGET_VALUE: 'SOURCE_REVISION',
  WRITE_INTERVAL_MS: 320
});

/**
 * READ ONLY gate.
 */
function previewInboxRevisionObservationTypeCommitGateV010() {
  console.log('========================================');
  console.log('OC-OS INBOX REVISION OBSERVATION TYPE COMMIT GATE v0.1.0');
  console.log('NOTION WRITE = NONE');
  console.log('========================================');

  const stage = loadAndValidateApprovedRevisionStageV010_();
  const audit = auditRevisionStageForCommitV010_(stage);

  console.log(`APPROVED_STAGE_ID = ${OCOS_REVISION_COMMIT_010.APPROVED_STAGE_ID}`);
  console.log(`STORED_STAGE_ID = ${stage.meta.stageId}`);
  console.log(`APPROVED_STAGE_HASH = ${OCOS_REVISION_COMMIT_010.APPROVED_STAGE_HASH}`);
  console.log(`STORED_STAGE_HASH = ${stage.meta.sha256}`);
  console.log(`TOTAL_STAGE_ROWS = ${stage.items.length}`);
  console.log('----------------------------------------');

  audit.rows.forEach((x, i) => {
    console.log(
      `${i + 1}. [${x.state}] ${x.stageRow.inboxId || '-'} | page=${x.stageRow.pageId} | ${x.stageRow.title || '-'}`
    );
    console.log(
      `   Observation_Type=${x.observationType || '(blank)'} / ` +
      `Decision=${x.current.decision || '-'} / Status=${x.current.status || '-'} / ` +
      `Event=${relationKeyV127DC_(x.current.eventIds) || '-'} / ` +
      `Source=${relationKeyV127DC_(x.current.sourceIds) || '-'} / ` +
      `Suggested=${x.current.suggestedDecision || '-'}`
    );
    x.errors.forEach(err => console.log(`   BLOCK: ${err}`));
  });

  console.log('----------------------------------------');
  console.log(`READY = ${audit.ready}`);
  console.log(`ALREADY_COMMITTED = ${audit.already}`);
  console.log(`BLOCKED = ${audit.blocked}`);
  console.log('========================================');

  if (audit.blocked > 0) {
    console.log('COMMIT GATE BLOCKED / Do not run commit');
  } else {
    console.log('COMMIT GATE PASSED / exact approved Stage is safe to commit');
  }
  console.log('NOTION WRITE = NONE');
  console.log('========================================');
}

/**
 * Writes Observation_Type only after full all-row preflight passes.
 */
function commitInboxRevisionObservationTypeStageV010() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Revision Observation commit skipped.');
    return;
  }

  try {
    console.log('========================================');
    console.log('OC-OS INBOX REVISION OBSERVATION TYPE COMMIT v0.1.0');
    console.log('WRITE = Observation_Type ONLY');
    console.log(`TARGET = ${OCOS_REVISION_COMMIT_010.TARGET_VALUE}`);
    console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
    console.log('========================================');

    const stage = loadAndValidateApprovedRevisionStageV010_();
    const audit = auditRevisionStageForCommitV010_(stage);

    console.log(`PREFLIGHT_READY = ${audit.ready}`);
    console.log(`PREFLIGHT_ALREADY_COMMITTED = ${audit.already}`);
    console.log(`PREFLIGHT_BLOCKED = ${audit.blocked}`);

    if (audit.blocked > 0) {
      console.log('COMMIT ABORTED BEFORE WRITE');
      audit.rows
        .filter(x => x.state === 'BLOCKED')
        .forEach(x => {
          console.log(`[BLOCKED] ${x.stageRow.inboxId || '-'} | ${x.stageRow.title || '-'}`);
          x.errors.forEach(err => console.log(`   ${err}`));
        });
      console.log('========================================');
      return;
    }

    let written = 0;
    let already = 0;
    let failed = 0;

    for (const x of audit.rows) {
      if (x.state === 'ALREADY_COMMITTED') {
        already++;
        console.log(`[ALREADY] ${x.stageRow.inboxId || '-'} | ${x.stageRow.title || '-'}`);
        continue;
      }

      try {
        notionRequest_(`/v1/pages/${x.stageRow.pageId}`, 'patch', {
          properties: {
            Observation_Type: { select: { name: OCOS_REVISION_COMMIT_010.TARGET_VALUE } }
          }
        });
        written++;
        console.log(`[OK] ${x.stageRow.inboxId || '-'} | Observation_Type=${OCOS_REVISION_COMMIT_010.TARGET_VALUE} | ${x.stageRow.title || '-'}`);
      } catch (err) {
        failed++;
        console.error(`[FAILED] ${x.stageRow.inboxId || '-'} | ${revisionCommitErrorMessageV010_(err)}`);
      }

      Utilities.sleep(OCOS_REVISION_COMMIT_010.WRITE_INTERVAL_MS);
    }

    console.log('----------------------------------------');
    console.log(`WRITTEN = ${written}`);
    console.log(`ALREADY_COMMITTED = ${already}`);
    console.log(`FAILED = ${failed}`);
    console.log(`TOTAL_ACCOUNTED = ${written + already}`);
    console.log('========================================');
    console.log(failed === 0 && written + already === OCOS_REVISION_COMMIT_010.EXPECTED_ROWS
      ? 'COMMIT COMPLETE'
      : 'COMMIT INCOMPLETE / run Gate again before any retry');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function loadAndValidateApprovedRevisionStageV010_() {
  const stage = loadRevisionObservationStageV010_();

  if (stage.meta.stageId !== OCOS_REVISION_COMMIT_010.APPROVED_STAGE_ID) {
    throw new Error(`Stage ID mismatch: ${stage.meta.stageId}`);
  }
  if (stage.meta.sha256 !== OCOS_REVISION_COMMIT_010.APPROVED_STAGE_HASH) {
    throw new Error(`Stage SHA256 mismatch: ${stage.meta.sha256}`);
  }
  if (!Array.isArray(stage.items) || stage.items.length !== OCOS_REVISION_COMMIT_010.EXPECTED_ROWS) {
    throw new Error(`Stage row count mismatch: ${stage.items && stage.items.length}`);
  }
  if (stage.meta.targetValue !== OCOS_REVISION_COMMIT_010.TARGET_VALUE) {
    throw new Error(`Stage target mismatch: ${stage.meta.targetValue}`);
  }

  return stage;
}

function auditRevisionStageForCommitV010_(stage) {
  const rows = stage.items.map(stageRow => inspectRevisionStageRowV010_(stageRow));
  return {
    rows,
    ready: rows.filter(x => x.state === 'READY').length,
    already: rows.filter(x => x.state === 'ALREADY_COMMITTED').length,
    blocked: rows.filter(x => x.state === 'BLOCKED').length
  };
}

function inspectRevisionStageRowV010_(stageRow) {
  const page = notionRequest_(`/v1/pages/${stageRow.pageId}`, 'get');
  const p = (page && page.properties) || {};

  const current = {
    title: notionTitleV127DC_(p.Inbox_Title),
    url: notionUrlV127DC_(p.URL),
    collector: notionTextV127DC_(p.Collector),
    detectedAt: notionDateStartV127DC_(p.Detected_At),
    decision: notionSelectV127DC_(p.Decision),
    status: notionSelectV127DC_(p.Status),
    eventIds: notionRelationIdsV127DC_(p.Event),
    sourceIds: notionRelationIdsV127DC_(p.Source),
    suggestedDecision: notionSelectV127DC_(p.Suggested_Decision),
    observationType: notionSelectV127DC_(p.Observation_Type)
  };

  const errors = [];
  const isTrashed = Boolean(page && (page.in_trash || page.archived));
  if (isTrashed) errors.push('page is trashed/archived');

  const currentStableKey = stableSourceKeyV127P_({
    collector: current.collector,
    url: current.url,
    title: current.title
  });

  if (currentStableKey !== stageRow.stableKey) {
    errors.push(`Stable Source Key changed: ${currentStableKey || '(blank)'}`);
  }
  if (current.title !== String(stageRow.title || '')) {
    errors.push('Inbox_Title changed since Stage');
  }
  if (current.detectedAt !== String(stageRow.detectedAt || '')) {
    errors.push('Detected_At changed since Stage');
  }
  if (current.decision !== String(stageRow.decision || '')) {
    errors.push(`Decision changed: ${stageRow.decision || '-'} -> ${current.decision || '-'}`);
  }
  if (current.status !== String(stageRow.status || '')) {
    errors.push(`Status changed: ${stageRow.status || '-'} -> ${current.status || '-'}`);
  }
  if (relationKeyV127DC_(current.eventIds) !== relationKeyV127DC_(stageRow.eventIds || [])) {
    errors.push('Event relation changed since Stage');
  }
  if (relationKeyV127DC_(current.sourceIds) !== relationKeyV127DC_(stageRow.sourceIds || [])) {
    errors.push('Source relation changed since Stage');
  }
  if (current.suggestedDecision !== String(stageRow.suggestedDecision || '')) {
    errors.push(`Suggested_Decision changed: ${stageRow.suggestedDecision || '-'} -> ${current.suggestedDecision || '-'}`);
  }

  const observationType = current.observationType || '';
  if (observationType && observationType !== OCOS_REVISION_COMMIT_010.TARGET_VALUE) {
    errors.push(`Unexpected Observation_Type=${observationType}`);
  }

  let state = 'READY';
  if (errors.length > 0) {
    state = 'BLOCKED';
  } else if (observationType === OCOS_REVISION_COMMIT_010.TARGET_VALUE) {
    state = 'ALREADY_COMMITTED';
  }

  return {
    stageRow,
    current,
    observationType,
    state,
    errors
  };
}

function revisionCommitErrorMessageV010_(err) {
  if (!err) return 'Unknown error';
  if (err.message) return String(err.message);
  return String(err);
}
