/**
 * おひさまコネクト - INBOX Crawler v1.2.7
 * Stable Source Identity + Revision Detection PREVIEW ONLY
 * 2026-09-28
 *
 * PURPOSE
 * -------
 * v1.2.7 Stable Source Identity の次段階。
 * 同じ Stable Source Key の行を単純に「重複」とみなさず、
 *   1) 同一内容の再INSERT
 *   2) 表記差のみ
 *   3) SOURCE側の意味あるRevision候補
 * に分離して監査する。
 *
 * WRITE = NONE
 * INBOX / Ledger / Decision / Event / Status / Suggestion_* は変更しない。
 *
 * Canonical design candidate
 * --------------------------
 * Stable Source Key:
 *   official-news / official-blog / official-youtube
 *   = Collector + canonical URL
 *
 * Content Signature v0.1:
 *   SOURCE visible title のみを使用。
 *   - Unicode NFKC
 *   - crawler prefix [YouTube] を除外
 *   - whitespaceを正規化
 *
 * Event_Date_Hint / Detected_At / Fingerprint / Suggestion_* は
 * SOURCE contentではなく取得・派生・運用情報なのでSignatureに含めない。
 * Published_At は現在の実装ではRevision判定に含めず、metadata driftとして別比較する。
 *
 * 制約:
 *   現CrawlerはSOURCE本文スナップショットを保持していないため、
 *   「タイトルを変えず本文だけ修正された」Revisionは検出できない。
 *
 * Dependencies:
 *   v1.2.6 main crawler:
 *     OCOS, notionRequest_()
 *   v1.2.7 stable source preview:
 *     stableSourceKeyV127_(), V127_STABLE_SOURCE_PREVIEW
 *
 * Run:
 *   previewV127RevisionAwareDuplicateReplay()
 *   previewV127RevisionAwareCurrentFetch()
 */

const V127_REVISION_AWARE_PREVIEW = Object.freeze({
  VERSION: '1.2.7-revision-aware-preview',
  MAX_DETAIL_LOGS: 200
});

/**
 * 既存INBOXのStable Source重複56 groups / 59 extra rowsを時系列でリプレイし、
 * 各「2行目以降」を分類する。
 *
 * Expected categories:
 *   EXACT_DUPLICATE
 *   SAME_CONTENT_FINGERPRINT_DRIFT
 *   FORMATTING_ONLY_CHANGE
 *   SOURCE_REVISION_CANDIDATE
 */
