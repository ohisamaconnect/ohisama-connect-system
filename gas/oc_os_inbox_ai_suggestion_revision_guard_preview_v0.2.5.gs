/**
 * OC-OS INBOX AI Suggestion Revision Guard PREVIEW v0.2.5
 * 2026-09-29
 *
 * PURPOSE
 * -------
 * SOURCE_REVISION を AI Suggestion の通常経路から完全隔離するための
 * READ ONLY 監査。
 *
 * Audits:
 *   1) CURRENT candidate loader: v0.1.1 query/runtime guard exposure
 *   2) BACKFILL candidate loader: legacy v0.2.0 path exposure
 *   3) existing v0.2.4 staged snapshot: live Observation_Type at commit time
 *
 * WRITE = NONE
 * Gemini = NONE
 * Script Properties = READ ONLY
 * Notion = READ ONLY
 *
 * Proposed v0.2.5 canonical guard:
 *   - candidate stage: blank / NORMAL only
 *   - stage snapshot records observationTypeAtStage
 *   - commit reloads live page
 *   - SOURCE_REVISION or unexpected Observation_Type => SKIP / NO PATCH
 *   - Decision / Event / Status remain unchanged
 *
 * Dependencies in same Apps Script project:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_revision_guard_v0.1.1.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 *   oc_os_inbox_ai_suggestion_staged_commit_v0.2.4.gs
 */

const OCOS_AI_SUGGESTION_REVISION_GUARD_025_PREVIEW = Object.freeze({
  VERSION: '0.2.5-revision-guard-preview',
  NORMAL: 'NORMAL',
  REVISION: 'SOURCE_REVISION'
});

function previewInboxAiSuggestionRevisionGuardV025() {
  suggestionValidateConfig_();

  console.log('========================================');
  console.log('OC-OS INBOX AI SUGGESTION REVISION GUARD PREVIEW v0.2.5');
  console.log('WRITE = NONE');
  console.log('GEMINI_CALL = NONE');
  console.log('========================================');

  const current = auditAiSuggestionCurrentRevisionExposureV025_();
  const backfill = auditAiSuggestionBackfillRevisionExposureV025_();
  const stage = auditAiSuggestionExistingStageRevisionExposureV025_();

  console.log('----------------------------------------');
  console.log('CURRENT PATH');
  console.log(`CURRENT_NORMAL_CANDIDATES = ${current.normalCandidates}`);
  console.log(`CURRENT_REVISION_EXCLUDED_BY_QUERY = ${current.revisionExcluded}`);
  console.log(`CURRENT_RUNTIME_REVISION_LEAK = ${current.runtimeRevisionLeak}`);

  console.log('----------------------------------------');
  console.log('BACKFILL PATH');
  console.log(`BACKFILL_LEGACY_CANDIDATES = ${backfill.legacyCandidates}`);
  console.log(`BACKFILL_SOURCE_REVISION_EXPOSURE = ${backfill.revisionExposure}`);
  console.log(`BACKFILL_GUARDED_CANDIDATES = ${backfill.guardedCandidates}`);
  backfill.revisionRows.forEach((item, i) => {
    console.log(`BACKFILL_REVISION_EXCLUDED ${i + 1}. ${item.title}`);
  });

  console.log('----------------------------------------');
  console.log('EXISTING v0.2.4 STAGE / COMMIT-TIME LIVE AUDIT');
  if (!stage.exists) {
    console.log('STAGE_V024_EXISTS = NO');
  } else {
    console.log('STAGE_V024_EXISTS = YES');
    console.log(`STAGE_V024_ID = ${stage.stageId}`);
    console.log(`STAGE_V024_ITEMS = ${stage.items}`);
    console.log(`STAGE_LIVE_NORMAL_OR_BLANK = ${stage.normalOrBlank}`);
    console.log(`STAGE_LIVE_SOURCE_REVISION = ${stage.revision}`);
    console.log(`STAGE_LIVE_UNEXPECTED_OBSERVATION_TYPE = ${stage.unexpected}`);
    console.log(`STAGE_LIVE_MISSING_PAGE = ${stage.missing}`);
    stage.revisionRows.forEach((x, i) => {
      console.log(`STAGE_REVISION_BLOCK ${i + 1}. ${x.title} | ${x.pageId}`);
    });
    stage.unexpectedRows.forEach((x, i) => {
      console.log(`STAGE_UNEXPECTED_BLOCK ${i + 1}. Observation_Type=${x.observationType} | ${x.title} | ${x.pageId}`);
    });
  }

  console.log('========================================');
  const safeCurrent = current.runtimeRevisionLeak === 0;
  const safeStageAudit = !stage.exists || (stage.unexpected === 0 && stage.missing === 0);
  console.log(`CURRENT_GUARD_STATUS = ${safeCurrent ? 'PASS' : 'FAIL'}`);
  console.log(`BACKFILL_GUARD_IMPLEMENTATION_NEEDED = ${backfill.revisionExposure > 0 ? 'YES' : 'YES (STRUCTURAL)'}`);
  console.log('COMMIT_LIVE_OBSERVATION_GUARD_NEEDED = YES');
  console.log(`EXISTING_STAGE_AUDIT_STATUS = ${safeStageAudit ? 'PASS' : 'REVIEW'}`);
  console.log('PROPOSED v0.2.5: stage/commit allow only blank or NORMAL; SOURCE_REVISION/unexpected => READ ONLY SKIP');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function auditAiSuggestionCurrentRevisionExposureV025_() {
  const mode = { backfill: false };
  const normalPages = suggestionLoadInboxCandidatesV011_(mode);
  const revisionPages = suggestionLoadRevisionExposureV011_(mode);

  let runtimeRevisionLeak = 0;
  normalPages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (isSourceRevisionSuggestionV011_(item)) runtimeRevisionLeak++;
  });

  return {
    normalCandidates: normalPages.length,
    revisionExcluded: revisionPages.length,
    runtimeRevisionLeak
  };
}

