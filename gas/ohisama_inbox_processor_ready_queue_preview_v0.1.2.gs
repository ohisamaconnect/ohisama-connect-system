/**
 * OC-OS Inbox Processor READY Queue Preview v0.1.2
 * 2026-09-29
 *
 * Purpose:
 *   Revision Guard導入後の通常Processor候補を広く走査し、
 *   先頭のBLOCKED行によって後続READY行が飢餓状態になる問題を可視化する。
 *
 * WRITE = NONE
 * - Notion page更新なし
 * - Script Properties更新なし
 * - Trigger変更なし
 *
 * Dependencies in same Apps Script project:
 *   ohisama_inbox_processor_v0.1.gs
 *   ohisama_inbox_processor_revision_guard_v0.1.1.gs
 */

const OCOS_PROCESSOR_READY_QUEUE_012 = Object.freeze({
  VERSION: '0.1.2-ready-queue-preview',
  PAGE_SIZE: 100,
  MAX_SCAN: 500,
  TARGET_READY: 10
});

function previewInboxProcessorReadyQueueV012() {
  processorValidateConfig_();

  console.log('========================================');
  console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_READY_QUEUE_012.VERSION}`);
  console.log('WRITE = NONE');
  console.log('SOURCE_REVISION = EXCLUDED');
  console.log('BLOCKED ROWS = READ ONLY / NO PATCH');
  console.log('========================================');

  const result = processorScanReadyQueueV012_();

  console.log(`SCANNED_NORMAL_CANDIDATES = ${result.scanned}`);
  console.log(`READY_FOUND = ${result.ready.length}`);
  console.log(`BLOCKED_FOUND = ${result.blocked.length}`);
  console.log(`TARGET_READY = ${OCOS_PROCESSOR_READY_QUEUE_012.TARGET_READY}`);
  console.log(`HAS_MORE_NORMAL_CANDIDATES = ${result.hasMore ? 'YES' : 'NO'}`);
  console.log('----------------------------------------');

  result.ready.forEach((x, i) => {
    console.log(`${i + 1}. [READY] ${x.item.decision} | ${x.item.title}`);
    console.log(
      `   observationType=${x.item.observationType || '(blank=NORMAL)'} / ` +
      `sourceClass=${x.item.sourceClass || '-'} / sourceType=${x.item.sourceType || '-'} / ` +
      `sourceRel=${x.item.sourceIds.length} / eventRel=${x.item.eventIds.length}`
    );
    x.validation.warnings.forEach(w => console.log(`   WARN: ${w}`));
  });

  if (result.ready.length) console.log('----------------------------------------');

  const blockedSample = result.blocked.slice(0, 30);
  blockedSample.forEach((x, i) => {
    console.log(`${i + 1}. [BLOCKED] ${x.item.decision} | ${x.item.title}`);
    x.validation.errors.forEach(e => console.log(`   ERROR: ${e}`));
  });
  if (result.blocked.length > blockedSample.length) {
    console.log(`... BLOCKED additional rows omitted = ${result.blocked.length - blockedSample.length}`);
  }

  console.log('========================================');
  if (result.ready.length > 0) {
    console.log('RESULT = READY rows exist behind BLOCKED head rows');
    console.log('RECOMMENDATION = production runner should scan past BLOCKED rows and process READY only');
  } else if (result.hasMore) {
    console.log('RESULT = No READY row found within scan limit; more candidates remain');
  } else {
    console.log('RESULT = No READY row exists in current normal candidate queue');
  }
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function processorScanReadyQueueV012_() {
  const ready = [];
  const blocked = [];
  let scanned = 0;
  let cursor = null;
  let hasMore = false;

  do {
    const body = {
      page_size: OCOS_PROCESSOR_READY_QUEUE_012.PAGE_SIZE,
      filter: {
        and: [
          ...processorBaseCandidateFiltersV011_(),
          {
            or: [
              { property: 'Observation_Type', select: { is_empty: true } },
              { property: 'Observation_Type', select: { equals: OCOS_PROCESSOR_REVISION_GUARD_011.NORMAL_VALUE } }
            ]
          }
        ]
      },
      sorts: [{ property: 'Detected_At', direction: 'ascending' }]
    };
    if (cursor) body.start_cursor = cursor;

    const response = processorNotionRequest_(
      `/v1/data_sources/${OCOS_PROCESSOR.INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    const pages = response.results || [];

    for (const page of pages) {
      if (scanned >= OCOS_PROCESSOR_READY_QUEUE_012.MAX_SCAN) break;
      scanned++;

      const item = processorParseInboxPageV011_(page);

      // Query-level guardの再確認。ここに来たRevisionは異常なのでBLOCK扱い。
      if (isSourceRevisionProcessorV011_(item)) {
        blocked.push({
          item,
          validation: {
            ok: false,
            errors: ['Unexpected SOURCE_REVISION passed normal candidate query.'],
            warnings: []
          }
        });
        continue;
      }

      const validation = processorValidateItemV011_(item);
      if (validation.ok) {
        ready.push({ item, validation });
        if (ready.length >= OCOS_PROCESSOR_READY_QUEUE_012.TARGET_READY) {
          return {
            scanned,
            ready,
            blocked,
            hasMore: Boolean(response.has_more || pages.indexOf(page) < pages.length - 1)
          };
        }
      } else {
        blocked.push({ item, validation });
      }
    }

    if (scanned >= OCOS_PROCESSOR_READY_QUEUE_012.MAX_SCAN) {
      hasMore = Boolean(response.has_more);
      break;
    }

    cursor = response.has_more ? response.next_cursor : null;
    hasMore = Boolean(cursor);
  } while (cursor);

  return { scanned, ready, blocked, hasMore };
}
