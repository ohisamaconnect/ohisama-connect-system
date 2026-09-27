/**
 * OC-OS INBOX Parent EVENT Backfill Preview v0.1.2
 * 2026-09-27
 *
 * 目的:
 *   2026-08-01..2026-09-19 の 日向坂46公式 × NEWS を対象に、
 *   「通常のEVENT候補」ではなく、Current OC-OS EVENTS の受け皿となる
 *   親EVENTの初期Backfill候補だけを抽出する。
 *
 * v0.1.0 / v0.1.1 と役割を分離する。
 *   - CURRENT Suggestion: 日々のINBOX判断支援（単発TV出演等もEVENT候補になり得る）
 *   - PARENT Backfill: 初期構築時の親EVENT土台づくり（単発出演は原則除外）
 *
 * 重要原則:
 *   - PREVIEW ONLY。NotionへのWRITEはしない。
 *   - Decision / Event / Status / Suggested_* は一切変更しない。
 *   - 同一URLはPreview内で1件に畳む。
 *   - 曖昧なものは AI_REVIEW として残し、無理に判定しない。
 *
 * 依存:
 *   oc_os_inbox_suggestion_engine_v0.1.0.gs
 */

const OCOS_PARENT_BACKFILL_012 = Object.freeze({
  VERSION: '0.1.2',
  FROM: '2026-08-01',
  TO: '2026-09-19',
  PAGE_SIZE: 100
});

function previewInboxParentEventBackfillV012() {
  suggestionValidateConfig_();

  const events = suggestionLoadEvents_();
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  const rows = pages.map(page => {
    const item = suggestionParseInboxPage_(page);
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
  console.log(`OC-OS PARENT EVENT BACKFILL v${OCOS_PARENT_BACKFILL_012.VERSION} PREVIEW`);
  console.log('WRITE = NONE');
  console.log(`WINDOW = ${OCOS_PARENT_BACKFILL_012.FROM} .. ${OCOS_PARENT_BACKFILL_012.TO}`);
  console.log('FILTER = Source_Class:日向坂46公式 / Source_Type:NEWS');
  console.log(`EVENTS = ${events.length}`);
  console.log(`RAW_INBOX = ${rawPages.length}`);
  console.log(`UNIQUE_URLS = ${pages.length}`);
  console.log(`DUPLICATES_COLLAPSED = ${rawPages.length - pages.length}`);
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
  console.log('SOURCE_ONLY rows are counted but omitted from detail output.');
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

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
