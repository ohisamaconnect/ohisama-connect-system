/**
 * おひさまコネクト - INBOX Crawler v1.2.7 Production Runner
 * Stable Source Identity + Revision Detection
 * 2026-09-28
 *
 * STATUS
 * ------
 * Production implementation candidate. 既存 v1.2.6 を直接上書きせず、
 * v1.2.6 のCollector / normalize / Notion write / Ledgerを再利用する別Runner。
 *
 * v1.2.7 rule
 * -----------
 * official-news / official-blog / official-youtube:
 *   Stable Source Key = Collector + canonical URL
 *
 * 同じ Stable Source Key の最新観測と現在取得内容を比較する。
 *   - 同一内容                 -> SUPPRESS_SAME_CONTENT
 *   - 空白等の表記差のみ       -> SUPPRESS_FORMATTING_ONLY
 *   - 意味のあるタイトル変更   -> CREATE_SOURCE_REVISION
 *   - Stable Key 未見          -> CREATE_NEW_SOURCE
 *
 * SOURCE Revision は新規SOURCEとはみなさないが、変化を失わないため
 * INBOXへ「新しい観測」として1回だけ投入する。
 * その際 Detected_Snippet の先頭へ [SOURCE_REVISION_CANDIDATE] を付与する。
 * Decision / Event / Status / Suggestion_* の既存行は変更しない。
 * 新規INBOX行の Decision / Status は従来 createInboxPage_() の既定値のまま。
 *
 * official-schedule / Google News / schedule-related 等:
 *   v1.2.6 の Fingerprint / Google News ArticleKey 判定をそのまま使う。
 *
 * IMPORTANT
 * ---------
 * このファイルを追加しただけでは既存トリガーは切り替わらない。
 * まず previewV127ProductionDecisionGate() を実行し、結果確認後に
 * installCrawlerTriggersV127() を実行する。
 *
 * Dependencies: v1.2.6 main crawler file in the same Apps Script project.
 */

const V127_PRODUCTION = Object.freeze({
  VERSION: '1.2.7',
  TARGET_COLLECTORS: [
    'official-news',
    'official-blog',
    'official-youtube'
  ],
  REVISION_SNIPPET_PREFIX: '[SOURCE_REVISION_CANDIDATE] '
});

// ============================================================
// Public entry points
// ============================================================

function runFrequentCrawlerV127() {
  runCrawlerGroupV127_('frequent-v1.2.7', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ], OCOS.MAX_CREATE_FREQUENT);
}

function runScheduleCrawlerV127() {
  runCrawlerGroupV127_('schedule-v1.2.7', [
    collectOfficialSchedule_
  ], OCOS.MAX_CREATE_SCHEDULE);
}

function runDailyCrawlerV127() {
  runCrawlerGroupV127_('daily-v1.2.7', [
    collectGoogleNewsCurrentMembers_,
    collectGoogleNewsGraduatedMembers_
  ], OCOS.MAX_CREATE_DAILY);
}

function runFullCrawlerChunkV127() {
  runCrawlerGroupV127_('full-chunk-v1.2.7', fullCollectors_(), OCOS.MAX_CREATE_FULL);
}

/**
 * v1.2.6 / v1.2.7 のCrawler triggerを整理し、v1.2.7へ切り替える。
 * 手動Preview確認後にのみ実行すること。
 */
function installCrawlerTriggersV127() {
  const oldHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler'
  ];

  const newHandlers = [
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    if (oldHandlers.includes(handler) || newHandlers.includes(handler)) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  ScriptApp.newTrigger('runFrequentCrawlerV127')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('runScheduleCrawlerV127')
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger('runDailyCrawlerV127')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  console.log(`v1.2.7 crawler triggers installed. removed=${removed}, installed=3`);
}

