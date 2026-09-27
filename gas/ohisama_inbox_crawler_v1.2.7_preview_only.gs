/**
 * おひさまコネクト - INBOX Crawler v1.2.7 Stable Source Identity PREVIEW
 * 2026-09-28
 *
 * PURPOSE
 * -------
 * v1.2.6 で確認された「同一SOURCE URLなのに Fingerprint が変化すると
 * 新しい INBOX row として再INSERTされ得る」問題を、WRITE NONEで検証する。
 *
 * このファイルは v1.2.6 と同じ Apps Script project に追加して使う補助ハーネス。
 * v1.2.6 本体、INBOX、Ledger、Decision / Event / Status は一切変更しない。
 *
 * Stable Source Identity（Preview rule）
 * -------------------------------------
 * official-news   : collector + canonical URL
 * official-blog   : collector + canonical URL
 * official-youtube: collector + canonical YouTube video URL
 * official-schedule / Google News 等は本Previewのstable URL判定対象外。
 *
 * 実行関数:
 *   previewV127StableSourceIdentity()
 *   previewV127ExistingDuplicateAudit()
 *
 * 必須依存（v1.2.6側）:
 *   OCOS
 *   collectOfficialNews_()
 *   collectOfficialBlogs_()
 *   collectOfficialYouTube_()
 *   normalizeAndDeduplicateCandidates_()
 *   loadSeenState_()
 *   isAlreadySeen_()
 *   notionRequest_()
 */

const V127_STABLE_SOURCE_PREVIEW = Object.freeze({
  VERSION: '1.2.7-preview',
  TARGET_COLLECTORS: [
    'official-news',
    'official-blog',
    'official-youtube'
  ],
  MAX_DETAIL_LOGS: 200
});

/**
 * Main preview.
 *
 * 現行v1.2.6判定とStable Source Identity判定を並べ、
 * 「v1.2.6なら未見扱いだがstable identityなら既存SOURCE」となる候補を抽出する。
 * WRITE NONE。
 */
