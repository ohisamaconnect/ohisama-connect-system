/**
 * OC-OS INBOX Revision Observation Type PREVIEW v0.1.0
 * 2026-09-29
 *
 * WRITE = NONE
 *
 * Purpose:
 *   Stable Source revision chain を通常INBOXから構造的に区別する前に、
 *   現在どの行が SOURCE_REVISION 対象になるか、Suggestion / Processor
 *   に露出している行が何件あるかを監査する。
 *
 * Proposed schema (NOT created by this file):
 *   Observation_Type (select)
 *     - NORMAL
 *     - SOURCE_REVISION
 *
 * Proposed semantics:
 *   - 同一 Stable Source Key に 2つ以上の semantic content version がある場合、
 *     その revision chain に属する全 physical rows を SOURCE_REVISION とする。
 *   - 同一 content version 内の単なる重複だけは revision とみなさない。
 *   - Historical blank Observation_Type は将来 NORMAL と同等に扱える設計にする。
 *
 * Why the whole chain is protected:
 *   旧版側に Human Decision が残っている場合（例: M02813 INB3210）、
 *   新版だけを revision 扱いすると旧版が Processor に流れ得るため。
 *
 * Dependencies in the same Apps Script project:
 *   - ohisama_inbox_crawler_v1.2.7_duplicate_cleanup_preview_only.gs
 *       loadV127DuplicateCleanupState_()
 *       groupRowsBySemanticContentV127DC_()
 *       relationKeyV127DC_()
 *   - ohisama_inbox_crawler_v1.2.7_production_runner.gs
 *       V127_PRODUCTION
 *
 * IMPORTANT:
 *   Notion schema / pages / Suggestion / Processor / Crawler are NOT modified.
 */

const OCOS_REVISION_OBS_PREVIEW = Object.freeze({
  VERSION: '0.1.0',
  PROPOSED_NORMAL: 'NORMAL',
  PROPOSED_REVISION: 'SOURCE_REVISION',
  REVISION_SNIPPET_PREFIX: '[SOURCE_REVISION_CANDIDATE]'
});

