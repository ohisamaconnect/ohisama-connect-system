/**
 * OC-OS INBOX AI Suggestion Revision Guard v0.2.5
 * 2026-09-29
 *
 * Purpose:
 *   SOURCE_REVISION を AI Suggestion の Preview / Stage / Commit 経路から
 *   構造的に隔離する。
 *
 * Canonical rules:
 *   1) candidate load: Observation_Type blank / NORMAL only
 *   2) stage snapshot records observationTypeAtStage
 *   3) commit reloads the live INBOX page immediately before write
 *   4) live SOURCE_REVISION or unexpected Observation_Type => READ ONLY SKIP
 *   5) Decision / Event / Status are never changed here
 *   6) SOURCES / EVENTS are never created here
 *   7) Gemini is never called during commit
 *
 * Dependencies in the same Apps Script project:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *   oc_os_inbox_suggestion_revision_guard_v0.1.1.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 *   oc_os_inbox_ai_suggestion_v0.2.1.gs
 *   oc_os_inbox_ai_suggestion_guardrails_v0.2.3.gs
 *   oc_os_inbox_ai_suggestion_staged_commit_v0.2.4.gs
 */

const OCOS_AI_SUGGESTION_025 = Object.freeze({
  VERSION: '0.2.5',
  CLASSIFIER_VERSION: '0.2.3',
  NORMAL: 'NORMAL',
  REVISION: 'SOURCE_REVISION',
  STAGE_META_KEY: 'OCOS_AI_SUGGESTION_STAGE_025_META',
  STAGE_CHUNK_PREFIX: 'OCOS_AI_SUGGESTION_STAGE_025_CHUNK_',
  CHUNK_SIZE: 7000,
  WRITE_INTERVAL_MS: 320
});

// ============================================================
// Public entry points
// ============================================================

/**
 * READ ONLY / GEMINI NONE.
 * v0.2.5 candidate loader が CURRENT / BACKFILL とも
 * blank / NORMAL のみを通すことを確認する。
 */
function previewInboxAiSuggestionProductionGateV025() {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();

  const currentAudit = aiSuggestionAuditCurrentCandidatesV025_(events);
  const backfillAudit = aiSuggestionAuditBackfillCandidatesV025_(events);

  console.log('========================================');
  console.log('OC-OS INBOX AI SUGGESTION v0.2.5 PRODUCTION GATE');
  console.log('WRITE = NONE');
  console.log('GEMINI_CALL = NONE');
  console.log('========================================');
  console.log('CURRENT');
  console.log(`CURRENT_LEGACY_AI_CANDIDATES = ${currentAudit.legacyCandidates}`);
  console.log(`CURRENT_GUARDED_CANDIDATES = ${currentAudit.guardedCandidates}`);
  console.log(`CURRENT_SOURCE_REVISION_EXCLUDED = ${currentAudit.revisionExcluded}`);
  console.log(`CURRENT_UNEXPECTED_OBSERVATION_EXCLUDED = ${currentAudit.unexpectedExcluded}`);
  console.log('----------------------------------------');
  console.log('BACKFILL');
  console.log(`BACKFILL_LEGACY_AI_CANDIDATES = ${backfillAudit.legacyCandidates}`);
  console.log(`BACKFILL_GUARDED_CANDIDATES = ${backfillAudit.guardedCandidates}`);
  console.log(`BACKFILL_SOURCE_REVISION_EXCLUDED = ${backfillAudit.revisionExcluded}`);
  console.log(`BACKFILL_UNEXPECTED_OBSERVATION_EXCLUDED = ${backfillAudit.unexpectedExcluded}`);
  console.log('----------------------------------------');
  console.log('STAGE_POLICY = blank / NORMAL only');
  console.log('COMMIT_POLICY = live blank / NORMAL only');
  console.log('SOURCE_REVISION / unexpected = READ ONLY SKIP');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('RESULT = SAFE PREVIEW');
  console.log('========================================');
}

function previewAndStageInboxAiSuggestionCurrentV025() {
  aiSuggestionPreviewAndStageV025_('CURRENT_AI_FALLBACK');
}

