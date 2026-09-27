/**
 * OC-OS INBOX AI Suggestion Guardrails v0.2.3
 * 2026-09-28
 *
 * v0.2.2 hotfix / refinement:
 *   1. undefined suggestionNormalizeText_ dependency を廃止し、ローカル正規化関数へ置換。
 *   2. 卒業事務案内のメンバー抽出をタイトル依存から、Current EVENTS の「○○ 卒業発表」逆照合へ変更。
 *   3. ミーグリ応募受付は、本体EVENT未作成時に「同一EVENTへ束ねるべき既存概念候補」として扱う。
 *
 * 原則:
 *   - Decision / Event / Status は変更しない。
 *   - SOURCES / EVENTS は作成しない。
 *   - Suggested_* の提案のみ。
 *   - Pilot中はTriggerを付けない。
 *
 * 依存:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 *   oc_os_inbox_ai_suggestion_v0.2.1.gs
 */

const OCOS_AI_SUGGESTION_023 = Object.freeze({
  VERSION: '0.2.3',
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 5 * 60 * 1000
});

function previewInboxAiSuggestionBackfillV023() {
  aiSuggestionRunV023_({ mode: 'BACKFILL_AI_REVIEW', write: false });
}

function previewInboxAiSuggestionCurrentV023() {
  aiSuggestionRunV023_({ mode: 'CURRENT_AI_FALLBACK', write: false });
}

function runInboxAiSuggestionBackfillV023() {
  aiSuggestionRunV023_({ mode: 'BACKFILL_AI_REVIEW', write: true });
}

function runInboxAiSuggestionCurrentV023() {
  aiSuggestionRunV023_({ mode: 'CURRENT_AI_FALLBACK', write: true });
}

