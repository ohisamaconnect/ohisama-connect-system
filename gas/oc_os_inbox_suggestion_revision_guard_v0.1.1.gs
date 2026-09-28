/**
 * OC-OS INBOX Suggestion Engine Revision Guard v0.1.1
 * 2026-09-29
 *
 * Purpose:
 *   Observation_Type = SOURCE_REVISION のINBOXを通常Suggestion処理から除外する。
 *
 * Safety design:
 *   1) Query-level guard: candidate load時点で SOURCE_REVISION を除外
 *   2) Runtime guard: parse後にも SOURCE_REVISION を再確認してskip
 *   3) Decision / Event / Status は変更しない
 *
 * Dependencies in same Apps Script project:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *     OCOS_SUGGESTION
 *     suggestionValidateConfig_()
 *     suggestionLoadEvents_()
 *     suggestionNotionRequest_()
 *     suggestionParseInboxPage_()
 *     suggestionBuildProposal_()
 *     suggestionPatchProposal_()
 *     suggestionErrorMessage_()
 *     suggestionSelect_()
 */

const OCOS_SUGGESTION_REVISION_GUARD_011 = Object.freeze({
  VERSION: '0.1.1-revision-guard',
  REVISION_VALUE: 'SOURCE_REVISION'
});

function previewInboxSuggestionV011() {
  suggestionPreviewRunV011_({ backfill: false });
}

function runInboxSuggestionV011() {
  suggestionWriteRunV011_({ backfill: false });
}

function previewInboxSuggestionBackfillV011() {
  suggestionPreviewRunV011_({ backfill: true });
}

function runInboxSuggestionBackfillV011() {
  suggestionWriteRunV011_({ backfill: true });
}

function suggestionPreviewRunV011_(mode) {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();
  const pages = suggestionLoadInboxCandidatesV011_(mode);

  let revisionSkipped = 0;
  const candidates = [];

  pages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (isSourceRevisionSuggestionV011_(item)) {
      revisionSkipped++;
      return;
    }
    candidates.push({ page, item });
  });

  console.log('========================================');
  console.log(`OC-OS INBOX SUGGESTION ${OCOS_SUGGESTION_REVISION_GUARD_011.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
  console.log(`QUERY_CANDIDATES = ${pages.length}`);
  console.log(`RUNTIME_REVISION_SKIPPED = ${revisionSkipped}`);
  console.log(`FINAL_CANDIDATES = ${candidates.length}`);
  console.log('========================================');

  candidates.forEach(({ item }, index) => {
    const proposal = suggestionBuildProposal_(item, events);
    console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
    console.log(`   observationType=${item.observationType || '(blank=NORMAL)'}`);
    console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
    console.log(`   reason=${proposal.reason}`);
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE');
  console.log('SOURCE_REVISION = EXCLUDED');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');
}

function suggestionWriteRunV011_(mode) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Suggestion Engine skipped.');
    return;
  }

  const startedAt = Date.now();
  try {
    suggestionValidateConfig_();
    const events = suggestionLoadEvents_();
    const pages = suggestionLoadInboxCandidatesV011_(mode);

    let written = 0;
    let skipped = 0;
    let revisionSkipped = 0;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX SUGGESTION ${OCOS_SUGGESTION_REVISION_GUARD_011.VERSION}`);
    console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
    console.log(`QUERY_CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_SUGGESTION.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const item = suggestionParseInboxPageV011_(page);

      // Runtime second guard. Query条件だけに依存しない。
      if (isSourceRevisionSuggestionV011_(item)) {
        revisionSkipped++;
        console.log(`[REVISION_SKIP] ${item.title}`);
        continue;
      }

      if (item.decision && item.decision !== '未判断') {
        skipped++;
        continue;
      }

      if (item.suggestedDecision && item.suggestedDecision !== '未提案') {
        skipped++;
        continue;
      }

      try {
        const proposal = suggestionBuildProposal_(item, events);
        suggestionPatchProposal_(item.pageId, proposal);
        written++;
        console.log(`[OK] ${proposal.suggestedDecision} | ${item.title}`);
      } catch (err) {
        failed++;
        console.error(`[FAILED] ${item.title}: ${suggestionErrorMessage_(err)}`);
      }

      Utilities.sleep(OCOS_SUGGESTION.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(`DONE written=${written}, skipped=${skipped}, revisionSkipped=${revisionSkipped}, failed=${failed}`);
    console.log('SOURCE_REVISION = EXCLUDED');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function suggestionLoadInboxCandidatesV011_(mode) {
  const pageSize = mode.backfill
    ? OCOS_SUGGESTION.BACKFILL_MAX_PER_RUN
    : OCOS_SUGGESTION.MAX_PER_RUN;

  const andFilters = [
    {
      or: [
        { property: 'Status', select: { equals: '未処理' } },
        { property: 'Status', select: { equals: '確認中' } }
      ]
    },
    { property: 'Decision', select: { equals: '未判断' } },
    // blank / NORMAL は従来通り通常処理。SOURCE_REVISIONだけ除外。
    { property: 'Observation_Type', select: { does_not_equal: OCOS_SUGGESTION_REVISION_GUARD_011.REVISION_VALUE } }
  ];

  if (mode.backfill) {
    andFilters.push({
      property: 'Published_At',
      date: { on_or_after: OCOS_SUGGESTION.BACKFILL_FROM }
    });
    andFilters.push({
      property: 'Published_At',
      date: { on_or_before: OCOS_SUGGESTION.BACKFILL_TO }
    });
  }

  const result = suggestionNotionRequest_(
    `/v1/data_sources/${OCOS_SUGGESTION.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: Math.min(pageSize, 100),
      filter: { and: andFilters },
      sorts: [{ property: 'Published_At', direction: 'ascending' }]
    }
  );

  return (result.results || []).filter(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (isSourceRevisionSuggestionV011_(item)) return false;
    return !item.suggestedDecision || item.suggestedDecision === '未提案';
  });
}

function suggestionParseInboxPageV011_(page) {
  const item = suggestionParseInboxPage_(page);
  const p = (page && page.properties) || {};
  item.observationType = suggestionSelect_(p.Observation_Type);
  return item;
}

function isSourceRevisionSuggestionV011_(item) {
  return String((item && item.observationType) || '').trim() ===
    OCOS_SUGGESTION_REVISION_GUARD_011.REVISION_VALUE;
}
