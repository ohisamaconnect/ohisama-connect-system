/**
 * OC-OS Suggestion Current - PILOT Runtime
 * Current public-surface consolidation generated from the verified Suggestion lineage.
 *
 * Runtime policy:
 * - Suggestion only; human Decision / Event / Status remain authoritative.
 * - SOURCES / EVENTS are never created by this layer.
 * - SOURCE_REVISION and unexpected Observation_Type values are excluded.
 * - Rule suggestion and AI suggestion remain separate responsibilities.
 * - AI Preview/Stage and Commit remain separated by human review.
 * - Commit never calls Gemini; only the reviewed staged snapshot can be written.
 * - No automatic trigger exists while Suggestion remains PILOT.
 * - Historical public entry points remain in GitHub source/history, not Runtime.
 *
 * Internal versioned helper names are intentionally retained until real Apps Script
 * parity validation is complete. Runtime users should invoke only the Current facade.
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

const OCOS_SUGGESTION_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  ENGINE: 'rules + v0.2.5-equivalent guarded staged AI',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});

// CURRENT BASE ENGINE CORE

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

// CURRENT RULE CLASSIFICATION CORE

function suggestionBuildProposalV011_(item, events) {
  const title = item.title || '';
  const eventMatch = suggestionFindBestEvent_(title, events);

  // Blog: 日常本文から EVENT を推測しない。
  if (item.sourceType === 'ブログ') {
    return suggestionProposal_(
      'SOURCESのみ登録候補',
      '中',
      'RULE011: Source_Type=ブログ。通常はSOURCE候補。',
      null
    );
  }

  // YouTube: 動画内の語彙を EVENT キーワードとして扱わない。
  if (item.sourceType === 'YouTube') {
    const isArchive = /アーカイブ/.test(title);
    const isLiveLike = /生配信|ライブ|LIVE|配信/.test(title);
    const isMusicVideo = /MUSIC\s*VIDEO|\bMV\b/i.test(title);

    if (isArchive && isLiveLike) {
      if (eventMatch && eventMatch.score >= 4) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE011: 配信アーカイブ。既存EVENT「${eventMatch.event.title}」と一致。`,
          eventMatch.event
        );
      }
      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        'RULE011: 配信アーカイブ。親EVENTがCurrent EVENTSに無く、Backfill候補。',
        null
      );
    }

    if (isMusicVideo) {
      if (eventMatch && eventMatch.score >= 4) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE011: 公式MUSIC VIDEO。既存EVENT「${eventMatch.event.title}」と一致。`,
          eventMatch.event
        );
      }
      return suggestionProposal_(
        '新規EVENT作成候補',
        '中',
        'RULE011: 公式MUSIC VIDEO公開物。Current EVENTSに強い一致なし。',
        null
      );
    }

    if (eventMatch && eventMatch.score >= 5) {
      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        `RULE011: 公式YouTube。既存EVENT「${eventMatch.event.title}」と高一致。`,
        eventMatch.event
      );
    }

    return suggestionProposal_(
      'SOURCESのみ登録候補',
      '中',
      'RULE011: 通常の公式YouTube。動画内容の語彙からEVENT化しない。',
      null
    );
  }

  const highPatterns = [
    /発売決定/,
    /開催決定/,
    /出演決定/,
    /出演が決定/,
    /出演！/,
    /放送が決定/,
    /生配信.*決定/,
    /MUSIC\s*VIDEO公開/i,
    /\bMV公開/i,
    /先行配信.*(?:開始|スタート|決定)/,
    /卒業のお知らせ/,
    /卒業セレモニー.*決定/,
    /活動休止/,
    /活動再開/,
    /(?:新メンバー|新加入|加入).*(?:決定|発表|お知らせ)/,
    /(?:新グループ|新ユニット).*誕生/,
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
    /インタビュー/,
    /アーティスト写真/,
    /バックカバー/
  ];

  // RULE011: title のみを見る。snippet は使わない。
  const highHit = suggestionFirstPattern_(title, highPatterns);
  const relatedHit = suggestionFirstPattern_(title, relatedPatterns);
  const sourceHit = suggestionFirstPattern_(title, sourceOnlyPatterns);

  if (item.sourceClass === '日向坂46公式') {
    // 明示的 EVENT 表現を最優先。
    if (highHit || item.sourceType === 'SCHEDULE') {
      if (eventMatch && eventMatch.score >= 4) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          '高',
          `RULE011: EVENT表現${highHit ? `「${highHit}」` : ''}。既存EVENT「${eventMatch.event.title}」と高一致。`,
          eventMatch.event
        );
      }
      return suggestionProposal_(
        '新規EVENT作成候補',
        highHit ? '高' : '中',
        `RULE011: ${highHit ? `EVENT表現「${highHit}」をタイトルで検出。` : '公式SCHEDULE。'} Current EVENTSに強い一致なし。`,
        null
      );
    }

    if (relatedHit) {
      if (eventMatch && eventMatch.score >= 3) {
        return suggestionProposal_(
          '既存EVENTへ追加候補',
          eventMatch.score >= 5 ? '高' : '中',
          `RULE011: RELATED表現「${relatedHit}」。既存EVENT「${eventMatch.event.title}」と一致。`,
          eventMatch.event
        );
      }
      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        `RULE011: RELATED表現「${relatedHit}」。親EVENTがCurrent EVENTSに無く、Backfill候補。`,
        null
      );
    }

    if (sourceHit) {
      return suggestionProposal_(
        'SOURCESのみ登録候補',
        '中',
        `RULE011: SOURCE寄り表現「${sourceHit}」をタイトルで検出。`,
        null
      );
    }
  }

  // External / unclassified: SOURCE first. Strong Event match only suggests relation.
  if (
    item.sourceType === '記事' ||
    item.sourceClass === '信頼できる報道' ||
    item.sourceClass === '未判定'
  ) {
    if (eventMatch && eventMatch.score >= 5) {
      return suggestionProposal_(
        '既存EVENTへ追加候補',
        '中',
        `RULE011: 外部SOURCE。既存EVENT「${eventMatch.event.title}」と高一致。`,
        eventMatch.event
      );
    }
    return suggestionProposal_(
      'SOURCESのみ登録候補',
      '低',
      'RULE011: 外部SOURCEはまずSOURCE候補。AI補助対象。',
      null
    );
  }

  if (eventMatch && eventMatch.score >= 5) {
    return suggestionProposal_(
      '既存EVENTへ追加候補',
      '中',
      `RULE011: 既存EVENT「${eventMatch.event.title}」と高一致。`,
      eventMatch.event
    );
  }

  return suggestionProposal_(
    'SOURCESのみ登録候補',
    '低',
    'RULE011: 明確なEVENT表現なし。AI補助候補。',
    null
  );
}

// CURRENT PARENT BACKFILL CORE

const OCOS_PARENT_BACKFILL_012 = Object.freeze({
  VERSION: '0.1.2',
  FROM: '2026-08-01',
  TO: '2026-09-19',
  PAGE_SIZE: 100
});
function suggestionLoadOfficialNewsBackfillAllV012_() {
  const out = [];
  let cursor = null;

  do {
    const body = {
      page_size: OCOS_PARENT_BACKFILL_012.PAGE_SIZE,
      filter: {
        and: [
          {
            or: [
              { property: 'Status', select: { equals: '未処理' } },
              { property: 'Status', select: { equals: '確認中' } }
            ]
          },
          { property: 'Decision', select: { equals: '未判断' } },
          { property: 'Published_At', date: { on_or_after: OCOS_PARENT_BACKFILL_012.FROM } },
          { property: 'Published_At', date: { on_or_before: OCOS_PARENT_BACKFILL_012.TO } },
          { property: 'Source_Class', select: { equals: '日向坂46公式' } },
          { property: 'Source_Type', select: { equals: 'NEWS' } }
        ]
      },
      sorts: [{ property: 'Published_At', direction: 'ascending' }]
    };

    if (cursor) body.start_cursor = cursor;

    const result = suggestionNotionRequest_(
      `/v1/data_sources/${OCOS_SUGGESTION.INBOX_DATA_SOURCE_ID}/query`,
      'post',
      body
    );

    (result.results || []).forEach(page => out.push(page));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return out;
}

function suggestionDedupeInboxPagesV012_(pages) {
  const seen = new Set();
  const out = [];

  (pages || []).forEach(page => {
    const item = suggestionParseInboxPage_(page);
    const key = item.url
      ? `URL:${String(item.url).trim()}`
      : `TITLE:${String(item.title || '').trim()}|DATE:${String(item.publishedAt || '')}`;

    if (seen.has(key)) return;
    seen.add(key);
    out.push(page);
  });

  return out;
}

function suggestionClassifyParentBackfillV012_(item, events) {
  const title = String(item.title || '');
  const eventMatch = suggestionFindBestEvent_(title, events);

  // 1) 明確な親EVENTそのもの。
  const parentPatterns = [
    /\d+(?:st|nd|rd|th)?\s*シングル.*発売決定/i,
    /シングル.*発売決定/,
    /アルバム.*発売決定/,
    /Blu-ray.*DVD.*発売決定/i,
    /DVD.*Blu-ray.*発売決定/i,
    /写真集.*発売.*決定/,
    /(?:ARENA\s*TOUR|TOUR|ツアー|LIVE|ライブ|フェス).*開催決定/i,
    /卒業のお知らせ/,
    /活動休止/,
    /活動再開/,
    /新グループ.*誕生/,
    /オーディション開始/,
    /新番組.*(?:決定|開始|スタート)/,
    /レギュラー出演が決定/
  ];

  const parentHit = suggestionFirstPattern_(title, parentPatterns);
  if (parentHit) {
    if (eventMatch && eventMatch.score >= 4) {
      return suggestionParentResultV012_(
        'PARENT_EXISTS',
        `親EVENT表現「${parentHit}」。Current EVENTS「${eventMatch.event.title}」と一致。`,
        eventMatch.event
      );
    }
    return suggestionParentResultV012_(
      'PARENT_NEW',
      `親EVENT表現「${parentHit}」。Current EVENTSに強い一致なし。`,
      null
    );
  }

  // 2) 親EVENTの状態変更。中止・延期は新しい親EVENTを増やすのではなく、
  //    元EVENTの存在確認を優先する。
  const stateChangeHit = suggestionFirstPattern_(title, [
    /開催中止/,
    /中止のお知らせ/,
    /延期/
  ]);
  if (stateChangeHit) {
    return suggestionParentResultV012_(
      eventMatch && eventMatch.score >= 3 ? 'PARENT_RELATED' : 'PARENT_MISSING',
      `親EVENTの状態変更「${stateChangeHit}」。${eventMatch && eventMatch.score >= 3 ? '既存EVENT候補あり。' : '元の親EVENTを先にBackfillする必要あり。'}`,
      eventMatch && eventMatch.score >= 3 ? eventMatch.event : null
    );
  }

  // 3) 明確に親EVENTへぶら下がる情報。
  const relatedHit = suggestionFirstPattern_(title, [
    /チケット/,
    /トレード/,
    /特典/,
    /グッズ/,
    /会場限定/,
    /パネル展示/,
    /ジャケット/,
    /バックカバー/,
    /収録内容/,
    /フォーメーション/,
    /歌唱メンバー/,
    /先行受付/,
    /先行販売/,
    /追加販売/,
    /払い戻し/,
    /通信販売/,
    /会場受取/,
    /コラボ/,
    /キャンペーン/,
    /生配信.*決定/,
    /配信.*決定/,
    /詳細決定/
  ]);

  if (relatedHit) {
    if (eventMatch && eventMatch.score >= 3) {
      return suggestionParentResultV012_(
        'PARENT_RELATED',
        `親EVENT付随表現「${relatedHit}」。Current EVENTS「${eventMatch.event.title}」と一致。`,
        eventMatch.event
      );
    }
    return suggestionParentResultV012_(
      'PARENT_MISSING',
      `親EVENT付随表現「${relatedHit}」。受け皿EVENTがCurrent EVENTSに無く、親EVENT Backfill候補。`,
      null
    );
  }

  // 4) 単発TV/ラジオ等は通常EVENT候補ではあるが、初期親EVENT Backfillの目的外。
  const standaloneAppearance =
    /\d+月\d+日.*(?:テレビ|TBS|ABEMA|NHK|文化放送|J-WAVE|ラジオ|MRT|テレビ東京|朝日放送|フジテレビ|日本テレビ).*出演/.test(title) ||
    (/出演！/.test(title) && !/レギュラー/.test(title));

  if (standaloneAppearance) {
    return suggestionParentResultV012_(
      'STANDALONE_EVENT_SKIP',
      '単発出演は通常運用ではEVENT候補になり得るが、初期の親EVENT Backfill対象外。',
      null
    );
  }

  // 5) 明確なSOURCE寄り。
  if (
    /表紙|巻頭|中面|雑誌|ブログを更新|アーティスト写真|日向坂ちゃんねる.*公開/.test(title)
  ) {
    return suggestionParentResultV012_(
      'SOURCE_ONLY',
      '親EVENT土台作りの対象ではないSOURCE寄りNEWS。',
      null
    );
  }

  // 6) それ以外はルールで無理に決めずAI/人間レビューへ。
  return suggestionParentResultV012_(
    'AI_REVIEW',
    '親EVENT/付随SOURCE/独立EVENTのいずれかをルールだけでは確定しにくい。AI補助対象。',
    null
  );
}

function suggestionParentResultV012_(kind, reason, event) {
  return {
    kind,
    reason,
    eventId: event ? event.id : '',
    eventTitle: event ? event.title : ''
  };
}

// CURRENT REVISION-GUARDED RULE RUNNER

const OCOS_SUGGESTION_REVISION_GUARD_011 = Object.freeze({
  VERSION: '0.1.1-revision-guard',
  REVISION_VALUE: 'SOURCE_REVISION',
  NORMAL_VALUE: 'NORMAL'
});
function suggestionPreviewRunV011_(mode) {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();
  const excludedRevisionPages = suggestionLoadRevisionExposureV011_(mode);
  const pages = suggestionLoadInboxCandidatesV011_(mode);

  let runtimeRevisionSkipped = 0;
  const candidates = [];

  pages.forEach(page => {
    const item = suggestionParseInboxPageV011_(page);
    if (isSourceRevisionSuggestionV011_(item)) {
      runtimeRevisionSkipped++;
      return;
    }
    candidates.push({ page, item });
  });

  console.log('========================================');
  console.log(`OC-OS INBOX SUGGESTION ${OCOS_SUGGESTION_REVISION_GUARD_011.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
  console.log(`REVISION_ROWS_EXCLUDED_BY_QUERY = ${excludedRevisionPages.length}`);
  console.log(`QUERY_CANDIDATES = ${pages.length}`);
  console.log(`RUNTIME_REVISION_SKIPPED = ${runtimeRevisionSkipped}`);
  console.log(`FINAL_CANDIDATES = ${candidates.length}`);
  console.log('========================================');

  excludedRevisionPages.forEach((page, index) => {
    const item = suggestionParseInboxPageV011_(page);
    console.log(`REVISION_EXCLUDED ${index + 1}. ${item.title}`);
  });

  if (excludedRevisionPages.length) console.log('----------------------------------------');

  candidates.forEach(({ item }, index) => {
    const proposal = suggestionBuildProposal_(item, events);
    console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
    console.log(`   observationType=${item.observationType || '(blank=NORMAL)'}`);
    console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
    console.log(`   reason=${proposal.reason}`);
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE');
  console.log('SOURCE_REVISION = EXCLUDED');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('========================================');
}

function suggestionWriteRunV011_(mode) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('Another OC-OS job is running; Suggestion Engine skipped.');
    return;
  }

  const startedAt = Date.now();
  try {
    suggestionValidateConfig_();
    const events = suggestionLoadEvents_();
    const pages = suggestionLoadInboxCandidatesV011_(mode);

    let written = 0;
    let skipped = 0;
    let revisionSkipped = 0;
    let failed = 0;

    console.log('========================================');
    console.log(`OC-OS INBOX SUGGESTION ${OCOS_SUGGESTION_REVISION_GUARD_011.VERSION}`);
    console.log(`MODE = ${mode.backfill ? 'BACKFILL' : 'CURRENT'}`);
    console.log(`QUERY_CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_SUGGESTION.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const item = suggestionParseInboxPageV011_(page);

      // Runtime second guard. Query条件だけに依存しない。
      if (isSourceRevisionSuggestionV011_(item)) {
        revisionSkipped++;
        console.log(`[REVISION_SKIP] ${item.title}`);
        continue;
      }

      if (item.decision && item.decision !== '未判断') {
        skipped++;
        continue;
      }

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
    console.log(`DONE written=${written}, skipped=${skipped}, revisionSkipped=${revisionSkipped}, failed=${failed}`);
    console.log('SOURCE_REVISION = EXCLUDED');
    console.log('Decision / Event / Status = UNCHANGED');
    console.log('========================================');
  } finally {
    lock.releaseLock();
  }
}

function suggestionLoadInboxCandidatesV011_(mode) {
  const pageSize = mode.backfill
    ? OCOS_SUGGESTION.BACKFILL_MAX_PER_RUN
    : OCOS_SUGGESTION.MAX_PER_RUN;

  const andFilters = suggestionBaseCandidateFiltersV011_(mode);
  andFilters.push({
    or: [
      { property: 'Observation_Type', select: { is_empty: true } },
      { property: 'Observation_Type', select: { equals: OCOS_SUGGESTION_REVISION_GUARD_011.NORMAL_VALUE } }
    ]
  });

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
    const item = suggestionParseInboxPageV011_(page);
    if (isSourceRevisionSuggestionV011_(item)) return false;
    return !item.suggestedDecision || item.suggestedDecision === '未提案';
  });
}

function suggestionLoadRevisionExposureV011_(mode) {
  const andFilters = suggestionBaseCandidateFiltersV011_(mode);
  andFilters.push({
    property: 'Observation_Type',
    select: { equals: OCOS_SUGGESTION_REVISION_GUARD_011.REVISION_VALUE }
  });

  const result = suggestionNotionRequest_(
    `/v1/data_sources/${OCOS_SUGGESTION.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    {
      page_size: 100,
      filter: { and: andFilters },
      sorts: [{ property: 'Published_At', direction: 'ascending' }]
    }
  );

  return (result.results || []).filter(page => {
    const item = suggestionParseInboxPageV011_(page);
    return !item.suggestedDecision || item.suggestedDecision === '未提案';
  });
}

function suggestionBaseCandidateFiltersV011_(mode) {
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

  return andFilters;
}

function suggestionParseInboxPageV011_(page) {
  const item = suggestionParseInboxPage_(page);
  const p = (page && page.properties) || {};
  item.observationType = suggestionSelect_(p.Observation_Type);
  return item;
}

function isSourceRevisionSuggestionV011_(item) {
  return String((item && item.observationType) || '').trim() ===
    OCOS_SUGGESTION_REVISION_GUARD_011.REVISION_VALUE;
}

// CURRENT AI BASE CORE

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

// CURRENT AI RETRY CORE

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

// CURRENT AI GUARDRAIL CORE

const OCOS_AI_SUGGESTION_023 = Object.freeze({
  VERSION: '0.2.3',
  WRITE_INTERVAL_MS: 320,
  RUN_SOFT_LIMIT_MS: 5 * 60 * 1000
});
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

// CURRENT AI STAGE SUPPORT CORE

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

// CURRENT AI REVISION-GUARDED STAGE CORE

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

// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

function previewSuggestionRuleCurrent() {
  return suggestionPreviewRunV011_({ backfill: false });
}

function runSuggestionRuleCurrent() {
  return suggestionWriteRunV011_({ backfill: false });
}

function previewSuggestionRuleBackfill() {
  return suggestionPreviewRunV011_({ backfill: true });
}

function previewSuggestionParentBackfill() {
  suggestionValidateConfig_();

  const events = suggestionLoadEvents_();
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  const rows = pages.map(page => {
    const item = suggestionParseInboxPageV011_(page);
    return {
      item,
      result: suggestionClassifyParentBackfillV012_(item, events)
    };
  });

  const counts = {};
  rows.forEach(x => {
    counts[x.result.kind] = (counts[x.result.kind] || 0) + 1;
  });

  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / PARENT BACKFILL PREVIEW');
  console.log('WRITE = NONE');
  console.log(`WINDOW = ${OCOS_PARENT_BACKFILL_012.FROM} .. ${OCOS_PARENT_BACKFILL_012.TO}`);
  console.log(`RAW_INBOX = ${rawPages.length}`);
  console.log(`UNIQUE_URLS = ${pages.length}`);
  console.log(`COUNTS = ${JSON.stringify(counts)}`);
  console.log('========================================');

  let n = 0;
  rows.forEach(x => {
    if (x.result.kind === 'SOURCE_ONLY') return;
    n++;
    console.log(`${n}. [${x.result.kind}] ${x.item.title}`);
    console.log(`   event=${x.result.eventTitle || '-'}`);
    console.log(`   reason=${x.result.reason}`);
  });

  console.log('========================================');
  console.log(`REVIEW_ROWS = ${n}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function previewSuggestionCurrentProductionGate() {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();

  const currentAudit = aiSuggestionAuditCurrentCandidatesV025_(events);
  const backfillAudit = aiSuggestionAuditBackfillCandidatesV025_(events);

  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / AI PRODUCTION GATE');
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

function previewAndStageSuggestionCurrent() {
  return aiSuggestionPreviewAndStageV025_('CURRENT_AI_FALLBACK');
}

function previewAndStageSuggestionBackfill() {
  return aiSuggestionPreviewAndStageV025_('BACKFILL_AI_REVIEW');
}

function commitSuggestionCurrentStage() {
  return aiSuggestionCommitStageV025_('CURRENT_AI_FALLBACK');
}

function commitSuggestionBackfillStage() {
  return aiSuggestionCommitStageV025_('BACKFILL_AI_REVIEW');
}

function inspectSuggestionCurrentStage() {
  const stage = aiSuggestionLoadStageV025_();
  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / STAGE');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`mode=${stage.meta.mode}`);
  console.log(`classifier_version=${stage.meta.classifierVersion}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

function clearSuggestionCurrentStage() {
  aiSuggestionClearStageV025_();
  console.log('Suggestion Current staged snapshot cleared.');
}