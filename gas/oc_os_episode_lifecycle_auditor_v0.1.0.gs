/**
 * OC-OS Episode Lifecycle Auditor
 * v0.1.0-preview (2026-09-26)
 *
 * Read-only diagnostic for one EPISODE.
 *
 * Purpose:
 * - Show what is already complete and what still needs human attention.
 * - Never block Wednesday recording.
 * - Never change Production_Status or any database property.
 * - Keep optional secondary publication work separate from the broadcast core.
 *
 * Optional Script Property:
 * - OC_TARGET_EPISODE_KEY
 *   When present, audit that exact Episode_Key.
 *   When absent, preview the nearest Recording_Date episode.
 *
 * Required Script Property:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_LIFECYCLE_AUDITOR_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  TIME_ZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STUDIO_ITEMS_DS: '9591403b-709c-41cc-b3a6-1917b0042abf',
  STATEMENTS_DS: '0019d30d-da69-4c8d-a24a-07ee4573fb4f',
  PUBLICATIONS_DS: 'f192f616-6d18-44b3-a591-825ee285283b',
  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済', 'アーカイブ処理済', '完了'],
  OPEN_PUBLICATION_STATUSES: ['未着手', '下書き', '確認待ち', '公開準備済']
});

/** Main read-only audit. */
function auditEpisodeLifecycleV01() {
  const resolved = lifecycleV01ResolveEpisode_();
  const episode = resolved.episode;
  const episodeKey = lifecycleV01Title_(episode.properties['Episode_Key']);

  const studioItems = lifecycleV01QueryAll_(OC_LIFECYCLE_AUDITOR_V01.STUDIO_ITEMS_DS, {
    filter: {
      property: 'Episode',
      relation: { contains: episode.id }
    },
    page_size: 100
  });

  const statements = lifecycleV01QueryAll_(OC_LIFECYCLE_AUDITOR_V01.STATEMENTS_DS, {
    filter: {
      property: 'Episode',
      relation: { contains: episode.id }
    },
    page_size: 100
  });

  const publications = lifecycleV01QueryAll_(OC_LIFECYCLE_AUDITOR_V01.PUBLICATIONS_DS, {
    filter: {
      property: 'Episode',
      relation: { contains: episode.id }
    },
    page_size: 100
  });

  const studioCounts = lifecycleV01CountSelect_(studioItems, 'Studio_Status', [
    '候補', '使用済', '保留', '見送り'
  ]);
  const statementCounts = lifecycleV01CountSelect_(statements, 'Review_Status', [
    '候補', '確定', '見送り'
  ]);
  const publicationCounts = lifecycleV01CountSelect_(publications, 'Publication_Status', [
    '未着手', '下書き', '確認待ち', '公開準備済', '公開済', '見送り'
  ]);

  const audioUrl = lifecycleV01Url_(episode.properties['Audio_URL']);
  const transcriptUrl = lifecycleV01Url_(episode.properties['Transcript_URL']);
  const studioPackUrl = lifecycleV01Url_(episode.properties['Studio_Pack_URL']);
  const structureMemo = lifecycleV01Text_(episode.properties['Structure_Memo']);
  const setlistMemo = lifecycleV01Text_(episode.properties['Setlist_Memo']);
  const episodeTitle = lifecycleV01Text_(episode.properties['Episode_Title']);
  const productionStatus = lifecycleV01Select_(episode.properties['Production_Status']);

  const relationCounts = {
    Studio_Items: lifecycleV01RelationCount_(episode.properties['Studio_Items']),
    Events: lifecycleV01RelationCount_(episode.properties['Events']),
    Songs: lifecycleV01RelationCount_(episode.properties['Songs']),
    Sources: lifecycleV01RelationCount_(episode.properties['Sources']),
    Statements: lifecycleV01RelationCount_(episode.properties['Statements']),
    Publications: lifecycleV01RelationCount_(episode.properties['Publications'])
  };

  const openPublicationCount = OC_LIFECYCLE_AUDITOR_V01.OPEN_PUBLICATION_STATUSES
    .reduce((sum, status) => sum + (publicationCounts[status] || 0), 0);

  const signals = {
    studioPackAvailable: !!studioPackUrl,
    studioItemsAvailable: studioItems.length > 0,
    studioJudgmentComplete: (studioCounts['候補'] || 0) === 0,
    usedStudioItemsExist: (studioCounts['使用済'] || 0) > 0,
    masterLinked: !!audioUrl,
    transcriptLinked: !!transcriptUrl,
    structureMemoRecorded: !!structureMemo,
    setlistMemoRecorded: !!setlistMemo,
    episodeTitlePresent: !!episodeTitle,
    statementReviewOpen: (statementCounts['候補'] || 0) > 0,
    publicationFollowupOpen: openPublicationCount > 0
  };

  const attention = lifecycleV01BuildAttention_(productionStatus, signals, studioCounts, statementCounts, publicationCounts);

  const out = {
    write: 'NONE',
    version: OC_LIFECYCLE_AUDITOR_V01.VERSION,
    advisoryOnly: true,
    recordingIsNeverBlockedByThisAudit: true,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episode: {
      pageId: episode.id,
      Episode_Key: episodeKey,
      Episode_ID: lifecycleV01UniqueOrText_(episode.properties['Episode_ID']),
      Recording_Date: lifecycleV01DateStart_(episode.properties['Recording_Date']),
      Air_Date: lifecycleV01DateStart_(episode.properties['Air_Date']),
      Production_Status: productionStatus,
      Episode_Title: episodeTitle
    },
    coreArtifacts: {
      Studio_Pack_URL: studioPackUrl,
      Audio_URL: audioUrl,
      Transcript_URL: transcriptUrl,
      Structure_Memo_present: !!structureMemo,
      Setlist_Memo_present: !!setlistMemo
    },
    relations: relationCounts,
    studioItems: {
      total: studioItems.length,
      byStatus: studioCounts
    },
    statements: {
      total: statements.length,
      byReviewStatus: statementCounts
    },
    publications: {
      total: publications.length,
      byStatus: publicationCounts,
      openFollowupCount: openPublicationCount,
      optionalForBroadcastCompletion: true
    },
    signals: signals,
    attention: attention,
    principle: 'This audit reports state only. Final status changes and all judgments remain human decisions.'
  };

  console.log('========================================');
  console.log('OC-OS EPISODE LIFECYCLE AUDIT');
  console.log('VERSION = ' + OC_LIFECYCLE_AUDITOR_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function lifecycleV01BuildAttention_(productionStatus, signals, studioCounts, statementCounts, publicationCounts) {
  const out = [];

  if (!signals.studioPackAvailable && !signals.studioItemsAvailable) {
    out.push('収録準備素材へのリンク／候補が未整備。ただし水曜収録を妨げる条件ではない。');
  }

  if ((studioCounts['候補'] || 0) > 0 && ['収録済', '放送済', 'アーカイブ処理済', '完了'].indexOf(productionStatus) >= 0) {
    out.push('収録後も Studio_Status=候補 が残っている。使用済 / 保留 / 見送りの人間判断を確認する。');
  }

  if (['収録済', '放送済', 'アーカイブ処理済', '完了'].indexOf(productionStatus) >= 0) {
    if (!signals.masterLinked) out.push('Audio_URL（MASTER）が未接続。');
    if (!signals.transcriptLinked) out.push('Transcript_URL（正式Transcript）が未接続。');
    if (!signals.structureMemoRecorded) out.push('Structure_Memo が未記録。必要なら実際の放送順を記録する。');
    if (!signals.setlistMemoRecorded) out.push('Setlist_Memo が未記録。必要なら実際の曲順・FULL/BGM等を記録する。');
  }

  if ((statementCounts['候補'] || 0) > 0) {
    out.push('STATEMENTSに要確認候補がある。確定 / 見送りは人間判断。');
  }

  const openPublications = ['未着手', '下書き', '確認待ち', '公開準備済']
    .reduce((sum, s) => sum + (publicationCounts[s] || 0), 0);
  if (openPublications > 0) {
    out.push('PUBLICATIONSに未完了の公開作業がある。これは放送本体の完了を妨げる必須条件ではない。');
  }

  if (!out.length) {
    out.push('このAuditorが確認する範囲では、追加注意事項なし。Status変更は人間判断。');
  }

  return out;
}

function lifecycleV01ResolveEpisode_() {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_LIFECYCLE_AUDITOR_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = lifecycleV01QueryAll_(OC_LIFECYCLE_AUDITOR_V01.EPISODES_DS, {
      filter: {
        property: 'Episode_Key',
        title: { equals: requestedKey }
      },
      page_size: 10
    });
    if (pages.length !== 1) {
      throw new Error('OC_TARGET_EPISODE_KEY一致EPISODEが1件ではありません。key=' + requestedKey + ' count=' + pages.length);
    }
    return { episode: pages[0], mode: 'EXPLICIT_KEY', requestedKey: requestedKey };
  }

  const filters = OC_LIFECYCLE_AUDITOR_V01.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  const pages = lifecycleV01QueryAll_(OC_LIFECYCLE_AUDITOR_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 50
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');

  const today = lifecycleV01DateOnly_(new Date());
  const scored = pages
    .map(p => {
      const d = lifecycleV01DateStart_(p.properties['Recording_Date']);
      if (!d) return null;
      return { page: p, distance: Math.abs(lifecycleV01DaysBetween_(today, d.slice(0, 10))) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return {
    episode: scored.length ? scored[0].page : pages[0],
    mode: 'NEAREST_RECORDING_DATE',
    requestedKey: ''
  };
}

function lifecycleV01CountSelect_(pages, propertyName, knownStatuses) {
  const out = {};
  knownStatuses.forEach(x => out[x] = 0);
  out['未設定'] = 0;

  pages.forEach(p => {
    const v = lifecycleV01Select_(p.properties[propertyName]);
    if (!v) out['未設定'] += 1;
    else if (Object.prototype.hasOwnProperty.call(out, v)) out[v] += 1;
    else out[v] = (out[v] || 0) + 1;
  });
  return out;
}

function lifecycleV01RelationCount_(prop) {
  const arr = prop && prop.relation;
  return Array.isArray(arr) ? arr.length : 0;
}

function lifecycleV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') || p.getProperty('NOTION_TOKEN') || p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function lifecycleV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + lifecycleV01Token_(),
      'Notion-Version': OC_LIFECYCLE_AUDITOR_V01.NOTION_VERSION
    }
  };
  if (payload !== undefined && payload !== null) options.payload = JSON.stringify(payload);

  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion API ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function lifecycleV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = lifecycleV01Request_('post', '/data_sources/' + dataSourceId + '/query', req);
    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

function lifecycleV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function lifecycleV01Text_(prop) {
  if (!prop) return '';
  const a = prop.rich_text || prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function lifecycleV01UniqueOrText_(prop) {
  if (!prop) return '';
  if (prop.unique_id) {
    const prefix = prop.unique_id.prefix ? prop.unique_id.prefix + '-' : '';
    return prefix + String(prop.unique_id.number || '');
  }
  return lifecycleV01Text_(prop);
}

function lifecycleV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function lifecycleV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}

function lifecycleV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function lifecycleV01DateOnly_(date) {
  return Utilities.formatDate(date, OC_LIFECYCLE_AUDITOR_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function lifecycleV01DaysBetween_(a, b) {
  const am = String(a).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const bm = String(b).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!am || !bm) return 9999;
  const ad = Date.UTC(Number(am[1]), Number(am[2]) - 1, Number(am[3]));
  const bd = Date.UTC(Number(bm[1]), Number(bm[2]) - 1, Number(bm[3]));
  return Math.round((bd - ad) / 86400000);
}
