/**
 * おひさまコネクト - INBOX Crawler v1.2.7
 * Existing Stable Source Duplicate Cleanup PREVIEW ONLY
 * 2026-09-28
 *
 * PURPOSE
 * -------
 * Stable Source Identity + Revision Detection の本番化後、
 * 既存INBOXに残っている重複行を、安全に整理できるか監査する。
 *
 * WRITE = NONE
 * 削除 / archive / update は一切行わない。
 *
 * 方針
 * ----
 * - Stable Source Key単位で集約する。
 * - 空白差のみは同一Content Versionとして扱う。
 * - 意味のあるタイトル変更は別Content Versionとして保持する。
 * - 各Content Version内で、Decision / Event / Source / Status / Memo 等を比較する。
 * - 保護対象フィールドに競合があればMANUAL_REVIEW_REQUIRED。
 * - 競合がなければ、最も情報量の多い行をKEEP候補とし、残りをARCHIVE候補にする。
 *
 * Expected after 2026-09-28 smoke test:
 *   TARGET_ROWS ~= 451
 *   STABLE_KEYS ~= 392
 *   DUPLICATE_STABLE_KEYS = 56
 *   PHYSICAL_EXTRA_ROWS = 59
 *   REVISION_EXTRA_ROWS = 3
 *   PROPOSED_ARCHIVE_ROWS = 56
 *
 * Dependencies in same Apps Script project:
 *   v1.2.6 main crawler:
 *     OCOS, notionRequest_()
 *   v1.2.7 production runner:
 *     V127_PRODUCTION, stableSourceKeyV127P_(),
 *     normalizeSourceTitleLooseV127P_()
 */

const V127_DUP_CLEANUP_PREVIEW = Object.freeze({
  VERSION: '1.2.7-duplicate-cleanup-preview',
  MAX_DETAIL_GROUPS: 200
});

