/**
 * OC-OS Weekly Episode Bootstrap
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Ensure there is one upcoming EPISODE container for the next weekly cycle.
 * - Create the matching Drive episode folder skeleton.
 * - Never decide content, candidates, songs, messages, or publication plans.
 *
 * Canonical cadence:
 * - Air day: Sunday
 * - Recording day: Wednesday (Air_Date - 4 days)
 * - Episode_Key: Air_Date in yyyy-MM-dd
 *
 * Safety:
 * - If an active upcoming EPISODE already exists (準備中 / 収録準備済), create nothing.
 * - The next date is derived only from the latest existing EPISODE Air_Date + 7 days.
 * - Existing Drive folder with the exact Episode_Key is reused only when unique.
 * - Multiple same-name Drive folders => BLOCK.
 * - Existing same-key Notion EPISODE => reuse/stop, never duplicate.
 * - Episode_No is NOT inferred or incremented automatically.
 * - No Production_Status other than the newly-created row's initial 準備中 is changed.
 * - No trigger is installed automatically.
 *
 * Required Script Property for WRITE:
 * - NOTION_API_TOKEN (preferred; NOTION_TOKEN / NOTION_SECRET fallback)
 *
 * Canonical Drive root:
 * - EPISODES folder: 1M7ds-mIVpDCwTbFecvlSIIZAj2tAO5H8
 */

const OC_WEEKLY_BOOTSTRAP_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  EPISODES_ROOT_FOLDER_ID: '1M7ds-mIVpDCwTbFecvlSIIZAj2tAO5H8',
  ACTIVE_STATUSES: ['準備中', '収録準備済'],
  INITIAL_STATUS: '準備中'
});

