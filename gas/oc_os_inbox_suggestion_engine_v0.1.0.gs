/**
 * OC-OS INBOX Suggestion Engine v0.1.0
 * 2026-09-27
 *
 * 目的:
 *   INBOX に対してルール + Current EVENTS照合で「提案」を付与する。
 *
 * 重要原則:
 *   - Decision は変更しない。
 *   - Event は変更しない。
 *   - Status は変更しない。
 *   - SOURCES / EVENTS は作成しない。
 *   - Suggested_* / Suggestion_* だけを更新する。
 *   - Pilot 中は自動トリガーを入れない。
 *
 * 必要 Script Property:
 *   NOTION_TOKEN
 */

const OCOS_SUGGESTION = Object.freeze({
  VERSION: '0.1.0',
  NOTION_VERSION: '2026-03-11',
  TIMEZONE: 'Asia/Tokyo',
  INBOX_DATA_SOURCE_ID: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  EVENTS_DATA_SOURCE_ID: '76508d6c-7771-46d4-850c-ca256c1080be',
  MAX_PER_RUN: 20,
  BACKFILL_MAX_PER_RUN: 30,
  BACKFILL_FROM: '2026-08-01',
  BACKFILL_TO: '2026-09-19',
  HTTP_MAX_RETRIES: 4,
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 4.5 * 60 * 1000
});

// ============================================================
// Public entry points
// ============================================================

