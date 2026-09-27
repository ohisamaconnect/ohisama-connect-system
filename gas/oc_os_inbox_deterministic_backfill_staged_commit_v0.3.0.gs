/**
 * OC-OS INBOX Deterministic Suggestion Backfill Staged Commit v0.3.0
 * 2026-09-28
 *
 * Purpose:
 *   AI_REVIEW 41 unique URLs are already handled by v0.2.4.
 *   This module handles the remaining official NEWS backfill URLs with:
 *     v0.1.1 normal rules
 *       -> v0.2.3 structural guardrails
 *       -> small set of explicitly reviewed OC-OS overrides
 *       -> exact staged snapshot
 *       -> human review
 *       -> commit exact snapshot to Suggested_* only
 *
 * Important:
 *   - NO Gemini call.
 *   - Decision / Event / Status are never changed.
 *   - SOURCES / EVENTS are never created here.
 *   - Same URL is treated as one judgment unit.
 *   - If ANY duplicate row for a URL already has Suggested_Decision, that URL is skipped.
 *   - Commit writes only the representative row for each remaining unique URL.
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

const OCOS_DETERMINISTIC_BACKFILL_030 = Object.freeze({
  VERSION: '0.3.0',
  STAGE_META_KEY: 'OCOS_DETERMINISTIC_BACKFILL_STAGE_030_META',
  STAGE_CHUNK_PREFIX: 'OCOS_DETERMINISTIC_BACKFILL_STAGE_030_CHUNK_',
  CHUNK_SIZE: 7000,
  WRITE_INTERVAL_MS: 320
});

// ============================================================
// Public entry points
// ============================================================

function previewAndStageInboxDeterministicBackfillV030() {
  deterministicBackfillPreviewAndStageV030_();
}

function commitInboxDeterministicBackfillStageV030() {
  deterministicBackfillCommitStageV030_();
}

function inspectInboxDeterministicBackfillStageV030() {
  const stage = deterministicBackfillLoadStageV030_();
  console.log('========================================');
  console.log('OC-OS INBOX DETERMINISTIC BACKFILL STAGE v0.3.0');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

function clearInboxDeterministicBackfillStageV030() {
  deterministicBackfillClearStageV030_();
  console.log('Deterministic Backfill v0.3.0 stage cleared.');
}

// ============================================================
// Preview + stage
// ============================================================

function deterministicBackfillPreviewAndStageV030_() {
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

    // representative = first row in Published_At ordered source query.
    const representative = parsed[0];
    candidates.push({
      key: group.key,
      duplicateCount: parsed.length,
      page: representative.page,
      item: representative.item
    });
  });

  console.log('========================================');
  console.log(`OC-OS INBOX DETERMINISTIC BACKFILL v${OCOS_DETERMINISTIC_BACKFILL_030.VERSION}`);
  console.log('CLASSIFIER = RULE011 + GUARD023 + reviewed overrides');
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

  candidates.forEach((entry, index) => {
    const item = entry.item;
    try {
      const base = suggestionBuildProposalV011_(item, events);
      const guarded = aiSuggestionNormalizeProposalV023_(base, item, events);
      if (guarded.guardrailApplied) guardrailCorrected++;

      const adjusted = deterministicBackfillApplyOverridesV030_(guarded.proposal, item, events);
      if (adjusted.overrideApplied) overrideCorrected++;

      const proposal = deterministicBackfillRetagRuleV030_(adjusted.proposal);
      counts[proposal.suggestedDecision] = (counts[proposal.suggestedDecision] || 0) + 1;

      console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
      console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
      console.log(`   reason=${proposal.reason}`);
      if (guarded.guardrailApplied) console.log(`   guardrail=${guarded.guardrailName}`);
      if (adjusted.overrideApplied) console.log(`   override=${adjusted.overrideName}`);
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
        override: adjusted.overrideName || ''
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

  const meta = deterministicBackfillSaveStageV030_(staged, {
    rawInbox: rawPages.length,
    uniqueUrls: grouped.length,
    alreadySuggestedUrls,
    guardrailCorrected,
    overrideCorrected,
    counts
  });

  console.log('========================================');
  console.log(`COUNTS = ${JSON.stringify(counts)}`);
  console.log(`GUARDRAIL_CORRECTED = ${guardrailCorrected}`);
  console.log(`OVERRIDE_CORRECTED = ${overrideCorrected}`);
  console.log(`STAGED = ${staged.length}`);
  console.log(`STAGE_ID = ${meta.stageId}`);
  console.log(`STAGE_SHA256 = ${meta.sha256}`);
  console.log('GEMINI_CALL = NONE');
  console.log('NOTION_WRITE = NONE');
  console.log('Review this exact preview before commit.');
  console.log('========================================');
}

// ============================================================
// Grouping / dedupe
// ============================================================

function deterministicBackfillGroupByJudgmentKeyV030_(pages) {
  const map = new Map();
  (pages || []).forEach(page => {
    const item = suggestionParseInboxPage_(page);
    const key = item.url
      ? `URL:${String(item.url).trim()}`
      : `TITLE:${String(item.title || '').trim()}|DATE:${String(item.publishedAt || '')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(page);
  });
  return Array.from(map.entries()).map(([key, groupPages]) => ({ key, pages: groupPages }));
}

// ============================================================
// Explicit reviewed overrides
// ============================================================

function deterministicBackfillApplyOverridesV030_(proposal, item, events) {
  const title = String(item.title || '');

  // Reviewed: BEAMS collaboration belongs under Hinata Fes 2026 as the broad parent.
  if (/日向坂46\s*meets\s*BEAMS/i.test(title) && /コラボレーションアイテム|コラボ/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['ひなたフェス2026']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '中',
          `RULE030-OVERRIDE: 「日向坂46 meets BEAMS」は初期Backfillでは「${event.title}」の関連施策として集約候補。`,
          event
        ),
        'BEAMS_TO_HINATA_FES'
      );
    }
  }

  // Reviewed: Yamaguchi graduation campaign belongs to the graduation concept, not a new parent.
  if (/山口陽世.*卒業キャンペーン/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['山口陽世', '卒業発表']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE030-OVERRIDE: 卒業キャンペーンは新しい親EVENTを作らず「${event.title}」へ集約候補。`,
          event
        ),
        'YAMAGUCHI_GRAD_CAMPAIGN'
      );
    }
  }

  // Reviewed: HinaAi goods lottery was operationally tied to Hinata Fes venue receipt.
  if (/日向坂で会いましょう.*グッズくじ/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['ひなたフェス2026']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '中',
          `RULE030-OVERRIDE: グッズくじは会場受取を含む「${event.title}」連動施策として集約候補。`,
          event
        ),
        'HINA_AI_GOODS_TO_HINATA_FES'
      );
    }
  }

  // Reviewed: emergency stream is an independent event caused by Hinata Fes cancellation.
  if (/9月6日\(日\)20:00.*日向坂46\s*緊急生配信決定/.test(title) || /日向坂46\s*緊急生配信決定/.test(title)) {
    const parent = aiSuggestionFindEventByTokensV023_(events, ['ひなたフェス2026']);
    return deterministicBackfillOverrideResultV030_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        `RULE030-OVERRIDE: 緊急生配信は独立した日時・目的を持つEVENT。${parent ? ` 親候補=${parent.title}` : ''}`,
        null
      ),
      'EMERGENCY_STREAM_STANDALONE'
    );
  }

  // Reviewed: Aobazaka audition campaign belongs to the existing Aobazaka parent.
  if (/青葉坂46.*オーディションキャンペーン/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['青葉坂46']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE030-OVERRIDE: オーディションキャンペーンは「${event.title}」の後続施策。`,
          event
        ),
        'AOBAZAKA_CAMPAIGN_TO_PARENT'
      );
    }
  }

  // Known title mismatch: photo book parent already exists.
  if (/金村美玖.*2nd写真集.*発売.*決定/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['金村美玖', '写真集']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE030-OVERRIDE: 既存EVENT「${event.title}」と同一概念。`,
          event
        ),
        'KANEMURA_PHOTOBOOK_EXISTING'
      );
    }
  }

  // Known wording mismatch: "卒業のお知らせ" = existing "卒業発表".
  if (/森本茉莉\s*卒業のお知らせ/.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['森本茉莉', '卒業発表']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE030-OVERRIDE: 「卒業のお知らせ」は既存EVENT「${event.title}」と同一概念。`,
          event
        ),
        'MORIMOTO_GRAD_EXISTING'
      );
    }
  }

  // Structural refinement: formation announcement livestream is an independent stream event.
  if (/フォーメーション発表生配信/.test(title)) {
    return deterministicBackfillOverrideResultV030_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'RULE030-OVERRIDE: 固有日時を持つフォーメーション発表生配信は独立EVENT候補。',
        null
      ),
      'FORMATION_STREAM_STANDALONE'
    );
  }

  // Structural refinement: clean-action activity is a distinct child event, not merely the parent festival itself.
  if (/おひさまクリーンアクション.*開催決定/.test(title)) {
    const parent = aiSuggestionFindEventByTokensV023_(events, ['ひなたフェス2026']);
    return deterministicBackfillOverrideResultV030_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        `RULE030-OVERRIDE: 独自名称・目的を持つ催事として独立EVENT候補。${parent ? ` 親候補=${parent.title}` : ''}`,
        null
      ),
      'CLEAN_ACTION_STANDALONE_CHILD'
    );
  }

  // Campaign parent already exists; individual TV/WEB CM notices are sources under it.
  if (/トクニナルド/.test(title) && /(?:TVCM|WEB\s*CM)/i.test(title)) {
    const event = aiSuggestionFindEventByTokensV023_(events, ['トクニナルド']);
    if (event) {
      return deterministicBackfillOverrideResultV030_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE030-OVERRIDE: 個別CM告知は既存キャンペーンEVENT「${event.title}」へ集約候補。`,
          event
        ),
        'TOKUNINARUDO_CM_TO_CAMPAIGN'
      );
    }
  }

  return { proposal, overrideApplied: false, overrideName: '' };
}

function deterministicBackfillOverrideResultV030_(proposal, name) {
  return { proposal, overrideApplied: true, overrideName: name };
}

function deterministicBackfillRetagRuleV030_(proposal) {
  const copy = Object.assign({}, proposal);
  if (/^RULE011:\s*/.test(copy.reason || '')) {
    copy.reason = String(copy.reason).replace(/^RULE011:\s*/, 'RULE030: ');
  }
  return copy;
}

