/**
 * OC-OS INBOX Deterministic Suggestion Backfill Staged Commit v0.3.1
 * 2026-09-28
 *
 * Patch over v0.3.0:
 * - Prevent false Existing EVENT relations for standalone TV/radio/stream appearances.
 * - Existing relation is allowed only when date + program identity match a Current EVENT.
 * - Otherwise standalone media appearance is proposed as NEW EVENT.
 * - Photo-book follow-up announcements are related to the existing photo-book EVENT.
 * - Uses its own staged snapshot keys; v0.3.0 stage must not be committed.
 *
 * Dependencies:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 *   oc_os_inbox_ai_suggestion_v0.2.1.gs
 *   oc_os_inbox_ai_suggestion_guardrails_v0.2.3.gs
 *   oc_os_inbox_deterministic_backfill_staged_commit_v0.3.0.gs
 */

const OCOS_DETERMINISTIC_BACKFILL_031 = Object.freeze({
  VERSION: '0.3.1',
  STAGE_META_KEY: 'OCOS_DETERMINISTIC_BACKFILL_STAGE_031_META',
  STAGE_CHUNK_PREFIX: 'OCOS_DETERMINISTIC_BACKFILL_STAGE_031_CHUNK_',
  CHUNK_SIZE: 7000,
  WRITE_INTERVAL_MS: 320
});

function previewAndStageInboxDeterministicBackfillV031() {
  deterministicBackfillPreviewAndStageV031_();
}

function commitInboxDeterministicBackfillStageV031() {
  deterministicBackfillCommitStageV031_();
}