function testInboxSuggestionConnectionV010() {
  suggestionValidateConfig_();
  const result = suggestionNotionRequest_(
    `/v1/data_sources/${OCOS_SUGGESTION.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );
  console.log(`Suggestion Engine connection OK. results=${(result.results || []).length}`);
}

function previewInboxSuggestionV010() {
  suggestionPreviewRun_({ backfill: false });
}

function runInboxSuggestionV010() {
  suggestionWriteRun_({ backfill: false });
}

function previewInboxSuggestionBackfillV010() {
  suggestionPreviewRun_({ backfill: true });
}

function runInboxSuggestionBackfillV010() {
  suggestionWriteRun_({ backfill: true });
}

// ============================================================
// Preview / Write
// ============================================================

function suggestionPreviewRun_(mode) {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();
  const pages = suggestionLoadInboxCandidates_(mode);

  console.log('========================================');
  console.log(`OC-OS INBOX SUGGESTION v${OCOS_SUGGESTION.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
  if (mode.backfill) {
    console.log(`WINDOW = ${OCOS_SUGGESTION.BACKFILL_FROM} .. ${OCOS_SUGGESTION.BACKFILL_TO}`);
  }
  console.log(`EVENTS = ${events.length}`);
  console.log(`CANDIDATES = ${pages.length}`);
  console.log('========================================');

  pages.forEach((page, index) => {
    const item = suggestionParseInboxPage_(page);
    const proposal = suggestionBuildProposal_(item, events);
    console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
    console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
    console.log(`   reason=${proposal.reason}`);
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');
}

function suggestionWriteRun_(mode) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Suggestion Engine skipped.');
    return;
  }

  const startedAt = Date.now();
  try {
    suggestionValidateConfig_();
    const events = suggestionLoadEvents_();
    const pages = suggestionLoadInboxCandidates_(mode);

    let written = 0;
    let skipped = 0;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX SUGGESTION v${OCOS_SUGGESTION.VERSION}`);
    console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_SUGGESTION.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const item = suggestionParseInboxPage_(page);

      // Human Decision が入ったものは絶対に触らない。
      if (item.decision && item.decision !== '未判断') {
        skipped++;
        continue;
      }

      // 既に提案済みなら通常は上書きしない。
      if (item.suggestedDecision && item.suggestedDecision !== '未提案') {
        skipped++;
        continue;
      }

      try {
        const proposal = suggestionBuildProposal_(item, events);
        suggestionPatchProposal_(item.pageId, proposal);
        written++;
        console.log(`[OK] ${proposal.suggestedDecision} | ${item.title}`);
      } catch (err) {
        failed++;
        console.error(`[FAILED] ${item.title}: ${suggestionErrorMessage_(err)}`);
      }

      Utilities.sleep(OCOS_SUGGESTION.WRITE_INTERVAL_MS);
    }

    console.log('========================================');
    console.log(`DONE written=${written}, skipped=${skipped}, failed=${failed}`);
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Candidate loading
// ============================================================

function suggestionLoadInboxCandidates_(mode) {
  const pageSize = mode.backfill
    ? OCOS_SUGGESTION.BACKFILL_MAX_PER_RUN
    : OCOS_SUGGESTION.MAX_PER_RUN;

  const andFilters = [
    {
      or: [
        { property: 'Status', select: { equals: '未処理' } },
        { property: 'Status', select: { equals: '確認中' } }
      ]
    },
    { property: 'Decision', select: { equals: '未判断' } }
  ];

  if (mode.backfill) {
    andFilters.push({
      property: 'Published_At',
      date: { on_or_after: OCOS_SUGGESTION.BACKFILL_FROM }
    });
    andFilters.push({
      property: 'Published_At',
      date: { on_or_before: OCOS_SUGGESTION.BACKFILL_TO }
    });
  }

  const result = suggestionNotionRequest_(
    `/v1/data_sources/${OCOS_SUGGESTION.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: Math.min(pageSize, 100),
      filter: { and: andFilters },
      sorts: [{ property: 'Published_At', direction: 'ascending' }]
    }
  );

  return (result.results || []).filter(page => {
    const item = suggestionParseInboxPage_(page);
    return !item.suggestedDecision || item.suggestedDecision === '未提案';
  });
}

function suggestionLoadEvents_() {
  const pages = [];
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const result = suggestionNotionRequest_(
      `/v1/data_sources/${OCOS_SUGGESTION.EVENTS_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => {
      const p = page.properties || {};
      pages.push({
        id: page.id,
        title: suggestionText_(p.Event_Title),
        dateTime: suggestionDateStart_(p.DateTime),
        status: suggestionSelect_(p.Event_Status)
      });
    });

    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return pages;
}

function suggestionParseInboxPage_(page) {
  const p = page.properties || {};
  return {
    pageId: page.id,
    title: suggestionText_(p.Inbox_Title),
    url: p.URL && p.URL.url ? String(p.URL.url) : '',
    publisher: suggestionText_(p.Publisher),
    sourceClass: suggestionSelect_(p.Source_Class),
    sourceType: suggestionSelect_(p.Source_Type),
    decision: suggestionSelect_(p.Decision),
    suggestedDecision: suggestionSelect_(p.Suggested_Decision),
    publishedAt: suggestionDateStart_(p.Published_At),
    eventDateHint: suggestionDateStart_(p.Event_Date_Hint),
    snippet: suggestionText_(p.Detected_Snippet)
  };
}

// ============================================================
// Proposal logic
// ============================================================

function suggestionBuildProposal_(item, events) {
  const title = item.title || '';
  const text = `${title} ${item.snippet || ''}`;
  const eventMatch = suggestionFindBestEvent_(title, events);

  const highPatterns = [
    /発売決定/,
    /開催決定/,
    /出演決定/,
    /出演！/,
    /出演が決定/,
    /放送が決定/,
    /生配信.*決定/,
    /公開.*決定/,
    /MUSIC\s*VIDEO公開/i,
    /MV公開/i,
    /先行配信.*(?:開始|スタート|決定)/,
    /卒業のお知らせ/,
    /卒業セレモニー.*決定/,
    /活動休止/,
    /活動再開/,
    /加入/,
    /誕生/,
    /オーディション開始/,
    /中止のお知らせ/,
    /開催中止/,
    /延期/,
    /レギュラー出演が決定/
  ];

  const relatedPatterns = [
    /先行受付/,
    /先行販売/,
    /特典/,
    /グッズ/,
    /注意事項/,
    /チケット/,
    /トレード/,
    /追加販売/,
    /受付開始/,
    /コラボ/,
    /パネル展示/,
    /絵柄/,
    /ジャケット/,
    /バックカバー/,
    /収録内容/,
    /フォーメーション/,
    /歌唱メンバー/,
    /会場限定/,
    /払い戻し/,
    /応募受付/,
    /通信販売/,
    /会場受取/,
    /詳細決定/
  ];

  const sourceOnlyPatterns = [
    /表紙/,
    /巻頭/,
    /中面/,
    /雑誌/,
    /発売.*に.*登場/,
    /ブログを更新/,
    /インタビュー/
  ];

  const highHit = suggestionFirstPattern_(text, highPatterns);
  const relatedHit = suggestionFirstPattern_(text, relatedPatterns);
  const sourceHit = suggestionFirstPattern_(text, sourceOnlyPatterns);

  // ブログは通常 SOURCE 寄り。EVENT化は人間判断に残す。
  if (item.sourceType === 'ブログ') {
    return suggestionProposal_(
      'SOURCESのみ登録候補',
      '中',
      `RULE: Source_Type=ブログ。通常はSOURCE候補。`,
      null
    );
  }

  // Official NEWS / SCHEDULE はEVENT提案を強く出す。
  if (item.sourceClass === '日向坂46公式') {
    if (relatedHit) {
      if (eventMatch && eventMatch.score >= 3) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          eventMatch.score >= 5 ? '高' : '中',
          `RULE: 「${relatedHit}」を検出。既存EVENT「${eventMatch.event.title}」と一致。`,
          eventMatch.event
        );
      }

      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        `RULE: 「${relatedHit}」を検出。親EVENT候補がCurrent EVENTSに見つからず、欠落Backfillの可能性。`,
        null
      );
    }

    if (highHit || item.sourceType === 'SCHEDULE') {
      if (eventMatch && eventMatch.score >= 4) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE: EVENT表現${highHit ? `「${highHit}」` : ''}を検出。既存EVENT「${eventMatch.event.title}」と高一致。`,
          eventMatch.event
        );
      }

      return suggestionProposal_(
        '新規EVENT作成候補',
        highHit ? '高' : '中',
        `RULE: ${highHit ? `EVENT表現「${highHit}」を検出。` : '公式SCHEDULE。'} Current EVENTSに強い一致なし。`,
        null
      );
    }

    if (sourceHit) {
      return suggestionProposal_(
        'SOURCESのみ登録候補',
        '中',
        `RULE: SOURCE寄り表現「${sourceHit}」を検出。`,
        null
      );
    }

    // Official YouTube: MV等でなければ通常SOURCE寄り。
    if (item.sourceType === 'YouTube') {
      if (eventMatch && eventMatch.score >= 4) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          '中',
          `RULE: 公式YouTube。既存EVENT「${eventMatch.event.title}」と一致。`,
          eventMatch.event
        );
      }
      return suggestionProposal_(
        'SOURCESのみ登録候補',
        '低',
        'RULE: 公式YouTubeだが独立EVENT表現なし。',
        null
      );
    }
  }

  // 外部記事は基本SOURCE。既存EVENTに強く一致すれば追加候補。
  if (item.sourceType === '記事' || item.sourceClass === '信頼できる報道' || item.sourceClass === '未判定') {
    if (eventMatch && eventMatch.score >= 5) {
      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        `RULE: 外部SOURCE。既存EVENT「${eventMatch.event.title}」と高一致。`,
        eventMatch.event
      );
    }
    return suggestionProposal_(
      'SOURCESのみ登録候補',
      '低',
      'RULE: 外部SOURCEはまずSOURCE候補として提示。',
      null
    );
  }

  // その他。既存EVENTとの強一致だけ拾い、それ以外はSOURCE寄り。
  if (eventMatch && eventMatch.score >= 5) {
    return suggestionProposal_(
      '既存EVENTへ追加候補',
      '中',
      `RULE: 既存EVENT「${eventMatch.event.title}」と高一致。`,
      eventMatch.event
    );
  }

  return suggestionProposal_(
    'SOURCESのみ登録候補',
    '低',
    'RULE: 明確なEVENT表現なし。AI補助候補。',
    null
  );
}