// ============================================================
// Commit exact staged snapshot
// ============================================================

function deterministicBackfillCommitStageV030_() {
  suggestionValidateConfig_();
  const stage = deterministicBackfillLoadStageV030_();
  const currentHash = deterministicBackfillSha256V030_(JSON.stringify(stage.items));
  if (currentHash !== stage.meta.sha256) {
    throw new Error('Stage SHA256 mismatch. Commit aborted.');
  }

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
    console.log('OC-OS INBOX DETERMINISTIC BACKFILL STAGED COMMIT v0.3.0');
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
        Utilities.sleep(OCOS_DETERMINISTIC_BACKFILL_030.WRITE_INTERVAL_MS);
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
    props.setProperty(OCOS_DETERMINISTIC_BACKFILL_030.STAGE_META_KEY, JSON.stringify(committedMeta));

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

function deterministicBackfillSaveStageV030_(items, audit) {
  deterministicBackfillClearStageV030_();
  const json = JSON.stringify(items);
  const chunks = [];
  for (let i = 0; i < json.length; i += OCOS_DETERMINISTIC_BACKFILL_030.CHUNK_SIZE) {
    chunks.push(json.slice(i, i + OCOS_DETERMINISTIC_BACKFILL_030.CHUNK_SIZE));
  }

  const stageId = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
  const meta = {
    version: OCOS_DETERMINISTIC_BACKFILL_030.VERSION,
    stageId,
    createdAt: new Date().toISOString(),
    count: items.length,
    chunks: chunks.length,
    sha256: deterministicBackfillSha256V030_(json),
    audit: audit || {},
    committedAt: ''
  };

  const props = PropertiesService.getScriptProperties();
  chunks.forEach((chunk, index) => {
    props.setProperty(`${OCOS_DETERMINISTIC_BACKFILL_030.STAGE_CHUNK_PREFIX}${index}`, chunk);
  });
  props.setProperty(OCOS_DETERMINISTIC_BACKFILL_030.STAGE_META_KEY, JSON.stringify(meta));
  return meta;
}

function deterministicBackfillLoadStageV030_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(OCOS_DETERMINISTIC_BACKFILL_030.STAGE_META_KEY);
  if (!metaRaw) throw new Error('No Deterministic Backfill v0.3.0 stage exists.');

  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const value = props.getProperty(`${OCOS_DETERMINISTIC_BACKFILL_030.STAGE_CHUNK_PREFIX}${i}`);
    if (value === null) throw new Error(`Missing stage chunk: ${i}`);
    parts.push(value);
  }

  const json = parts.join('');
  const items = JSON.parse(json);
  const hash = deterministicBackfillSha256V030_(json);
  if (hash !== meta.sha256) throw new Error('Stage SHA256 mismatch.');
  if (!Array.isArray(items) || items.length !== Number(meta.count)) {
    throw new Error('Stage item count mismatch.');
  }
  return { meta, items };
}

function deterministicBackfillClearStageV030_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (
      key === OCOS_DETERMINISTIC_BACKFILL_030.STAGE_META_KEY ||
      key.indexOf(OCOS_DETERMINISTIC_BACKFILL_030.STAGE_CHUNK_PREFIX) === 0
    ) {
      props.deleteProperty(key);
    }
  });
}

function deterministicBackfillSha256V030_(text) {
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