function previewInboxRevisionObservationTypeV010() {
  console.log('========================================');
  console.log('OC-OS INBOX REVISION OBSERVATION TYPE PREVIEW v0.1.0');
  console.log('NOTION WRITE = NONE');
  console.log('SCHEMA WRITE = NONE');
  console.log('========================================');

  const state = loadV127DuplicateCleanupState_();
  const revisionGroups = [];
  const sameContentDuplicateGroups = [];

  state.byStableKey.forEach((rows, stableKey) => {
    if (!rows || rows.length < 2) return;

    const versions = groupRowsBySemanticContentV127DC_(rows);
    if (versions.length > 1) {
      revisionGroups.push({ stableKey, rows, versions });
    } else {
      sameContentDuplicateGroups.push({ stableKey, rows, versions });
    }
  });

  revisionGroups.sort((a, b) => a.stableKey.localeCompare(b.stableKey));
  sameContentDuplicateGroups.sort((a, b) => a.stableKey.localeCompare(b.stableKey));

  const revisionRows = [];
  let semanticVersions = 0;
  let processorExposure = 0;
  let suggestionExposure = 0;
  let alreadyProcessed = 0;
  let snippetMarkerRows = 0;
  let humanDecisionRows = 0;
  let unjudgedRows = 0;

  revisionGroups.forEach(group => {
    semanticVersions += group.versions.length;

    group.rows.forEach(row => {
      const decision = String(row.decision || '').trim();
      const status = String(row.status || '').trim();
      const suggested = String(row.suggestedDecision || '').trim();
      const snippet = String(row.detectedSnippet || '');

      const activeStatus = status === '未処理' || status === '確認中';
      const humanDecision = Boolean(decision && decision !== '未判断');
      const unjudged = !decision || decision === '未判断';
      const suggestionPending = !suggested || suggested === '未提案';
      const processorExposed = activeStatus && humanDecision;
      const suggestionExposed = activeStatus && unjudged && suggestionPending;
      const processed = status === '処理済';
      const hasMarker = snippet.indexOf(OCOS_REVISION_OBS_PREVIEW.REVISION_SNIPPET_PREFIX) === 0;

      if (processorExposed) processorExposure++;
      if (suggestionExposed) suggestionExposure++;
      if (processed) alreadyProcessed++;
      if (hasMarker) snippetMarkerRows++;
      if (humanDecision) humanDecisionRows++;
      if (unjudged) unjudgedRows++;

      revisionRows.push({
        stableKey: group.stableKey,
        pageId: row.pageId,
        inboxId: row.inboxId,
        title: row.title,
        detectedAt: row.detectedAt,
        decision,
        status,
        eventIds: row.eventIds || [],
        sourceIds: row.sourceIds || [],
        suggestedDecision: suggested,
        proposedObservationType: OCOS_REVISION_OBS_PREVIEW.PROPOSED_REVISION,
        processorExposed,
        suggestionExposed,
        processed,
        hasMarker
      });
    });
  });

  revisionRows.sort((a, b) => {
    const ka = `${a.stableKey}|${a.detectedAt || ''}|${a.pageId || ''}`;
    const kb = `${b.stableKey}|${b.detectedAt || ''}|${b.pageId || ''}`;
    return ka.localeCompare(kb);
  });

  console.log(`STABLE_TARGET_ROWS = ${state.targetRows}`);
  console.log(`STABLE_KEYS = ${state.byStableKey.size}`);
  console.log(`ROWS_WITHOUT_STABLE_KEY = ${state.rowsWithoutStableKey}`);
  console.log('----------------------------------------');
  console.log(`TRUE_REVISION_STABLE_KEYS = ${revisionGroups.length}`);
  console.log(`REVISION_SEMANTIC_VERSIONS = ${semanticVersions}`);
  console.log(`REVISION_CHAIN_PHYSICAL_ROWS = ${revisionRows.length}`);
  console.log(`SAME_CONTENT_DUPLICATE_KEYS_NOT_REVISION = ${sameContentDuplicateGroups.length}`);
  console.log('----------------------------------------');
  console.log(`PROPOSED_SOURCE_REVISION_ROWS = ${revisionRows.length}`);
  console.log(`PROCESSOR_EXPOSURE_TO_BLOCK = ${processorExposure}`);
  console.log(`SUGGESTION_EXPOSURE_TO_BLOCK = ${suggestionExposure}`);
  console.log(`ALREADY_PROCESSED_REVISION_ROWS = ${alreadyProcessed}`);
  console.log(`HUMAN_DECISION_REVISION_ROWS = ${humanDecisionRows}`);
  console.log(`UNJUDGED_REVISION_ROWS = ${unjudgedRows}`);
  console.log(`CURRENT_SNIPPET_MARKER_ROWS = ${snippetMarkerRows}`);
  console.log('----------------------------------------');

  revisionGroups.forEach((group, gi) => {
    console.log(`${gi + 1}. ${group.stableKey} | rows=${group.rows.length} | contentVersions=${group.versions.length}`);

    group.versions.forEach((versionRows, vi) => {
      console.log(`   VERSION ${vi + 1} | rows=${versionRows.length}`);
      versionRows.forEach(row => {
        const found = revisionRows.find(x => x.pageId === row.pageId);
        console.log(
          `     ${found && found.processorExposed ? '[PROCESSOR_EXPOSED]' : ''}` +
          `${found && found.suggestionExposed ? '[SUGGESTION_EXPOSED]' : ''}` +
          `${found && found.processed ? '[PROCESSED]' : ''} ` +
          `${row.inboxId || '-'} | page=${row.pageId} | ${row.title || '-'}`
        );
        console.log(
          `       proposed=${OCOS_REVISION_OBS_PREVIEW.PROPOSED_REVISION} / ` +
          `Decision=${row.decision || '-'} / Status=${row.status || '-'} / ` +
          `Event=${relationKeyV127DC_(row.eventIds) || '-'} / ` +
          `Source=${relationKeyV127DC_(row.sourceIds) || '-'} / ` +
          `Suggested=${row.suggestedDecision || '-'} / ` +
          `snippetMarker=${String(row.detectedSnippet || '').indexOf(OCOS_REVISION_OBS_PREVIEW.REVISION_SNIPPET_PREFIX) === 0 ? 'YES' : 'NO'}`
        );
      });
    });
  });

  console.log('----------------------------------------');
  console.log('SAME-CONTENT DUPLICATES (NOT SOURCE_REVISION)');
  sameContentDuplicateGroups.forEach((group, i) => {
    console.log(`${i + 1}. ${group.stableKey} | rows=${group.rows.length}`);
    group.rows.forEach(row => {
      console.log(
        `   ${row.inboxId || '-'} | Decision=${row.decision || '-'} | Status=${row.status || '-'} | ${row.title || '-'}`
      );
    });
  });

  console.log('========================================');
  console.log('PROPOSED GUARD');
  console.log('- Observation_Type = SOURCE_REVISION -> Suggestion candidateから除外');
  console.log('- Observation_Type = SOURCE_REVISION -> Processor candidateから除外');
  console.log('- blank / NORMAL -> 従来どおり通常処理');
  console.log('- Crawler revision creation -> SOURCE_REVISION をmachine-ownedで設定');
  console.log('========================================');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}
