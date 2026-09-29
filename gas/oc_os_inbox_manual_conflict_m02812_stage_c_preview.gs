/**
 * OC-OS INBOX M02812 Manual Conflict Cleanup - Stage C PREVIEW ONLY
 * 2026-09-29
 *
 * READ ONLY.
 * Revalidates the two physical INBOX rows for official NEWS M02812 and
 * the two EVENT pages referenced by them.
 *
 * Proposed cleanup:
 *   KEEP    INB3212 + its EVENT (canonical: has DateTime)
 *   ARCHIVE INB1866 + its EVENT (duplicate draft: DateTime blank)
 *
 * No Notion writes. No Script Properties writes.
 *
 * Dependencies:
 *   ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *   ohisama_inbox_crawler_v1.2.7_production_runner.gs
 */

const OCOS_M02812_STAGE_C_PREVIEW = Object.freeze({
  COLLECTOR: 'official-news',
  URL: 'https://www.hinatazaka46.com/s/official/news/detail/M02812',
  KEEP_INBOX_ID: 'INB3212',
  ARCHIVE_INBOX_ID: 'INB1866'
});

function previewM02812ManualConflictStageC() {
  console.log('========================================');
  console.log('OC-OS INBOX M02812 MANUAL CONFLICT CLEANUP - STAGE C PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');

  const state = loadV127DuplicateCleanupState_();
  const stableKey = `${OCOS_M02812_STAGE_C_PREVIEW.COLLECTOR}|${OCOS_M02812_STAGE_C_PREVIEW.URL}`;
  const rows = (state.byStableKey.get(stableKey) || []).slice();

  console.log(`STABLE_KEY = ${stableKey}`);
  console.log(`PHYSICAL_ROWS = ${rows.length}`);

  rows.forEach((row, i) => {
    console.log('----------------------------------------');
    console.log(`${i + 1}. ${row.inboxId || '-'} | page=${row.pageId}`);
    console.log(`   title=${row.title || '-'}`);
    console.log(`   detectedAt=${row.detectedAt || '-'}`);
    console.log(`   Decision=${row.decision || '-'} / Status=${row.status || '-'}`);
    console.log(`   Event=${(row.eventIds || []).join('|') || '-'}`);
    console.log(`   Source=${(row.sourceIds || []).join('|') || '-'}`);
    console.log(`   Processed=${row.processedAt || '-'}`);
    console.log(`   Processor_Error=${row.processorError || '-'}`);
  });

  const keepInbox = rows.find(r => r.inboxId === OCOS_M02812_STAGE_C_PREVIEW.KEEP_INBOX_ID) || null;
  const archiveInbox = rows.find(r => r.inboxId === OCOS_M02812_STAGE_C_PREVIEW.ARCHIVE_INBOX_ID) || null;

  const keepEventId = keepInbox && (keepInbox.eventIds || []).length === 1 ? keepInbox.eventIds[0] : '';
  const archiveEventId = archiveInbox && (archiveInbox.eventIds || []).length === 1 ? archiveInbox.eventIds[0] : '';

  const keepEvent = keepEventId ? readM02812StageCEvent_(keepEventId) : null;
  const archiveEvent = archiveEventId ? readM02812StageCEvent_(archiveEventId) : null;

  if (keepEvent) logM02812StageCEvent_('KEEP EVENT', keepEvent);
  if (archiveEvent) logM02812StageCEvent_('ARCHIVE EVENT CANDIDATE', archiveEvent);

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
  const keepOriginCorrect = Boolean(
    keepEvent && keepInbox &&
    (keepEvent.originInboxIds || []).length === 1 &&
    keepEvent.originInboxIds[0] === keepInbox.pageId
  );
  const archiveOriginCorrect = Boolean(
    archiveEvent && archiveInbox &&
    (archiveEvent.originInboxIds || []).length === 1 &&
    archiveEvent.originInboxIds[0] === archiveInbox.pageId
  );

  const checks = [
    ['EXACTLY_2_PHYSICAL_ROWS', rows.length === 2],
    ['KEEP_INBOX_EXISTS', Boolean(keepInbox)],
    ['ARCHIVE_INBOX_EXISTS', Boolean(archiveInbox)],
    ['SAME_SEMANTIC_INBOX_TITLE', sameInboxTitle],
    ['BOTH_PROCESSED', Boolean(keepInbox && archiveInbox && keepInbox.status === '処理済' && archiveInbox.status === '処理済')],
    ['BOTH_HAVE_ONE_EVENT', Boolean(keepEventId && archiveEventId && keepEventId !== archiveEventId)],
    ['BOTH_HAVE_SAME_SOURCE', sameSourceRelation],
    ['KEEP_EVENT_EXISTS', Boolean(keepEvent)],
    ['ARCHIVE_EVENT_EXISTS', Boolean(archiveEvent)],
    ['SAME_SEMANTIC_EVENT_TITLE', sameEventTitle],
    ['EVENTS_HAVE_SAME_SOURCE', eventSourcesSame],
    ['KEEP_EVENT_HAS_DATETIME', Boolean(keepEvent && keepEvent.dateTime)],
    ['ARCHIVE_EVENT_DATETIME_BLANK', Boolean(archiveEvent && !archiveEvent.dateTime)],
    ['KEEP_EVENT_ORIGIN_MATCHES_KEEP_INBOX', keepOriginCorrect],
    ['ARCHIVE_EVENT_ORIGIN_MATCHES_ARCHIVE_INBOX', archiveOriginCorrect]
  ];

  console.log('========================================');
  console.log('GUARDS');
  let failed = false;
  checks.forEach(([name, ok]) => {
    if (!ok) failed = true;
    console.log(`${name} = ${ok ? 'PASS' : 'FAIL'}`);
  });

  console.log('----------------------------------------');
  console.log('PROPOSAL');
  if (keepInbox && keepEvent) {
    console.log(`KEEP INBOX = ${keepInbox.inboxId} | ${keepInbox.pageId}`);
    console.log(`KEEP EVENT = ${keepEvent.pageId} | DateTime=${keepEvent.dateTime || '-'}`);
  }
  if (archiveInbox && archiveEvent) {
    console.log(`ARCHIVE INBOX CANDIDATE = ${archiveInbox.inboxId} | ${archiveInbox.pageId}`);
    console.log(`ARCHIVE EVENT CANDIDATE = ${archiveEvent.pageId} | DateTime=${archiveEvent.dateTime || '-'}`);
  }
  console.log('Reason: same SOURCE/content produced two processed INBOX rows and two same-title EVENTS; retain the EVENT with DateTime and its Origin_Inbox, remove the duplicate blank-DateTime pair.');
  console.log('No Relation / property is modified in Preview.');
  console.log('----------------------------------------');
  console.log(`RESULT = ${failed ? 'REVIEW REQUIRED' : 'SAFE PREVIEW'}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function readM02812StageCEvent_(pageId) {
  const page = notionRequest_(`/v1/pages/${pageId}`, 'get');
  if (!page || !page.id || page.in_trash || page.archived) return null;
  const p = page.properties || {};
  return {
    pageId: page.id,
    title: notionTitleV127DC_(p.Event_Title),
    humanStatus: notionSelectV127DC_(p.Human_Status),
    dateTime: notionDateStartV127DC_(p.DateTime),
    sourceIds: notionRelationIdsV127DC_(p.Sources),
    originInboxIds: notionRelationIdsV127DC_(p.Origin_Inbox)
  };
}

function logM02812StageCEvent_(label, event) {
  console.log('----------------------------------------');
  console.log(`${label} | page=${event.pageId}`);
  console.log(`   title=${event.title || '-'}`);
  console.log(`   Human_Status=${event.humanStatus || '-'}`);
  console.log(`   DateTime=${event.dateTime || '-'}`);
  console.log(`   Sources=${(event.sourceIds || []).join('|') || '-'}`);
  console.log(`   Origin_Inbox=${(event.originInboxIds || []).join('|') || '-'}`);
}
