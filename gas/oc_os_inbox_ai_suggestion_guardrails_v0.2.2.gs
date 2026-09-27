/**
 * OC-OS INBOX AI Suggestion Guardrails v0.2.2
 * 2026-09-28
 *
 * v0.2.1 の Gemini 提案に、OC-OS 固有の EVENT 粒度を決定論的に補正する。
 * AIを置き換えるのではなく、明確な構造ルールだけを後段で適用する。
 *
 * 原則:
 * - Decision / Event / Status は変更しない。
 * - SOURCES / EVENTS は作成しない。
 * - Suggested_* の提案のみ。
 * - Pilot中はTriggerを付けない。
 *
 * 依存:
 * - oc_os_inbox_suggestion_engine_v0.1.0.gs
 * - oc_os_inbox_suggestion_rules_v0.1.1.gs
 * - oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 * - oc_os_inbox_ai_suggestion_v0.2.0.gs
 * - oc_os_inbox_ai_suggestion_v0.2.1.gs
 */

const OCOS_AI_SUGGESTION_022 = Object.freeze({
  VERSION: '0.2.2',
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 5 * 60 * 1000
});

function previewInboxAiSuggestionBackfillV022() {
  aiSuggestionRunV022_({ mode: 'BACKFILL_AI_REVIEW', write: false });
}

function previewInboxAiSuggestionCurrentV022() {
  aiSuggestionRunV022_({ mode: 'CURRENT_AI_FALLBACK', write: false });
}

function runInboxAiSuggestionBackfillV022() {
  aiSuggestionRunV022_({ mode: 'BACKFILL_AI_REVIEW', write: true });
}

function runInboxAiSuggestionCurrentV022() {
  aiSuggestionRunV022_({ mode: 'CURRENT_AI_FALLBACK', write: true });
}