/** Read-only preview. */
function previewWeeklyEpisodeBootstrapV01() {
  const plan = weeklyBootV01BuildPlan_();

  const out = {
    write: 'NONE',
    version: OC_WEEKLY_BOOTSTRAP_V01.VERSION,
    action: plan.action,
    reason: plan.reason,
    activeEpisodes: plan.activeEpisodes.map(weeklyBootV01EpisodeSummary_),
    latestEpisode: plan.latestEpisode
      ? weeklyBootV01EpisodeSummary_(plan.latestEpisode)
      : null,
    proposed: plan.proposed,
    drive: plan.drive,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS WEEKLY EPISODE BOOTSTRAP PREVIEW');
  console.log('VERSION = ' + OC_WEEKLY_BOOTSTRAP_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Create the next EPISODE only when no active upcoming EPISODE exists.
 * Safe to rerun after a partial Drive-folder creation.
 */
function createNextWeeklyEpisodeV01() {
  const plan = weeklyBootV01BuildPlan_();

  if (plan.action !== 'CREATE_NEXT_EPISODE') {
    const out = {
      write: 'NONE',
      version: OC_WEEKLY_BOOTSTRAP_V01.VERSION,
      action: plan.action,
      reason: plan.reason,
      activeEpisodes: plan.activeEpisodes.map(weeklyBootV01EpisodeSummary_),
      proposed: plan.proposed,
      warnings: plan.warnings
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  if (!plan.proposed || !plan.proposed.episodeKey) {
    throw new Error('proposed EPISODE is missing');
  }

  const existingSameKey = weeklyBootV01FindEpisodeByKey_(plan.proposed.episodeKey);
  if (existingSameKey.length > 1) {
    throw new Error(
      '同一Episode_KeyのEPISODEが複数あります。key=' +
      plan.proposed.episodeKey + ' count=' + existingSameKey.length
    );
  }
  if (existingSameKey.length === 1) {
    const out = {
      write: 'NONE',
      version: OC_WEEKLY_BOOTSTRAP_V01.VERSION,
      action: 'SKIP_EXISTING_EPISODE_KEY',
      episode: weeklyBootV01EpisodeSummary_(existingSameKey[0])
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  const root = DriveApp.getFolderById(OC_WEEKLY_BOOTSTRAP_V01.EPISODES_ROOT_FOLDER_ID);
  const episodeFolder = weeklyBootV01GetOrCreateUniqueChild_(root, plan.proposed.episodeKey);
  const studioFolder = weeklyBootV01GetOrCreateUniqueChild_(episodeFolder, 'STUDIO');
  const audioFolder = weeklyBootV01GetOrCreateUniqueChild_(episodeFolder, 'AUDIO');
  const masterFolder = weeklyBootV01GetOrCreateUniqueChild_(audioFolder, 'MASTER');
  const proxyFolder = weeklyBootV01GetOrCreateUniqueChild_(audioFolder, 'TRANSCRIPTION_PROXY');
  const speechFolder = weeklyBootV01GetOrCreateUniqueChild_(audioFolder, 'SPEECH_STEM');
  const transcriptFolder = weeklyBootV01GetOrCreateUniqueChild_(episodeFolder, 'TRANSCRIPT');
  const machineFolder = weeklyBootV01GetOrCreateUniqueChild_(transcriptFolder, 'MACHINE');

  const page = weeklyBootV01Request_('post', '/pages', {
    parent: { data_source_id: OC_WEEKLY_BOOTSTRAP_V01.EPISODES_DS },
    properties: {
      Episode_Key: weeklyBootV01TitleProp_(plan.proposed.episodeKey),
      Air_Date: {
        date: { start: plan.proposed.airDate }
      },
      Recording_Date: {
        date: { start: plan.proposed.recordingDate }
      },
      Production_Status: {
        select: { name: OC_WEEKLY_BOOTSTRAP_V01.INITIAL_STATUS }
      },
      Episode_Folder_URL: {
        url: episodeFolder.getUrl()
      }
    }
  });

  const out = {
    write: 'EPISODE_AND_DRIVE_SKELETON_CREATED',
    version: OC_WEEKLY_BOOTSTRAP_V01.VERSION,
    episode: {
      pageId: page.id,
      url: page.url || '',
      episodeKey: plan.proposed.episodeKey,
      recordingDate: plan.proposed.recordingDate,
      airDate: plan.proposed.airDate,
      productionStatus: OC_WEEKLY_BOOTSTRAP_V01.INITIAL_STATUS
    },
    drive: {
      episodeFolder: weeklyBootV01FolderSummary_(episodeFolder),
      studioFolder: weeklyBootV01FolderSummary_(studioFolder),
      audioFolder: weeklyBootV01FolderSummary_(audioFolder),
      masterFolder: weeklyBootV01FolderSummary_(masterFolder),
      proxyFolder: weeklyBootV01FolderSummary_(proxyFolder),
      speechFolder: weeklyBootV01FolderSummary_(speechFolder),
      transcriptFolder: weeklyBootV01FolderSummary_(transcriptFolder),
      machineFolder: weeklyBootV01FolderSummary_(machineFolder)
    },
    nextAction: 'Studio Candidate Seeder can now use this EPISODE when it becomes the active upcoming cycle.'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Optional daily trigger installer.
 * Do not install during initial Pilot unless intentionally approved.
 * The handler is idempotent at the active-episode level.
 */
function installWeeklyEpisodeBootstrapTriggerV01() {
  const handler = 'createNextWeeklyEpisodeV01';

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .inTimezone(OC_WEEKLY_BOOTSTRAP_V01.TIME_ZONE)
    .create();

  const result = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .map(t => ({
      handler: t.getHandlerFunction(),
      eventType: String(t.getEventType()),
      source: String(t.getTriggerSource())
    }));

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function weeklyBootV01BuildPlan_() {
  const activeEpisodes = weeklyBootV01GetActiveEpisodes_();
  const latestEpisode = weeklyBootV01GetLatestEpisode_();
  const warnings = [];

  if (activeEpisodes.length > 1) {
    warnings.push(
      'Active EPISODEが複数あります。自動作成は行いません。count=' +
      activeEpisodes.length
    );
    return {
      action: 'BLOCK_MULTIPLE_ACTIVE_EPISODES',
      reason: '準備中 / 収録準備済 のEPISODEが複数存在するため。',
      activeEpisodes: activeEpisodes,
      latestEpisode: latestEpisode,
      proposed: null,
      drive: null,
      warnings: warnings
    };
  }

  if (activeEpisodes.length === 1) {
    return {
      action: 'SKIP_ACTIVE_EPISODE_EXISTS',
      reason: '次回制作対象のEPISODEが既に存在するため。',
      activeEpisodes: activeEpisodes,
      latestEpisode: latestEpisode,
      proposed: null,
      drive: null,
      warnings: warnings
    };
  }

  if (!latestEpisode) {
    warnings.push('EPISODESが0件です。初回起点は自動推測しません。');
    return {
      action: 'BLOCK_NO_BASE_EPISODE',
      reason: '次回日付を導く基準EPISODEが存在しないため。',
      activeEpisodes: [],
      latestEpisode: null,
      proposed: null,
      drive: null,
      warnings: warnings
    };
  }

  const latestAirDate = weeklyBootV01DateStart_(latestEpisode.properties['Air_Date']);
  if (!latestAirDate) {
    warnings.push('Latest EPISODEにAir_Dateがありません。');
    return {
      action: 'BLOCK_LATEST_AIR_DATE_MISSING',
      reason: '次回日付を安全に導けないため。',
      activeEpisodes: [],
      latestEpisode: latestEpisode,
      proposed: null,
      drive: null,
      warnings: warnings
    };
  }

  const airDate = weeklyBootV01ShiftDateOnly_(latestAirDate.slice(0, 10), 7);
  const recordingDate = weeklyBootV01ShiftDateOnly_(airDate, -4);
  const episodeKey = airDate;

  const sameKey = weeklyBootV01FindEpisodeByKey_(episodeKey);
  if (sameKey.length > 1) {
    warnings.push('次回Episode_Keyが既に複数存在します。key=' + episodeKey);
    return {
      action: 'BLOCK_DUPLICATE_EPISODE_KEY',
      reason: '同一Episode_Keyが複数存在するため。',
      activeEpisodes: [],
      latestEpisode: latestEpisode,
      proposed: { episodeKey: episodeKey, recordingDate: recordingDate, airDate: airDate },
      drive: weeklyBootV01PreviewDrive_(episodeKey),
      warnings: warnings
    };
  }

  if (sameKey.length === 1) {
    return {
      action: 'SKIP_EXISTING_EPISODE_KEY',
      reason: '次回Episode_Keyは既に作成済み。',
      activeEpisodes: [],
      latestEpisode: latestEpisode,
      proposed: { episodeKey: episodeKey, recordingDate: recordingDate, airDate: airDate },
      drive: weeklyBootV01PreviewDrive_(episodeKey),
      warnings: warnings
    };
  }

  return {
    action: 'CREATE_NEXT_EPISODE',
    reason: '次回制作対象が存在せず、最新Air_Dateから次週を一意に導けるため。',
    activeEpisodes: [],
    latestEpisode: latestEpisode,
    proposed: {
      episodeKey: episodeKey,
      recordingDate: recordingDate,
      airDate: airDate,
      productionStatus: OC_WEEKLY_BOOTSTRAP_V01.INITIAL_STATUS,
      episodeNo: null
    },
    drive: weeklyBootV01PreviewDrive_(episodeKey),
    warnings: warnings
  };
}

/* =========================================================
 * NOTION EPISODES
 * ========================================================= */

function weeklyBootV01GetActiveEpisodes_() {
  const filters = OC_WEEKLY_BOOTSTRAP_V01.ACTIVE_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  return weeklyBootV01QueryAll_(OC_WEEKLY_BOOTSTRAP_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 50
  });
}

function weeklyBootV01GetLatestEpisode_() {
  const pages = weeklyBootV01QueryAll_(OC_WEEKLY_BOOTSTRAP_V01.EPISODES_DS, {
    sorts: [{ property: 'Air_Date', direction: 'descending' }],
    page_size: 1
  });
  return pages.length ? pages[0] : null;
}

function weeklyBootV01FindEpisodeByKey_(episodeKey) {
  return weeklyBootV01QueryAll_(OC_WEEKLY_BOOTSTRAP_V01.EPISODES_DS, {
    filter: {
      property: 'Episode_Key',
      title: { equals: episodeKey }
    },
    page_size: 10
  });
}

function weeklyBootV01EpisodeSummary_(page) {
  if (!page) return null;
  return {
    id: page.id,
    url: page.url || '',
    episodeKey: weeklyBootV01Title_(page.properties['Episode_Key']),
    recordingDate: weeklyBootV01DateStart_(page.properties['Recording_Date']),
    airDate: weeklyBootV01DateStart_(page.properties['Air_Date']),
    productionStatus: weeklyBootV01Select_(page.properties['Production_Status']),
    episodeFolderUrl: weeklyBootV01Url_(page.properties['Episode_Folder_URL'])
  };
}

/* =========================================================
 * DRIVE
 * ========================================================= */

function weeklyBootV01PreviewDrive_(episodeKey) {
  const root = DriveApp.getFolderById(OC_WEEKLY_BOOTSTRAP_V01.EPISODES_ROOT_FOLDER_ID);
  const matches = weeklyBootV01ListChildFoldersByName_(root, episodeKey);
  return {
    root: weeklyBootV01FolderSummary_(root),
    matchingEpisodeFolderCount: matches.length,
    matchingEpisodeFolders: matches.map(weeklyBootV01FolderSummary_)
  };
}

function weeklyBootV01GetOrCreateUniqueChild_(parent, name) {
  const matches = weeklyBootV01ListChildFoldersByName_(parent, name);
  if (matches.length > 1) {
    throw new Error(
      '同名Drive folderが複数あります。parent=' + parent.getName() +
      ' name=' + name + ' count=' + matches.length
    );
  }
  return matches.length === 1 ? matches[0] : parent.createFolder(name);
}

function weeklyBootV01ListChildFoldersByName_(parent, name) {
  const out = [];
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) out.push(it.next());
  return out;
}

function weeklyBootV01FolderSummary_(folder) {
  return {
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl()
  };
}

/* =========================================================
 * DATE
 * ========================================================= */

function weeklyBootV01ShiftDateOnly_(dateOnly, days) {
  const m = String(dateOnly || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('invalid date: ' + dateOnly);

  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));

  return [
    d.getUTCFullYear(),
    ('0' + (d.getUTCMonth() + 1)).slice(-2),
    ('0' + d.getUTCDate()).slice(-2)
  ].join('-');
}

/* =========================================================
 * NOTION API
 * ========================================================= */

function weeklyBootV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function weeklyBootV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + weeklyBootV01Token_(),
      'Notion-Version': OC_WEEKLY_BOOTSTRAP_V01.NOTION_VERSION
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

function weeklyBootV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = weeklyBootV01Request_(
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

function weeklyBootV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function weeklyBootV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function weeklyBootV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function weeklyBootV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}

function weeklyBootV01TitleProp_(text) {
  return {
    title: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }]
  };
}