function removeCrawlerTriggersV127() {
  const handlers = [
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  console.log(`v1.2.7 crawler triggers removed: ${removed}`);
}

// ============================================================
// Production decision gate preview (WRITE NONE)
// ============================================================

/**
 * 本番Runner自身の判定ロジックを使って、Stable Source対象3 collectorを確認する。
 * WRITE = NONE。
 *
 * 現在値（2026-09-28 Preview通過直後）の期待:
 *   normalized=326
 *   CREATE_NEW_SOURCE=0
 *   CREATE_SOURCE_REVISION=0
 *   SUPPRESS_SAME_CONTENT=326
 *   SUPPRESS_FORMATTING_ONLY=0
 */
function previewV127ProductionDecisionGate() {
  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.7 PRODUCTION DECISION GATE');
  console.log('WRITE = NONE');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetV127P_);

  const state = loadSeenStateV127P_();
  const counts = {};
  const details = [];

  normalized.forEach(item => {
    const d = classifyItemV127P_(item, state);
    counts[d.action] = (counts[d.action] || 0) + 1;

    if (d.action === 'CREATE_NEW_SOURCE' || d.action === 'CREATE_SOURCE_REVISION') {
      details.push({ item, decision: d });
    }
  });

  console.log(`RAW_COLLECTED = ${raw.length}`);
  console.log(`NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`STABLE_STATE_KEYS = ${state.latestStableByKey.size}`);
  console.log('----------------------------------------');
  [
    'CREATE_NEW_SOURCE',
    'CREATE_SOURCE_REVISION',
    'SUPPRESS_SAME_CONTENT',
    'SUPPRESS_FORMATTING_ONLY',
    'SUPPRESS_LEGACY_SEEN',
    'CREATE_LEGACY_NEW'
  ].forEach(name => console.log(`${name} = ${counts[name] || 0}`));

  console.log('----------------------------------------');
  console.log('DETAIL: CREATE candidates');
  details.slice(0, 100).forEach((x, i) => {
    console.log(
      `${i + 1}. ${x.decision.action} | ${x.item.collector} | ${x.item.title} | ${x.item.url}`
    );
    if (x.decision.latest) {
      console.log(`   latest=${x.decision.latest.title || '-'} | ${x.decision.latest.detectedAt || '-'}`);
    }
  });

  console.log('========================================');
  console.log('DECISION GATE COMPLETE / WRITE = NONE');
  console.log('========================================');
}

// ============================================================
// Orchestrator v1.2.7
// ============================================================

function runCrawlerGroupV127_(label, collectors, maxCreate) {
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
        const writeItem = isRevision
          ? makeRevisionInboxItemV127P_(item)
          : item;

        createInboxPage_(writeItem);
        markSeen_(item, state.baseSeenState);
        markStableObservationV127P_(item, state, nowJstIso_(), 'runtime');

        if (isRevision) {
          counts.createdRevision++;
          console.log(
            `[${label}] SOURCE_REVISION_CANDIDATE created: ${item.collector} | ${item.title} | ${item.url}`
          );
        } else {
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
          `createInboxPage v1.2.7 failed: ${item.title} / ${err.stack || err}`
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
      if (d.action === 'CREATE_NEW_SOURCE' || d.action === 'CREATE_SOURCE_REVISION' || d.action === 'CREATE_LEGACY_NEW') {
        remaining++;
      }
    });

    console.log(
      `[${label}] done. new=${counts.createdNew}, revisions=${counts.createdRevision}, ` +
      `suppressedSame=${counts.suppressedSame}, suppressedFormatting=${counts.suppressedFormatting}, ` +
      `suppressedLegacy=${counts.suppressedLegacy}, failed=${counts.failed}, ` +
      `remaining=${remaining}, elapsedSec=${Math.round((Date.now() - startedAt) / 1000)}`
    );
  } finally {
    if (ledgerBuffer.length) {
      try {
        appendLedgerRows_(ledgerBuffer);
      } catch (e) {
        console.error(`Ledger v1.2.7 final flush failed: ${e.stack || e}`);
      }
    }

    lock.releaseLock();
  }
}

// ============================================================
// Decision logic
// ============================================================

function classifyItemV127P_(item, state) {
  if (!item || !state) {
    return { action: 'SUPPRESS_LEGACY_SEEN', reason: 'INVALID_ITEM_OR_STATE' };
  }

  if (!isStableTargetV127P_(item)) {
    return isAlreadySeen_(item, state.baseSeenState)
      ? { action: 'SUPPRESS_LEGACY_SEEN', reason: 'V126_ALREADY_SEEN' }
      : { action: 'CREATE_LEGACY_NEW', reason: 'V126_NEW' };
  }

  const key = stableSourceKeyV127P_(item);
  if (!key) {
    return isAlreadySeen_(item, state.baseSeenState)
      ? { action: 'SUPPRESS_LEGACY_SEEN', reason: 'STABLE_KEY_MISSING_OLD_SEEN' }
      : { action: 'CREATE_NEW_SOURCE', reason: 'STABLE_KEY_MISSING_OLD_NEW' };
  }

  const latest = state.latestStableByKey.get(key) || null;

  if (!latest) {
    // 古いBACKFILLなどURLを持たない履歴だけがある場合は、
    // Fingerprint既出を尊重して不要な再投入を避ける。
    if (isAlreadySeen_(item, state.baseSeenState)) {
      return { action: 'SUPPRESS_LEGACY_SEEN', reason: 'NO_STABLE_HISTORY_BUT_OLD_SEEN' };
    }

    return { action: 'CREATE_NEW_SOURCE', reason: 'NEW_STABLE_KEY' };
  }

  const currentStrict = normalizeSourceTitleStrictV127P_(item.title);
  const latestStrict = normalizeSourceTitleStrictV127P_(latest.title);

  if (currentStrict === latestStrict) {
    return {
      action: 'SUPPRESS_SAME_CONTENT',
      reason: 'LATEST_CONTENT_MATCH',
      stableKey: key,
      latest
    };
  }

  const currentLoose = normalizeSourceTitleLooseV127P_(item.title);
  const latestLoose = normalizeSourceTitleLooseV127P_(latest.title);

  if (currentLoose === latestLoose) {
    return {
      action: 'SUPPRESS_FORMATTING_ONLY',
      reason: 'LATEST_CONTENT_FORMATTING_ONLY',
      stableKey: key,
      latest
    };
  }

  return {
    action: 'CREATE_SOURCE_REVISION',
    reason: 'LATEST_CONTENT_CHANGED',
    stableKey: key,
    latest
  };
}

function makeRevisionInboxItemV127P_(item) {
  const copy = Object.assign({}, item);
  const originalSnippet = String(item.snippet || '').trim();
  copy.snippet = truncate_(
    V127_PRODUCTION.REVISION_SNIPPET_PREFIX + originalSnippet,
    1900
  );
  return copy;
}

// ============================================================
// Seen state: v1.2.6 + latest Stable Source observation
// ============================================================

function loadSeenStateV127P_() {
  const state = {
    baseSeenState: loadSeenState_(),
    latestStableByKey: new Map()
  };

  loadStableLedgerObservationsV127P_(state);
  loadStableInboxObservationsV127P_(state);
  return state;
}

function loadStableLedgerObservationsV127P_(state) {
  const sheet = getOrCreateLedgerSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const values = sheet
    .getRange(2, 1, lastRow - 1, OCOS.LEDGER_HEADERS.length)
    .getValues();

  values.forEach(row => {
    const obs = {
      fingerprint: cleanText_(row[0]),
      detectedAt: row[1] instanceof Date ? row[1].toISOString() : cleanText_(row[1]),
      url: cleanText_(row[2]),
      title: cleanText_(row[4]),
      collector: cleanText_(row[5]),
      source: 'ledger'
    };

    considerStableObservationV127P_(state, obs);
  });
}

function loadStableInboxObservationsV127P_(state) {
  let cursor = null;

  do {
    const body = {
      page_size: 100,
      filter: {
        or: V127_PRODUCTION.TARGET_COLLECTORS.map(collector => ({
          property: 'Collector',
          rich_text: { equals: collector }
        }))
      }
    };

    if (cursor) body.start_cursor = cursor;

    const result = notionRequest_(
      `/v1/data_sources/${OCOS.NOTION_INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const p = page.properties || {};
      const obs = {
        fingerprint: crawlerNotionText_(p.Fingerprint),
        detectedAt:
          p.Detected_At && p.Detected_At.date && p.Detected_At.date.start
            ? p.Detected_At.date.start
            : '',
        url: p.URL && p.URL.url ? p.URL.url : '',
        title: crawlerNotionTitle_(p.Inbox_Title),
        collector: crawlerNotionText_(p.Collector),
        source: 'inbox'
      };

      considerStableObservationV127P_(state, obs);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
}

function considerStableObservationV127P_(state, obs) {
  if (!state || !obs || !isStableTargetV127P_(obs)) return;

  const key = stableSourceKeyV127P_(obs);
  if (!key) return;

  const current = state.latestStableByKey.get(key);
  if (!current || isObservationNewerV127P_(obs, current)) {
    state.latestStableByKey.set(key, Object.assign({ stableKey: key }, obs));
  }
}

function markStableObservationV127P_(item, state, detectedAt, source) {
  if (!isStableTargetV127P_(item)) return;

  const obs = {
    fingerprint: String(item.fingerprint || ''),
    detectedAt: detectedAt || nowJstIso_(),
    url: String(item.url || ''),
    title: String(item.title || ''),
    collector: String(item.collector || ''),
    source: source || 'runtime'
  };

  const key = stableSourceKeyV127P_(obs);
  if (!key) return;

  state.latestStableByKey.set(key, Object.assign({ stableKey: key }, obs));
}

function isObservationNewerV127P_(a, b) {
  const ta = timestampV127P_(a && a.detectedAt);
  const tb = timestampV127P_(b && b.detectedAt);

  if (ta !== tb) return ta > tb;

  // LedgerとINBOXが同時刻なら、実際のINBOX表示内容を優先する。
  const pa = a && a.source === 'inbox' ? 2 : 1;
  const pb = b && b.source === 'inbox' ? 2 : 1;
  return pa >= pb;
}

function timestampV127P_(value) {
  if (value instanceof Date) return value.getTime();
  const s = String(value || '').trim();
  if (!s) return 0;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ============================================================
// Stable Source Key / content normalization
// ============================================================

function isStableTargetV127P_(item) {
  const collector = String((item && item.collector) || '').trim();
  return V127_PRODUCTION.TARGET_COLLECTORS.includes(collector);
}

function stableSourceKeyV127P_(item) {
  if (!isStableTargetV127P_(item)) return '';

  const collector = String(item.collector || '').trim();
  const url = canonicalStableUrlV127P_(item.url, collector);
  if (!url) return '';

  return `${collector}|${url}`;
}

function canonicalStableUrlV127P_(inputUrl, collector) {
  let url = String(inputUrl || '').trim();
  if (!url) return '';

  url = url.split('#')[0];

  if (collector === 'official-youtube') {
    const videoId = extractYouTubeVideoIdV127P_(url);
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  }

  const match = url.match(/^(https?):\/\/([^\/?#]+)([^#]*)$/i);
  if (!match) return stripTrailingSlashV127P_(url);

  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const rest = match[3] || '';
  const qIndex = rest.indexOf('?');

  let path = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : '';

  if (!path) path = '/';
  path = stripTrailingSlashV127P_(path) || '/';

  const kept = [];
  if (query) {
    query.split('&').forEach(part => {
      if (!part) return;
      const eq = part.indexOf('=');
      const rawKey = eq >= 0 ? part.slice(0, eq) : part;
      const key = safeDecodeURIComponentV127P_(rawKey).toLowerCase();
      if (isTrackingQueryKeyV127P_(key)) return;
      kept.push(part);
    });
  }

  kept.sort();
  return `${scheme}://${host}${path}${kept.length ? '?' + kept.join('&') : ''}`;
}

function extractYouTubeVideoIdV127P_(url) {
  const s = String(url || '');

  let m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  m = s.match(/youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  return '';
}

function isTrackingQueryKeyV127P_(key) {
  if (!key) return false;
  if (key.indexOf('utm_') === 0) return true;

  return [
    'fbclid',
    'gclid',
    'dclid',
    'igshid',
    'mc_cid',
    'mc_eid',
    'ref',
    'ref_src',
    'feature',
    'si'
  ].includes(key);
}

function safeDecodeURIComponentV127P_(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch (e) {
    return String(value || '');
  }
}

function stripTrailingSlashV127P_(value) {
  const s = String(value || '');
  if (s === '/') return s;
  return s.replace(/\/+$/, '');
}

function normalizeSourceTitleStrictV127P_(title) {
  let s = String(title || '');
  s = s.replace(/^\s*\[YouTube\]\s*/i, '');

  try {
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  } catch (e) {}

  return s
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceTitleLooseV127P_(title) {
  return normalizeSourceTitleStrictV127P_(title).replace(/\s+/g, '');
}
