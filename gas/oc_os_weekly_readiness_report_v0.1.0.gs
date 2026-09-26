/**
 * OC-OS Weekly Readiness Report
 * v0.1.0-preview (2026-09-26)
 *
 * Read-only status report for one EPISODE.
 * This module NEVER changes Notion, Drive, Studio Items, or Production_Status.
 * Missing signals are not treated as a reason to stop Wednesday recording.
 *
 * Optional dependencies in the same Apps Script project:
 * - oc_os_episode_actuals_finalizer_v0.1.0.gs
 * - oc_os_post_recording_intake_v0.2.0.gs
 * - oc_os_transcript_materializer_v0.1.0.gs
 *
 * Script Property:
 * - OC_TARGET_EPISODE_KEY (recommended; preview can fall back)
 * - NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET
 */

const OC_READINESS_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STATEMENTS_DS: '0019d30d-da69-4c8d-a24a-07ee4573fb4f',
  PUBLICATIONS_DS: 'f192f616-6d18-44b3-a591-825ee285283b',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY'
});

function reportWeeklyReadinessV01() {
  const resolved = readinessV01ResolveEpisode_();
  const episode = resolved.episode;
  const episodeKey = readinessV01Title_(episode.properties['Episode_Key']);

  const post = typeof postV02BuildPlan_ === 'function'
    ? postV02BuildPlan_(episode)
    : null;
  const transcript = typeof transcriptV01BuildPlan_ === 'function'
    ? transcriptV01BuildPlan_(episode)
    : null;
  const actuals = typeof actualsV01BuildPlan_ === 'function'
    ? actualsV01BuildPlan_(episode)
    : null;

  const statements = readinessV01QueryRelated_(
    OC_READINESS_V01.STATEMENTS_DS,
    'Episode',
    episode.id
  );
  const publications = readinessV01QueryRelated_(
    OC_READINESS_V01.PUBLICATIONS_DS,
    'Episode',
    episode.id
  );

  const statementCounts = readinessV01CountSelect_(statements, 'Review_Status');
  const publicationCounts = readinessV01CountSelect_(publications, 'Publication_Status');
  const studioStatusCounts = actuals
    ? readinessV01CountPlain_(actuals.allItems || [], 'status')
    : {};

  const report = {
    write: 'NONE',
    version: OC_READINESS_V01.VERSION,
    targetMode: resolved.mode,
    episode: {
      key: episodeKey,
      pageId: episode.id,
      productionStatus: readinessV01Select_(episode.properties['Production_Status']),
      recordingDate: readinessV01DateStart_(episode.properties['Recording_Date']),
      airDate: readinessV01DateStart_(episode.properties['Air_Date']),
      studioPackUrl: readinessV01Url_(episode.properties['Studio_Pack_URL']),
      audioUrl: readinessV01Url_(episode.properties['Audio_URL']),
      transcriptUrl: readinessV01Url_(episode.properties['Transcript_URL'])
    },
    preRecording: {
      studioPackExists: !!readinessV01Url_(episode.properties['Studio_Pack_URL']),
      studioItemCount: actuals ? (actuals.allItems || []).length : null,
      studioStatusCounts: studioStatusCounts,
      note: 'Missing items here do not block recording. System-free recording remains valid.'
    },
    postRecording: {
      masterCandidateCount: post ? (post.masterCandidates || []).length : null,
      proxyCandidateCount: post ? (post.proxyCandidates || []).length : null,
      speechStemCandidateCount: post ? (post.speechCandidates || []).length : null,
      formalTranscriptCount: transcript
        ? (transcript.formalTranscriptCandidates || []).length
        : null,
      cleanHhaCandidateCount: transcript
        ? (transcript.cleanHhaCandidates || []).length
        : null,
      audioUrlConnected: !!readinessV01Url_(episode.properties['Audio_URL']),
      transcriptUrlConnected: !!readinessV01Url_(episode.properties['Transcript_URL']),
      usedStudioItemCount: actuals ? (actuals.usedItems || []).length : null
    },
    statements: {
      total: statements.length,
      byStatus: statementCounts,
      needsHumanReview: statementCounts['候補'] || 0
    },
    publications: {
      total: publications.length,
      byStatus: publicationCounts,
      draftOrReviewCount:
        (publicationCounts['下書き'] || 0) +
        (publicationCounts['確認待ち'] || 0),
      readyToPublishCount: publicationCounts['公開準備済'] || 0,
      publishedCount: publicationCounts['公開済'] || 0
    },
    signals: readinessV01BuildSignals_(
      episode,
      post,
      transcript,
      actuals,
      statementCounts,
      publicationCounts
    )
  };

  console.log('========================================');
  console.log('OC-OS WEEKLY READINESS REPORT');
  console.log('VERSION = ' + OC_READINESS_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function readinessV01BuildSignals_(
  episode,
  post,
  transcript,
  actuals,
  statementCounts,
  publicationCounts
) {
  const signals = [];
  const status = readinessV01Select_(episode.properties['Production_Status']);

  signals.push({
    level: 'INFO',
    code: 'RECORDING_CONTINUITY',
    message: 'Notion/GASの状態に関係なく、水曜収録は継続可能。'
  });

  if (!readinessV01Url_(episode.properties['Studio_Pack_URL'])) {
    signals.push({
      level: 'NOTICE',
      code: 'NO_STUDIO_PACK',
      message: 'Studio Pack未生成。通常のNotion運用が使える限り収録阻害条件ではない。'
    });
  }

  if (status === '収録済' || status === '放送済' || status === 'アーカイブ処理済') {
    if (post && (post.masterCandidates || []).length !== 1) {
      signals.push({
        level: 'ACTION',
        code: 'MASTER_NOT_UNIQUE',
        message: 'AUDIO/MASTERの完成音源が1件に確定していない。'
      });
    }
    if (transcript && (transcript.formalTranscriptCandidates || []).length !== 1) {
      signals.push({
        level: 'ACTION',
        code: 'FORMAL_TRANSCRIPT_NOT_UNIQUE',
        message: '正式Transcript Google Docが1件に確定していない。'
      });
    }
  }

  if ((statementCounts['候補'] || 0) > 0) {
    signals.push({
      level: 'REVIEW',
      code: 'STATEMENTS_REVIEW',
      message: 'STATEMENTS候補が人間確認待ち。count=' + statementCounts['候補']
    });
  }

  if ((publicationCounts['確認待ち'] || 0) > 0) {
    signals.push({
      level: 'REVIEW',
      code: 'PUBLICATION_REVIEW',
      message: 'PUBLICATIONSに確認待ちがある。count=' + publicationCounts['確認待ち']
    });
  }

  if ((publicationCounts['公開準備済'] || 0) > 0) {
    signals.push({
      level: 'ACTION',
      code: 'PUBLICATION_READY',
      message: '公開準備済のPUBLICATIONがある。公開は人間判断で実施する。count=' +
        publicationCounts['公開準備済']
    });
  }

  if (actuals && !(actuals.allItems || []).length) {
    signals.push({
      level: 'NOTICE',
      code: 'NO_STUDIO_ITEMS',
      message: '対象EPISODEにSTUDIO ITEMSがない。収録前なら正常。'
    });
  }

  return signals;
}

/* =========================================================
 * TARGET EPISODE
 * ========================================================= */

function readinessV01ResolveEpisode_() {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_READINESS_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = readinessV01QueryAll_(OC_READINESS_V01.EPISODES_DS, {
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

  if (typeof postV02GetTargetEpisode_ === 'function') {
    return { episode: postV02GetTargetEpisode_(), mode: 'NEAREST_RECORDING_DATE' };
  }

  const pages = readinessV01QueryAll_(OC_READINESS_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 10
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'LATEST_EPISODE' };
}

/* =========================================================
 * COUNTS
 * ========================================================= */

function readinessV01QueryRelated_(dataSourceId, relationProperty, pageId) {
  return readinessV01QueryAll_(dataSourceId, {
    filter: {
      property: relationProperty,
      relation: { contains: pageId }
    },
    page_size: 100
  });
}

function readinessV01CountSelect_(pages, propertyName) {
  const out = {};
  (pages || []).forEach(p => {
    const props = p.properties || {};
    const name = readinessV01Select_(props[propertyName]);
    const key = name || '(blank)';
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function readinessV01CountPlain_(rows, propertyName) {
  const out = {};
  (rows || []).forEach(row => {
    const key = String((row && row[propertyName]) || '(blank)');
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

/* =========================================================
 * NOTION
 * ========================================================= */

function readinessV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function readinessV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + readinessV01Token_(),
      'Notion-Version': OC_READINESS_V01.NOTION_VERSION
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

function readinessV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = readinessV01Request_(
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

function readinessV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function readinessV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function readinessV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}

function readinessV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}
