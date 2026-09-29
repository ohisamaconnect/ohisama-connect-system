/**
 * おひさまコネクト - INBOX Crawler v1.2.8 Production Candidate
 * Revision Chain Structured Marking
 * 2026-09-29
 *
 * PURPOSE
 * -------
 * v1.2.7 の Stable Source Identity / Revision Detection を維持したまま、
 * CREATE_SOURCE_REVISION 発生時だけ Observation_Type を構造化する。
 *
 * Canonical policy:
 *   A) 既存の同一 Stable Source Key の physical rows
 *      -> Observation_Type = SOURCE_REVISION
 *   B) 新規 revision observation
 *      -> 作成時から Observation_Type = SOURCE_REVISION
 *   C) Decision / Event / Source / Status / Suggested_* は変更しない
 *   D) same-content / formatting-only は SOURCE_REVISION にしない
 *
 * SAFETY ORDER
 * ------------
 * Revision発生時は必ず:
 *   1. live chain reload
 *   2. Observation_Type safety audit
 *   3. existing rows mark (Observation_Type ONLY)
 *   4. new revision row create WITH SOURCE_REVISION
 *   5. ledger / in-memory state update
 *
 * 途中失敗時も、Revisionが通常Suggestion/Processorへ漏れない側へ倒す。
 *
 * Dependencies in same Apps Script project:
 *   ohisama_inbox_crawler_v1.2.6
 *   ohisama_inbox_crawler_v1.2.7_production_runner.gs
 *
 * IMPORTANT:
 *   v1.2.7 triggers停止中にPreviewを通し、承認後のみ
 *   installCrawlerTriggersV128() を実行する。
 */

const V128_PRODUCTION = Object.freeze({
  VERSION: '1.2.8',
  OBSERVATION_NORMAL: 'NORMAL',
  OBSERVATION_REVISION: 'SOURCE_REVISION',
  WRITE_INTERVAL_MS: 380,
  MAX_CHAIN_AUDIT_ROWS: 1000
});

// ============================================================
// Public entry points
// ============================================================

function runFrequentCrawlerV128() {
  runCrawlerGroupV128_('frequent-v1.2.8', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ], OCOS.MAX_CREATE_FREQUENT);
}

function runScheduleCrawlerV128() {
  runCrawlerGroupV128_('schedule-v1.2.8', [
    collectOfficialSchedule_
  ], OCOS.MAX_CREATE_SCHEDULE);
}

function runDailyCrawlerV128() {
  runCrawlerGroupV128_('daily-v1.2.8', [
    collectGoogleNewsCurrentMembers_,
    collectGoogleNewsGraduatedMembers_
  ], OCOS.MAX_CREATE_DAILY);
}

function runFullCrawlerChunkV128() {
  runCrawlerGroupV128_('full-chunk-v1.2.8', fullCollectors_(), OCOS.MAX_CREATE_FULL);
}

/**
 * WRITE = NONE
 * 現行公式取得を v1.2.7 classifier で判定し、
 * Revisionが出た場合に v1.2.8 がどの既存行をmarkするかまで表示する。
 */
