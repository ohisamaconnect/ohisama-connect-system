/**
 * OC-OS INBOX Crawler SOURCE Revision Chain Marking Preview v0.1.0
 * 2026-09-29
 *
 * WRITE = NONE
 *
 * Purpose:
 *   1) Stable Source KeyごとにINBOX観測を再構成する。
 *   2) 意味あるcontent versionが2つ以上あるkeyをtrue SOURCE revision chainとみなす。
 *   3) true revision chain全体が Observation_Type=SOURCE_REVISION か監査する。
 *   4) same-content duplicate / formatting-only duplicateをrevision扱いしない。
 *   5) 現在fetchで新Revision候補が出た場合、旧chain全体＋新行をどうmarkするかPreviewする。
 *
 * Canonical rule:
 *   - semantic version key = normalizeSourceTitleLooseV127P_(title)
 *     strict差があっても空白差だけなら同一version。
 *   - semantic versionが2以上 → chain全体 SOURCE_REVISION
 *   - 同一semantic versionの複数物理行 → duplicateでありrevisionではない
 *   - Decision / Event / Source / Status / Suggested_* は変更対象外
 *
 * Dependencies in same Apps Script project:
 *   v1.2.6 base crawler: OCOS, notionRequest_(), normalizeAndDeduplicateCandidates_()
 *   v1.2.7 production runner:
 *     V127_PRODUCTION, stableSourceKeyV127P_(), normalizeSourceTitleLooseV127P_(),
 *     classifyItemV127P_(), loadSeenStateV127P_(), isStableTargetV127P_()
 *   collectors: collectOfficialNews_(), collectOfficialBlogs_(), collectOfficialYouTube_()
 */

const OCOS_REVISION_CHAIN_PREVIEW_010 = Object.freeze({
  VERSION: '0.1.0',
  REVISION_VALUE: 'SOURCE_REVISION',
  NORMAL_VALUE: 'NORMAL',
  MAX_DETAIL: 100
});

