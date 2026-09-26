/**
 * OC-OS EPISODE Completion Gate
 * v0.1.0-preview (2026-09-26)
 *
 * Read-only eligibility check for:
 * - 放送済 -> アーカイブ処理済
 * - アーカイブ処理済 -> 完了
 *
 * This module NEVER changes Production_Status or any other property.
 * Human decides every status transition.
 *
 * Script Properties:
 * - OC_TARGET_EPISODE_KEY recommended
 * - NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET
 *
 * Optional dependency:
 * - oc_os_episode_actuals_finalizer_v0.1.0.gs
 */

const OC_COMPLETION_GATE_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STUDIO_ITEMS_DS: '9591403b-709c-41cc-b3a6-1917b0042abf',
  STATEMENTS_DS: '0019d30d-da69-4c8d-a24a-07ee4573fb4f',
  PUBLICATIONS_DS: 'f192f616-6d18-44b3-a591-825ee285283b',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  UNRESOLVED_PUBLICATION_STATUSES: [
    '未着手',
    '下書き',
    '確認待ち',
    '公開準備済'
  ]
});

function previewEpisodeCompletionGateV01() {
  const resolved = completionV01ResolveEpisode_();
  const episode = resolved.episode;
  const p = episode.properties || {};

  const studioItems = completionV01QueryRelated_(
    OC_COMPLETION_GATE_V01.STUDIO_ITEMS_DS,
    'Episode',
    episode.id
  );
  const statements = completionV01QueryRelated_(
    OC_COMPLETION_GATE_V01.STATEMENTS_DS,
    'Episode',
    episode.id
  );
  const publications = completionV01QueryRelated_(
    OC_COMPLETION_GATE_V01.PUBLICATIONS_DS,
    'Episode',
    episode.id
  );

  const studioCounts = completionV01CountSelect_(studioItems, 'Studio_Status');
  const statementCounts = completionV01CountSelect_(statements, 'Review_Status');
  const publicationCounts = completionV01CountSelect_(publications, 'Publication_Status');

  const actuals = typeof actualsV01BuildPlan_ === 'function'
    ? actualsV01BuildPlan_(episode)
    : null;

  const archiveChecks = [];
  completionV01AddCheck_(
    archiveChecks,
    'AUDIO_URL',
    !!completionV01Url_(p['Audio_URL']),
    'Audio_URLがCanonical MASTERへ接続されている'
  );
  completionV01AddCheck_(
    archiveChecks,
    'TRANSCRIPT_URL',
    !!completionV01Url_(p['Transcript_URL']),
    'Transcript_URLが正式Transcriptへ接続されている'
  );
  completionV01AddCheck_(
    archiveChecks,
    'NO_STUDIO_CANDIDATES',
    (studioCounts['候補'] || 0) === 0,
    'STUDIO ITEMSに未判断の「候補」が残っていない',
    { count: studioCounts['候補'] || 0 }
  );

  if (actuals) {
    const pendingActualRelations =
      (actuals.additions.eventIds || []).length +
      (actuals.additions.songIds || []).length +
      (actuals.additions.sourceIds || []).length;

    completionV01AddCheck_(
      archiveChecks,
      'ACTUAL_RELATIONS_SYNCED',
      pendingActualRelations === 0,
      '使用済STUDIO ITEMSに由来するEvents/Songs/Sourcesの不足Relationがない',
      {
        pendingEvents: (actuals.additions.eventIds || []).length,
        pendingSongs: (actuals.additions.songIds || []).length,
        pendingSources: (actuals.additions.sourceIds || []).length
      }
    );
  } else {
    archiveChecks.push({
      code: 'ACTUAL_RELATIONS_SYNCED',
      ok: null,
      level: 'UNKNOWN',
      message: 'Episode Actuals Finalizer未読込のためRelation同期状態を判定できない。'
    });
  }

  completionV01AddCheck_(
    archiveChecks,
    'STRUCTURE_MEMO',
    !!completionV01RichText_(p['Structure_Memo']).trim(),
    'Structure_Memoに実際の番組構成が記録されている'
  );
  completionV01AddCheck_(
    archiveChecks,
    'SETLIST_MEMO',
    !!completionV01RichText_(p['Setlist_Memo']).trim(),
    'Setlist_Memoに実際の曲順・役割が記録されている'
  );

  const archiveReady = archiveChecks.every(x => x.ok === true);

  const completionChecks = [];
  completionV01AddCheck_(
    completionChecks,
    'ARCHIVE_GATE',
    archiveReady,
    'Archive Gateがすべて満たされている'
  );
  completionV01AddCheck_(
    completionChecks,
    'STATEMENTS_RESOLVED',
    (statementCounts['候補'] || 0) === 0,
    'STATEMENTSの候補がすべて確定または見送りになっている',
    { pendingCandidates: statementCounts['候補'] || 0 }
  );

  const unresolvedPublications = OC_COMPLETION_GATE_V01.UNRESOLVED_PUBLICATION_STATUSES
    .reduce((sum, status) => sum + (publicationCounts[status] || 0), 0);

  completionV01AddCheck_(
    completionChecks,
    'PUBLICATIONS_RESOLVED',
    unresolvedPublications === 0,
    'PUBLICATIONSに未着手・下書き・確認待ち・公開準備済が残っていない',
    { unresolvedCount: unresolvedPublications }
  );

  const publicationMetadataIssues = publications
    .map(page => {
      const props = page.properties || {};
      const status = completionV01Select_(props['Publication_Status']);
      if (status !== '公開済') return null;
      const missing = [];
      if (!completionV01Url_(props['Public_URL'])) missing.push('Public_URL');
      if (!completionV01DateStart_(props['Published_At'])) missing.push('Published_At');
      return missing.length
        ? {
            id: page.id,
            title: completionV01Title_(props['Publication']),
            missing: missing
          }
        : null;
    })
    .filter(Boolean);

  completionV01AddCheck_(
    completionChecks,
    'PUBLISHED_METADATA',
    publicationMetadataIssues.length === 0,
    '公開済PUBLICATIONにPublic_URL / Published_Atが記録されている',
    { issues: publicationMetadataIssues }
  );

  const completionReady = completionChecks.every(x => x.ok === true);
  const productionStatus = completionV01Select_(p['Production_Status']);

  const out = {
    write: 'NONE',
    version: OC_COMPLETION_GATE_V01.VERSION,
    targetMode: resolved.mode,
    episode: {
      id: episode.id,
      key: completionV01Title_(p['Episode_Key']),
      productionStatus: productionStatus,
      recordingDate: completionV01DateStart_(p['Recording_Date']),
      airDate: completionV01DateStart_(p['Air_Date'])
    },
    archiveGate: {
      ready: archiveReady,
      checks: archiveChecks,
      eligibleStatusTransition:
        productionStatus === '放送済' && archiveReady
          ? '放送済 → アーカイブ処理済（人間判断）'
          : ''
    },
    completionGate: {
      ready: completionReady,
      checks: completionChecks,
      eligibleStatusTransition:
        productionStatus === 'アーカイブ処理済' && completionReady
          ? 'アーカイブ処理済 → 完了（人間判断）'
          : ''
    },
    counts: {
      studioItems: studioItems.length,
      studioStatus: studioCounts,
      statements: statements.length,
      statementStatus: statementCounts,
      publications: publications.length,
      publicationStatus: publicationCounts
    },
    note: 'ready=trueでもProduction_Statusは自動変更しない。最終判断はあさくらじゅん。'
  };

  console.log('========================================');
  console.log('OC-OS EPISODE COMPLETION GATE');
  console.log('VERSION = ' + OC_COMPLETION_GATE_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function completionV01AddCheck_(list, code, ok, message, details) {
  list.push({
    code: code,
    ok: ok,
    level: ok === true ? 'OK' : ok === false ? 'BLOCK' : 'UNKNOWN',
    message: message,
    details: details || null
  });
}

/* =========================================================
 * TARGET
 * ========================================================= */

function completionV01ResolveEpisode_() {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_COMPLETION_GATE_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = completionV01QueryAll_(OC_COMPLETION_GATE_V01.EPISODES_DS, {
      filter: {
        property: 'Episode_Key',
        title: { equals: requestedKey }
      },
      page_size: 10
    });
    if (pages.length !== 1) {
      throw new Error(
        'OC_TARGET_EPISODE_KEY一致EPISODEが1件ではありません。key=' +
        requestedKey + ' count=' + pages.length
      );
    }
    return { episode: pages[0], mode: 'EXPLICIT_KEY' };
  }

  const pages = completionV01QueryAll_(OC_COMPLETION_GATE_V01.EPISODES_DS, {
    sorts: [{ property: 'Air_Date', direction: 'descending' }],
    page_size: 10
  });
  if (!pages.length) throw new Error('EPISODEがありません。');

  const preferred = pages.find(page => {
    const status = completionV01Select_(page.properties['Production_Status']);
    return status === '放送済' || status === 'アーカイブ処理済';
  });

  return {
    episode: preferred || pages[0],
    mode: preferred ? 'LATEST_ARCHIVE_TARGET' : 'LATEST_EPISODE_PREVIEW'
  };
}

/* =========================================================
 * QUERIES
 * ========================================================= */

function completionV01QueryRelated_(dataSourceId, relationProperty, pageId) {
  return completionV01QueryAll_(dataSourceId, {
    filter: {
      property: relationProperty,
      relation: { contains: pageId }
    },
    page_size: 100
  });
}

function completionV01CountSelect_(pages, propertyName) {
  const out = {};
  (pages || []).forEach(page => {
    const props = page.properties || {};
    const key = completionV01Select_(props[propertyName]) || '(blank)';
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

/* =========================================================
 * NOTION API
 * ========================================================= */

function completionV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function completionV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + completionV01Token_(),
      'Notion-Version': OC_COMPLETION_GATE_V01.NOTION_VERSION
    }
  };
  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Notion API ' + code + ': ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function completionV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = completionV01Request_(
      'post',
      '/data_sources/' + dataSourceId + '/query',
      req
    );
    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

/* =========================================================
 * PROPERTY HELPERS
 * ========================================================= */

function completionV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function completionV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function completionV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function completionV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}

function completionV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}