function suggestionProposal_(decision, confidence, reason, event) {
  return {
    suggestedDecision: decision,
    confidence,
    reason: suggestionTruncate_(reason, 1900),
    eventId: event ? event.id : '',
    eventTitle: event ? event.title : ''
  };
}

function suggestionFirstPattern_(text, patterns) {
  for (const re of patterns) {
    const m = String(text || '').match(re);
    if (m) return m[0];
  }
  return '';
}

// ============================================================
// Existing EVENT matching
// ============================================================

function suggestionFindBestEvent_(title, events) {
  const normalizedTitle = suggestionNormalize_(title);
  const titleKeys = suggestionExtractKeys_(title);
  let best = null;

  events.forEach(event => {
    const eventTitle = event.title || '';
    if (!eventTitle) return;

    const normalizedEvent = suggestionNormalize_(eventTitle);
    const eventKeys = suggestionExtractKeys_(eventTitle);
    let score = 0;

    if (normalizedTitle && normalizedEvent) {
      if (normalizedTitle === normalizedEvent) score += 10;
      if (normalizedTitle.includes(normalizedEvent) || normalizedEvent.includes(normalizedTitle)) score += 5;
    }

    titleKeys.forEach(key => {
      if (key.length < 3) return;
      if (normalizedEvent.includes(suggestionNormalize_(key))) score += key.length >= 8 ? 3 : 2;
    });

    eventKeys.forEach(key => {
      if (key.length < 3) return;
      if (normalizedTitle.includes(suggestionNormalize_(key))) score += key.length >= 8 ? 2 : 1;
    });

    if (!best || score > best.score) {
      best = { event, score };
    }
  });

  return best && best.score > 0 ? best : null;
}