function previewV128ProductionDecisionGate() {
  validateBaseConfig_();

  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.8 PRODUCTION DECISION GATE');
  console.log('WRITE = NONE');
  console.log('REVISION CHAIN MARKING = PREVIEW ONLY');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetV127P_);

  const state = loadSeenStateV127P_();
  const counts = {
    createNew: 0,
    createRevision: 0,
    suppressSame: 0,
    suppressFormatting: 0,
    suppressLegacy: 0,
    revisionExistingRows: 0,
    revisionExistingNeedsMark: 0,
    revisionExistingAlreadyMarked: 0,
    revisionUnexpectedObservationType: 0
  };

  const revisionPlans = [];

  normalized.forEach(item => {
    const d = classifyItemV127P_(item, state);

    if (d.action === 'CREATE_NEW_SOURCE') counts.createNew++;
    else if (d.action === 'CREATE_SOURCE_REVISION') {
      counts.createRevision++;
      const plan = previewRevisionChainPlanV128_(item, d.stableKey);
      counts.revisionExistingRows += plan.rows.length;
      counts.revisionExistingNeedsMark += plan.needsMark.length;
      counts.revisionExistingAlreadyMarked += plan.alreadyMarked.length;
      counts.revisionUnexpectedObservationType += plan.unexpected.length;
      revisionPlans.push({ item, decision: d, plan });
    }
    else if (d.action === 'SUPPRESS_SAME_CONTENT') counts.suppressSame++;
    else if (d.action === 'SUPPRESS_FORMATTING_ONLY') counts.suppressFormatting++;
    else if (d.action === 'SUPPRESS_LEGACY_SEEN') counts.suppressLegacy++;
  });

  console.log(`RAW_COLLECTED = ${raw.length}`);
  console.log(`NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`STABLE_STATE_KEYS = ${state.latestStableByKey.size}`);
  console.log('----------------------------------------');
  console.log(`CREATE_NEW_SOURCE = ${counts.createNew}`);
  console.log(`CREATE_SOURCE_REVISION = ${counts.createRevision}`);
  console.log(`SUPPRESS_SAME_CONTENT = ${counts.suppressSame}`);
  console.log(`SUPPRESS_FORMATTING_ONLY = ${counts.suppressFormatting}`);
  console.log(`SUPPRESS_LEGACY_SEEN = ${counts.suppressLegacy}`);
  console.log('----------------------------------------');
  console.log(`REVISION_EXISTING_PHYSICAL_ROWS = ${counts.revisionExistingRows}`);
  console.log(`REVISION_EXISTING_ROWS_NEED_MARK = ${counts.revisionExistingNeedsMark}`);
  console.log(`REVISION_EXISTING_ROWS_ALREADY_MARKED = ${counts.revisionExistingAlreadyMarked}`);
  console.log(`REVISION_UNEXPECTED_OBSERVATION_TYPE = ${counts.revisionUnexpectedObservationType}`);

  revisionPlans.forEach((x, i) => {
    console.log('----------------------------------------');
    console.log(`${i + 1}. CREATE_SOURCE_REVISION | ${x.decision.stableKey}`);
    console.log(`   current=${x.item.title}`);
    console.log(`   previous=${x.decision.latest ? x.decision.latest.title : '-'}`);
    console.log(`   physicalRows=${x.plan.rows.length} / needsMark=${x.plan.needsMark.length} / alreadyMarked=${x.plan.alreadyMarked.length} / unexpected=${x.plan.unexpected.length}`);
    x.plan.rows.forEach((r, j) => {
      console.log(`   ${j + 1}) ${r.pageId} | Observation_Type=${r.observationType || '(blank)'} | ${r.title}`);
    });
  });

  console.log('========================================');
  if (counts.revisionUnexpectedObservationType > 0) {
    console.log('RESULT = BLOCKED: unexpected Observation_Type exists in revision chain');
  } else {
    console.log('RESULT = SAFE PREVIEW');
  }
  console.log('NEW REVISION ROW WILL BE CREATED WITH Observation_Type=SOURCE_REVISION');
  console.log('Decision / Event / Source / Status / Suggested_* = UNCHANGED');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

/**
 * v1.2.7 / v1.2.8 / legacy crawler handlers を整理し、v1.2.8だけを3本入れる。
 * Preview承認後のみ実行。
 */
function installCrawlerTriggersV128() {
  const removeHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (removeHandlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  ScriptApp.newTrigger('runFrequentCrawlerV128')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('runScheduleCrawlerV128')
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger('runDailyCrawlerV128')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  console.log(`v1.2.8 crawler triggers installed. removed=${removed}, installed=3`);
  auditCrawlerTriggersV128();
}

function removeCrawlerTriggersV128() {
  const handlers = [
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  console.log(`v1.2.8 crawler triggers removed: ${removed}`);
}

function auditCrawlerTriggersV128() {
  const handlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];

  const counts = {};
  handlers.forEach(h => counts[h] = 0);
  const rows = [];

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (!Object.prototype.hasOwnProperty.call(counts, h)) return;
    counts[h]++;
    rows.push({
      handler: h,
      eventType: String(t.getEventType()),
      source: String(t.getTriggerSource())
    });
  });

  console.log('========================================');
  console.log('OC-OS CRAWLER TRIGGER MIGRATION AUDIT v1.2.8');
  handlers.forEach(h => console.log(`${h} = ${counts[h]}`));
  rows.forEach((r, i) => console.log(`${i + 1}. ${r.handler} | eventType=${r.eventType} / source=${r.source}`));
  console.log('EXPECTED: V128 frequent=1 / schedule=1 / daily=1; all legacy/V127=0');
  console.log('========================================');
}

// ============================================================
// Orchestrator v1.2.8
// ============================================================

function runCrawlerGroupV128_(label, collectors, maxCreate) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn(`[${label}] another crawler is running; skipped.`);
    return;
  }

  const startedAt = Date.now();
  let ledgerBuffer = [];

  try {
    validateBaseConfig_();
    getOrCreateLedgerSheet_();

    let candidates = [];
    for (const fn of collectors) {
      if (isNearSoftLimit_(startedAt)) {
        console.warn(`[${label}] soft time limit reached during collection.`);
        break;
      }
      try {
        const items = fn() || [];
        console.log(`${fn.name}: ${items.length} candidates`);
        candidates = candidates.concat(items);
      } catch (err) {
        console.error(`${fn.name} failed: ${err.stack || err}`);
      }
    }

    const normalized = normalizeAndDeduplicateCandidates_(candidates);
    console.log(`[${label}] normalized unique candidates: ${normalized.length}`);

    const state = loadSeenStateV127P_();
    const counts = {
      createdNew: 0,
      createdRevision: 0,
      existingRevisionRowsMarked: 0,
      existingRevisionRowsAlreadyMarked: 0,
      revisionBlocked: 0,
      suppressedSame: 0,
      suppressedFormatting: 0,
      suppressedLegacy: 0,
      failed: 0
    };

    for (const item of normalized) {
      const decision = classifyItemV127P_(item, state);

      if (decision.action === 'SUPPRESS_SAME_CONTENT') {
        counts.suppressedSame++;
        continue;
      }
      if (decision.action === 'SUPPRESS_FORMATTING_ONLY') {
        counts.suppressedFormatting++;
        continue;
      }
      if (decision.action === 'SUPPRESS_LEGACY_SEEN') {
        counts.suppressedLegacy++;
        continue;
      }

      if (
        counts.createdNew + counts.createdRevision >= maxCreate ||
        isNearSoftLimit_(startedAt)
      ) {
        break;
      }

      try {
        const isRevision = decision.action === 'CREATE_SOURCE_REVISION';
        const detectedAt = nowJstIso_();

        if (isRevision) {
          const markResult = markExistingRevisionChainV128_(item, decision.stableKey);
          counts.existingRevisionRowsMarked += markResult.marked;
          counts.existingRevisionRowsAlreadyMarked += markResult.alreadyMarked;

          if (!markResult.safe) {
            counts.revisionBlocked++;
            console.error(
              `[${label}] REVISION BLOCKED unexpected Observation_Type: ` +
              `${decision.stableKey} | ${item.title}`
            );
            continue;
          }

          const writeItem = makeRevisionInboxItemV127P_(item);
          createRevisionInboxPageV128_(writeItem, detectedAt);

          markSeen_(item, state.baseSeenState);
          markStableObservationV127P_(item, state, detectedAt, 'runtime');
          counts.createdRevision++;

          console.log(
            `[${label}] SOURCE_REVISION created + chain marked: ` +
            `${item.collector} | ${item.title} | ${item.url}`
          );
        } else {
          createInboxPage_(item);
          markSeen_(item, state.baseSeenState);
          markStableObservationV127P_(item, state, detectedAt, 'runtime');
          counts.createdNew++;
        }

        ledgerBuffer.push(makeLedgerRow_(item));
        if (ledgerBuffer.length >= OCOS.LEDGER_FLUSH_EVERY) {
          appendLedgerRows_(ledgerBuffer);
          ledgerBuffer = [];
        }

        Utilities.sleep(OCOS.NOTION_WRITE_INTERVAL_MS);
      } catch (err) {
        counts.failed++;
        console.error(
          `createInboxPage v1.2.8 failed: ${item.title} / ${err.stack || err}`
        );
      }
    }

    if (ledgerBuffer.length) {
      appendLedgerRows_(ledgerBuffer);
      ledgerBuffer = [];
    }

    let remaining = 0;
    normalized.forEach(item => {
      const d = classifyItemV127P_(item, state);
      if (
        d.action === 'CREATE_NEW_SOURCE' ||
        d.action === 'CREATE_SOURCE_REVISION' ||
        d.action === 'CREATE_LEGACY_NEW'
      ) remaining++;
    });

    console.log(
      `[${label}] done. new=${counts.createdNew}, revisions=${counts.createdRevision}, ` +
      `revisionMarked=${counts.existingRevisionRowsMarked}, revisionAlreadyMarked=${counts.existingRevisionRowsAlreadyMarked}, ` +
      `revisionBlocked=${counts.revisionBlocked}, suppressedSame=${counts.suppressedSame}, ` +
      `suppressedFormatting=${counts.suppressedFormatting}, suppressedLegacy=${counts.suppressedLegacy}, ` +
      `failed=${counts.failed}, remaining=${remaining}, ` +
      `elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
  } finally {
    if (ledgerBuffer.length) {
      try {
        appendLedgerRows_(ledgerBuffer);
      } catch (e) {
        console.error(`Ledger v1.2.8 final flush failed: ${e.stack || e}`);
      }
    }
    lock.releaseLock();
  }
}