function auditAiSuggestionBackfillRevisionExposureV025_() {
  const events = suggestionLoadEvents_();
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  const legacyCandidates = [];
  const revisionRows = [];
  const guardedCandidates = [];

  pages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (item.decision && item.decision !== '未判断') return;
    if (item.suggestedDecision && item.suggestedDecision !== '未提案') return;

    const triage = suggestionClassifyParentBackfillV012_(item, events);
    if (triage.kind !== 'AI_REVIEW') return;

    legacyCandidates.push(item);

    if (isSourceRevisionSuggestionV011_(item)) {
      revisionRows.push(item);
      return;
    }

    if (isAllowedNormalObservationV025_(item.observationType)) {
      guardedCandidates.push(item);
    }
  });

  return {
    legacyCandidates: legacyCandidates.length,
    revisionExposure: revisionRows.length,
    guardedCandidates: guardedCandidates.length,
    revisionRows
  };
}

function auditAiSuggestionExistingStageRevisionExposureV025_() {
  let stage;
  try {
    stage = aiSuggestionLoadStageV024_();
  } catch (err) {
    if (/No AI Suggestion v0\.2\.4 stage exists/i.test(String(err && err.message || err))) {
      return { exists: false };
    }
    throw err;
  }

  const result = {
    exists: true,
    stageId: stage.meta.stageId || '',
    items: stage.items.length,
    normalOrBlank: 0,
    revision: 0,
    unexpected: 0,
    missing: 0,
    revisionRows: [],
    unexpectedRows: []
  };

  stage.items.forEach(stagedItem => {
    try {
      const page = suggestionNotionRequest_(`/v1/pages/${stagedItem.pageId}`, 'get');
      if (!page || !page.id) {
        result.missing++;
        return;
      }

      // Use the canonical v0.1.1 parser so title and Observation_Type are read
      // through functions that actually exist in the current Apps Script project.
      const current = suggestionParseInboxPageV011_(page);
      const observationType = current.observationType || '';
      const row = {
        pageId: stagedItem.pageId,
        title: current.title || stagedItem.title || '',
        observationType
      };

      if (String(observationType).trim() === OCOS_AI_SUGGESTION_REVISION_GUARD_025_PREVIEW.REVISION) {
        result.revision++;
        result.revisionRows.push(row);
      } else if (isAllowedNormalObservationV025_(observationType)) {
        result.normalOrBlank++;
      } else {
        result.unexpected++;
        result.unexpectedRows.push(row);
      }
    } catch (err) {
      result.missing++;
      console.log(`[STAGE LIVE READ FAILED] ${stagedItem.title || stagedItem.pageId}: ${suggestionErrorMessage_(err)}`);
    }
  });

  return result;
}

function isAllowedNormalObservationV025_(value) {
  const v = String(value || '').trim();
  return !v || v === OCOS_AI_SUGGESTION_REVISION_GUARD_025_PREVIEW.NORMAL;
}