function inspectInboxDeterministicBackfillStageV031() {
  const stage = deterministicBackfillLoadStageV031_();
  console.log('========================================');
  console.log('OC-OS INBOX DETERMINISTIC BACKFILL STAGE v0.3.1');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

function clearInboxDeterministicBackfillStageV031() {
  deterministicBackfillClearStageV031_();
  console.log('Deterministic Backfill v0.3.1 stage cleared.');
}

function deterministicBackfillPreviewAndStageV031_() {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const grouped = deterministicBackfillGroupByJudgmentKeyV030_(rawPages);

  const candidates = [];
  let alreadySuggestedUrls = 0;
  grouped.forEach(group => {
    const parsed = group.pages.map(page => ({ page, item: suggestionParseInboxPage_(page) }));
    const hasSuggestion = parsed.some(x => x.item.suggestedDecision && x.item.suggestedDecision !== '未提案');
    if (hasSuggestion) {
      alreadySuggestedUrls++;
      return;
    }
    const representative = parsed[0];
    candidates.push({
      key: group.key,
      duplicateCount: parsed.length,
      page: representative.page,
      item: representative.item
    });
  });

  console.log('========================================');
  console.log(`OC-OS INBOX DETERMINISTIC BACKFILL v${OCOS_DETERMINISTIC_BACKFILL_031.VERSION}`);
  console.log('CLASSIFIER = RULE011 + GUARD023 + reviewed overrides + MEDIA_RELATION_SAFETY031');
  console.log('GEMINI_CALL = NONE');
  console.log('NOTION_WRITE = NONE');
  console.log('STAGE_WRITE = SCRIPT_PROPERTIES_ONLY');
  console.log('MODE = BACKFILL_OFFICIAL_NEWS_REMAINDER');
  console.log(`EVENTS = ${events.length}`);
  console.log(`RAW_INBOX = ${rawPages.length}`);
  console.log(`UNIQUE_URLS = ${grouped.length}`);
  console.log(`ALREADY_SUGGESTED_URLS = ${alreadySuggestedUrls}`);
  console.log(`CANDIDATES = ${candidates.length}`);
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');

  const staged = [];
  const counts = {};
  let failed = 0;
  let guardrailCorrected = 0;
  let overrideCorrected = 0;
  let mediaSafetyCorrected = 0;

  candidates.forEach((entry, index) => {
    const item = entry.item;
    try {
      const base = suggestionBuildProposalV011_(item, events);
      const guarded = aiSuggestionNormalizeProposalV023_(base, item, events);
      if (guarded.guardrailApplied) guardrailCorrected++;

      const adjusted030 = deterministicBackfillApplyOverridesV030_(guarded.proposal, item, events);
      if (adjusted030.overrideApplied) overrideCorrected++;

      const adjusted031 = deterministicBackfillApplySafetyV031_(
        adjusted030.proposal,
        item,
        events,
        adjusted030.overrideApplied
      );
      if (adjusted031.corrected) mediaSafetyCorrected++;

      const proposal = deterministicBackfillRetagRuleV031_(adjusted031.proposal);
      counts[proposal.suggestedDecision] = (counts[proposal.suggestedDecision] || 0) + 1;

      console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
      console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
      console.log(`   reason=${proposal.reason}`);
      if (guarded.guardrailApplied) console.log(`   guardrail=${guarded.guardrailName}`);
      if (adjusted030.overrideApplied) console.log(`   override=${adjusted030.overrideName}`);
      if (adjusted031.corrected) console.log(`   safety=${adjusted031.name}`);
      if (entry.duplicateCount > 1) console.log(`   duplicate_rows=${entry.duplicateCount}`);

      staged.push({
        pageId: item.pageId,
        judgmentKey: entry.key,
        duplicateCount: entry.duplicateCount,
        title: item.title,
        proposal: {
          suggestedDecision: proposal.suggestedDecision,
          confidence: proposal.confidence,
          reason: proposal.reason,
          eventId: proposal.eventId || '',
          eventTitle: proposal.eventTitle || ''
        },
        guardrail: guarded.guardrailName || '',
        override: adjusted030.overrideName || '',
        safety: adjusted031.name || ''
      });
    } catch (err) {
      failed++;
      console.error(`[FAILED] ${item.title}: ${suggestionErrorMessage_(err)}`);
    }
  });

  if (failed > 0 || staged.length !== candidates.length) {
    console.log('========================================');
    console.log(`STAGE NOT SAVED: staged=${staged.length}, failed=${failed}, expected=${candidates.length}`);
    console.log('Incomplete preview must never become a commit snapshot.');
    console.log('========================================');
    return;
  }

  const meta = deterministicBackfillSaveStageV031_(staged, {
    rawInbox: rawPages.length,
    uniqueUrls: grouped.length,
    alreadySuggestedUrls,
    guardrailCorrected,
    overrideCorrected,
    mediaSafetyCorrected,
    counts
  });

  console.log('========================================');
  console.log(`COUNTS = ${JSON.stringify(counts)}`);
  console.log(`GUARDRAIL_CORRECTED = ${guardrailCorrected}`);
  console.log(`OVERRIDE_CORRECTED = ${overrideCorrected}`);
  console.log(`MEDIA_SAFETY_CORRECTED = ${mediaSafetyCorrected}`);
  console.log(`STAGED = ${staged.length}`);
  console.log(`STAGE_ID = ${meta.stageId}`);
  console.log(`STAGE_SHA256 = ${meta.sha256}`);
  console.log('GEMINI_CALL = NONE');
  console.log('NOTION_WRITE = NONE');
  console.log('Review this exact preview before commit.');
  console.log('========================================');
}

function deterministicBackfillApplySafetyV031_(proposal, item, events, priorOverrideApplied) {
  const title = String(item.title || '');

  // Explicit reviewed v0.3.0 overrides take precedence.
  if (priorOverrideApplied) {
    return { proposal, corrected: false, name: '' };
  }

  // Follow-up facts about the known photobook belong to the existing photobook EVENT.
  if (/金村美玖.*2nd写真集/.test(title)) {
    const photoEvent = aiSuggestionFindEventByTokensV023_(events, ['金村美玖', '写真集']);
    if (photoEvent) {
      return deterministicBackfillSafetyResultV031_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE031-SAFETY: 写真集のタイトル・表紙・特典等は既存EVENT「${photoEvent.title}」へ集約候補。`,
          photoEvent
        ),
        'PHOTOBOOK_FOLLOWUP_TO_EXISTING'
      );
    }
  }

  // Standalone media appearance must never attach to another occurrence merely
  // because the member name or generic words overlap.
  if (deterministicBackfillIsStandaloneMediaAppearanceV031_(title)) {
    const exactEvent = deterministicBackfillFindExactMediaOccurrenceV031_(title, events);
    if (exactEvent) {
      return deterministicBackfillSafetyResultV031_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE031-SAFETY: 単発メディア出演。日付＋番組名が一致する既存EVENT「${exactEvent.title}」へ追加候補。`,
          exactEvent
        ),
        'MEDIA_EXACT_EXISTING'
      );
    }

    return deterministicBackfillSafetyResultV031_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'RULE031-SAFETY: 単発メディア出演は独立EVENT。出演者名だけが一致する別日・別番組EVENTには結び付けない。',
        null
      ),
      'MEDIA_STANDALONE_NEW'
    );
  }

  return { proposal, corrected: false, name: '' };
}

function deterministicBackfillIsStandaloneMediaAppearanceV031_(title) {
  const t = String(title || '');
  if (!/出演/.test(t)) return false;
  if (/レギュラー出演/.test(t)) return false;
  if (/TVCM|WEB\s*CM/i.test(t)) return false;
  return /(?:ABEMA|TBS|NHK|テレビ東京|テレビ朝日|朝日放送|フジテレビ|日本テレビ|MBS|MRT|TOKYO\s*FM|J-WAVE|文化放送|ラジオ|YouTube)/i.test(t);
}