// ============================================================
// Revision chain marking
// ============================================================

function previewRevisionChainPlanV128_(item, stableKey) {
  const rows = loadPhysicalStableChainV128_(item, stableKey);
  const plan = classifyPhysicalChainMarkingV128_(rows);
  return Object.assign({ rows }, plan);
}

function markExistingRevisionChainV128_(item, stableKey) {
  // Live reload immediately before any write.
  const rows = loadPhysicalStableChainV128_(item, stableKey);
  const plan = classifyPhysicalChainMarkingV128_(rows);

  if (plan.unexpected.length > 0) {
    return {
      safe: false,
      marked: 0,
      alreadyMarked: plan.alreadyMarked.length,
      unexpected: plan.unexpected.length
    };
  }

  let marked = 0;
  for (const row of plan.needsMark) {
    notionRequest_(
      `/v1/pages/${row.pageId}`,
      'patch',
      {
        properties: {
          Observation_Type: {
            select: { name: V128_PRODUCTION.OBSERVATION_REVISION }
          }
        }
      }
    );
    marked++;
    Utilities.sleep(V128_PRODUCTION.WRITE_INTERVAL_MS);
  }

  return {
    safe: true,
    marked,
    alreadyMarked: plan.alreadyMarked.length,
    unexpected: 0
  };
}