function previewV127RevisionAwareDuplicateReplay() {
  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.7 REVISION-AWARE DUPLICATE REPLAY');
  console.log('WRITE = NONE');
  console.log('========================================');

  const state = loadV127RevisionAwareInboxState_();
  const duplicateGroups = [];

  state.byStableKey.forEach((rows, key) => {
    if (rows.length > 1) duplicateGroups.push({ key, rows });
  });

  duplicateGroups.sort((a, b) =>
    b.rows.length - a.rows.length || a.key.localeCompare(b.key)
  );

  const counts = {
    inboxTargetRows: state.targetRows,
    stableKeys: state.byStableKey.size,
    duplicateStableKeys: duplicateGroups.length,
    extraRows: 0,
    exactDuplicate: 0,
    sameContentFingerprintDrift: 0,
    formattingOnlyChange: 0,
    sourceRevisionCandidate: 0,
    publishedAtDriftSameContent: 0,
    missingStableKey: state.rowsWithoutStableKey
  };

  const transitions = [];

  duplicateGroups.forEach(group => {
    counts.extraRows += group.rows.length - 1;

    for (let i = 1; i < group.rows.length; i++) {
      const prev = group.rows[i - 1];
      const curr = group.rows[i];
      const classified = classifyV127RevisionTransition_(prev, curr);

      counts[classified.counter]++;

      if (
        classified.classification !== 'SOURCE_REVISION_CANDIDATE' &&
        normalizePublishedAtV127RA_(prev.publishedAt) !== normalizePublishedAtV127RA_(curr.publishedAt)
      ) {
        counts.publishedAtDriftSameContent++;
      }

      transitions.push({
        stableKey: group.key,
        indexInGroup: i,
        rowsInGroup: group.rows.length,
        previous: prev,
        current: curr,
        classification: classified.classification,
        strictPrevious: classified.strictPrevious,
        strictCurrent: classified.strictCurrent,
        loosePrevious: classified.loosePrevious,
        looseCurrent: classified.looseCurrent
      });
    }
  });

  console.log(`INBOX_TARGET_ROWS = ${counts.inboxTargetRows}`);
  console.log(`STABLE_KEYS = ${counts.stableKeys}`);
  console.log(`DUPLICATE_STABLE_KEYS = ${counts.duplicateStableKeys}`);
  console.log(`EXTRA_ROWS / TRANSITIONS = ${counts.extraRows}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${counts.missingStableKey}`);
  console.log('----------------------------------------');
  console.log(`EXACT_DUPLICATE = ${counts.exactDuplicate}`);
  console.log(`SAME_CONTENT_FINGERPRINT_DRIFT = ${counts.sameContentFingerprintDrift}`);
  console.log(`FORMATTING_ONLY_CHANGE = ${counts.formattingOnlyChange}`);
  console.log(`SOURCE_REVISION_CANDIDATE = ${counts.sourceRevisionCandidate}`);
  console.log(`PUBLISHED_AT_DRIFT_WITHOUT_CONTENT_CHANGE = ${counts.publishedAtDriftSameContent}`);
  console.log('----------------------------------------');
  console.log(
    `SUPPRESSIBLE_REINSERT = ${
      counts.exactDuplicate +
      counts.sameContentFingerprintDrift +
      counts.formattingOnlyChange
    }`
  );
  console.log(`KEEP_AS_REVISION_CANDIDATE = ${counts.sourceRevisionCandidate}`);

  logV127RevisionCategory_(
    transitions,
    'SOURCE_REVISION_CANDIDATE',
    V127_REVISION_AWARE_PREVIEW.MAX_DETAIL_LOGS
  );

  logV127RevisionCategory_(
    transitions,
    'FORMATTING_ONLY_CHANGE',
    V127_REVISION_AWARE_PREVIEW.MAX_DETAIL_LOGS
  );

  console.log('========================================');
  console.log('REPLAY COMPLETE / WRITE = NONE');
  console.log('========================================');
}

/**
 * 現在取得できる公式NEWS / BLOG / YouTubeを、
 * 「最新INBOX row」とRevision-awareで比較する。
 *
 * 現時点で既に最新FingerprintがINBOXにある場合はUNCHANGEDになるはず。
 * 将来タイトルが変化した時はSOURCE_REVISION_CANDIDATEを出す。
 */
