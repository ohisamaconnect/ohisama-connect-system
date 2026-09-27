/**
 * OC-OS INBOX AI Suggestion v0.2.0
 * 2026-09-27
 *
 * 目的:
 *   GAS/ルールで絞り込んだ曖昧なINBOXだけを Gemini に渡し、
 *   Suggested_* を作るための「提案」を生成する。
 *
 * 原則:
 *   - 判断はあさくらじゅん。AIは提案のみ。
 *   - Decision / Event / Status は絶対に変更しない。
 *   - SOURCES / EVENTS は作成しない。
 *   - AI出力は JSON Schema + GAS側の再検証を通す。
 *   - 既存EVENT候補は Current EVENTS に実在する page id だけ許可する。
 *   - Pilot 中は Trigger を付けない。
 *
 * 依存:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *
 * 必要 Script Property:
 *   GEMINI_API_KEY
 */

const OCOS_AI_SUGGESTION_020 = Object.freeze({
  VERSION: '0.2.0',
  MODEL: 'gemini-3.6-flash',
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_KEY_PROPERTY: 'GEMINI_API_KEY',
  BATCH_SIZE: 8,
  CALL_INTERVAL_MS: 600,
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 4.5 * 60 * 1000
});

// ============================================================
// Public entry points
// ============================================================