function aiSuggestionRunV022_(opts) {
  suggestionValidateConfig_();
  const geminiKey = aiSuggestionGeminiKeyV020_();
  const events = suggestionLoadEvents_();
  const pages = opts.mode === 'BACKFILL_AI_REVIEW'
    ? aiSuggestionLoadBackfillCandidatesV020_(events)
    : aiSuggestionLoadCurrentCandidatesV020_(events);

  const lock = LockService.getScriptLock();
  if (opts.write && !lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; AI Suggestion skipped.');
    return;
  }

  const startedAt = Date.now();
  let proposed = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let corrected = 0;

  try {
    console.log('========================================');
    console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_022.VERSION}`);
    console.log('BASE = v0.2.1 + deterministic structural guardrails');
    console.log(`WRITE = ${opts.write ? 'SUGGESTED_* ONLY' : 'NONE'}`);
    console.log(`MODE = ${opts.mode}`);
    console.log(`EVENTS = ${events.length}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_021.BATCH_SIZE) {
      if (Date.now() - startedAt >= OCOS_AI_SUGGESTION_022.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const batchPages = pages.slice(i, i + OCOS_AI_SUGGESTION_021.BATCH_SIZE);
      const items = batchPages.map(page => suggestionParseInboxPage_(page));

      let rawProposals;
      try {
        rawProposals = aiSuggestionAskWithFallbackV021_(geminiKey, opts.mode, items, events);
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
          const normalized = aiSuggestionNormalizeProposalV022_(validated, item, events);
          if (normalized.guardrailApplied) corrected++;
          const proposal = normalized.proposal;

          proposed++;
          console.log(`${proposed}. ${proposal.suggestedDecision} | ${item.title}`);
          console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
          console.log(`   reason=${proposal.reason}`);
          if (normalized.guardrailApplied) {
            console.log(`   guardrail=${normalized.guardrailName}`);
          }

          if (!opts.write) continue;

          if (item.decision && item.decision !== '未判断') {
            skipped++;
            continue;
          }
          if (item.suggestedDecision && item.suggestedDecision !== '未提案') {
            skipped++;
            continue;
          }

          suggestionPatchProposal_(item.pageId, proposal);
          written++;
          Utilities.sleep(OCOS_AI_SUGGESTION_022.WRITE_INTERVAL_MS);
        } catch (err) {
          failed++;
          console.error(`[AI INVALID] ${item.title}: ${suggestionErrorMessage_(err)}`);
        }
      }
    }

    console.log('========================================');
    console.log(`DONE proposed=${proposed}, written=${written}, skipped=${skipped}, failed=${failed}, guardrail_corrected=${corrected}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    if (opts.write) lock.releaseLock();
  }
}

function aiSuggestionNormalizeProposalV022_(proposal, item, events) {
  const title = item.title || '';

  // 1) 雑誌掲載はEVENT化しない。
  if (aiSuggestionIsMagazineListingV022_(title)) {
    return aiSuggestionGuardrailResultV022_(
      suggestionProposal_(
        'SOURCESのみ登録候補',
        '高',
        'GUARD022: 雑誌・書籍の掲載／表紙／巻頭情報はEVENT化せずSOURCEとして保持。',
        null
      ),
      'MAGAZINE_SOURCE_ONLY'
    );
  }

  // 2) MV公開・先行配信は独立EVENT。
  if (/MUSIC\s*VIDEO|\bMV\b/i.test(title) && /公開|配信/.test(title)) {
    return aiSuggestionGuardrailResultV022_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'GUARD022: MV公開／先行配信は発売EVENTへ吸収せず独立EVENT候補。',
        null
      ),
      'MV_STANDALONE_EVENT'
    );
  }

  // 3) 独立した子催事。親EVENTと関係していても潰さない。
  if (aiSuggestionIsStandaloneChildEventV022_(title)) {
    const parentHint = aiSuggestionParentHintV022_(title, events);
    const suffix = parentHint ? ` 親候補=${parentHint.title}` : '';
    return aiSuggestionGuardrailResultV022_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        `GUARD022: 固有の日時・目的を持つ独立催事。親EVENTへ吸収しない。${suffix}`,
        null
      ),
      'STANDALONE_CHILD_EVENT'
    );
  }

  // 4) オンラインミーグリは「開催決定」なら独立EVENT。
  if (/オンラインミート＆グリート/.test(title) && /開催決定/.test(title)) {
    return aiSuggestionGuardrailResultV022_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'GUARD022: オンラインミート＆グリートは独立した実施日程を持つEVENT候補。発売EVENTへ吸収しない。',
        null
      ),
      'MEETGREET_STANDALONE_EVENT'
    );
  }

  // 5) ミーグリ応募受付・追加販売は同一ミーグリEVENTへ束ねる前提。
  //    Backfill時点で親が未作成なら、新規EVENT候補として同一概念を示す。
  if (/オンラインミート＆グリート/.test(title) && /応募受付|追加販売/.test(title)) {
    const meetEvent = aiSuggestionFindEventByTokensV022_(events, ['ミート', 'グリート']);
    if (meetEvent) {
      return aiSuggestionGuardrailResultV022_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `GUARD022: 既存のオンラインミート＆グリートEVENT「${meetEvent.title}」への受付／販売情報。`,
          meetEvent
        ),
        'MEETGREET_RELATED'
      );
    }
    return aiSuggestionGuardrailResultV022_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '中',
        'GUARD022: ミーグリ本体EVENTがCurrent EVENTSに未登録。開催決定NEWSと同一EVENTへ束ねる前提のBackfill候補。',
        null
      ),
      'MEETGREET_PARENT_MISSING'
    );
  }

  // 6) 卒業に伴う事務案内は、セレモニーではなく卒業発表側へ寄せる。
  if (/プロフィール.*ブログ.*クローズ|ブログ.*クローズ|卒業による振替|卒業.*振替/.test(title)) {
    const member = aiSuggestionExtractMemberBeforeGraduationV022_(title);
    const graduationEvent = aiSuggestionFindGraduationAnnouncementV022_(events, member);
    if (graduationEvent) {
      return aiSuggestionGuardrailResultV022_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `GUARD022: 卒業に伴う事務案内は卒業セレモニーではなく「${graduationEvent.title}」へ集約。`,
          graduationEvent
        ),
        'GRADUATION_ADMIN_TO_ANNOUNCEMENT'
      );
    }
  }

  return {
    proposal: proposal,
    guardrailApplied: false,
    guardrailName: ''
  };
}

function aiSuggestionIsMagazineListingV022_(title) {
  return /(?:BRUTUS|anan|non-no|B\.L\.T|EX大衆|月刊ジャイアンツ|週刊少年マガジン)/i.test(title) ||
    /(?:表紙|巻頭|中面).*(?:登場|掲載)|(?:発売).*(?:表紙|巻頭|中面|登場)/.test(title);
}

function aiSuggestionIsStandaloneChildEventV022_(title) {
  return /公開収録/.test(title) ||
    /POP-UP\s*STORE.*開催/i.test(title) ||
    /「出発式」|出発式/.test(title) ||
    /ライトアップ.*(?:実施|決定)|(?:実施|開催).*ライトアップ/.test(title) ||
    /オーディションセミナー.*開催/.test(title);
}

function aiSuggestionParentHintV022_(title, events) {
  if (/ひなたフェス\s*2026/.test(title)) {
    return aiSuggestionFindEventByTokensV022_(events, ['ひなたフェス2026']);
  }
  if (/イチャイチャ虫/.test(title)) {
    return aiSuggestionFindEventByTokensV022_(events, ['イチャイチャ虫']);
  }
  if (/青葉坂46/.test(title)) {
    return aiSuggestionFindEventByTokensV022_(events, ['青葉坂46']);
  }
  return null;
}

function aiSuggestionFindEventByTokensV022_(events, tokens) {
  const normTokens = tokens.map(t => suggestionNormalizeText_(t));
  return (events || []).find(e => {
    const n = suggestionNormalizeText_(e.title || '');
    return normTokens.every(t => n.indexOf(t) >= 0);
  }) || null;
}

function aiSuggestionExtractMemberBeforeGraduationV022_(title) {
  const patterns = [
    /^([^\s　]+)[\s　]+の?プロフィール/,
    /^([^\s　]+)[\s　]+個別/,
    /^([^\s　]+)[\s　]+.*卒業/
  ];
  for (const re of patterns) {
    const m = String(title || '').match(re);
    if (m && m[1]) return m[1].replace(/\s+/g, '');
  }
  return '';
}

function aiSuggestionFindGraduationAnnouncementV022_(events, member) {
  if (!member) return null;
  const memberNorm = suggestionNormalizeText_(member);
  return (events || []).find(e => {
    const n = suggestionNormalizeText_(e.title || '');
    return n.indexOf(memberNorm) >= 0 && /卒業発表/.test(e.title || '');
  }) || null;
}

function aiSuggestionGuardrailResultV022_(proposal, name) {
  return {
    proposal: proposal,
    guardrailApplied: true,
    guardrailName: name
  };
}