function previewV127RevisionAwareCurrentFetch() {
  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER v1.2.7 REVISION-AWARE CURRENT FETCH PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(item => stableSourceKeyV127_(item));

  const state = loadV127RevisionAwareInboxState_();
  const currentByKey = new Map();

  normalized.forEach(item => {
    const key = stableSourceKeyV127_(item);
    if (!key) return;
    currentByKey.set(key, item);
  });

  const counts = {
    raw: raw.length,
    normalized: normalized.length,
    stableUniqueCurrent: currentByKey.size,
    newStableSource: 0,
    unchanged: 0,
    formattingOnlyChange: 0,
    sourceRevisionCandidate: 0
  };

  const details = [];

  currentByKey.forEach((item, key) => {
    const existingRows = state.byStableKey.get(key) || [];

    if (!existingRows.length) {
      counts.newStableSource++;
      details.push({
        classification: 'NEW_STABLE_SOURCE',
        stableKey: key,
        current: candidateToV127RevisionRow_(item),
        previous: null
      });
      return;
    }

    const latest = existingRows[existingRows.length - 1];
    const current = candidateToV127RevisionRow_(item);
    const classified = classifyV127RevisionTransition_(latest, current);

    if (
      classified.classification === 'EXACT_DUPLICATE' ||
      classified.classification === 'SAME_CONTENT_FINGERPRINT_DRIFT'
    ) {
      counts.unchanged++;
      return;
    }

    if (classified.classification === 'FORMATTING_ONLY_CHANGE') {
      counts.formattingOnlyChange++;
    } else {
      counts.sourceRevisionCandidate++;
    }

    details.push({
      classification: classified.classification,
      stableKey: key,
      current,
      previous: latest
    });
  });

  console.log(`RAW_COLLECTED = ${counts.raw}`);
  console.log(`NORMALIZED_TARGET = ${counts.normalized}`);
  console.log(`CURRENT_STABLE_UNIQUE = ${counts.stableUniqueCurrent}`);
  console.log('----------------------------------------');
  console.log(`NEW_STABLE_SOURCE = ${counts.newStableSource}`);
  console.log(`UNCHANGED_EXISTING_SOURCE = ${counts.unchanged}`);
  console.log(`FORMATTING_ONLY_CHANGE = ${counts.formattingOnlyChange}`);
  console.log(`SOURCE_REVISION_CANDIDATE = ${counts.sourceRevisionCandidate}`);

  ['SOURCE_REVISION_CANDIDATE', 'FORMATTING_ONLY_CHANGE', 'NEW_STABLE_SOURCE']
    .forEach(category => {
      console.log('----------------------------------------');
      console.log(`DETAIL: ${category}`);
      console.log('----------------------------------------');

      details
        .filter(x => x.classification === category)
        .slice(0, V127_REVISION_AWARE_PREVIEW.MAX_DETAIL_LOGS)
        .forEach((x, i) => {
          console.log(`${i + 1}. ${x.stableKey}`);
          if (x.previous) {
            console.log(
              `   PREV title=${x.previous.title || '-'} | pub=${x.previous.publishedAt || '-'} | fp=${x.previous.fingerprint || '-'}`
            );
          }
          console.log(
            `   CURR title=${x.current.title || '-'} | pub=${x.current.publishedAt || '-'} | fp=${x.current.fingerprint || '-'}`
          );
        });
    });

  console.log('========================================');
  console.log('CURRENT FETCH PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function classifyV127RevisionTransition_(previous, current) {
  const prevTitle = String((previous && previous.title) || '');
  const currTitle = String((current && current.title) || '');
  const prevFp = String((previous && previous.fingerprint) || '');
  const currFp = String((current && current.fingerprint) || '');

  const strictPrevious = normalizeSourceTitleStrictV127RA_(prevTitle);
  const strictCurrent = normalizeSourceTitleStrictV127RA_(currTitle);
  const loosePrevious = normalizeSourceTitleLooseV127RA_(prevTitle);
  const looseCurrent = normalizeSourceTitleLooseV127RA_(currTitle);

  if (prevFp && currFp && prevFp === currFp && strictPrevious === strictCurrent) {
    return {
      classification: 'EXACT_DUPLICATE',
      counter: 'exactDuplicate',
      strictPrevious,
      strictCurrent,
      loosePrevious,
      looseCurrent
    };
  }

  if (strictPrevious === strictCurrent) {
    return {
      classification: 'SAME_CONTENT_FINGERPRINT_DRIFT',
      counter: 'sameContentFingerprintDrift',
      strictPrevious,
      strictCurrent,
      loosePrevious,
      looseCurrent
    };
  }

  if (loosePrevious === looseCurrent) {
    return {
      classification: 'FORMATTING_ONLY_CHANGE',
      counter: 'formattingOnlyChange',
      strictPrevious,
      strictCurrent,
      loosePrevious,
      looseCurrent
    };
  }

  return {
    classification: 'SOURCE_REVISION_CANDIDATE',
    counter: 'sourceRevisionCandidate',
    strictPrevious,
    strictCurrent,
    loosePrevious,
    looseCurrent
  };
}

/**
 * Strict content normalization:
 * - SOURCEではないcrawler表示prefix [YouTube]を除く
 * - Unicode NFKC
 * - 全角空白を通常空白へ
 * - whitespace collapse
 */
function normalizeSourceTitleStrictV127RA_(title) {
  let s = String(title || '');

  s = s.replace(/^\s*\[YouTube\]\s*/i, '');

  try {
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  } catch (e) {
    // Apps Script runtime差異があってもPreviewを止めない。
  }

  s = s.replace(/\u3000/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Loose normalization:
 * strict normalization後、空白差だけを無視する。
 * punctuationや語そのものは消さないため、意味ある変更は残す。
 */
function normalizeSourceTitleLooseV127RA_(title) {
  return normalizeSourceTitleStrictV127RA_(title).replace(/\s+/g, '');
}

function contentSignatureV127RA_(title) {
  const normalized = normalizeSourceTitleStrictV127RA_(title);
  return sha256HexV127RA_(normalized);
}

function looseContentSignatureV127RA_(title) {
  const normalized = normalizeSourceTitleLooseV127RA_(title);
  return sha256HexV127RA_(normalized);
}

function sha256HexV127RA_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );

  return bytes.map(b => {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function normalizePublishedAtV127RA_(value) {
  const s = String(value || '').trim();
  if (!s) return '';

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString();
}

function candidateToV127RevisionRow_(item) {
  return {
    pageId: '',
    title: String((item && item.title) || ''),
    url: String((item && item.url) || ''),
    collector: String((item && item.collector) || ''),
    fingerprint: String((item && item.fingerprint) || ''),
    detectedAt: '',
    publishedAt: String((item && item.publishedAt) || '')
  };
}

function loadV127RevisionAwareInboxState_() {
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
        title: notionTitleV127RA_(p.Inbox_Title),
        url: notionUrlV127RA_(p.URL),
        collector: notionTextV127RA_(p.Collector),
        fingerprint: notionTextV127RA_(p.Fingerprint),
        detectedAt: notionDateStartV127RA_(p.Detected_At),
        publishedAt: notionDateStartV127RA_(p.Published_At)
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

      if (!state.byStableKey.has(key)) state.byStableKey.set(key, []);
      state.byStableKey.get(key).push(row);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  state.byStableKey.forEach(rows => {
    rows.sort((a, b) => {
      const ta = String(a.detectedAt || '');
      const tb = String(b.detectedAt || '');
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a.pageId || '').localeCompare(String(b.pageId || ''));
    });
  });

  return state;
}

function logV127RevisionCategory_(transitions, category, maxRows) {
  console.log('----------------------------------------');
  console.log(`DETAIL: ${category}`);
  console.log('----------------------------------------');

  transitions
    .filter(x => x.classification === category)
    .slice(0, maxRows)
    .forEach((x, i) => {
      console.log(
        `${i + 1}. ${x.stableKey} | transition=${x.indexInGroup}/${x.rowsInGroup - 1}`
      );
      console.log(
        `   PREV detected=${x.previous.detectedAt || '-'} | fp=${x.previous.fingerprint || '-'} | ` +
        `pub=${x.previous.publishedAt || '-'} | title=${x.previous.title || '-'}`
      );
      console.log(
        `   CURR detected=${x.current.detectedAt || '-'} | fp=${x.current.fingerprint || '-'} | ` +
        `pub=${x.current.publishedAt || '-'} | title=${x.current.title || '-'}`
      );
      console.log(`   contentSigPrev=${contentSignatureV127RA_(x.previous.title)}`);
      console.log(`   contentSigCurr=${contentSignatureV127RA_(x.current.title)}`);
      console.log(`   looseSigPrev=${looseContentSignatureV127RA_(x.previous.title)}`);
      console.log(`   looseSigCurr=${looseContentSignatureV127RA_(x.current.title)}`);
    });
}

function notionTitleV127RA_(prop) {
  if (!prop || !Array.isArray(prop.title)) return '';
  return prop.title
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('')
    .trim();
}

function notionTextV127RA_(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text
    .map(x => x.plain_text || (x.text && x.text.content) || '')
    .join('')
    .trim();
}

function notionUrlV127RA_(prop) {
  if (!prop) return '';
  return String(prop.url || '').trim();
}

function notionDateStartV127RA_(prop) {
  if (!prop || !prop.date) return '';
  return String(prop.date.start || '');
}
