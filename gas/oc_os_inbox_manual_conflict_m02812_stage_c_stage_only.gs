/**
 * OC-OS INBOX M02812 Manual Conflict Cleanup - Stage C / STAGE ONLY
 * 2026-09-29
 *
 * Notion WRITE = NONE.
 * Stores the approved cleanup pair in Script Properties only after
 * re-validating the two INBOX rows and their two EVENT pages.
 *
 * Canonical proposal:
 *   KEEP    INB3212 + its EVENT (has DateTime)
 *   ARCHIVE INB1866 + its EVENT (duplicate, DateTime blank)
 *
 * Dependencies:
 *   oc_os_inbox_manual_conflict_m02812_stage_c_preview.gs
 *   ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *   ohisama_inbox_crawler_v1.2.7_production_runner.gs
 */

const OCOS_M02812_STAGE_C = Object.freeze({
  VERSION: 'm02812-stage-c-v0.1.0',
  PROPERTY_KEY: 'OCOS_M02812_MANUAL_CONFLICT_STAGE_C',
  COLLECTOR: 'official-news',
  URL: 'https://www.hinatazaka46.com/s/official/news/detail/M02812',
  KEEP_INBOX_ID: 'INB3212',
  ARCHIVE_INBOX_ID: 'INB1866'
});

function stageM02812ManualConflictStageC() {
  console.log('========================================');
  console.log('OC-OS INBOX M02812 MANUAL CONFLICT CLEANUP - STAGE C');
  console.log('NOTION WRITE = NONE');
  console.log('========================================');

  const plan = buildM02812StageCPlan_();
  assertM02812StageCPlan_(plan);

  const payload = {
    version: OCOS_M02812_STAGE_C.VERSION,
    stagedAt: nowJstIso_(),
    stableKey: plan.stableKey,
    keepInbox: minimalM02812StageCInbox_(plan.keepInbox),
    archiveInbox: minimalM02812StageCInbox_(plan.archiveInbox),
    keepEvent: minimalM02812StageCEvent_(plan.keepEvent),
    archiveEvent: minimalM02812StageCEvent_(plan.archiveEvent)
  };

  payload.stageHash = sha256M02812StageC_(JSON.stringify({
    stableKey: payload.stableKey,
    keepInbox: payload.keepInbox,
    archiveInbox: payload.archiveInbox,
    keepEvent: payload.keepEvent,
    archiveEvent: payload.archiveEvent
  }));

  PropertiesService.getScriptProperties().setProperty(
    OCOS_M02812_STAGE_C.PROPERTY_KEY,
    JSON.stringify(payload)
  );

  console.log(`STAGED_AT = ${payload.stagedAt}`);
  console.log(`STAGE_HASH = ${payload.stageHash}`);
  console.log(`STABLE_KEY = ${payload.stableKey}`);
  console.log('----------------------------------------');
  console.log(`KEEP INBOX = ${payload.keepInbox.inboxId} | ${payload.keepInbox.pageId}`);
  console.log(`KEEP EVENT = ${payload.keepEvent.pageId} | DateTime=${payload.keepEvent.dateTime}`);
  console.log(`ARCHIVE INBOX CANDIDATE = ${payload.archiveInbox.inboxId} | ${payload.archiveInbox.pageId}`);
  console.log(`ARCHIVE EVENT CANDIDATE = ${payload.archiveEvent.pageId} | DateTime=${payload.archiveEvent.dateTime || '-'}`);
  console.log('----------------------------------------');
  console.log('No Notion Relation / property is modified in Stage.');
  console.log('STAGE COMPLETE / NOTION WRITE = NONE');
  console.log('========================================');
}

function inspectM02812ManualConflictStageC() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    OCOS_M02812_STAGE_C.PROPERTY_KEY
  );
  if (!raw) {
    console.log('No M02812 Stage C snapshot stored.');
    return;
  }

  const stage = JSON.parse(raw);
  console.log('========================================');
  console.log('OC-OS INBOX M02812 MANUAL CONFLICT CLEANUP - STORED STAGE C');
  console.log('WRITE = NONE');
  console.log(`VERSION = ${stage.version}`);
  console.log(`STAGED_AT = ${stage.stagedAt}`);
  console.log(`STAGE_HASH = ${stage.stageHash}`);
  console.log(`KEEP INBOX = ${stage.keepInbox.inboxId} | ${stage.keepInbox.pageId}`);
  console.log(`KEEP EVENT = ${stage.keepEvent.pageId}`);
  console.log(`ARCHIVE INBOX = ${stage.archiveInbox.inboxId} | ${stage.archiveInbox.pageId}`);
  console.log(`ARCHIVE EVENT = ${stage.archiveEvent.pageId}`);
  console.log('========================================');
}

function clearM02812ManualConflictStageC() {
  PropertiesService.getScriptProperties().deleteProperty(
    OCOS_M02812_STAGE_C.PROPERTY_KEY
  );
  console.log('M02812 Stage C snapshot cleared. Notion WRITE = NONE.');
}

