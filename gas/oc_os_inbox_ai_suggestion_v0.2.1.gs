/**
 * OC-OS INBOX AI Suggestion v0.2.1
 * 2026-09-28
 *
 * v0.2.0 Pilot で判明した2点を修正する。
 *   1. 8件バッチのJSONが出力上限等で途中切れし、1バッチ全体が失敗する問題。
 *   2. 既存の親EVENTへ寄せすぎ、独立すべき子EVENTやSOURCE-onlyを潰す問題。
 *
 * 原則:
 *   - Decision / Event / Status は変更しない。
 *   - SOURCES / EVENTS は作成しない。
 *   - Suggested_* の提案のみ。
 *   - AIが返した既存EVENT IDは v0.2.0 の validator で Current EVENTS 実在確認する。
 *   - Pilot中はTriggerを付けない。
 *
 * 依存:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 *   oc_os_inbox_suggestion_rules_v0.1.1.gs
 *   oc_os_inbox_parent_backfill_preview_v0.1.2.gs
 *   oc_os_inbox_ai_suggestion_v0.2.0.gs
 */

const OCOS_AI_SUGGESTION_021 = Object.freeze({
  VERSION: '0.2.1',
  MODEL: 'gemini-3.6-flash',
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_KEY_PROPERTY: 'GEMINI_API_KEY',
  BATCH_SIZE: 4,
  CALL_INTERVAL_MS: 500,
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 5 * 60 * 1000,
  MAX_OUTPUT_TOKENS: 8192
});

function previewInboxAiSuggestionBackfillV021() {
  aiSuggestionRunV021_({ mode: 'BACKFILL_AI_REVIEW', write: false });
}

function previewInboxAiSuggestionCurrentV021() {
  aiSuggestionRunV021_({ mode: 'CURRENT_AI_FALLBACK', write: false });
}

function runInboxAiSuggestionBackfillV021() {
  aiSuggestionRunV021_({ mode: 'BACKFILL_AI_REVIEW', write: true });
}

function runInboxAiSuggestionCurrentV021() {
  aiSuggestionRunV021_({ mode: 'CURRENT_AI_FALLBACK', write: true });
}

