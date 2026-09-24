/**
 * OC-OS Episode Actuals Finalizer
 * v0.1.0-preview (2026-09-25)
 *
 * Purpose:
 * - Read STUDIO ITEMS for one target EPISODE.
 * - Treat only Studio_Status = "使用済" as actual on-air usage.
 * - Reflect used EVENT / SONG / SOURCE relations into EPISODES.
 *
 * Canonical safety:
 * - Does NOT change any STUDIO ITEM status.
 * - Does NOT infer usage from transcript, memo, candidate origin, or AI.
 * - Does NOT touch candidate / hold / rejected items.
 * - Does NOT touch Production_Status.
 * - Does NOT touch Structure_Memo or Setlist_Memo.
 * - MESSAGE actuals remain traceable through EPISODE -> STUDIO ITEMS -> Message,
 *   because EPISODES currently has no direct Messages relation.
 * - Existing EPISODE relations are preserved. Missing used relations are added.
 * - Existing relations that are not represented by used items are warned about,
 *   but never deleted automatically.
 * - No trigger is installed by this file.
 *
 * Script Properties:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_ACTUALS_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',

  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STUDIO_ITEMS_DS: '9591403b-709c-41cc-b3a6-1917b0042abf',

  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済'],
  MAX_EPISODES: 50
});

/** Read-only preview. */
function previewEpisodeActualsFinalizerV01() {
  const episode = actualsV01GetTargetEpisode_();
  const plan = actualsV01BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_ACTUALS_V01.VERSION,
    episodeKey: actualsV01Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: actualsV01DateStart_(episode.properties['Recording_Date']),
    productionStatus: actualsV01Select_(episode.properties['Production_Status']),

    studioItemCount: plan.allItems.length,
    studioStatusCounts: actualsV01CountBy_(plan.allItems, 'status'),
    usedItemCount: plan.usedItems.length,

    usedItems: plan.usedItems.map(x => ({
      material: x.material,
      materialType: x.materialType,
      usedOrder: x.usedOrder,
      eventId: x.eventId,
      messageId: x.messageId,
      songId: x.songId,
      sourceId: x.sourceId
    })),

    currentRelations: {
      Events: plan.current.eventIds,
      Songs: plan.current.songIds,
      Sources: plan.current.sourceIds
    },

    proposedRelations: {
      Events: plan.proposed.eventIds,
      Songs: plan.proposed.songIds,
      Sources: plan.proposed.sourceIds
    },

    additions: {
      Events: plan.additions.eventIds,
      Songs: plan.additions.songIds,
      Sources: plan.additions.sourceIds
    },

    usedMessages: plan.usedMessageIds,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS EPISODE ACTUALS FINALIZER PREVIEW');
  console.log('VERSION = ' + OC_ACTUALS_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));

  return out;
}

/**
 * Manual sync.
 * Adds only missing actual relations to EPISODES.
 * Existing relation values are preserved.
 */