function previewAndStageInboxAiSuggestionBackfillV025() {
  aiSuggestionPreviewAndStageV025_('BACKFILL_AI_REVIEW');
}

function commitInboxAiSuggestionCurrentStageV025() {
  aiSuggestionCommitStageV025_('CURRENT_AI_FALLBACK');
}

function commitInboxAiSuggestionBackfillStageV025() {
  aiSuggestionCommitStageV025_('BACKFILL_AI_REVIEW');
}

function inspectInboxAiSuggestionStageV025() {
  const stage = aiSuggestionLoadStageV025_();
  console.log('========================================');
  console.log('OC-OS INBOX AI SUGGESTION STAGE v0.2.5');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`mode=${stage.meta.mode}`);
  console.log(`classifier_version=${stage.meta.classifierVersion}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

function clearInboxAiSuggestionStageV025() {
  aiSuggestionClearStageV025_();
  console.log('AI Suggestion v0.2.5 stage cleared.');
}

// ============================================================
// Candidate guards
// ============================================================

function aiSuggestionLoadGuardedCandidatesV025_(mode, events) {
  if (mode === 'BACKFILL_AI_REVIEW') {
    return aiSuggestionLoadGuardedBackfillCandidatesV025_(events);
  }
  if (mode === 'CURRENT_AI_FALLBACK') {
    return aiSuggestionLoadGuardedCurrentCandidatesV025_(events);
  }
  throw new Error(`Unsupported v0.2.5 mode: ${mode}`);
}

function aiSuggestionLoadGuardedCurrentCandidatesV025_(events) {
  // v0.2.0 current loader already starts from v0.1.1's query/runtime
  // SOURCE_REVISION guard. Apply a final v0.2.5 parser guard as well.
  const pages = aiSuggestionLoadCurrentCandidatesV020_(events);
  return pages.filter(page => {
    const item = suggestionParseInboxPageV011_(page);
    return aiSuggestionAllowedObservationV025_(item.observationType);
  });
}

function aiSuggestionLoadGuardedBackfillCandidatesV025_(events) {
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  return pages.filter(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (!aiSuggestionAllowedObservationV025_(item.observationType)) return false;
    if (item.decision && item.decision !== '未判断') return false;
    if (item.suggestedDecision && item.suggestedDecision !== '未提案') return false;

    const triage = suggestionClassifyParentBackfillV012_(item, events);
    return triage.kind === 'AI_REVIEW';
  });
}

function aiSuggestionAuditCurrentCandidatesV025_(events) {
  const legacyPages = aiSuggestionLoadCurrentCandidatesV020_(events);
  let guardedCandidates = 0;
  let revisionExcluded = 0;
  let unexpectedExcluded = 0;

  legacyPages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    const cls = aiSuggestionObservationClassV025_(item.observationType);
    if (cls === 'ALLOWED') guardedCandidates++;
    else if (cls === 'REVISION') revisionExcluded++;
    else unexpectedExcluded++;
  });

  // Query-level revision rows are not present in legacyPages, so include them
  // explicitly for observability.
  const revisionPages = suggestionLoadRevisionExposureV011_({ backfill: false });
  revisionExcluded += revisionPages.length;

  return {
    legacyCandidates: legacyPages.length,
    guardedCandidates,
    revisionExcluded,
    unexpectedExcluded
  };
}

function aiSuggestionAuditBackfillCandidatesV025_(events) {
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  let legacyCandidates = 0;
  let guardedCandidates = 0;
  let revisionExcluded = 0;
  let unexpectedExcluded = 0;

  pages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (item.decision && item.decision !== '未判断') return;
    if (item.suggestedDecision && item.suggestedDecision !== '未提案') return;

    const triage = suggestionClassifyParentBackfillV012_(item, events);
    if (triage.kind !== 'AI_REVIEW') return;
    legacyCandidates++;

    const cls = aiSuggestionObservationClassV025_(item.observationType);
    if (cls === 'ALLOWED') guardedCandidates++;
    else if (cls === 'REVISION') revisionExcluded++;
    else unexpectedExcluded++;
  });

  return {
    legacyCandidates,
    guardedCandidates,
    revisionExcluded,
    unexpectedExcluded
  };
}

function aiSuggestionObservationClassV025_(value) {
  const v = String(value || '').trim();
  if (!v || v === OCOS_AI_SUGGESTION_025.NORMAL) return 'ALLOWED';
  if (v === OCOS_AI_SUGGESTION_025.REVISION) return 'REVISION';
  return 'UNEXPECTED';
}

function aiSuggestionAllowedObservationV025_(value) {
  return aiSuggestionObservationClassV025_(value) === 'ALLOWED';
}

// ============================================================
// Preview + Stage
// ============================================================

function aiSuggestionPreviewAndStageV025_(mode) {
  suggestionValidateConfig_();
  const geminiKey = aiSuggestionGeminiKeyV020_();
  const events = suggestionLoadEvents_();
  const pages = aiSuggestionLoadGuardedCandidatesV025_(mode, events);

  const staged = [];
  let proposed = 0;
  let failed = 0;
  let corrected = 0;

  console.log('========================================');
  console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_025.VERSION}`);
  console.log(`CLASSIFIER = v${OCOS_AI_SUGGESTION_025.CLASSIFIER_VERSION}`);
  console.log('NOTION_WRITE = NONE');
  console.log('STAGE_WRITE = SCRIPT_PROPERTIES_ONLY');
  console.log(`MODE = ${mode}`);
  console.log(`EVENTS = ${events.length}`);
  console.log(`GUARDED_CANDIDATES = ${pages.length}`);
  console.log('Observation_Type = blank / NORMAL only');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');

  for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_021.BATCH_SIZE) {
    const batchPages = pages.slice(i, i + OCOS_AI_SUGGESTION_021.BATCH_SIZE);
    const items = batchPages.map(page => suggestionParseInboxPageV011_(page));

    // Final pre-Gemini guard on the exact snapshot sent to the model.
    const unsafe = items.filter(item => !aiSuggestionAllowedObservationV025_(item.observationType));
    if (unsafe.length) {
      failed += unsafe.length;
      unsafe.forEach(item => {
        console.error(`[OBSERVATION BLOCKED BEFORE GEMINI] ${item.title} | ${item.observationType || '(blank)'}`);
      });
      continue;
    }

    let rawProposals;
    try {
      rawProposals = aiSuggestionAskWithFallbackV021_(geminiKey, mode, items, events);
    } catch (err) {
      failed += items.length;
      console.error(`[AI BATCH FAILED] offset=${i}: ${suggestionErrorMessage_(err)}`);
      continue;
    }

    const byKey = new Map(rawProposals.map(p => [p.itemKey, p]));

    for (const item of items) {
      const raw = byKey.get(item.pageId);
      if (!raw) {
        failed++;
        console.error(`[AI MISSING] ${item.title}`);
        continue;
      }

      try {
        const validated = aiSuggestionValidateProposalV020_(raw, item, events);
        const normalized = aiSuggestionNormalizeProposalV023_(validated, item, events);
        if (normalized.guardrailApplied) corrected++;

        const proposal = aiSuggestionRetagProposalV024_(normalized.proposal);
        proposed++;

        console.log(`${proposed}. ${proposal.suggestedDecision} | ${item.title}`);
        console.log(`   observationType=${item.observationType || '(blank=NORMAL)'}`);
        console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
        console.log(`   reason=${proposal.reason}`);
        if (normalized.guardrailApplied) {
          console.log(`   guardrail=${normalized.guardrailName}`);
        }

        staged.push({
          pageId: item.pageId,
          title: item.title,
          observationTypeAtStage: String(item.observationType || ''),
          proposal: {
            suggestedDecision: proposal.suggestedDecision,
            confidence: proposal.confidence,
            reason: proposal.reason,
            eventId: proposal.eventId || '',
            eventTitle: proposal.eventTitle || ''
          },
          guardrail: normalized.guardrailName || ''
        });
      } catch (err) {
        failed++;
        console.error(`[AI INVALID] ${item.title}: ${suggestionErrorMessage_(err)}`);
      }
    }
  }

  if (failed > 0 || staged.length !== pages.length) {
    console.log('========================================');
    console.log(`STAGE NOT SAVED: proposed=${proposed}, failed=${failed}, expected=${pages.length}`);
    console.log('Reason: incomplete/unsafe preview must never become a commit snapshot.');
    console.log('========================================');
    return;
  }

  const meta = aiSuggestionSaveStageV025_(mode, staged);

  console.log('========================================');
  console.log(`DONE proposed=${proposed}, failed=${failed}, guardrail_corrected=${corrected}`);
  console.log(`STAGED = ${staged.length}`);
  console.log(`STAGE_ID = ${meta.stageId}`);
  console.log(`STAGE_SHA256 = ${meta.sha256}`);
  console.log('NOTION_WRITE = NONE');
  console.log('Observation_Type captured in exact stage snapshot.');
  console.log('Review this exact preview before commit.');
  console.log('========================================');
}

