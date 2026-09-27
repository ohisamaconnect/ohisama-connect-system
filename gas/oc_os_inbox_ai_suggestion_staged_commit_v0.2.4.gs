/**
 * OC-OS INBOX AI Suggestion Staged Commit v0.2.4
 * 2026-09-28
 *
 * Purpose:
 *   Preview で人間が確認した AI Suggestion と、実際に Notion へ書き込む Suggestion を完全に同一にする。
 *   Commit 時には Gemini を再呼び出ししない。
 *
 * Architecture:
 *   previewAndStage...V024()
 *     -> Gemini + v0.2.3 guardrails
 *     -> console preview
 *     -> exact proposals are staged in Script Properties only
 *     -> Notion WRITE = NONE
 *
 *   commit...V024()
 *     -> load exact staged snapshot
 *     -> re-check human Decision / existing Suggestion / Current EVENT existence
 *     -> write Suggested_* only
 *     -> Gemini is NOT called
 *
 * Principles:
 *   - Decision / Event / Status are never changed.
 *   - SOURCES / EVENTS are never created here.
 *   - Preview and Commit use the exact same staged proposals.
 *   - Human review remains between proposal generation and Notion write.
 *   - No trigger during Pilot.
 *
 * Dependencies:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 *   oc_os_inbox_ai_suggestion_v0.2.1.gs
 *   oc_os_inbox_ai_suggestion_guardrails_v0.2.3.gs
 */

const OCOS_AI_SUGGESTION_024 = Object.freeze({
  VERSION: '0.2.4',
  CLASSIFIER_VERSION: '0.2.3',
  STAGE_META_KEY: 'OCOS_AI_SUGGESTION_STAGE_024_META',
  STAGE_CHUNK_PREFIX: 'OCOS_AI_SUGGESTION_STAGE_024_CHUNK_',
  CHUNK_SIZE: 7000,
  WRITE_INTERVAL_MS: 320
});

// ============================================================
// Public entry points
// ============================================================

/**
 * Generates the Backfill AI_REVIEW proposals, prints them, and stages the
 * exact proposal snapshot in Script Properties. Notion is not modified.
 */
function previewAndStageInboxAiSuggestionBackfillV024() {
  aiSuggestionPreviewAndStageV024_('BACKFILL_AI_REVIEW');
}

/**
 * Writes the exact latest staged Backfill snapshot to Suggested_* only.
 * Gemini is NOT called here.
 */
function commitInboxAiSuggestionBackfillStageV024() {
  aiSuggestionCommitStageV024_('BACKFILL_AI_REVIEW');
}

/**
 * Shows metadata for the currently staged snapshot.
 */