function aiSuggestionRunV021_(opts) {
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
    console.log(`OC-OS INBOX AI SUGGESTION v${OCOS_AI_SUGGESTION_021.VERSION}`);
    console.log(`MODEL = ${OCOS_AI_SUGGESTION_021.MODEL}`);
    console.log(`WRITE = ${opts.write ? 'SUGGESTED_* ONLY' : 'NONE'}`);
    console.log(`MODE = ${opts.mode}`);
    console.log(`EVENTS = ${events.length}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log(`BATCH_SIZE = ${OCOS_AI_SUGGESTION_021.BATCH_SIZE}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');

    for (let i = 0; i < pages.length; i += OCOS_AI_SUGGESTION_021.BATCH_SIZE) {
      if (Date.now() - startedAt >= OCOS_AI_SUGGESTION_021.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const batchPages = pages.slice(i, i + OCOS_AI_SUGGESTION_021.BATCH_SIZE);
      const items = batchPages.map(page => suggestionParseInboxPage_(page));

      let proposals = [];
      try {
        proposals = aiSuggestionAskWithFallbackV021_(geminiKey, opts.mode, items, events);
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
          Utilities.sleep(OCOS_AI_SUGGESTION_021.WRITE_INTERVAL_MS);
        } catch (err) {
          failed++;
          console.error(`[WRITE FAILED] ${item.title}: ${suggestionErrorMessage_(err)}`);
        }
      }

      Utilities.sleep(OCOS_AI_SUGGESTION_021.CALL_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(`DONE proposed=${proposed}, written=${written}, skipped=${skipped}, failed=${failed}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    if (opts.write) lock.releaseLock();
  }
}

/**
 * JSON切れ等でバッチが失敗した場合、半分に割って再試行する。
 * 1件まで割ってなお失敗した時だけエラーとする。
 */
function aiSuggestionAskWithFallbackV021_(apiKey, mode, items, events) {
  try {
    return aiSuggestionAskGeminiV021_(apiKey, mode, items, events);
  } catch (err) {
    if (items.length <= 1) throw err;

    console.warn(
      `[AI RETRY SPLIT] size=${items.length} reason=${suggestionErrorMessage_(err)}`
    );

    const mid = Math.ceil(items.length / 2);
    const left = aiSuggestionAskWithFallbackV021_(
      apiKey, mode, items.slice(0, mid), events
    );
    Utilities.sleep(OCOS_AI_SUGGESTION_021.CALL_INTERVAL_MS);
    const right = aiSuggestionAskWithFallbackV021_(
      apiKey, mode, items.slice(mid), events
    );
    return left.concat(right);
  }
}

function aiSuggestionAskGeminiV021_(apiKey, mode, items, events) {
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
    snippet: suggestionTruncate_(item.snippet || '', 450)
  }));

  const prompt = [
    'あなたは OC-OS INBOX の Suggestion Layer です。最終判断者ではありません。',
    '最終判断は必ず「あさくらじゅん」が行います。あなたは候補を提案するだけです。',
    '',
    'OC-OSの定義:',
    '- SOURCE = 「どこに書いてあったか」を残すもの。',
    '- EVENT = 「いつ、何が起きた／起きるか」を残すもの。',
    '- EVENTには独立した日時・目的・名称があり、後から「いつ何が起きたか」を検索する価値がある。',
    '- 親EVENTと関係があっても、独立した出来事なら親EVENTへ潰さず新規EVENT候補にする。',
    '- 同一の出来事がCurrent EVENTSにすでにある場合だけ既存EVENTへ追加する。',
    '',
    '重要な分類ルール:',
    '1. 雑誌・書籍の「表紙・巻頭・掲載・登場」は原則 SOURCESのみ登録候補。雑誌発売をEVENT化しない。',
    '2. 通常の公式YouTube動画公開は原則 SOURCESのみ登録候補。',
    '3. TV・ラジオ・配信番組への出演、公開収録は、固有日時があるなら独立EVENT候補。',
    '4. 外部ライブ・フェスへの出演は独立EVENT候補。',
    '5. MUSIC VIDEO公開・先行配信は独立EVENT候補。既存のシングル発売EVENTへ潰さない。',
    '6. 卒業セレモニー、オーディションセミナー等、独立名称と日時を持つ催事は独立EVENT候補。',
    '7. チケット販売、特典、グッズ、会場案内、交通案内、サイト公開、払戻し、アンケート、展示詳細、ブース案内などは、通常は既存親EVENTへの追加候補。',
    '8. 発売記念施策でも、施策自体に固有の日時・目的があり独立して追跡する価値があれば新規EVENT候補。',
    '9. 卒業に伴う事務案内は、独立EVENTを作らず既存の卒業EVENTへ追加する。',
    '10. Current EVENTSに親EVENTが存在するという理由だけで、独立した子EVENTを親へ集約しない。',
    '11. 迷う場合は confidence を低にし、無理にEVENT化しない。',
    '',
    `MODE=${mode}`,
    '',
    '許可される suggestedDecision:',
    '1. SOURCESのみ登録候補',
    '2. 既存EVENTへ追加候補',
    '3. 新規EVENT作成候補',
    '4. 対象外候補',
    '',
    '既存EVENTへ追加候補の場合だけ、Current EVENTSのeventPageIdを正確に返すこと。',
    '新規EVENT作成候補の場合はeventPageIdを空文字にし、newEventTitleHintに簡潔なEVENT名候補を入れること。',
    'reasonは日本語100文字以内を目安にすること。',
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
      temperature: 0,
      maxOutputTokens: OCOS_AI_SUGGESTION_021.MAX_OUTPUT_TOKENS,
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

  const url = `${OCOS_AI_SUGGESTION_021.API_BASE}/${encodeURIComponent(OCOS_AI_SUGGESTION_021.MODEL)}:generateContent`;
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
  const candidate = (json.candidates || [])[0] || {};
  const finishReason = candidate.finishReason || '';
  const parts = ((candidate.content || {}).parts || []);
  const outputText = parts.map(p => p.text || '').join('').trim();

  if (!outputText) {
    throw new Error(`Gemini returned no text. finishReason=${finishReason || '-'}`);
  }

  try {
    return JSON.parse(outputText);
  } catch (err) {
    throw new Error(
      `Gemini JSON parse failed. finishReason=${finishReason || '-'}: ` +
      suggestionTruncate_(outputText, 1200)
    );
  }
}