// ============================================================
// Commit exact Stage with LIVE Observation_Type guard
// ============================================================

function aiSuggestionCommitStageV025_(expectedMode) {
  suggestionValidateConfig_();
  const stage = aiSuggestionLoadStageV025_();

  if (stage.meta.mode !== expectedMode) {
    throw new Error(`Stage mode mismatch: ${stage.meta.mode}`);
  }

  const currentHash = aiSuggestionSha256V024_(JSON.stringify(stage.items));
  if (currentHash !== stage.meta.sha256) {
    throw new Error('Stage SHA256 mismatch. Commit aborted.');
  }

  const events = suggestionLoadEvents_();
  const eventIds = new Set(events.map(e => e.id));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; v0.2.5 staged commit skipped.');
    return;
  }

  let written = 0;
  let skippedHuman = 0;
  let skippedAlreadySuggested = 0;
  let skippedRevision = 0;
  let skippedUnexpectedObservation = 0;
  let failed = 0;

  try {
    console.log('========================================');
    console.log('OC-OS INBOX AI SUGGESTION STAGED COMMIT v0.2.5');
    console.log(`STAGE_ID = ${stage.meta.stageId}`);
    console.log(`STAGE_SHA256 = ${stage.meta.sha256}`);
    console.log(`ITEMS = ${stage.items.length}`);
    console.log('GEMINI_CALL = NONE');
    console.log('WRITE = SUGGESTED_* ONLY');
    console.log('LIVE Observation_Type guard = ON');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (const stagedItem of stage.items) {
      try {
        // Stage snapshot itself must have been NORMAL/blank.
        const stageClass = aiSuggestionObservationClassV025_(stagedItem.observationTypeAtStage);
        if (stageClass === 'REVISION') {
          skippedRevision++;
          console.log(`[SKIP STAGE REVISION] ${stagedItem.title}`);
          continue;
        }
        if (stageClass !== 'ALLOWED') {
          skippedUnexpectedObservation++;
          console.log(`[SKIP STAGE UNEXPECTED OBSERVATION] ${stagedItem.title}`);
          continue;
        }

        // Live reload immediately before any Suggested_* PATCH.
        const page = suggestionNotionRequest_(`/v1/pages/${stagedItem.pageId}`, 'get');
        const current = suggestionParseInboxPageV011_(page);
        const liveClass = aiSuggestionObservationClassV025_(current.observationType);

        if (liveClass === 'REVISION') {
          skippedRevision++;
          console.log(`[SKIP LIVE SOURCE_REVISION] ${stagedItem.title}`);
          continue;
        }
        if (liveClass !== 'ALLOWED') {
          skippedUnexpectedObservation++;
          console.log(`[SKIP LIVE UNEXPECTED OBSERVATION] ${stagedItem.title} | ${current.observationType}`);
          continue;
        }

        if (current.decision && current.decision !== '未判断') {
          skippedHuman++;
          console.log(`[SKIP HUMAN DECISION] ${stagedItem.title}`);
          continue;
        }
        if (current.suggestedDecision && current.suggestedDecision !== '未提案') {
          skippedAlreadySuggested++;
          console.log(`[SKIP ALREADY SUGGESTED] ${stagedItem.title}`);
          continue;
        }

        const proposal = stagedItem.proposal || {};
        if (proposal.eventId && !eventIds.has(proposal.eventId)) {
          failed++;
          console.error(`[EVENT MISSING] ${stagedItem.title}: ${proposal.eventId}`);
          continue;
        }

        suggestionPatchProposal_(stagedItem.pageId, proposal);
        written++;
        console.log(`[OK] ${proposal.suggestedDecision} | ${stagedItem.title}`);
        Utilities.sleep(OCOS_AI_SUGGESTION_025.WRITE_INTERVAL_MS);
      } catch (err) {
        failed++;
        console.error(`[COMMIT FAILED] ${stagedItem.title}: ${suggestionErrorMessage_(err)}`);
      }
    }

    const props = PropertiesService.getScriptProperties();
    const committedMeta = Object.assign({}, stage.meta, {
      committedAt: new Date().toISOString(),
      commitWritten: written,
      commitSkippedHuman: skippedHuman,
      commitSkippedAlreadySuggested: skippedAlreadySuggested,
      commitSkippedRevision: skippedRevision,
      commitSkippedUnexpectedObservation: skippedUnexpectedObservation,
      commitFailed: failed
    });
    props.setProperty(OCOS_AI_SUGGESTION_025.STAGE_META_KEY, JSON.stringify(committedMeta));

    console.log('========================================');
    console.log(
      `DONE written=${written}, skippedHuman=${skippedHuman}, ` +
      `skippedAlreadySuggested=${skippedAlreadySuggested}, skippedRevision=${skippedRevision}, ` +
      `skippedUnexpectedObservation=${skippedUnexpectedObservation}, failed=${failed}`
    );
    console.log('GEMINI_CALL = NONE');
    console.log('SOURCE_REVISION = READ ONLY SKIP');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Stage persistence v0.2.5
// ============================================================

function aiSuggestionSaveStageV025_(mode, items) {
  aiSuggestionClearStageV025_();

  const json = JSON.stringify(items);
  const chunks = [];
  for (let i = 0; i < json.length; i += OCOS_AI_SUGGESTION_025.CHUNK_SIZE) {
    chunks.push(json.slice(i, i + OCOS_AI_SUGGESTION_025.CHUNK_SIZE));
  }

  const stageId = Utilities.formatDate(
    new Date(),
    'Asia/Tokyo',
    'yyyyMMdd_HHmmss'
  ) + '_' + Utilities.getUuid().slice(0, 8);

  const meta = {
    version: OCOS_AI_SUGGESTION_025.VERSION,
    classifierVersion: OCOS_AI_SUGGESTION_025.CLASSIFIER_VERSION,
    stageId,
    mode,
    createdAt: new Date().toISOString(),
    count: items.length,
    chunks: chunks.length,
    sha256: aiSuggestionSha256V024_(json),
    committedAt: ''
  };

  const props = PropertiesService.getScriptProperties();
  chunks.forEach((chunk, index) => {
    props.setProperty(
      `${OCOS_AI_SUGGESTION_025.STAGE_CHUNK_PREFIX}${index}`,
      chunk
    );
  });
  props.setProperty(OCOS_AI_SUGGESTION_025.STAGE_META_KEY, JSON.stringify(meta));
  return meta;
}

function aiSuggestionLoadStageV025_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(OCOS_AI_SUGGESTION_025.STAGE_META_KEY);
  if (!metaRaw) throw new Error('No AI Suggestion v0.2.5 stage exists.');

  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const value = props.getProperty(`${OCOS_AI_SUGGESTION_025.STAGE_CHUNK_PREFIX}${i}`);
    if (value === null) throw new Error(`Missing v0.2.5 stage chunk: ${i}`);
    parts.push(value);
  }

  const json = parts.join('');
  const items = JSON.parse(json);
  const hash = aiSuggestionSha256V024_(json);
  if (hash !== meta.sha256) throw new Error('v0.2.5 Stage SHA256 mismatch.');
  if (!Array.isArray(items) || items.length !== Number(meta.count)) {
    throw new Error('v0.2.5 Stage item count mismatch.');
  }

  return { meta, items };
}

function aiSuggestionClearStageV025_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (
      key === OCOS_AI_SUGGESTION_025.STAGE_META_KEY ||
      key.indexOf(OCOS_AI_SUGGESTION_025.STAGE_CHUNK_PREFIX) === 0
    ) {
      props.deleteProperty(key);
    }
  });
}
