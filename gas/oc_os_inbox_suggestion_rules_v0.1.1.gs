/**
 * OC-OS INBOX Suggestion Rules v0.1.1
 * 2026-09-27
 *
 * v0.1.0 engine の helper / config を利用して、分類ルールだけを改善する Pilot patch。
 *
 * 改善点:
 *   1. ルール判定は原則 Inbox_Title のみを使う。Detected_Snippet はキーワード判定に使わない。
 *   2. Source_Type ごとに判定順を分離する。
 *   3. 公式YouTubeには NEWS 用の「グッズ」「加入」等の汎用語判定を適用しない。
 *   4. 明示的 EVENT 表現は RELATED 表現より優先する。
 *   5. Backfill は 日向坂46公式 × NEWS × 2026-08-01..2026-09-19 に限定する。
 *
 * 重要原則:
 *   - Decision / Event / Status は変更しない。
 *   - SOURCES / EVENTS は作成しない。
 *   - Suggested_* / Suggestion_* だけを更新する。
 *   - v0.1.0 本体ファイルが同じ Apps Script project に必要。
 *   - Pilot 中は Trigger を付けない。
 */

function previewInboxSuggestionV011() {
  suggestionPreviewRunV011_({ backfill: false });
}

function runInboxSuggestionV011() {
  suggestionWriteRunV011_({ backfill: false });
}

function previewInboxSuggestionBackfillV011() {
  suggestionPreviewRunV011_({ backfill: true });
}

function runInboxSuggestionBackfillV011() {
  suggestionWriteRunV011_({ backfill: true });
}

function suggestionPreviewRunV011_(mode) {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();
  const pages = suggestionLoadInboxCandidatesV011_(mode);

  console.log('========================================');
  console.log('OC-OS INBOX SUGGESTION RULES v0.1.1 PREVIEW');
  console.log('WRITE = NONE');
  console.log(`MODE = ${mode.backfill ? 'BACKFILL_OFFICIAL_NEWS' : 'CURRENT'}`);
  if (mode.backfill) {
    console.log(`WINDOW = ${OCOS_SUGGESTION.BACKFILL_FROM} .. ${OCOS_SUGGESTION.BACKFILL_TO}`);
    console.log('FILTER = Source_Class:日向坂46公式 / Source_Type:NEWS');
  }
  console.log(`EVENTS = ${events.length}`);
  console.log(`CANDIDATES = ${pages.length}`);
  console.log('========================================');

  pages.forEach((page, index) => {
    const item = suggestionParseInboxPage_(page);
    const proposal = suggestionBuildProposalV011_(item, events);
    console.log(`${index + 1}. ${proposal.suggestedDecision} | ${item.title}`);
    console.log(`   confidence=${proposal.confidence} / event=${proposal.eventTitle || '-'}`);
    console.log(`   reason=${proposal.reason}`);
  });

  console.log('========================================');
  console.log('PREVIEW COMPLETE');
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
    let failed = 0;

    console.log('========================================');
    console.log('OC-OS INBOX SUGGESTION RULES v0.1.1');
    console.log(`MODE = ${mode.backfill ? 'BACKFILL_OFFICIAL_NEWS' : 'CURRENT'}`);
    console.log(`CANDIDATES = ${pages.length}`);
    console.log('========================================');

    for (const page of pages) {
      if (Date.now() - startedAt >= OCOS_SUGGESTION.RUN_SOFT_LIMIT_MS) {
        console.warn('Soft time limit reached. Remaining items wait for next run.');
        break;
      }

      const item = suggestionParseInboxPage_(page);
      if (item.decision && item.decision !== '未判断') {
        skipped++;
        continue;
      }
      if (item.suggestedDecision && item.suggestedDecision !== '未提案') {
        skipped++;
        continue;
      }

      try {
        const proposal = suggestionBuildProposalV011_(item, events);
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

function suggestionLoadInboxCandidatesV011_(mode) {
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
    andFilters.push({
      property: 'Source_Class',
      select: { equals: '日向坂46公式' }
    });
    andFilters.push({
      property: 'Source_Type',
      select: { equals: 'NEWS' }
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