function testInboxAiSuggestionConnectionV020() {
  const key = aiSuggestionGeminiKeyV020_();
  const body = {
    contents: [{ parts: [{ text: 'Return JSON with ok=true.' }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false
      }
    }
  };
  const result = aiSuggestionGeminiRequestV020_(key, body);
  console.log(`AI Suggestion Gemini connection OK. model=${OCOS_AI_SUGGESTION_020.MODEL}`);
  console.log(JSON.stringify(result));
}

/**
 * 8/1..9/19 の official NEWS で v0.1.2 が AI_REVIEW に残したものを全件Preview。
 * WRITE = NONE
 */
function previewInboxAiSuggestionBackfillV020() {
  aiSuggestionRunV020_({ mode: 'BACKFILL_AI_REVIEW', write: false });
}

/**
 * 日常運用で v0.1.1 が「低 confidence / AI補助候補」としたものだけPreview。
 * WRITE = NONE
 */
function previewInboxAiSuggestionCurrentV020() {
  aiSuggestionRunV020_({ mode: 'CURRENT_AI_FALLBACK', write: false });
}

/**
 * Backfill AI_REVIEW に Suggested_* だけを書き込む。
 * Pilot検証後にのみ使用すること。
 */
function runInboxAiSuggestionBackfillV020() {
  aiSuggestionRunV020_({ mode: 'BACKFILL_AI_REVIEW', write: true });
}

/**
 * 日常運用の曖昧候補に Suggested_* だけを書き込む。
 * Pilot検証後にのみ使用すること。
 */
function runInboxAiSuggestionCurrentV020() {
  aiSuggestionRunV020_({ mode: 'CURRENT_AI_FALLBACK', write: true });
}

// ============================================================
// Main
// ============================================================

function aiSuggestionRunV020_(opts) {
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

  try {
    console.log('========================================');
    console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_020.VERSION}`);
    console.log(`MODEL = ${OCOS_AI_SUGGESTION_020.MODEL}`);
    console.log(`WRITE = ${opts.write ? 'SUGGESTED_* ONLY' : 'NONE'}`);
    console.log(`MODE = ${opts.mode}`);
    console.log(`EVENTS = ${events.length}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log(`BATCH_SIZE = ${OCOS_AI_SUGGESTION_020.BATCH_SIZE}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_020.BATCH_SIZE) {
      if (Date.now() - startedAt >= OCOS_AI_SUGGESTION_020.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const batchPages = pages.slice(i, i + OCOS_AI_SUGGESTION_020.BATCH_SIZE);
      const items = batchPages.map(page => suggestionParseInboxPage_(page));

      let proposals;
      try {
        proposals = aiSuggestionAskGeminiV020_(geminiKey, opts.mode, items, events);
      } catch (err) {
        failed += items.length;
        console.error(`[AI BATCH FAILED] offset=${i}: ${suggestionErrorMessage_(err)}`);
        continue;
      }

      const byKey = new Map(proposals.map(p => [p.itemKey, p]));

      for (const item of items) {
        const raw = byKey.get(item.pageId);
        if (!raw) {
          failed++;
          console.error(`[AI MISSING] ${item.title}`);
          continue;
        }

        let proposal;
        try {
          proposal = aiSuggestionValidateProposalV020_(raw, item, events);
        } catch (err) {
          failed++;
          console.error(`[AI INVALID] ${item.title}: ${suggestionErrorMessage_(err)}`);
          continue;
        }

        proposed++;
        console.log(`${proposed}. ${proposal.suggestedDecision} | ${item.title}`);
        console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
        console.log(`   reason=${proposal.reason}`);

        if (!opts.write) continue;

        // 人間判断または既存Suggestionが入った場合は直前でも守る。
        if (item.decision && item.decision !== '未判断') {
          skipped++;
          continue;
        }
        if (item.suggestedDecision && item.suggestedDecision !== '未提案') {
          skipped++;
          continue;
        }

        try {
          suggestionPatchProposal_(item.pageId, proposal);
          written++;
          Utilities.sleep(OCOS_AI_SUGGESTION_020.WRITE_INTERVAL_MS);
        } catch (err) {
          failed++;
          console.error(`[WRITE FAILED] ${item.title}: ${suggestionErrorMessage_(err)}`);
        }
      }

      Utilities.sleep(OCOS_AI_SUGGESTION_020.CALL_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(`DONE proposed=${proposed}, written=${written}, skipped=${skipped}, failed=${failed}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    if (opts.write) lock.releaseLock();
  }
}

// ============================================================
// Candidate selection
// ============================================================

function aiSuggestionLoadBackfillCandidatesV020_(events) {
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  return pages.filter(page => {
    const item = suggestionParseInboxPage_(page);
    if (item.decision && item.decision !== '未判断') return false;
    if (item.suggestedDecision && item.suggestedDecision !== '未提案') return false;
    const triage = suggestionClassifyParentBackfillV012_(item, events);
    return triage.kind === 'AI_REVIEW';
  });
}

function aiSuggestionLoadCurrentCandidatesV020_(events) {
  const pages = suggestionLoadInboxCandidatesV011_({ backfill: false });
  return pages.filter(page => {
    const item = suggestionParseInboxPage_(page);
    if (item.decision && item.decision !== '未判断') return false;
    if (item.suggestedDecision && item.suggestedDecision !== '未提案') return false;

    const rule = suggestionBuildProposalV011_(item, events);
    return rule.confidence === '低' || /AI補助候補/.test(rule.reason || '');
  });
}

// ============================================================
// Gemini request
// ============================================================

function aiSuggestionAskGeminiV020_(apiKey, mode, items, events) {
  const eventList = events.map(e => ({
    eventPageId: e.id,
    title: e.title,
    date: e.dateTime || '',
    status: e.status || ''
  }));

  const inputItems = items.map(item => ({
    itemKey: item.pageId,
    title: item.title,
    sourceClass: item.sourceClass || '',
    sourceType: item.sourceType || '',
    publishedAt: item.publishedAt || '',
    eventDateHint: item.eventDateHint || '',
    snippet: suggestionTruncate_(item.snippet || '', 500)
  }));

  const prompt = [
    'あなたは OC-OS INBOX の Suggestion Layer です。最終判断者ではありません。',
    '最終判断は必ず「あさくらじゅん」が行います。あなたは候補を提案するだけです。',
    '',
    '定義:',
    '- SOURCE = 「どこに書いてあったか」を残すもの。',
    '- EVENT = 「いつ、何が起きた／起きるか」を残すもの。',
    '- 同じ出来事なら EVENT を増やさず、既存EVENTへSOURCEを集約する。',
    '- Current EVENTSに無いという理由だけで新規EVENTにしない。概念的に同じEVENTがあれば既存EVENTを選ぶ。',
    '- 記事や告知そのものが独立EVENTでない場合は SOURCESのみ登録候補 または 既存EVENTへ追加候補。',
    '- 迷う場合は confidence を低にし、無理にEVENT化しない。',
    '',
    `MODE=${mode}`,
    '',
    '許可される suggestedDecision:',
    '1. SOURCESのみ登録候補',
    '2. 既存EVENTへ追加候補',
    '3. 新規EVENT作成候補',
    '4. 対象外候補',
    '',
    '既存EVENTへ追加候補の場合だけ、下記 Current EVENTS の eventPageId を正確に返してください。',
    '新規EVENT作成候補の場合は eventPageId を空文字にし、newEventTitleHint に簡潔なEVENT名候補を入れてください。',
    'reason は日本語120文字程度以内で、なぜその提案かを説明してください。',
    '',
    'Current EVENTS:',
    JSON.stringify(eventList),
    '',
    'INBOX items:',
    JSON.stringify(inputItems)
  ].join('\n');

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            itemKey: { type: 'string' },
            suggestedDecision: {
              type: 'string',
              enum: [
                'SOURCESのみ登録候補',
                '既存EVENTへ追加候補',
                '新規EVENT作成候補',
                '対象外候補'
              ]
            },
            eventPageId: { type: 'string' },
            confidence: { type: 'string', enum: ['高', '中', '低'] },
            reason: { type: 'string' },
            newEventTitleHint: { type: 'string' }
          },
          required: [
            'itemKey',
            'suggestedDecision',
            'eventPageId',
            'confidence',
            'reason',
            'newEventTitleHint'
          ],
          additionalProperties: false
        }
      }
    }
  };

  const result = aiSuggestionGeminiRequestV020_(apiKey, body);
  if (!Array.isArray(result)) {
    throw new Error('Gemini response is not an array.');
  }
  return result;
}

