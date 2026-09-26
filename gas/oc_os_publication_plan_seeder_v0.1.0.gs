/**
 * OC-OS PUBLICATIONS Plan Seeder
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Create weekly PUBLICATIONS work slots only.
 * - Does NOT create copy/content, schedule publication, or publish externally.
 * - Does NOT change EPISODES.Production_Status.
 *
 * Required Script Properties:
 * - NOTION_API_TOKEN (preferred; NOTION_TOKEN / NOTION_SECRET fallback)
 * - OC_TARGET_EPISODE_KEY for WRITE
 */

const OC_PUBLICATION_SEEDER_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  PUBLICATIONS_DS: 'f192f616-6d18-44b3-a591-825ee285283b',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  DEFAULT_PLAN: [
    {
      keySuffix: 'TALK_AUDIO',
      label: 'トーク音声',
      outputType: 'トーク音声',
      platform: 'Spotify'
    },
    {
      keySuffix: 'SHOW_NOTES',
      label: 'ショーノート',
      outputType: 'ショーノート',
      platform: 'note'
    },
    {
      keySuffix: 'SOCIAL_PRIMARY',
      label: 'SNS投稿',
      outputType: 'SNS投稿',
      platform: '未定'
    },
    {
      keySuffix: 'AUDIOGRAM_PRIMARY',
      label: 'オーディオグラム',
      outputType: 'オーディオグラム',
      platform: '未定'
    }
  ]
});

/** Read-only preview. */
function previewPublicationPlanV01() {
  const resolved = pubSeedV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const plan = pubSeedV01BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_PUBLICATION_SEEDER_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: pubSeedV01Title_(episode.properties['Episode_Key']),
    existingCount: plan.existing.length,
    items: plan.items,
    createCount: plan.items.filter(x => x.action === 'CREATE').length
  };

  console.log('========================================');
  console.log('OC-OS PUBLICATION PLAN PREVIEW');
  console.log('VERSION = ' + OC_PUBLICATION_SEEDER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Create missing default work slots.
 * WRITE requires explicit OC_TARGET_EPISODE_KEY.
 */
function seedPublicationPlanV01() {
  const resolved = pubSeedV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const plan = pubSeedV01BuildPlan_(episode);
  const created = [];
  const skipped = [];

  plan.items.forEach(item => {
    if (item.action === 'SKIP_EXISTING') {
      skipped.push({
        publicationKey: item.publicationKey,
        title: item.title,
        reason: 'existing'
      });
      return;
    }

    const page = pubSeedV01Request_('post', '/pages', {
      parent: { data_source_id: OC_PUBLICATION_SEEDER_V01.PUBLICATIONS_DS },
      properties: {
        Publication: pubSeedV01TitleProp_(item.title),
        Publication_Key: pubSeedV01RichTextProp_(item.publicationKey),
        Episode: { relation: [{ id: episode.id }] },
        Output_Type: { select: { name: item.outputType } },
        Platform: { select: { name: item.platform } },
        Publication_Status: { select: { name: '未着手' } }
      }
    });

    created.push({
      publicationKey: item.publicationKey,
      title: item.title,
      pageId: page.id,
      url: page.url || ''
    });
  });

  const out = {
    write: 'PUBLICATION_PLAN_CREATED',
    version: OC_PUBLICATION_SEEDER_V01.VERSION,
    episodeKey: pubSeedV01Title_(episode.properties['Episode_Key']),
    createdCount: created.length,
    skippedCount: skipped.length,
    created: created,
    skipped: skipped,
    nextAction: '必要な成果物だけ進め、不要な枠は人間が見送りにする。'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function pubSeedV01BuildPlan_(episode) {
  const episodeKey = pubSeedV01Title_(episode.properties['Episode_Key']);
  if (!episodeKey) throw new Error('Episode_Key missing');

  const existing = pubSeedV01QueryAll_(OC_PUBLICATION_SEEDER_V01.PUBLICATIONS_DS, {
    filter: {
      property: 'Episode',
      relation: { contains: episode.id }
    },
    page_size: 100
  });

  const existingKeys = {};
  const existingTitles = {};

  existing.forEach(p => {
    const key = pubSeedV01RichText_(p.properties['Publication_Key']);
    const title = pubSeedV01Title_(p.properties['Publication']);
    if (key) existingKeys[key] = true;
    if (title) existingTitles[title] = true;
  });

  const items = OC_PUBLICATION_SEEDER_V01.DEFAULT_PLAN.map(slot => {
    const title = episodeKey + '｜' + slot.label;
    const publicationKey = pubSeedV01PublicationKey_(episodeKey, slot.keySuffix);
    return {
      publicationKey: publicationKey,
      keySuffix: slot.keySuffix,
      title: title,
      outputType: slot.outputType,
      platform: slot.platform,
      action:
        existingKeys[publicationKey] || existingTitles[title]
          ? 'SKIP_EXISTING'
          : 'CREATE'
    };
  });

  return { existing: existing, items: items };
}

function pubSeedV01PublicationKey_(episodeKey, keySuffix) {
  return 'PUBPLAN|' + String(episodeKey || '').trim() + '|' +
    String(keySuffix || '').trim();
}

/* =========================================================
 * EPISODE TARGET
 * ========================================================= */

function pubSeedV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_PUBLICATION_SEEDER_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = pubSeedV01QueryAll_(OC_PUBLICATION_SEEDER_V01.EPISODES_DS, {
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

    return { episode: pages[0], mode: 'EXPLICIT_KEY', requestedKey: requestedKey };
  }

  if (requireExplicit) {
    throw new Error('WRITEには Script Property OC_TARGET_EPISODE_KEY が必要です。');
  }

  if (typeof postV02GetTargetEpisode_ === 'function') {
    return {
      episode: postV02GetTargetEpisode_(),
      mode: 'NEAREST_RECORDING_DATE_PREVIEW',
      requestedKey: ''
    };
  }

  const pages = pubSeedV01QueryAll_(OC_PUBLICATION_SEEDER_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 10
  });

  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'LATEST_EPISODE_PREVIEW', requestedKey: '' };
}

/* =========================================================
 * NOTION
 * ========================================================= */

function pubSeedV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function pubSeedV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + pubSeedV01Token_(),
      'Notion-Version': OC_PUBLICATION_SEEDER_V01.NOTION_VERSION
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

function pubSeedV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = pubSeedV01Request_(
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

function pubSeedV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubSeedV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubSeedV01TitleProp_(text) {
  return {
    title: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }]
  };
}

function pubSeedV01RichTextProp_(text) {
  const s = String(text || '');
  return s
    ? { rich_text: [{ type: 'text', text: { content: s.slice(0, 2000) } }] }
    : { rich_text: [] };
}
