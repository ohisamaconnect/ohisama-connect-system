/**
 * OC-OS Inbox Processor READY-only Production Runner v0.1.2
 * 2026-09-29
 *
 * Purpose:
 *   - SOURCE_REVISION を通常Processorから除外する。
 *   - BLOCKED候補はREAD ONLYでskipし、NotionへPATCHしない。
 *   - 先頭BLOCKED行を越えて走査し、READY行だけ最大10件処理する。
 *
 * Safety:
 *   1) Query-level: Observation_Type blank / NORMAL のみ対象。
 *   2) Scan-level: SOURCE_REVISION再確認。
 *   3) Commit直前: page GETで現在状態を再取得し再validation。
 *   4) BLOCKEDはProcessor_Error / Version / Statusを含め一切書き換えない。
 *   5) Human-owned Decision / Event はProcessorが決めない。
 *
 * Dependencies in same Apps Script project:
 *   ohisama_inbox_processor_v0.1.gs
 *   ohisama_inbox_processor_revision_guard_v0.1.1.gs
 */

const OCOS_PROCESSOR_READY_ONLY_012 = Object.freeze({
  VERSION: '0.1.2-ready-only',
  PAGE_SIZE: 100,
  MAX_SCAN: 500,
  TARGET_READY: 10
});

function previewInboxProcessorProductionV012() {
  processorValidateConfig_();
  const revisionExposure = processorLoadRevisionExposureV011_();
  const scan = processorScanReadyOnlyV012_();

  console.log('========================================');
  console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_READY_ONLY_012.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`REVISION_ROWS_EXCLUDED_BY_QUERY = ${revisionExposure.length}`);
  console.log(`SCANNED_NORMAL_CANDIDATES = ${scan.scanned}`);
  console.log(`READY_TO_PROCESS = ${scan.ready.length}`);
  console.log(`BLOCKED_SKIPPED_READ_ONLY = ${scan.blocked.length}`);
  console.log(`HAS_MORE_NORMAL_CANDIDATES = ${scan.hasMore ? 'YES' : 'NO'}`);
  console.log('----------------------------------------');

  scan.ready.forEach((x, i) => {
    console.log(`${i + 1}. [READY] ${x.item.decision} | ${x.item.title}`);
    console.log(
      `   observationType=${x.item.observationType || '(blank=NORMAL)'} / ` +
      `sourceClass=${x.item.sourceClass || '-'} / sourceType=${x.item.sourceType || '-'} / ` +
      `sourceRel=${x.item.sourceIds.length} / eventRel=${x.item.eventIds.length}`
    );
    x.validation.warnings.forEach(w => console.log(`   WARN: ${w}`));
  });

  if (scan.blocked.length) {
    console.log('----------------------------------------');
    scan.blocked.slice(0, 20).forEach((x, i) => {
      console.log(`${i + 1}. [BLOCKED-SKIP] ${x.item.decision} | ${x.item.title}`);
      x.validation.errors.forEach(e => console.log(`   ERROR: ${e}`));
    });
    if (scan.blocked.length > 20) {
      console.log(`... additional blocked omitted = ${scan.blocked.length - 20}`);
    }
  }

  console.log('========================================');
  console.log('SOURCE_REVISION = EXCLUDED');
  console.log('BLOCKED = READ ONLY / NO PATCH');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function runInboxProcessorV012() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Processor skipped.');
    return;
  }

  const startedAt = Date.now();
  try {
    processorValidateConfig_();
    const scan = processorScanReadyOnlyV012_();

    let processed = 0;
    let excluded = 0;
    let staleSkipped = 0;
    let revisionSkipped = 0;
    let blockedSkipped = scan.blocked.length;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_READY_ONLY_012.VERSION}`);
    console.log(`SCANNED_NORMAL_CANDIDATES = ${scan.scanned}`);
    console.log(`READY_SNAPSHOT = ${scan.ready.length}`);
    console.log(`BLOCKED_SKIPPED_READ_ONLY = ${scan.blocked.length}`);
    console.log('========================================');

    for (const snapshot of scan.ready) {
      if (Date.now() - startedAt >= OCOS_PROCESSOR.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining READY items wait for next run.');
        break;
      }

      // Commit直前に必ず再取得する。Snapshotだけで書かない。
      const currentPage = processorNotionRequest_(`/v1/pages/${snapshot.item.pageId}`, 'get');
      if (!currentPage || currentPage.in_trash || currentPage.archived) {
        staleSkipped++;
        console.log(`[STALE_SKIP] trashed/archived | ${snapshot.item.title}`);
        continue;
      }

      const item = processorParseInboxPageV011_(currentPage);

      if (!processorIsNormalObservationV012_(item.observationType)) {
        if (isSourceRevisionProcessorV011_(item)) revisionSkipped++;
        else staleSkipped++;
        console.log(`[OBSERVATION_SKIP] ${item.observationType || '(unknown)'} | ${item.title}`);
        continue;
      }

      const validation = processorValidateItemV011_(item);
      if (!validation.ok) {
        // 状態が変わってBLOCKEDになった場合もREAD ONLY。
        staleSkipped++;
        console.log(`[NOW_BLOCKED_SKIP] ${item.title}: ${validation.errors.join(' / ')}`);
        continue;
      }

      try {
        const result = processorProcessItemV012_(item);
        if (result === 'excluded') excluded++;
        else processed++;
        console.log(`[OK] ${item.decision} | ${item.title}`);
      } catch (err) {
        failed++;
        const message = processorErrorMessage_(err);

        try {
          processorMarkRuntimeErrorV012_(item, message);
        } catch (markErr) {
          console.error(
            `[ERROR] Failed to record runtime error for ${item.title}: ` +
            processorErrorMessage_(markErr)
          );
        }
        console.error(`[FAILED] ${item.title}: ${message}`);
      }

      Utilities.sleep(OCOS_PROCESSOR.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(
      `DONE processed=${processed}, excluded=${excluded}, ` +
      `blockedSkippedReadOnly=${blockedSkipped}, staleSkipped=${staleSkipped}, ` +
      `revisionSkipped=${revisionSkipped}, failed=${failed}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
    console.log('SOURCE_REVISION = EXCLUDED');
    console.log('BLOCKED = READ ONLY / NO PATCH');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function processorScanReadyOnlyV012_() {
  const ready = [];
  const blocked = [];
  let scanned = 0;
  let cursor = null;
  let hasMore = false;

  do {
    const body = {
      page_size: OCOS_PROCESSOR_READY_ONLY_012.PAGE_SIZE,
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

    for (let i = 0; i < pages.length; i++) {
      if (scanned >= OCOS_PROCESSOR_READY_ONLY_012.MAX_SCAN) break;
      scanned++;

      const item = processorParseInboxPageV011_(pages[i]);

      if (!processorIsNormalObservationV012_(item.observationType)) {
        blocked.push({
          item,
          validation: {
            ok: false,
            errors: [`Unexpected Observation_Type=${item.observationType || '(blank)'}`],
            warnings: []
          }
        });
        continue;
      }

      const validation = processorValidateItemV011_(item);
      if (validation.ok) {
        ready.push({ item, validation });
        if (ready.length >= OCOS_PROCESSOR_READY_ONLY_012.TARGET_READY) {
          return {
            scanned,
            ready,
            blocked,
            hasMore: Boolean(response.has_more || i < pages.length - 1)
          };
        }
      } else {
        blocked.push({ item, validation });
      }
    }

    if (scanned >= OCOS_PROCESSOR_READY_ONLY_012.MAX_SCAN) {
      hasMore = Boolean(response.has_more);
      break;
    }

    cursor = response.has_more ? response.next_cursor : null;
    hasMore = Boolean(cursor);
  } while (cursor);

  return { scanned, ready, blocked, hasMore };
}

function processorIsNormalObservationV012_(value) {
  const s = String(value || '').trim();
  return !s || s === OCOS_PROCESSOR_REVISION_GUARD_011.NORMAL_VALUE;
}

function processorProcessItemV012_(item) {
  const version = OCOS_PROCESSOR_READY_ONLY_012.VERSION;

  if (item.decision === '対象外') {
    processorPatchPage_(item.pageId, {
      Status: { select: { name: '除外' } },
      Processed_At: { date: { start: processorNowJstIso_() } },
      Processor_Version: processorRichText_(version),
      Processor_Error: processorRichText_('')
    });
    return 'excluded';
  }

  processorPatchPage_(item.pageId, {
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(version),
    Processor_Error: processorRichText_('')
  });

  const sourceId = processorGetOrCreateSource_(item);

  processorPatchPage_(item.pageId, {
    Source: { relation: [{ id: sourceId }] },
    Processor_Version: processorRichText_(version)
  });

  if (item.decision === 'SOURCESのみ登録') {
    processorMarkSuccessV012_(item.pageId);
    return 'processed';
  }

  if (item.decision === '既存EVENTへ追加') {
    processorMergeSourceEvents_(sourceId, item.eventIds);
    processorMarkSuccessV012_(item.pageId);
    return 'processed';
  }

  if (item.decision === '新規EVENT作成') {
    const eventId = processorGetOrCreateDraftEvent_(item, sourceId);
    processorPatchPage_(item.pageId, {
      Event: { relation: [{ id: eventId }] },
      Processor_Version: processorRichText_(version)
    });
    processorMergeSourceEvents_(sourceId, [eventId]);
    processorMarkSuccessV012_(item.pageId);
    return 'processed';
  }

  throw new Error(`Unexpected Decision: ${item.decision}`);
}

function processorMarkSuccessV012_(inboxPageId) {
  processorPatchPage_(inboxPageId, {
    Status: { select: { name: '処理済' } },
    Processed_At: { date: { start: processorNowJstIso_() } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_READY_ONLY_012.VERSION),
    Processor_Error: processorRichText_('')
  });
}

function processorMarkRuntimeErrorV012_(item, message) {
  processorPatchPage_(item.pageId, {
    Status: { select: { name: '確認中' } },
    Processor_Version: processorRichText_(OCOS_PROCESSOR_READY_ONLY_012.VERSION),
    Processor_Error: processorRichText_(processorTruncate_(message, 1800))
  });
}