function buildM02812StageCPlan_() {
  const state = loadV127DuplicateCleanupState_();
  const stableKey = `${OCOS_M02812_STAGE_C.COLLECTOR}|${OCOS_M02812_STAGE_C.URL}`;
  const rows = (state.byStableKey.get(stableKey) || []).slice();

  const keepInbox = rows.find(r => r.inboxId === OCOS_M02812_STAGE_C.KEEP_INBOX_ID) || null;
  const archiveInbox = rows.find(r => r.inboxId === OCOS_M02812_STAGE_C.ARCHIVE_INBOX_ID) || null;

  const keepEventId = keepInbox && (keepInbox.eventIds || []).length === 1 ? keepInbox.eventIds[0] : '';
  const archiveEventId = archiveInbox && (archiveInbox.eventIds || []).length === 1 ? archiveInbox.eventIds[0] : '';

  return {
    stableKey,
    rows,
    keepInbox,
    archiveInbox,
    keepEvent: keepEventId ? readM02812StageCEvent_(keepEventId) : null,
    archiveEvent: archiveEventId ? readM02812StageCEvent_(archiveEventId) : null
  };
}

function assertM02812StageCPlan_(plan) {
  const keepInbox = plan.keepInbox;
  const archiveInbox = plan.archiveInbox;
  const keepEvent = plan.keepEvent;
  const archiveEvent = plan.archiveEvent;

  const sameInboxTitle = Boolean(
    keepInbox && archiveInbox &&
    normalizeSourceTitleLooseV127P_(keepInbox.title) === normalizeSourceTitleLooseV127P_(archiveInbox.title)
  );
  const sameEventTitle = Boolean(
    keepEvent && archiveEvent &&
    normalizeSourceTitleLooseV127P_(keepEvent.title) === normalizeSourceTitleLooseV127P_(archiveEvent.title)
  );
  const sameSourceRelation = Boolean(
    keepInbox && archiveInbox &&
    relationKeyV127DC_(keepInbox.sourceIds) &&
    relationKeyV127DC_(keepInbox.sourceIds) === relationKeyV127DC_(archiveInbox.sourceIds)
  );
  const eventSourcesSame = Boolean(
    keepEvent && archiveEvent &&
    relationKeyV127DC_(keepEvent.sourceIds) &&
    relationKeyV127DC_(keepEvent.sourceIds) === relationKeyV127DC_(archiveEvent.sourceIds)
  );

  const checks = [
    ['EXACTLY_2_PHYSICAL_ROWS', plan.rows.length === 2],
    ['KEEP_INBOX_EXISTS', Boolean(keepInbox)],
    ['ARCHIVE_INBOX_EXISTS', Boolean(archiveInbox)],
    ['SAME_SEMANTIC_INBOX_TITLE', sameInboxTitle],
    ['BOTH_PROCESSED', Boolean(keepInbox && archiveInbox && keepInbox.status === '処理済' && archiveInbox.status === '処理済')],
    ['BOTH_HAVE_ONE_DISTINCT_EVENT', Boolean(keepInbox && archiveInbox && (keepInbox.eventIds || []).length === 1 && (archiveInbox.eventIds || []).length === 1 && keepInbox.eventIds[0] !== archiveInbox.eventIds[0])],
    ['BOTH_HAVE_SAME_SOURCE', sameSourceRelation],
    ['KEEP_EVENT_EXISTS', Boolean(keepEvent)],
    ['ARCHIVE_EVENT_EXISTS', Boolean(archiveEvent)],
    ['SAME_SEMANTIC_EVENT_TITLE', sameEventTitle],
    ['EVENTS_HAVE_SAME_SOURCE', eventSourcesSame],
    ['KEEP_EVENT_HAS_DATETIME', Boolean(keepEvent && keepEvent.dateTime)],
    ['ARCHIVE_EVENT_DATETIME_BLANK', Boolean(archiveEvent && !archiveEvent.dateTime)],
    ['KEEP_EVENT_ORIGIN_MATCHES_KEEP_INBOX', Boolean(keepEvent && keepInbox && (keepEvent.originInboxIds || []).length === 1 && keepEvent.originInboxIds[0] === keepInbox.pageId)],
    ['ARCHIVE_EVENT_ORIGIN_MATCHES_ARCHIVE_INBOX', Boolean(archiveEvent && archiveInbox && (archiveEvent.originInboxIds || []).length === 1 && archiveEvent.originInboxIds[0] === archiveInbox.pageId)]
  ];

  let failed = false;
  checks.forEach(([name, ok]) => {
    if (!ok) failed = true;
    console.log(`${name} = ${ok ? 'PASS' : 'FAIL'}`);
  });

  if (failed) {
    throw new Error('M02812 Stage C guard failed. Current INBOX/EVENT state differs from approved preview.');
  }
}

function minimalM02812StageCInbox_(row) {
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

function minimalM02812StageCEvent_(event) {
  return {
    pageId: event.pageId,
    title: event.title,
    humanStatus: event.humanStatus,
    dateTime: event.dateTime || '',
    sourceIds: (event.sourceIds || []).slice(),
    originInboxIds: (event.originInboxIds || []).slice()
  };
}

function sha256M02812StageC_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