function suggestionExtractKeys_(text) {
  const raw = String(text || '');
  const keys = [];

  const quotedPatterns = [
    /『([^』]{2,})』/g,
    /「([^」]{2,})」/g,
    /“([^”]{2,})”/g,
    /\"([^\"]{2,})\"/g
  ];

  quotedPatterns.forEach(re => {
    let m;
    while ((m = re.exec(raw)) !== null) {
      keys.push(m[1]);
    }
  });

  const cleaned = raw
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[『』「」“”\"'（）()【】\[\]・!！?？,:：、。／\/〜~]/g, ' ');

  cleaned.split(/\s+/).forEach(token => {
    const t = token.trim();
    if (t.length >= 3 && !suggestionStopword_(t)) keys.push(t);
  });

  return Array.from(new Set(keys)).slice(0, 20);
}

function suggestionStopword_(token) {
  const stop = [
    '日向坂46', '公式', '決定', 'お知らせ', '発売', '公開', '開催', '出演',
    'スタート', '開始', '本日', '更新', 'シングル', 'Single', 'LIVE', 'ライブ'
  ];
  return stop.includes(token);
}

function suggestionNormalize_(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[『』「」“”\"'（）()【】\[\]・!！?？,:：、。／\/〜~\-–—_]/g, '');
}

// ============================================================
// Write proposal only
// ============================================================

function suggestionPatchProposal_(pageId, proposal) {
  const properties = {
    Suggested_Decision: { select: { name: proposal.suggestedDecision } },
    Suggestion_Confidence: { select: { name: proposal.confidence } },
    Suggestion_Reason: suggestionRichText_(proposal.reason)
  };

  properties.Suggested_Event = {
    relation: proposal.eventId ? [{ id: proposal.eventId }] : []
  };

  suggestionNotionRequest_(`/v1/pages/${pageId}`, 'patch', { properties });
}

// ============================================================
// Notion helpers
// ============================================================

function suggestionValidateConfig_() {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw new Error('Script Property NOTION_TOKEN is missing.');
}

function suggestionNotionRequest_(path, method, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  const url = `https://api.notion.com${path}`;
  let lastErr = null;

  for (let attempt = 1; attempt <= OCOS_SUGGESTION.HTTP_MAX_RETRIES; attempt++) {
    try {
      const options = {
        method: method || 'get',
        muteHttpExceptions: true,
        contentType: 'application/json',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': OCOS_SUGGESTION.NOTION_VERSION
        }
      };

      if (payload !== undefined && payload !== null) {
        options.payload = JSON.stringify(payload);
      }

      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      const text = response.getContentText();
      const data = text ? JSON.parse(text) : {};

      if (code >= 200 && code < 300) return data;

      const retryable = code === 429 || code >= 500;
      const message = `Notion API ${code}: ${text}`;
      if (!retryable || attempt === OCOS_SUGGESTION.HTTP_MAX_RETRIES) {
        throw new Error(message);
      }

      Utilities.sleep(Math.min(800 * Math.pow(2, attempt - 1), 8000));
    } catch (err) {
      lastErr = err;
      if (attempt === OCOS_SUGGESTION.HTTP_MAX_RETRIES) throw err;
      Utilities.sleep(Math.min(800 * Math.pow(2, attempt - 1), 8000));
    }
  }

  throw lastErr || new Error('Unknown Notion request failure.');
}

function suggestionText_(property) {
  if (!property) return '';
  const arr = property.title || property.rich_text || [];
  return arr.map(x => (x.plain_text !== undefined ? x.plain_text : '')).join('');
}

function suggestionSelect_(property) {
  return property && property.select && property.select.name
    ? String(property.select.name)
    : '';
}

function suggestionDateStart_(property) {
  return property && property.date && property.date.start
    ? String(property.date.start)
    : '';
}

function suggestionRichText_(text) {
  const value = suggestionTruncate_(String(text || ''), 1900);
  if (!value) return { rich_text: [] };
  return {
    rich_text: [
      {
        type: 'text',
        text: { content: value }
      }
    ]
  };
}

function suggestionTruncate_(text, max) {
  const s = String(text || '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function suggestionErrorMessage_(err) {
  if (!err) return 'Unknown error';
  return err && err.message ? String(err.message) : String(err);
}