function aiSuggestionGeminiRequestV020_(apiKey, body) {
  const url = `${OCOS_AI_SUGGESTION_020.API_BASE}/${encodeURIComponent(OCOS_AI_SUGGESTION_020.MODEL)}:generateContent`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(`Gemini HTTP ${code}: ${suggestionTruncate_(text, 1000)}`);
  }

  const json = JSON.parse(text);
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  const outputText = parts.map(p => p.text || '').join('').trim();
  if (!outputText) throw new Error('Gemini returned no text.');

  try {
    return JSON.parse(outputText);
  } catch (err) {
    throw new Error(`Gemini JSON parse failed: ${suggestionTruncate_(outputText, 1000)}`);
  }
}

function aiSuggestionGeminiKeyV020_() {
  const key = PropertiesService.getScriptProperties().getProperty(
    OCOS_AI_SUGGESTION_020.GEMINI_KEY_PROPERTY
  );
  if (!key) {
    throw new Error(
      `Missing Script Property: ${OCOS_AI_SUGGESTION_020.GEMINI_KEY_PROPERTY}`
    );
  }
  return key;
}

// ============================================================
// Output validation
// ============================================================

function aiSuggestionValidateProposalV020_(raw, item, events) {
  const validDecisions = new Set([
    'SOURCESのみ登録候補',
    '既存EVENTへ追加候補',
    '新規EVENT作成候補',
    '対象外候補'
  ]);
  const validConfidence = new Set(['高', '中', '低']);

  if (raw.itemKey !== item.pageId) {
    throw new Error(`itemKey mismatch: ${raw.itemKey}`);
  }
  if (!validDecisions.has(raw.suggestedDecision)) {
    throw new Error(`invalid suggestedDecision: ${raw.suggestedDecision}`);
  }
  if (!validConfidence.has(raw.confidence)) {
    throw new Error(`invalid confidence: ${raw.confidence}`);
  }

  let event = null;
  const eventPageId = String(raw.eventPageId || '').trim();
  if (raw.suggestedDecision === '既存EVENTへ追加候補') {
    event = events.find(e => e.id === eventPageId) || null;
    if (!event) {
      throw new Error(`unknown eventPageId: ${eventPageId || '(empty)'}`);
    }
  }

  let reason = String(raw.reason || '').trim();
  const titleHint = String(raw.newEventTitleHint || '').trim();
  if (raw.suggestedDecision === '新規EVENT作成候補' && titleHint) {
    reason += ` / EVENT名候補: ${titleHint}`;
  }
  reason = `AI020: ${reason}`;

  return suggestionProposal_(
    raw.suggestedDecision,
    raw.confidence,
    suggestionTruncate_(reason, 1900),
    event
  );
}