function deterministicBackfillFindExactMediaOccurrenceV031_(title, events) {
  const dateMatch = String(title || '').match(/(\d{1,2}月\d{1,2}日)/);
  const dateToken = dateMatch ? aiSuggestionNormalizeTextV023_(dateMatch[1]) : '';
  const quoted = deterministicBackfillQuotedTermsV031_(title)
    .map(aiSuggestionNormalizeTextV023_)
    .filter(x => x.length >= 4);

  if (!dateToken || quoted.length === 0) return null;

  return (events || []).find(e => {
    const n = aiSuggestionNormalizeTextV023_(e.title || '');
    if (n.indexOf(dateToken) < 0) return false;
    return quoted.some(q => n.indexOf(q) >= 0);
  }) || null;
}

function deterministicBackfillQuotedTermsV031_(text) {
  const out = [];
  const patterns = [/「([^」]+)」/g, /『([^』]+)』/g];
  patterns.forEach(re => {
    let m;
    while ((m = re.exec(String(text || ''))) !== null) out.push(m[1]);
  });
  return out;
}

function deterministicBackfillSafetyResultV031_(proposal, name) {
  return { proposal, corrected: true, name };
}

function deterministicBackfillRetagRuleV031_(proposal) {
  const copy = Object.assign({}, proposal);
  copy.reason = String(copy.reason || '')
    .replace(/^RULE011:\s*/, 'RULE031: ')
    .replace(/^RULE030:\s*/, 'RULE031: ')
    .replace(/^RULE030-OVERRIDE:\s*/, 'RULE031-OVERRIDE: ');
  return copy;
}

function deterministicBackfillCommitStageV031_() {
  suggestionValidateConfig_();
  const stage = deterministicBackfillLoadStageV031_();
  const currentHash = deterministicBackfillSha256V030_(JSON.stringify(stage.items));
  if (currentHash !== stage.meta.sha256) throw new Error('Stage SHA256 mismatch. Commit aborted.');

  const events = suggestionLoadEvents_();
  const eventIds = new Set(events.map(e => e.id));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; deterministic staged commit skipped.');
    return;
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;

  try {
    console.log('========================================');
    console.log('OC-OS INBOX DETERMINISTIC BACKFILL STAGED COMMIT v0.3.1');
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
        Utilities.sleep(OCOS_DETERMINISTIC_BACKFILL_031.WRITE_INTERVAL_MS);
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
    props.setProperty(OCOS_DETERMINISTIC_BACKFILL_031.STAGE_META_KEY, JSON.stringify(committedMeta));

    console.log('========================================');
    console.log(`DONE written=${written}, skipped=${skipped}, failed=${failed}`);
    console.log('GEMINI_CALL = NONE');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function deterministicBackfillSaveStageV031_(items, audit) {
  deterministicBackfillClearStageV031_();
  const json = JSON.stringify(items);
  const chunks = [];
  for (let i = 0; i < json.length; i += OCOS_DETERMINISTIC_BACKFILL_031.CHUNK_SIZE) {
    chunks.push(json.slice(i, i + OCOS_DETERMINISTIC_BACKFILL_031.CHUNK_SIZE));
  }

  const stageId = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
  const meta = {
    version: OCOS_DETERMINISTIC_BACKFILL_031.VERSION,
    stageId,
    createdAt: new Date().toISOString(),
    count: items.length,
    chunks: chunks.length,
    sha256: deterministicBackfillSha256V030_(json),
    audit: audit || {},
    committedAt: ''
  };

  const props = PropertiesService.getScriptProperties();
  chunks.forEach((chunk, index) => props.setProperty(`${OCOS_DETERMINISTIC_BACKFILL_031.STAGE_CHUNK_PREFIX}${index}`, chunk));
  props.setProperty(OCOS_DETERMINISTIC_BACKFILL_031.STAGE_META_KEY, JSON.stringify(meta));
  return meta;
}

function deterministicBackfillLoadStageV031_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(OCOS_DETERMINISTIC_BACKFILL_031.STAGE_META_KEY);
  if (!metaRaw) throw new Error('No Deterministic Backfill v0.3.1 stage exists.');
  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const value = props.getProperty(`${OCOS_DETERMINISTIC_BACKFILL_031.STAGE_CHUNK_PREFIX}${i}`);
    if (value === null) throw new Error(`Missing stage chunk: ${i}`);
    parts.push(value);
  }
  const json = parts.join('');
  const items = JSON.parse(json);
  const hash = deterministicBackfillSha256V030_(json);
  if (hash !== meta.sha256) throw new Error('Stage SHA256 mismatch.');
  if (!Array.isArray(items) || items.length !== Number(meta.count)) throw new Error('Stage item count mismatch.');
  return { meta, items };
}

function deterministicBackfillClearStageV031_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (key === OCOS_DETERMINISTIC_BACKFILL_031.STAGE_META_KEY || key.indexOf(OCOS_DETERMINISTIC_BACKFILL_031.STAGE_CHUNK_PREFIX) === 0) {
      props.deleteProperty(key);
    }
  });
}