function previewV127DuplicateCleanupPlan() {
  console.log('========================================');
  console.log('OC-OS INBOX v1.2.7 DUPLICATE CLEANUP PLAN PREVIEW');
  console.log('WRITE = NONE');
  console.log('========================================');

  const state = loadV127DuplicateCleanupState_();
  const duplicateGroups = [];

  state.byStableKey.forEach((rows, key) => {
    if (rows.length > 1) duplicateGroups.push({ key, rows });
  });

  duplicateGroups.sort((a, b) =>
    b.rows.length - a.rows.length || a.key.localeCompare(b.key)
  );

  const summary = {
    targetRows: state.targetRows,
    stableKeys: state.byStableKey.size,
    duplicateStableKeys: duplicateGroups.length,
    physicalExtraRows: 0,
    revisionExtraRows: 0,
    proposedArchiveRows: 0,
    keepRows: 0,
    safeContentVersions: 0,
    manualReviewContentVersions: 0,
    protectedConflictGroups: 0,
    rowsWithoutStableKey: state.rowsWithoutStableKey
  };

  const plans = [];

  duplicateGroups.forEach(group => {
    summary.physicalExtraRows += group.rows.length - 1;

    const contentVersions = groupRowsBySemanticContentV127DC_(group.rows);
    summary.revisionExtraRows += Math.max(0, contentVersions.length - 1);

    const contentPlans = contentVersions.map(versionRows => {
      const plan = planContentVersionV127DC_(versionRows);
      summary.keepRows += 1;
      summary.proposedArchiveRows += plan.archiveRows.length;

      if (plan.manualReviewRequired) {
        summary.manualReviewContentVersions++;
      } else {
        summary.safeContentVersions++;
      }

      return plan;
    });

    const hasProtectedConflict = contentPlans.some(x => x.manualReviewRequired);
    if (hasProtectedConflict) summary.protectedConflictGroups++;

    plans.push({
      stableKey: group.key,
      rows: group.rows,
      contentVersions: contentPlans,
      hasProtectedConflict
    });
  });

  console.log(`INBOX_TARGET_ROWS = ${summary.targetRows}`);
  console.log(`STABLE_KEYS = ${summary.stableKeys}`);
  console.log(`DUPLICATE_STABLE_KEYS = ${summary.duplicateStableKeys}`);
  console.log(`PHYSICAL_EXTRA_ROWS = ${summary.physicalExtraRows}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${summary.rowsWithoutStableKey}`);
  console.log('----------------------------------------');
  console.log(`REVISION_EXTRA_ROWS_TO_KEEP = ${summary.revisionExtraRows}`);
  console.log(`PROPOSED_ARCHIVE_ROWS = ${summary.proposedArchiveRows}`);
  console.log(`SAFE_CONTENT_VERSIONS = ${summary.safeContentVersions}`);
  console.log(`MANUAL_REVIEW_CONTENT_VERSIONS = ${summary.manualReviewContentVersions}`);
  console.log(`PROTECTED_CONFLICT_GROUPS = ${summary.protectedConflictGroups}`);
  console.log('----------------------------------------');

  plans
    .slice(0, V127_DUP_CLEANUP_PREVIEW.MAX_DETAIL_GROUPS)
    .forEach((group, gi) => logDuplicateCleanupGroupV127DC_(group, gi + 1));

  console.log('========================================');
  console.log('CLEANUP PLAN PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function groupRowsBySemanticContentV127DC_(rows) {
  const versions = [];
  const byKey = new Map();

  (rows || []).forEach(row => {
    const key = normalizeSourceTitleLooseV127P_(row.title || '');

    if (!byKey.has(key)) {
      const arr = [];
      byKey.set(key, arr);
      versions.push(arr);
    }

    byKey.get(key).push(row);
  });

  versions.forEach(arr => arr.sort(compareDetectedV127DC_));
  return versions;
}

function planContentVersionV127DC_(rows) {
  const conflictReport = detectProtectedConflictsV127DC_(rows);
  const ranked = (rows || []).slice().sort((a, b) => {
    const sa = keeperScoreV127DC_(a);
    const sb = keeperScoreV127DC_(b);
    if (sa !== sb) return sb - sa;

    // score tieなら新しい観測をKEEP候補にする。
    return -compareDetectedV127DC_(a, b);
  });

  const keep = ranked[0] || null;
  const archiveRows = ranked.filter(x => !keep || x.pageId !== keep.pageId);

  return {
    semanticTitle: keep ? normalizeSourceTitleLooseV127P_(keep.title || '') : '',
    keep,
    archiveRows,
    manualReviewRequired: conflictReport.conflicts.length > 0,
    conflicts: conflictReport.conflicts,
    protectedValues: conflictReport.protectedValues
  };
}

function keeperScoreV127DC_(row) {
  let score = 0;

  // 人間判断・Canonical接続は最優先。
  if (isMeaningfulDecisionV127DC_(row.decision)) score += 1000;
  if ((row.eventIds || []).length) score += 1000;
  if ((row.sourceIds || []).length) score += 1000;
  if (isMeaningfulStatusV127DC_(row.status)) score += 800;
  if (String(row.memo || '').trim()) score += 500;

  // Suggestion Layerは次点。ただし失わない。
  if (isMeaningfulSuggestedDecisionV127DC_(row.suggestedDecision)) score += 200;
  if ((row.suggestedEventIds || []).length) score += 200;
  if (String(row.suggestionConfidence || '').trim()) score += 100;
  if (String(row.suggestionReason || '').trim()) score += 100;

  // Processor実行結果も保持優先。
  if (String(row.processedAt || '').trim()) score += 100;
  if (String(row.processorVersion || '').trim()) score += 50;
  if (String(row.processorError || '').trim()) score += 50;

  // metadata richnessはtie-break補助。
  if (String(row.eventDateHint || '').trim()) score += 10;
  if (String(row.publishedAt || '').trim()) score += 5;
  if (String(row.detectedSnippet || '').trim()) score += 2;
  if (String(row.discoveryTerms || '').trim()) score += 1;

  return score;
}

function detectProtectedConflictsV127DC_(rows) {
  const specs = [
    { name: 'Decision', values: rows.map(r => isMeaningfulDecisionV127DC_(r.decision) ? r.decision : '') },
    { name: 'Event', values: rows.map(r => relationKeyV127DC_(r.eventIds)) },
    { name: 'Source', values: rows.map(r => relationKeyV127DC_(r.sourceIds)) },
    { name: 'Status', values: rows.map(r => isMeaningfulStatusV127DC_(r.status) ? r.status : '') },
    { name: 'Memo', values: rows.map(r => String(r.memo || '').trim()) },
    { name: 'Suggested_Decision', values: rows.map(r => isMeaningfulSuggestedDecisionV127DC_(r.suggestedDecision) ? r.suggestedDecision : '') },
    { name: 'Suggested_Event', values: rows.map(r => relationKeyV127DC_(r.suggestedEventIds)) },
    { name: 'Suggestion_Confidence', values: rows.map(r => String(r.suggestionConfidence || '').trim()) },
    { name: 'Suggestion_Reason', values: rows.map(r => String(r.suggestionReason || '').trim()) }
  ];

  const conflicts = [];
  const protectedValues = {};

  specs.forEach(spec => {
    const unique = Array.from(new Set(spec.values.filter(Boolean)));
    protectedValues[spec.name] = unique;
    if (unique.length > 1) {
      conflicts.push({ field: spec.name, values: unique });
    }
  });

  return { conflicts, protectedValues };
}

function isMeaningfulDecisionV127DC_(value) {
  const s = String(value || '').trim();
  return Boolean(s && s !== '未判断');
}

function isMeaningfulStatusV127DC_(value) {
  const s = String(value || '').trim();
  return Boolean(s && s !== '未処理');
}

function isMeaningfulSuggestedDecisionV127DC_(value) {
  const s = String(value || '').trim();
  return Boolean(s && s !== '未提案');
}

function relationKeyV127DC_(ids) {
  return (ids || []).slice().sort().join('|');
}

function compareDetectedV127DC_(a, b) {
  const ta = String((a && a.detectedAt) || '');
  const tb = String((b && b.detectedAt) || '');
  if (ta !== tb) return ta.localeCompare(tb);
  return String((a && a.pageId) || '').localeCompare(String((b && b.pageId) || ''));
}

function logDuplicateCleanupGroupV127DC_(group, index) {
  console.log('----------------------------------------');
  console.log(
    `${index}. ${group.stableKey} | rows=${group.rows.length} | ` +
    `contentVersions=${group.contentVersions.length} | ` +
    `protectedConflict=${group.hasProtectedConflict ? 'YES' : 'NO'}`
  );

  group.contentVersions.forEach((plan, vi) => {
    console.log(
      `   VERSION ${vi + 1}: ${plan.manualReviewRequired ? 'MANUAL_REVIEW_REQUIRED' : 'SAFE'} | ` +
      `rows=${1 + plan.archiveRows.length}`
    );

    if (plan.keep) {
      console.log(
        `     KEEP page=${plan.keep.pageId} | Inbox_ID=${plan.keep.inboxId || '-'} | ` +
        `detected=${plan.keep.detectedAt || '-'} | score=${keeperScoreV127DC_(plan.keep)} | ` +
        `title=${plan.keep.title || '-'}`
      );
      console.log(`       state=${summarizeProtectedStateV127DC_(plan.keep)}`);
    }

    plan.archiveRows.forEach(row => {
      console.log(
        `     ARCHIVE_CANDIDATE page=${row.pageId} | Inbox_ID=${row.inboxId || '-'} | ` +
        `detected=${row.detectedAt || '-'} | score=${keeperScoreV127DC_(row)} | ` +
        `title=${row.title || '-'}`
      );
      console.log(`       state=${summarizeProtectedStateV127DC_(row)}`);
    });

    plan.conflicts.forEach(c => {
      console.log(`     CONFLICT ${c.field}: ${c.values.join(' || ')}`);
    });
  });
}

function summarizeProtectedStateV127DC_(row) {
  return [
    `Decision=${row.decision || '-'}`,
    `Status=${row.status || '-'}`,
    `Event=${relationKeyV127DC_(row.eventIds) || '-'}`,
    `Source=${relationKeyV127DC_(row.sourceIds) || '-'}`,
    `Suggested=${row.suggestedDecision || '-'}`,
    `Suggested_Event=${relationKeyV127DC_(row.suggestedEventIds) || '-'}`,
    `Confidence=${row.suggestionConfidence || '-'}`,
    `Processed=${row.processedAt || '-'}`
  ].join(' / ');
}

function loadV127DuplicateCleanupState_() {
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
        inboxId: notionUniqueIdV127DC_(p.Inbox_ID),
        title: notionTitleV127DC_(p.Inbox_Title),
        url: notionUrlV127DC_(p.URL),
        collector: notionTextV127DC_(p.Collector),
        fingerprint: notionTextV127DC_(p.Fingerprint),
        detectedAt: notionDateStartV127DC_(p.Detected_At),
        publishedAt: notionDateStartV127DC_(p.Published_At),
        eventDateHint: notionDateStartV127DC_(p.Event_Date_Hint),
        detectedSnippet: notionTextV127DC_(p.Detected_Snippet),
        discoveryTerms: notionTextV127DC_(p.Discovery_Terms),
        decision: notionSelectV127DC_(p.Decision),
        status: notionSelectV127DC_(p.Status),
        memo: notionTextV127DC_(p.Memo),
        eventIds: notionRelationIdsV127DC_(p.Event),
        sourceIds: notionRelationIdsV127DC_(p.Source),
        suggestedDecision: notionSelectV127DC_(p.Suggested_Decision),
        suggestedEventIds: notionRelationIdsV127DC_(p.Suggested_Event),
        suggestionConfidence: notionSelectV127DC_(p.Suggestion_Confidence),
        suggestionReason: notionTextV127DC_(p.Suggestion_Reason),
        processedAt: notionDateStartV127DC_(p.Processed_At),
        processorVersion: notionTextV127DC_(p.Processor_Version),
        processorError: notionTextV127DC_(p.Processor_Error)
      };

      if (!V127_PRODUCTION.TARGET_COLLECTORS.includes(row.collector)) return;

      state.targetRows++;
      const key = stableSourceKeyV127P_(row);

      if (!key) {
        state.rowsWithoutStableKey++;
        return;
      }

      if (!state.byStableKey.has(key)) state.byStableKey.set(key, []);
      state.byStableKey.get(key).push(row);
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  state.byStableKey.forEach(rows => rows.sort(compareDetectedV127DC_));
  return state;
}

function notionTitleV127DC_(prop) {
  if (!prop || !Array.isArray(prop.title)) return '';
  return prop.title.map(x => x.plain_text || (x.text && x.text.content) || '').join('').trim();
}

function notionTextV127DC_(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map(x => x.plain_text || (x.text && x.text.content) || '').join('').trim();
}

function notionUrlV127DC_(prop) {
  if (!prop) return '';
  return String(prop.url || '').trim();
}

function notionDateStartV127DC_(prop) {
  if (!prop || !prop.date) return '';
  return String(prop.date.start || '');
}

function notionSelectV127DC_(prop) {
  if (!prop || !prop.select) return '';
  return String(prop.select.name || '');
}

function notionRelationIdsV127DC_(prop) {
  if (!prop || !Array.isArray(prop.relation)) return [];
  return prop.relation.map(x => String(x.id || '')).filter(Boolean);
}

function notionUniqueIdV127DC_(prop) {
  if (!prop || !prop.unique_id) return '';
  const prefix = prop.unique_id.prefix ? String(prop.unique_id.prefix) : '';
  const number = prop.unique_id.number !== undefined && prop.unique_id.number !== null
    ? String(prop.unique_id.number)
    : '';
  return prefix + number;
}