function classifyPhysicalChainMarkingV128_(rows) {
  const needsMark = [];
  const alreadyMarked = [];
  const unexpected = [];

  (rows || []).forEach(row => {
    const v = String(row.observationType || '').trim();
    if (!v || v === V128_PRODUCTION.OBSERVATION_NORMAL) {
      needsMark.push(row);
    } else if (v === V128_PRODUCTION.OBSERVATION_REVISION) {
      alreadyMarked.push(row);
    } else {
      unexpected.push(row);
    }
  });

  return { needsMark, alreadyMarked, unexpected };
}

function loadPhysicalStableChainV128_(item, stableKey) {
  const collector = String((item && item.collector) || '').trim();
  const targetKey = String(stableKey || stableSourceKeyV127P_(item) || '').trim();
  if (!collector || !targetKey) return [];

  const rows = [];
  let cursor = null;
  let scanned = 0;

  do {
    const body = {
      page_size: 100,
      filter: {
        property: 'Collector',
        rich_text: { equals: collector }
      },
      sorts: [
        { property: 'Detected_At', direction: 'ascending' }
      ]
    };
    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      scanned++;
      if (scanned > V128_PRODUCTION.MAX_CHAIN_AUDIT_ROWS) {
        throw new Error('Revision chain audit exceeded MAX_CHAIN_AUDIT_ROWS.');
      }

      const p = page.properties || {};
      const row = {
        pageId: page.id || '',
        title: crawlerNotionTitle_(p.Inbox_Title),
        url: p.URL && p.URL.url ? String(p.URL.url) : '',
        collector: crawlerNotionText_(p.Collector),
        observationType: selectNameV128_(p.Observation_Type),
        decision: selectNameV128_(p.Decision),
        status: selectNameV128_(p.Status),
        detectedAt:
          p.Detected_At && p.Detected_At.date && p.Detected_At.date.start
            ? String(p.Detected_At.date.start)
            : ''
      };

      if (stableSourceKeyV127P_(row) === targetKey) rows.push(row);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return rows;
}

// ============================================================
// Revision row creation WITH structured Observation_Type
// ============================================================

function createRevisionInboxPageV128_(item, detectedAt) {
  const properties = {
    Inbox_Title: notionTitle_(item.title),
    URL: { url: item.url },
    Detected_At: { date: { start: detectedAt || nowJstIso_() } },
    Publisher: notionRichText_(item.publisher),
    Source_Class: { select: { name: item.sourceClass } },
    Source_Type: { select: { name: item.sourceType } },
    Detected_Snippet: notionRichText_(item.snippet),
    Status: { select: { name: '未処理' } },
    Decision: { select: { name: '未判断' } },
    Fingerprint: notionRichText_(item.fingerprint),
    Collector: notionRichText_(item.collector || ''),
    Publisher_Host: notionRichText_(item.publisherHost || ''),
    Discovery_Terms: notionRichText_(item.discoveryTerms || ''),
    Observation_Type: {
      select: { name: V128_PRODUCTION.OBSERVATION_REVISION }
    }
  };

  if (item.publishedAt) {
    properties.Published_At = {
      date: { start: item.publishedAt }
    };
  }

  if (item.eventDateHint) {
    properties.Event_Date_Hint = {
      date: { start: item.eventDateHint }
    };
  }

  const page = notionRequest_(
    '/v1/pages',
    'post',
    {
      parent: {
        type: 'data_source_id',
        data_source_id: OCOS.NOTION_INBOX_DATA_SOURCE_ID
      },
      properties
    }
  );

  if (!page || !page.id) {
    throw new Error('v1.2.8 revision create returned no page.id');
  }

  return page;
}

function selectNameV128_(prop) {
  return prop && prop.select && prop.select.name
    ? String(prop.select.name)
    : '';
}
