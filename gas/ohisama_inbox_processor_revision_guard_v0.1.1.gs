/**
 * OC-OS Inbox Processor Revision Guard v0.1.1
 * 2026-09-29
 *
 * Purpose:
 *   Observation_Type = SOURCE_REVISION のINBOXを通常Processorから除外する。
 *
 * Safety design:
 *   1) Query-level guard: candidate load時点で SOURCE_REVISION を除外
 *   2) Validation-level guard: 実行直前にも SOURCE_REVISION をBLOCK
 *   3) SOURCE_REVISIONを理由にINBOXを書き換えない（skip only）
 *
 * Dependencies in same Apps Script project:
 *   ohisama_inbox_processor_v0.1.gs
 *     OCOS_PROCESSOR
 *     processorValidateConfig_()
 *     processorNotionRequest_()
 *     processorParseInboxPage_()
 *     processorValidateItem_()
 *     processorProcessItem_()
 *     processorMarkRuntimeError_()
 *     processorErrorMessage_()
 *     processorSelect_()
 */

const OCOS_PROCESSOR_REVISION_GUARD_011 = Object.freeze({
  VERSION: '0.1.1-revision-guard',
  REVISION_VALUE: 'SOURCE_REVISION'
});

function previewInboxProcessorV011() {
  processorValidateConfig_();
  const pages = processorLoadCandidatesV011_(OCOS_PROCESSOR.MAX_PER_RUN);

  let revisionBlocked = 0;

  console.log('========================================');
  console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_REVISION_GUARD_011.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`QUERY_CANDIDATES = ${pages.length}`);
  console.log('========================================');

  pages.forEach((page, index) => {
    const item = processorParseInboxPageV011_(page);
    const validation = processorValidateItemV011_(item);
    if (isSourceRevisionProcessorV011_(item)) revisionBlocked++;

    console.log(
      `${index + 1}. ${validation.ok ? '[READY]' : '[BLOCKED]'} ` +
      `${item.decision} | ${item.title}`
    );
    console.log(
      `   observationType=${item.observationType || '(blank=NORMAL)'} / ` +
      `sourceClass=${item.sourceClass || '-'} / sourceType=${item.sourceType || '-'} / ` +
      `sourceRel=${item.sourceIds.length} / eventRel=${item.eventIds.length}`
    );
    validation.errors.forEach(x => console.log(`   ERROR: ${x}`));
    validation.warnings.forEach(x => console.log(`   WARN: ${x}`));
  });

  console.log('----------------------------------------');
  console.log(`RUNTIME_REVISION_BLOCKED = ${revisionBlocked}`);
  console.log('SOURCE_REVISION = EXCLUDED / BLOCKED');
  console.log('========================================');
  console.log('PREVIEW COMPLETE');
  console.log('========================================');
}

function runInboxProcessorV011() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Processor skipped.');
    return;
  }

  const startedAt = Date.now();

  try {
    processorValidateConfig_();
    const pages = processorLoadCandidatesV011_(OCOS_PROCESSOR.MAX_PER_RUN);

    let processed = 0;
    let excluded = 0;
    let revisionSkipped = 0;
    let blocked = 0;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX PROCESSOR ${OCOS_PROCESSOR_REVISION_GUARD_011.VERSION}`);
    console.log(`QUERY_CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_PROCESSOR.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items will wait for next run.');
        break;
      }

      const item = processorParseInboxPageV011_(page);

      // Runtime second guard. SOURCE_REVISIONは書換えずskipする。
      if (isSourceRevisionProcessorV011_(item)) {
        revisionSkipped++;
        console.log(`[REVISION_SKIP] ${item.decision} | ${item.title}`);
        continue;
      }

      const validation = processorValidateItemV011_(item);
      if (!validation.ok) {
        blocked++;
        // v0.1.0と同様のvalidation記録は通常行だけに行う。
        processorMarkValidationBlocked_(item, validation.errors.join(' / '));
        console.warn(`[BLOCKED] ${item.title}: ${validation.errors.join(' / ')}`);
        Utilities.sleep(OCOS_PROCESSOR.WRITE_INTERVAL_MS);
        continue;
      }

      try {
        const result = processorProcessItem_(item);
        if (result === 'excluded') excluded++;
        else processed++;
        console.log(`[OK] ${item.decision} | ${item.title}`);
      } catch (err) {
        failed++;
        const message = processorErrorMessage_(err);
        try {
          processorMarkRuntimeError_(item, message);
        } catch (markErr) {
          console.error(
            `[ERROR] Failed to record Processor_Error for ${item.title}: ` +
            processorErrorMessage_(markErr)
          );
        }
        console.error(`[FAILED] ${item.title}: ${message}`);
      }

      Utilities.sleep(OCOS_PROCESSOR.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(
      `DONE processed=${processed}, excluded=${excluded}, revisionSkipped=${revisionSkipped}, ` +
      `blocked=${blocked}, failed=${failed}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
    console.log('SOURCE_REVISION = EXCLUDED / BLOCKED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function processorLoadCandidatesV011_(pageSize) {
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: Math.min(pageSize || 20, 100),
      filter: {
        and: [
          {
            or: [
              { property: 'Status', select: { equals: '未処理' } },
              { property: 'Status', select: { equals: '確認中' } }
            ]
          },
          { property: 'Decision', select: { does_not_equal: '未判断' } },
          // blank / NORMAL は従来通り通常処理。SOURCE_REVISIONだけ除外。
          { property: 'Observation_Type', select: { does_not_equal: OCOS_PROCESSOR_REVISION_GUARD_011.REVISION_VALUE } }
        ]
      },
      sorts: [
        { property: 'Detected_At', direction: 'ascending' }
      ]
    }
  );

  return (result.results || []).filter(page => {
    const item = processorParseInboxPageV011_(page);
    return !isSourceRevisionProcessorV011_(item);
  });
}

function processorParseInboxPageV011_(page) {
  const item = processorParseInboxPage_(page);
  const p = (page && page.properties) || {};
  item.observationType = processorSelect_(p.Observation_Type);
  return item;
}

function processorValidateItemV011_(item) {
  if (isSourceRevisionProcessorV011_(item)) {
    return {
      ok: false,
      errors: ['Observation_Type=SOURCE_REVISION は通常Processor対象外です。'],
      warnings: []
    };
  }
  return processorValidateItem_(item);
}

function isSourceRevisionProcessorV011_(item) {
  return String((item && item.observationType) || '').trim() ===
    OCOS_PROCESSOR_REVISION_GUARD_011.REVISION_VALUE;
}