function aiSuggestionRunV023_(opts) {
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
    console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_023.VERSION}`);
    console.log('BASE = v0.2.1 + deterministic structural guardrails');
    console.log(`WRITE = ${opts.write ? 'SUGGESTED_* ONLY' : 'NONE'}`);
    console.log(`MODE = ${opts.mode}`);
    console.log(`EVENTS = ${events.length}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_021.BATCH_SIZE) {
      if (Date.now() - startedAt >= OCOS_AI_SUGGESTION_023.RUN_SOFT_LIMIT_MS) {
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
          const normalized = aiSuggestionNormalizeProposalV023_(validated, item, events);
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
          Utilities.sleep(OCOS_AI_SUGGESTION_023.WRITE_INTERVAL_MS);
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

function aiSuggestionNormalizeProposalV023_(proposal, item, events) {
  const title = item.title || '';

  // 1) 雑誌掲載はEVENT化しない。
  if (aiSuggestionIsMagazineListingV023_(title)) {
    return aiSuggestionGuardrailResultV023_(
      suggestionProposal_(
        'SOURCESのみ登録候補',
        '高',
        'GUARD023: 雑誌・書籍の掲載／表紙／巻頭情報はEVENT化せずSOURCEとして保持。',
        null
      ),
      'MAGAZINE_SOURCE_ONLY'
    );
  }

  // 2) MV公開・先行配信は独立EVENT。
  if (/MUSIC\s*VIDEO|\bMV\b/i.test(title) && /公開|配信/.test(title)) {
    return aiSuggestionGuardrailResultV023_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'GUARD023: MV公開／先行配信は発売EVENTへ吸収せず独立EVENT候補。',
        null
      ),
      'MV_STANDALONE_EVENT'
    );
  }

  // 3) 独立した子催事。親EVENTと関係していても潰さない。
  if (aiSuggestionIsStandaloneChildEventV023_(title)) {
    const parentHint = aiSuggestionParentHintV023_(title, events);
    const suffix = parentHint ? ` 親候補=${parentHint.title}` : '';
    return aiSuggestionGuardrailResultV023_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        `GUARD023: 固有の日時・目的を持つ独立催事。親EVENTへ吸収しない。${suffix}`,
        null
      ),
      'STANDALONE_CHILD_EVENT'
    );
  }

  // 4) オンラインミーグリ本体の開催決定は独立EVENT。
  if (/オンラインミート＆グリート/.test(title) && /開催決定/.test(title)) {
    return aiSuggestionGuardrailResultV023_(
      suggestionProposal_(
        '新規EVENT作成候補',
        '高',
        'GUARD023: オンラインミート＆グリートは独立した実施日程を持つEVENT候補。発売EVENTへ吸収しない。',
        null
      ),
      'MEETGREET_STANDALONE_EVENT'
    );
  }

  // 5) ミーグリ応募受付・追加販売は、本体EVENTへ束ねる。
  if (/オンラインミート＆グリート/.test(title) && /応募受付|追加販売/.test(title)) {
    const meetEvent = aiSuggestionFindEventByTokensV023_(events, ['ミート', 'グリート']);
    if (meetEvent) {
      return aiSuggestionGuardrailResultV023_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `GUARD023: 既存のオンラインミート＆グリートEVENT「${meetEvent.title}」への受付／販売情報。`,
          meetEvent
        ),
        'MEETGREET_RELATED'
      );
    }
    return aiSuggestionGuardrailResultV023_(
      suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        'GUARD023: ミーグリ本体EVENTがCurrent EVENTSに未登録。開催決定NEWSと同一EVENTへ束ねるべきBackfill候補。',
        null
      ),
      'MEETGREET_PARENT_MISSING'
    );
  }

  // 6) 卒業に伴う事務案内は、卒業セレモニーではなく卒業発表側へ寄せる。
  if (/プロフィール.*ブログ.*クローズ|ブログ.*クローズ|卒業による振替|卒業.*振替/.test(title)) {
    const graduationEvent = aiSuggestionFindGraduationAnnouncementForTitleV023_(events, title);
    if (graduationEvent) {
      return aiSuggestionGuardrailResultV023_(
        suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `GUARD023: 卒業に伴う事務案内は卒業セレモニーではなく「${graduationEvent.title}」へ集約。`,
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

function aiSuggestionIsMagazineListingV023_(title) {
  return /(?:BRUTUS|anan|non-no|B\.L\.T|EX大衆|月刊ジャイアンツ|週刊少年マガジン)/i.test(title) ||
    /(?:表紙|巻頭|中面).*(?:登場|掲載)|(?:発売).*(?:表紙|巻頭|中面|登場)/.test(title);
}

function aiSuggestionIsStandaloneChildEventV023_(title) {
  return /公開収録/.test(title) ||
    /POP-UP\s*STORE.*開催/i.test(title) ||
    /「出発式」|出発式/.test(title) ||
    /ライトアップ.*(?:実施|決定)|(?:実施|開催).*ライトアップ/.test(title) ||
    /オーディションセミナー.*開催/.test(title);
}

function aiSuggestionParentHintV023_(title, events) {
  if (/ひなたフェス\s*2026/.test(title)) {
    return aiSuggestionFindEventByTokensV023_(events, ['ひなたフェス2026']);
  }
  if (/イチャイチャ虫/.test(title)) {
    return aiSuggestionFindEventByTokensV023_(events, ['イチャイチャ虫']);
  }
  if (/青葉坂46/.test(title)) {
    return aiSuggestionFindEventByTokensV023_(events, ['青葉坂46']);
  }
  return null;
}

function aiSuggestionFindEventByTokensV023_(events, tokens) {
  const normTokens = (tokens || []).map(aiSuggestionNormalizeTextV023_);
  return (events || []).find(e => {
    const n = aiSuggestionNormalizeTextV023_(e.title || '');
    return normTokens.every(t => n.indexOf(t) >= 0);
  }) || null;
}

function aiSuggestionFindGraduationAnnouncementForTitleV023_(events, title) {
  const titleNorm = aiSuggestionNormalizeTextV023_(title);
  return (events || []).find(e => {
    const eventTitle = e.title || '';
    if (!/卒業発表/.test(eventTitle)) return false;
    const memberName = eventTitle.replace(/\s*卒業発表.*$/, '');
    const memberNorm = aiSuggestionNormalizeTextV023_(memberName);
    return !!memberNorm && titleNorm.indexOf(memberNorm) >= 0;
  }) || null;
}

function aiSuggestionNormalizeTextV023_(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　\-‐‑‒–—―ー・･「」『』【】（）()\[\]［］〈〉《》<>:：!！?？,，.。'"“”‘’]/g, '')
    .trim();
}

function aiSuggestionGuardrailResultV023_(proposal, name) {
  return {
    proposal: proposal,
    guardrailApplied: true,
    guardrailName: name
  };
}