function previewCrawlerRevisionChainMarkingV010() {
  console.log('========================================');
  console.log('OC-OS CRAWLER SOURCE REVISION CHAIN MARKING PREVIEW v0.1.0');
  console.log('WRITE = NONE');
  console.log('HUMAN FIELDS = UNCHANGED');
  console.log('========================================');

  const state = loadRevisionChainInboxStateV010_();
  const revisionChains = [];
  const sameContentDuplicateKeys = [];
  const unexpectedMarkedRows = [];

  let revisionChainRows = 0;
  let alreadyRevisionMarked = 0;
  let proposedMarks = 0;

  state.byStableKey.forEach((rows, stableKey) => {
    const semanticVersions = new Map();

    rows.forEach(row => {
      const semanticKey = normalizeSourceTitleLooseV127P_(row.title);
      if (!semanticVersions.has(semanticKey)) semanticVersions.set(semanticKey, []);
      semanticVersions.get(semanticKey).push(row);
    });

    const isRevisionChain = semanticVersions.size >= 2;

    if (isRevisionChain) {
      revisionChainRows += rows.length;
      const needsMark = rows.filter(r => r.observationType !== OCOS_REVISION_CHAIN_PREVIEW_010.REVISION_VALUE);
      const alreadyMarked = rows.filter(r => r.observationType === OCOS_REVISION_CHAIN_PREVIEW_010.REVISION_VALUE);
      alreadyRevisionMarked += alreadyMarked.length;
      proposedMarks += needsMark.length;

      revisionChains.push({
        stableKey,
        rows,
        semanticVersions,
        needsMark,
        alreadyMarked
      });
    } else {
      if (rows.length > 1) {
        sameContentDuplicateKeys.push({ stableKey, rows, semanticVersions });
      }
      rows.forEach(row => {
        if (row.observationType === OCOS_REVISION_CHAIN_PREVIEW_010.REVISION_VALUE) {
          unexpectedMarkedRows.push({ stableKey, row });
        }
      });
    }
  });

  console.log(`STABLE_TARGET_ROWS = ${state.targetRows}`);
  console.log(`STABLE_KEYS = ${state.byStableKey.size}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${state.rowsWithoutStableKey}`);
  console.log('----------------------------------------');
  console.log(`TRUE_REVISION_STABLE_KEYS = ${revisionChains.length}`);
  console.log(`REVISION_CHAIN_PHYSICAL_ROWS = ${revisionChainRows}`);
  console.log(`ALREADY_SOURCE_REVISION = ${alreadyRevisionMarked}`);
  console.log(`PROPOSED_EXISTING_ROW_MARKS = ${proposedMarks}`);
  console.log(`SAME_CONTENT_DUPLICATE_KEYS_NOT_REVISION = ${sameContentDuplicateKeys.length}`);
  console.log(`UNEXPECTED_SOURCE_REVISION_OUTSIDE_TRUE_CHAIN = ${unexpectedMarkedRows.length}`);
  console.log('----------------------------------------');

  revisionChains
    .sort((a, b) => a.stableKey.localeCompare(b.stableKey))
    .slice(0, OCOS_REVISION_CHAIN_PREVIEW_010.MAX_DETAIL)
    .forEach((chain, i) => {
      console.log(`${i + 1}. REVISION_CHAIN | ${chain.stableKey}`);
      console.log(
        `   semanticVersions=${chain.semanticVersions.size} / physicalRows=${chain.rows.length} / ` +
        `alreadyMarked=${chain.alreadyMarked.length} / needsMark=${chain.needsMark.length}`
      );
      chain.rows.forEach((row, j) => {
        console.log(
          `   ${j + 1}) ${row.inboxId || row.pageId} | ` +
          `Observation_Type=${row.observationType || '(blank=NORMAL)'} | ` +
          `Decision=${row.decision || '-'} | Status=${row.status || '-'} | ${row.title}`
        );
      });
    });

  console.log('----------------------------------------');
  console.log('SAME-CONTENT DUPLICATE SAMPLE (NOT REVISION)');
  sameContentDuplicateKeys.slice(0, 20).forEach((group, i) => {
    console.log(`${i + 1}. ${group.stableKey} | physicalRows=${group.rows.length} | semanticVersions=1`);
    group.rows.forEach(row => {
      console.log(`   ${row.inboxId || row.pageId} | ${row.title}`);
    });
  });

  if (unexpectedMarkedRows.length) {
    console.log('----------------------------------------');
    console.log('UNEXPECTED SOURCE_REVISION OUTSIDE TRUE CHAIN');
    unexpectedMarkedRows.slice(0, 50).forEach((x, i) => {
      console.log(`${i + 1}. ${x.stableKey} | ${x.row.inboxId || x.row.pageId} | ${x.row.title}`);
    });
  }

  console.log('----------------------------------------');
  previewFutureRevisionMarkPlanV010_(state);

  console.log('========================================');
  console.log('CANONICAL FUTURE POLICY');
  console.log('IF CREATE_SOURCE_REVISION:');
  console.log('  A) existing physical rows for that Stable Source Key -> Observation_Type=SOURCE_REVISION');
  console.log('  B) newly created observation row -> Observation_Type=SOURCE_REVISION');
  console.log('  C) Decision / Event / Source / Status / Suggested_* -> UNCHANGED');
  console.log('  D) same-content / formatting-only duplicates -> NOT SOURCE_REVISION');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function previewFutureRevisionMarkPlanV010_(inboxState) {
  console.log('LIVE CURRENT-FETCH REVISION MARK PLAN');
  console.log('WRITE = NONE');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetV127P_);

  const seenState = loadSeenStateV127P_();
  const revisionCandidates = [];

  normalized.forEach(item => {
    const decision = classifyItemV127P_(item, seenState);
    if (decision.action !== 'CREATE_SOURCE_REVISION') return;

    const stableKey = decision.stableKey || stableSourceKeyV127P_(item);
    const existingRows = inboxState.byStableKey.get(stableKey) || [];
    const existingNeedsMark = existingRows.filter(
      r => r.observationType !== OCOS_REVISION_CHAIN_PREVIEW_010.REVISION_VALUE
    );

    revisionCandidates.push({
      item,
      stableKey,
      existingRows,
      existingNeedsMark,
      latest: decision.latest || null
    });
  });

  console.log(`LIVE_NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`LIVE_CREATE_SOURCE_REVISION = ${revisionCandidates.length}`);
  console.log(`LIVE_EXISTING_ROWS_TO_MARK = ${revisionCandidates.reduce((n, x) => n + x.existingNeedsMark.length, 0)}`);
  console.log(`LIVE_NEW_ROWS_TO_CREATE_AS_SOURCE_REVISION = ${revisionCandidates.length}`);

  revisionCandidates.slice(0, 50).forEach((x, i) => {
    console.log(`${i + 1}. ${x.stableKey}`);
    console.log(`   PREVIOUS=${x.latest ? x.latest.title : '-'}`);
    console.log(`   CURRENT=${x.item.title || '-'}`);
    console.log(`   existingPhysicalRows=${x.existingRows.length} / existingNeedsMark=${x.existingNeedsMark.length}`);
    console.log('   newRowObservationType=SOURCE_REVISION');
  });
}

function loadRevisionChainInboxStateV010_() {
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
      const row = {
        pageId: page.id || '',
        inboxId: revisionChainTitleTextV010_(p.Inbox_ID),
        title: revisionChainTitleTextV010_(p.Inbox_Title),
        url: p.URL && p.URL.url ? String(p.URL.url) : '',
        collector: revisionChainRichTextV010_(p.Collector),
        detectedAt: revisionChainDateV010_(p.Detected_At),
        observationType: revisionChainSelectV010_(p.Observation_Type),
        decision: revisionChainSelectV010_(p.Decision),
        status: revisionChainSelectV010_(p.Status)
      };

      if (!V127_PRODUCTION.TARGET_COLLECTORS.includes(row.collector)) return;
      state.targetRows++;

      const stableKey = stableSourceKeyV127P_(row);
      if (!stableKey) {
        state.rowsWithoutStableKey++;
        return;
      }

      if (!state.byStableKey.has(stableKey)) state.byStableKey.set(stableKey, []);
      state.byStableKey.get(stableKey).push(row);
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

function revisionChainTitleTextV010_(prop) {
  if (!prop) return '';
  const items = prop.title || prop.rich_text || [];
  return items.map(x => x.plain_text || (x.text && x.text.content) || '').join('').trim();
}

function revisionChainRichTextV010_(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map(x => x.plain_text || (x.text && x.text.content) || '').join('').trim();
}

function revisionChainSelectV010_(prop) {
  return prop && prop.select && prop.select.name ? String(prop.select.name) : '';
}

function revisionChainDateV010_(prop) {
  return prop && prop.date && prop.date.start ? String(prop.date.start) : '';
}