function previewV127StableSourceIdentity() {
  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.7 STABLE SOURCE IDENTITY PREVIEW');
  console.log('WRITE = NONE');
  console.log('TARGET = official-news / official-blog / official-youtube');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isV127StableTargetCollector_);

  const oldSeenState = loadSeenState_();
  const inboxState = loadV127StableInboxState_();

  const currentByStableKey = new Map();
  normalized.forEach(item => {
    const key = stableSourceKeyV127_(item);
    if (!key) return;

    if (!currentByStableKey.has(key)) {
      currentByStableKey.set(key, {
        key,
        item,
        fingerprints: new Set([String(item.fingerprint || '')]),
        count: 1
      });
    } else {
      const row = currentByStableKey.get(key);
      row.count++;
      row.fingerprints.add(String(item.fingerprint || ''));
    }
  });

  const summary = {
    raw: raw.length,
    normalized: normalized.length,
    stableUniqueCurrent: currentByStableKey.size,
    newStableSource: 0,
    existingSameFingerprint: 0,
    sourceUpdateCandidate: 0,
    oldLogicWouldInsertButStableSuppresses: 0,
    oldLogicAlreadySeen: 0,
    missingStableKey: 0,
    currentStableKeyCollision: 0
  };

  const details = [];

  currentByStableKey.forEach(row => {
    const item = row.item;
    const existing = inboxState.byStableKey.get(row.key) || [];
    const oldSeen = isAlreadySeen_(item, oldSeenState);

    if (oldSeen) summary.oldLogicAlreadySeen++;
    if (row.count > 1 || row.fingerprints.size > 1) {
      summary.currentStableKeyCollision++;
    }

    if (!existing.length) {
      summary.newStableSource++;
      details.push({
        classification: 'NEW_STABLE_SOURCE',
        oldSeen,
        item,
        stableKey: row.key,
        existing: [],
        currentCount: row.count,
        currentFingerprints: Array.from(row.fingerprints)
      });
      return;
    }

    const currentFp = String(item.fingerprint || '');
    const fpMatch = existing.some(x => String(x.fingerprint || '') === currentFp);

    if (fpMatch) {
      summary.existingSameFingerprint++;
      details.push({
        classification: 'EXISTING_SOURCE_SAME_FINGERPRINT',
        oldSeen,
        item,
        stableKey: row.key,
        existing,
        currentCount: row.count,
        currentFingerprints: Array.from(row.fingerprints)
      });
      return;
    }

    summary.sourceUpdateCandidate++;
    if (!oldSeen) {
      summary.oldLogicWouldInsertButStableSuppresses++;
    }

    details.push({
      classification: 'SOURCE_UPDATE_CANDIDATE',
      oldSeen,
      item,
      stableKey: row.key,
      existing,
      currentCount: row.count,
      currentFingerprints: Array.from(row.fingerprints)
    });
  });

  normalized.forEach(item => {
    if (!stableSourceKeyV127_(item)) summary.missingStableKey++;
  });

  logV127Summary_(summary, inboxState);

  console.log('----------------------------------------');
  console.log('DETAIL: OLD LOGIC WOULD INSERT / STABLE WOULD SUPPRESS');
  console.log('----------------------------------------');

  details
    .filter(x => x.classification === 'SOURCE_UPDATE_CANDIDATE' && !x.oldSeen)
    .slice(0, V127_STABLE_SOURCE_PREVIEW.MAX_DETAIL_LOGS)
    .forEach((x, i) => logV127Detail_(x, i + 1));

  console.log('----------------------------------------');
  console.log('DETAIL: NEW STABLE SOURCE');
  console.log('----------------------------------------');

  details
    .filter(x => x.classification === 'NEW_STABLE_SOURCE')
    .slice(0, V127_STABLE_SOURCE_PREVIEW.MAX_DETAIL_LOGS)
    .forEach((x, i) => logV127Detail_(x, i + 1));

  console.log('========================================');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function previewV127ExistingDuplicateAudit() {
  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 EXISTING STABLE SOURCE DUPLICATE AUDIT');
  console.log('WRITE = NONE');
  console.log('========================================');

  const state = loadV127StableInboxState_();
  const duplicateGroups = [];
  let extraRows = 0;

  state.byStableKey.forEach((rows, key) => {
    if (rows.length <= 1) return;
    duplicateGroups.push({ key, rows });
    extraRows += rows.length - 1;
  });

  duplicateGroups.sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key));

  console.log(`INBOX_TARGET_ROWS = ${state.targetRows}`);
  console.log(`STABLE_KEYS = ${state.byStableKey.size}`);
  console.log(`DUPLICATE_STABLE_KEYS = ${duplicateGroups.length}`);
  console.log(`EXTRA_ROWS = ${extraRows}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${state.rowsWithoutStableKey}`);
  console.log('----------------------------------------');

  duplicateGroups
    .slice(0, V127_STABLE_SOURCE_PREVIEW.MAX_DETAIL_LOGS)
    .forEach((group, i) => {
      console.log(`${i + 1}. ${group.key} | rows=${group.rows.length}`);
      group.rows.forEach(r => {
        console.log(
          `   - page=${r.pageId || '-'} | detected=${r.detectedAt || '-'} | ` +
          `fp=${r.fingerprint || '-'} | title=${r.title || '-'} | url=${r.url || '-'}`
        );
      });
    });

  console.log('========================================');
  console.log('AUDIT COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function logV127Summary_(summary, inboxState) {
  console.log(`RAW_COLLECTED = ${summary.raw}`);
  console.log(`NORMALIZED_TARGET = ${summary.normalized}`);
  console.log(`CURRENT_STABLE_UNIQUE = ${summary.stableUniqueCurrent}`);
  console.log(`INBOX_TARGET_ROWS = ${inboxState.targetRows}`);
  console.log(`INBOX_STABLE_KEYS = ${inboxState.byStableKey.size}`);
  console.log('----------------------------------------');
  console.log(`NEW_STABLE_SOURCE = ${summary.newStableSource}`);
  console.log(`EXISTING_SOURCE_SAME_FINGERPRINT = ${summary.existingSameFingerprint}`);
  console.log(`SOURCE_UPDATE_CANDIDATE = ${summary.sourceUpdateCandidate}`);
  console.log(`OLD_LOGIC_WOULD_INSERT_BUT_STABLE_SUPPRESSES = ${summary.oldLogicWouldInsertButStableSuppresses}`);
  console.log(`OLD_LOGIC_ALREADY_SEEN = ${summary.oldLogicAlreadySeen}`);
  console.log(`CURRENT_STABLE_KEY_COLLISION = ${summary.currentStableKeyCollision}`);
  console.log(`MISSING_STABLE_KEY = ${summary.missingStableKey}`);
}