function inspectInboxAiSuggestionStageV024() {
  const stage = aiSuggestionLoadStageV024_();
  console.log('========================================');
  console.log('OC-OS INBOX AI SUGGESTION STAGE v0.2.4');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`mode=${stage.meta.mode}`);
  console.log(`classifier_version=${stage.meta.classifierVersion}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

/**
 * Clears only the v0.2.4 staged snapshot from Script Properties.
 */
function clearInboxAiSuggestionStageV024() {
  aiSuggestionClearStageV024_();
  console.log('AI Suggestion v0.2.4 stage cleared.');
}

// ============================================================
// Preview + stage
// ============================================================

function aiSuggestionPreviewAndStageV024_(mode) {
  suggestionValidateConfig_();
  const geminiKey = aiSuggestionGeminiKeyV020_();
  const events = suggestionLoadEvents_();
  const pages = mode === 'BACKFILL_AI_REVIEW'
    ? aiSuggestionLoadBackfillCandidatesV020_(events)
    : aiSuggestionLoadCurrentCandidatesV020_(events);

  const staged = [];
  let proposed = 0;
  let failed = 0;
  let corrected = 0;

  console.log('========================================');
  console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_024.VERSION}`);
  console.log(`CLASSIFIER = v${OCOS_AI_SUGGESTION_024.CLASSIFIER_VERSION}`);
  console.log('NOTION_WRITE = NONE');
  console.log('STAGE_WRITE = SCRIPT_PROPERTIES_ONLY');
  console.log(`MODE = ${mode}`);
  console.log(`EVENTS = ${events.length}`);
  console.log(`CANDIDATES = ${pages.length}`);
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');

  for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_021.BATCH_SIZE) {
    const batchPages = pages.slice(i, i + OCOS_AI_SUGGESTION_021.BATCH_SIZE);
    const items = batchPages.map(page => suggestionParseInboxPage_(page));

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
        console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
        console.log(`   reason=${proposal.reason}`);
        if (normalized.guardrailApplied) {
          console.log(`   guardrail=${normalized.guardrailName}`);
        }

        staged.push({
          pageId: item.pageId,
          title: item.title,
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
    console.log('Reason: incomplete preview must never become a commit snapshot.');
    console.log('========================================');
    return;
  }

  const meta = aiSuggestionSaveStageV024_(mode, staged);

  console.log('========================================');
  console.log(`DONE proposed=${proposed}, failed=${failed}, guardrail_corrected=${corrected}`);
  console.log(`STAGED = ${staged.length}`);
  console.log(`STAGE_ID = ${meta.stageId}`);
  console.log(`STAGE_SHA256 = ${meta.sha256}`);
  console.log('NOTION_WRITE = NONE');
  console.log('Review this exact preview before commit.');
  console.log('========================================');
}

// ============================================================
// Commit exact stage
// ============================================================

function aiSuggestionCommitStageV024_(expectedMode) {
  suggestionValidateConfig_();
  const stage = aiSuggestionLoadStageV024_();

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
    console.warn('Another OC-OS job is running; staged commit skipped.');
    return;
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;

  try {
    console.log('========================================');
    console.log('OC-OS INBOX AI SUGGESTION STAGED COMMIT v0.2.4');
    console.log(`STAGE_ID = ${stage.meta.stageId}`);
    console.log(`STAGE_SHA256 = ${stage.meta.sha256}`);
    console.log(`ITEMS = ${stage.items.length}`);
    console.log('GEMINI_CALL = NONE');
    console.log('WRITE = SUGGESTED_* ONLY');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (const stagedItem of stage.items) {
      try {
        const page = suggestionNotionRequest_(`/v1/pages/${stagedItem.pageId}`, 'get');
        const current = suggestionParseInboxPage_(page);

        if (current.decision && current.decision !== '未判断') {
          skipped++;
          console.log(`[SKIP HUMAN DECISION] ${stagedItem.title}`);
          continue;
        }
        if (current.suggestedDecision && current.suggestedDecision !== '未提案') {
          skipped++;
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
        Utilities.sleep(OCOS_AI_SUGGESTION_024.WRITE_INTERVAL_MS);
      } catch (err) {
        failed++;
        console.error(`[COMMIT FAILED] ${stagedItem.title}: ${suggestionErrorMessage_(err)}`);
      }
    }

    const props = PropertiesService.getScriptProperties();
    const committedMeta = Object.assign({}, stage.meta, {
      committedAt: new Date().toISOString(),
      commitWritten: written,
      commitSkipped: skipped,
      commitFailed: failed
    });
    props.setProperty(OCOS_AI_SUGGESTION_024.STAGE_META_KEY, JSON.stringify(committedMeta));

    console.log('========================================');
    console.log(`DONE written=${written}, skipped=${skipped}, failed=${failed}`);
    console.log('GEMINI_CALL = NONE');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Stage persistence
// ============================================================

function aiSuggestionSaveStageV024_(mode, items) {
  aiSuggestionClearStageV024_();

  const json = JSON.stringify(items);
  const chunks = [];
  for (let i = 0; i < json.length; i += OCOS_AI_SUGGESTION_024.CHUNK_SIZE) {
    chunks.push(json.slice(i, i + OCOS_AI_SUGGESTION_024.CHUNK_SIZE));
  }

  const stageId = Utilities.formatDate(
    new Date(),
    'Asia/Tokyo',
    'yyyyMMdd_HHmmss'
  ) + '_' + Utilities.getUuid().slice(0, 8);

  const meta = {
    version: OCOS_AI_SUGGESTION_024.VERSION,
    classifierVersion: OCOS_AI_SUGGESTION_024.CLASSIFIER_VERSION,
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
      `${OCOS_AI_SUGGESTION_024.STAGE_CHUNK_PREFIX}${index}`,
      chunk
    );
  });
  props.setProperty(OCOS_AI_SUGGESTION_024.STAGE_META_KEY, JSON.stringify(meta));
  return meta;
}

function aiSuggestionLoadStageV024_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(OCOS_AI_SUGGESTION_024.STAGE_META_KEY);
  if (!metaRaw) throw new Error('No AI Suggestion v0.2.4 stage exists.');

  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const value = props.getProperty(`${OCOS_AI_SUGGESTION_024.STAGE_CHUNK_PREFIX}${i}`);
    if (value === null) throw new Error(`Missing stage chunk: ${i}`);
    parts.push(value);
  }

  const json = parts.join('');
  const items = JSON.parse(json);
  const hash = aiSuggestionSha256V024_(json);
  if (hash !== meta.sha256) throw new Error('Stage SHA256 mismatch.');
  if (!Array.isArray(items) || items.length !== Number(meta.count)) {
    throw new Error('Stage item count mismatch.');
  }

  return { meta, items };
}

function aiSuggestionClearStageV024_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (
      key === OCOS_AI_SUGGESTION_024.STAGE_META_KEY ||
      key.indexOf(OCOS_AI_SUGGESTION_024.STAGE_CHUNK_PREFIX) === 0
    ) {
      props.deleteProperty(key);
    }
  });
}

// ============================================================
// Audit helpers
// ============================================================

function aiSuggestionRetagProposalV024_(proposal) {
  const copy = Object.assign({}, proposal);
  if (/^AI020:\s*/.test(copy.reason || '')) {
    copy.reason = String(copy.reason).replace(/^AI020:\s*/, 'AI023: ');
  }
  return copy;
}

function aiSuggestionSha256V024_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