function syncEpisodeActualsFinalizerV01() {
  const episode = actualsV01GetTargetEpisode_();
  const plan = actualsV01BuildPlan_(episode);
  const patch = {};
  const actions = [];

  if (plan.additions.eventIds.length) {
    patch['Events'] = actualsV01RelationProp_(plan.proposed.eventIds);
    actions.push('UPDATE Events');
  }

  if (plan.additions.songIds.length) {
    patch['Songs'] = actualsV01RelationProp_(plan.proposed.songIds);
    actions.push('UPDATE Songs');
  }

  if (plan.additions.sourceIds.length) {
    patch['Sources'] = actualsV01RelationProp_(plan.proposed.sourceIds);
    actions.push('UPDATE Sources');
  }

  if (!actions.length) {
    const out = {
      write: 'NONE',
      episodeKey: actualsV01Title_(episode.properties['Episode_Key']),
      usedItemCount: plan.usedItems.length,
      actions: [],
      warnings: plan.warnings
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  actualsV01PatchPage_(episode.id, patch);

  const out = {
    write: 'EPISODE_RELATIONS_ONLY',
    episodeKey: actualsV01Title_(episode.properties['Episode_Key']),
    usedItemCount: plan.usedItems.length,
    actions: actions,
    added: {
      Events: plan.additions.eventIds.length,
      Songs: plan.additions.songIds.length,
      Sources: plan.additions.sourceIds.length
    },
    usedMessages: plan.usedMessageIds.length,
    warnings: plan.warnings
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function actualsV01BuildPlan_(episode) {
  const pages = actualsV01QueryAll_(
    OC_ACTUALS_V01.STUDIO_ITEMS_DS,
    {
      filter: {
        property: 'Episode',
        relation: { contains: episode.id }
      },
      sorts: [
        { property: 'Used_Order', direction: 'ascending' },
        { timestamp: 'created_time', direction: 'ascending' }
      ],
      page_size: 100
    }
  );

  const allItems = pages.map(actualsV01StudioItemSummary_);
  const usedItems = allItems.filter(x => x.status === '使用済');

  const usedEventIds = actualsV01Unique_(
    usedItems.map(x => x.eventId).filter(Boolean)
  );
  const usedSongIds = actualsV01Unique_(
    usedItems.map(x => x.songId).filter(Boolean)
  );
  const usedSourceIds = actualsV01Unique_(
    usedItems.map(x => x.sourceId).filter(Boolean)
  );
  const usedMessageIds = actualsV01Unique_(
    usedItems.map(x => x.messageId).filter(Boolean)
  );

  const current = {
    eventIds: actualsV01RelationIds_(episode.properties['Events']),
    songIds: actualsV01RelationIds_(episode.properties['Songs']),
    sourceIds: actualsV01RelationIds_(episode.properties['Sources'])
  };

  const proposed = {
    eventIds: actualsV01Unique_(current.eventIds.concat(usedEventIds)),
    songIds: actualsV01Unique_(current.songIds.concat(usedSongIds)),
    sourceIds: actualsV01Unique_(current.sourceIds.concat(usedSourceIds))
  };

  const additions = {
    eventIds: usedEventIds.filter(id => current.eventIds.indexOf(id) < 0),
    songIds: usedSongIds.filter(id => current.songIds.indexOf(id) < 0),
    sourceIds: usedSourceIds.filter(id => current.sourceIds.indexOf(id) < 0)
  };

  const warnings = [];

  const currentEventNotUsed = current.eventIds.filter(id => usedEventIds.indexOf(id) < 0);
  const currentSongNotUsed = current.songIds.filter(id => usedSongIds.indexOf(id) < 0);
  const currentSourceNotUsed = current.sourceIds.filter(id => usedSourceIds.indexOf(id) < 0);

  if (currentEventNotUsed.length) {
    warnings.push(
      'EPISODES.Events contains relation(s) not represented by current 使用済 STUDIO ITEMS; preserved without deletion: ' +
      currentEventNotUsed.length
    );
  }

  if (currentSongNotUsed.length) {
    warnings.push(
      'EPISODES.Songs contains relation(s) not represented by current 使用済 STUDIO ITEMS; preserved without deletion: ' +
      currentSongNotUsed.length
    );
  }

  if (currentSourceNotUsed.length) {
    warnings.push(
      'EPISODES.Sources contains relation(s) not represented by current 使用済 STUDIO ITEMS; preserved without deletion: ' +
      currentSourceNotUsed.length
    );
  }

  usedItems.forEach(x => {
    if (
      x.materialType === 'EVENT' && !x.eventId ||
      x.materialType === 'SONG' && !x.songId ||
      x.materialType === 'SOURCE' && !x.sourceId ||
      x.materialType === 'MESSAGE' && !x.messageId
    ) {
      warnings.push(
        '使用済 item has Material_Type=' + x.materialType +
        ' but no matching relation: ' + x.material
      );
    }
  });

  return {
    allItems: allItems,
    usedItems: usedItems,
    usedMessageIds: usedMessageIds,
    current: current,
    proposed: proposed,
    additions: additions,
    warnings: warnings
  };
}

function actualsV01StudioItemSummary_(page) {
  const p = page.properties || {};

  return {
    id: page.id,
    material: actualsV01Title_(p['Material']),
    materialType: actualsV01Select_(p['Material_Type']) || 'OTHER',
    status: actualsV01Select_(p['Studio_Status']) || '',
    usedOrder: actualsV01Number_(p['Used_Order']),
    eventId: actualsV01RelationIds_(p['Event'])[0] || '',
    messageId: actualsV01RelationIds_(p['Message'])[0] || '',
    songId: actualsV01RelationIds_(p['Song'])[0] || '',
    sourceId: actualsV01RelationIds_(p['Source'])[0] || ''
  };
}

function actualsV01CountBy_(rows, key) {
  const out = {};
  rows.forEach(x => {
    const k = String(x[key] || '(blank)');
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function actualsV01Unique_(ids) {
  const seen = {};
  const out = [];

  ids.forEach(id => {
    if (!id || seen[id]) return;
    seen[id] = true;
    out.push(id);
  });

  return out;
}

/* =========================================================
 * TARGET EPISODE
 * ========================================================= */

function actualsV01GetTargetEpisode_() {
  const filters = OC_ACTUALS_V01.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  const pages = actualsV01QueryAll_(
    OC_ACTUALS_V01.EPISODES_DS,
    {
      filter: { or: filters },
      sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
      page_size: OC_ACTUALS_V01.MAX_EPISODES
    }
  );

  if (!pages.length) {
    throw new Error('対象EPISODEがありません。');
  }

  const today = actualsV01DateOnly_(new Date());

  const scored = pages
    .map(p => {
      const d = actualsV01DateStart_(p.properties['Recording_Date']);
      if (!d) return null;

      return {
        page: p,
        distance: Math.abs(actualsV01DaysBetween_(today, d.slice(0, 10)))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return scored.length ? scored[0].page : pages[0];
}

function actualsV01DateOnly_(date) {
  return Utilities.formatDate(date, OC_ACTUALS_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function actualsV01DaysBetween_(a, b) {
  const am = String(a).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const bm = String(b).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!am || !bm) return 9999;

  const ad = Date.UTC(Number(am[1]), Number(am[2]) - 1, Number(am[3]));
  const bd = Date.UTC(Number(bm[1]), Number(bm[2]) - 1, Number(bm[3]));

  return Math.round((bd - ad) / 86400000);
}

/* =========================================================
 * NOTION
 * ========================================================= */

function actualsV01Token_() {
  const p = PropertiesService.getScriptProperties();

  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');

  if (!token) {
    throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  }

  return token;
}

function actualsV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + actualsV01Token_(),
      'Notion-Version': OC_ACTUALS_V01.NOTION_VERSION
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

function actualsV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = actualsV01Request_(
      'post',
      '/data_sources/' + dataSourceId + '/query',
      req
    );

    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  return out;
}

function actualsV01PatchPage_(pageId, properties) {
  return actualsV01Request_(
    'patch',
    '/pages/' + pageId,
    { properties: properties }
  );
}

/* =========================================================
 * PROPERTY HELPERS
 * ========================================================= */

function actualsV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function actualsV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function actualsV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function actualsV01Number_(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}

function actualsV01RelationIds_(prop) {
  const a = prop && prop.relation;
  return Array.isArray(a) ? a.map(x => x.id).filter(Boolean) : [];
}

function actualsV01RelationProp_(ids) {
  return {
    relation: actualsV01Unique_(ids).map(id => ({ id: id }))
  };
}