function logV127Detail_(x, index) {
  const item = x.item || {};
  console.log(
    `${index}. ${x.classification} | oldSeen=${x.oldSeen ? 'YES' : 'NO'} | ` +
    `[${item.collector || '-'}] ${item.title || '-'} | ${item.url || '-'}`
  );
  console.log(`   stableKey=${x.stableKey}`);
  console.log(`   currentFingerprint=${item.fingerprint || '-'}`);

  (x.existing || []).forEach((r, j) => {
    console.log(
      `   existing[${j + 1}] page=${r.pageId || '-'} | detected=${r.detectedAt || '-'} | ` +
      `fp=${r.fingerprint || '-'} | title=${r.title || '-'}`
    );
  });
}

function isV127StableTargetCollector_(item) {
  const collector = String((item && item.collector) || '').trim();
  return V127_STABLE_SOURCE_PREVIEW.TARGET_COLLECTORS.includes(collector);
}

function stableSourceKeyV127_(item) {
  if (!isV127StableTargetCollector_(item)) return null;

  const collector = String(item.collector || '').trim();
  const canonicalUrl = canonicalStableUrlV127_(item.url, collector);
  if (!canonicalUrl) return null;

  return `${collector}|${canonicalUrl}`;
}

function canonicalStableUrlV127_(inputUrl, collector) {
  let url = String(inputUrl || '').trim();
  if (!url) return '';

  url = url.split('#')[0];

  if (collector === 'official-youtube') {
    const videoId = extractYouTubeVideoIdV127_(url);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  }

  const match = url.match(/^(https?):\/\/([^\/?#]+)([^#]*)$/i);
  if (!match) {
    return stripTrailingSlashV127_(url);
  }

  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const rest = match[3] || '';

  const qIndex = rest.indexOf('?');
  let path = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : '';

  if (!path) path = '/';
  path = stripTrailingSlashV127_(path);
  if (!path) path = '/';

  const kept = [];
  if (query) {
    query.split('&').forEach(part => {
      if (!part) return;
      const eq = part.indexOf('=');
      const rawKey = eq >= 0 ? part.slice(0, eq) : part;
      const key = safeDecodeURIComponentV127_(rawKey).toLowerCase();

      if (isTrackingQueryKeyV127_(key)) return;
      kept.push(part);
    });
  }

  kept.sort();
  return `${scheme}://${host}${path}${kept.length ? '?' + kept.join('&') : ''}`;
}

function stripTrailingSlashV127_(value) {
  const s = String(value || '');
  if (s === '/') return s;
  return s.replace(/\/+$/, '');
}

function isTrackingQueryKeyV127_(key) {
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

function safeDecodeURIComponentV127_(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch (e) {
    return String(value || '');
  }
}

function extractYouTubeVideoIdV127_(url) {
  const s = String(url || '');

  let m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  m = s.match(/youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  return '';
}

function loadV127StableInboxState_() {
  const state = {
    byStableKey: new Map(),
    targetRows: 0,
    rowsWithoutStableKey: 0
  };

  let cursor = null;

  do {
    const body = {
      page_size: 100,
      filter: {
        or: V127_STABLE_SOURCE_PREVIEW.TARGET_COLLECTORS.map(collector => ({
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
      const row = {
        pageId: page.id || '',
        title: notionTitleV127_(p.Inbox_Title),
        url: notionUrlV127_(p.URL),
        collector: notionTextV127_(p.Collector),
        fingerprint: notionTextV127_(p.Fingerprint),
        detectedAt: notionDateStartV127_(p.Detected_At)
      };

      if (!V127_STABLE_SOURCE_PREVIEW.TARGET_COLLECTORS.includes(row.collector)) {
        return;
      }

      state.targetRows++;
      const key = stableSourceKeyV127_(row);

      if (!key) {
        state.rowsWithoutStableKey++;
        return;
      }

      if (!state.byStableKey.has(key)) {
        state.byStableKey.set(key, []);
      }
      state.byStableKey.get(key).push(row);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  state.byStableKey.forEach(rows => {
    rows.sort((a, b) => String(a.detectedAt || '').localeCompare(String(b.detectedAt || '')));
  });

  return state;
}

function notionTitleV127_(prop) {
  if (!prop || !Array.isArray(prop.title)) return '';
  return prop.title
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('')
    .trim();
}

function notionTextV127_(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('')
    .trim();
}

function notionUrlV127_(prop) {
  if (!prop) return '';
  return String(prop.url || '').trim();
}

function notionDateStartV127_(prop) {
  if (!prop || !prop.date) return '';
  return String(prop.date.start || '');
}
