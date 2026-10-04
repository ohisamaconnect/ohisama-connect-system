/**
 * OC-OS Weekly Current - Production Runtime
 * Consolidated weekly-production family.
 *
 * Responsibilities retained as separate namespaces inside one Current family:
 * - create/reuse the next weekly EPISODE + Drive skeleton
 * - manage explicit PRE/POST target episode lock
 * - seed STUDIO ITEMS and generate STUDIO PACK
 * - resolve/sync the Weekly Review Queue window
 *
 * Runtime policy:
 * - Human editorial judgement remains authoritative.
 * - Existing handler names are preserved for trigger compatibility.
 * - No trigger is installed merely by building this file.
 * - This is family consolidation, not a semantic rewrite.
 */

// ============================================================
// CURRENT MODULE: Weekly Episode Bootstrap
// ============================================================

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


// ============================================================
// CURRENT MODULE: Target Episode Lock Manager
// ============================================================

/**
 * OC-OS Target Episode Lock Manager
 * v0.1.0-preview (2026-10-04)
 *
 * Purpose:
 * - Keep OC_TARGET_EPISODE_KEY as a WRITE safety lock.
 * - Eliminate weekly manual typing in Apps Script Properties.
 * - Distinguish PRE_RECORDING and POST_RECORDING targets because both can
 *   legitimately exist at the same time.
 * - Never infer or change Production_Status.
 *
 * Canonical rule:
 * - Preview first.
 * - Human runs one explicit lock function.
 * - Existing modules continue reading OC_TARGET_EPISODE_KEY unchanged.
 * - Clear the lock when switching context is preferable to leaving an old
 *   target indefinitely.
 *
 * No trigger is installed by this module.
 */

const OC_TARGET_LOCK_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',

  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  TARGET_MODE_PROPERTY: 'OC_TARGET_EPISODE_LOCK_MODE',
  TARGET_LOCKED_AT_PROPERTY: 'OC_TARGET_EPISODE_LOCKED_AT',

  PRE_MODE: 'PRE_RECORDING',
  POST_MODE: 'POST_RECORDING',

  PRE_STATUSES: ['準備中', '収録準備済'],
  POST_STATUSES: ['収録済', '放送済', 'アーカイブ処理済']
});

/**
 * One read-only overview of the current lock plus both workflow candidates.
 */
function previewTargetEpisodeLocksV01() {
  const out = {
    write: 'NONE',
    version: OC_TARGET_LOCK_V01.VERSION,
    currentLock: targetLockV01ReadCurrent_(),
    preRecording: targetLockV01BuildPlan_(OC_TARGET_LOCK_V01.PRE_MODE),
    postRecording: targetLockV01BuildPlan_(OC_TARGET_LOCK_V01.POST_MODE)
  };

  console.log('========================================');
  console.log('OC-OS TARGET EPISODE LOCK PREVIEW');
  console.log('VERSION = ' + OC_TARGET_LOCK_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/** Read-only preview for the upcoming/pre-recording production target. */
function previewPreRecordingTargetLockV01() {
  return targetLockV01LogPlan_(
    'OC-OS PRE-RECORDING TARGET LOCK PREVIEW',
    targetLockV01BuildPlan_(OC_TARGET_LOCK_V01.PRE_MODE)
  );
}

/**
 * Lock the unique PRE_RECORDING EPISODE.
 * This replaces manual Script Property editing.
 */
function lockPreRecordingTargetV01() {
  return targetLockV01ApplyPlan_(OC_TARGET_LOCK_V01.PRE_MODE);
}

/** Read-only preview for the most recent unfinished post-recording target. */
function previewPostRecordingTargetLockV01() {
  return targetLockV01LogPlan_(
    'OC-OS POST-RECORDING TARGET LOCK PREVIEW',
    targetLockV01BuildPlan_(OC_TARGET_LOCK_V01.POST_MODE)
  );
}

/**
 * Lock the deterministic POST_RECORDING EPISODE.
 * This replaces manual Script Property editing.
 */
function lockPostRecordingTargetV01() {
  return targetLockV01ApplyPlan_(OC_TARGET_LOCK_V01.POST_MODE);
}

/**
 * Read and validate the current OC_TARGET_EPISODE_KEY without changing it.
 */
function previewCurrentTargetEpisodeLockV01() {
  const current = targetLockV01ReadCurrent_();
  const out = {
    write: 'NONE',
    version: OC_TARGET_LOCK_V01.VERSION,
    currentLock: current,
    episodeMatches: []
  };

  if (current.episodeKey) {
    out.episodeMatches = targetLockV01FindByKey_(current.episodeKey)
      .map(targetLockV01EpisodeSummary_);
  }

  out.valid = !current.episodeKey || out.episodeMatches.length === 1;
  out.warnings = [];

  if (current.episodeKey && out.episodeMatches.length !== 1) {
    out.warnings.push(
      'Current OC_TARGET_EPISODE_KEY does not resolve to exactly one EPISODE. count=' +
      out.episodeMatches.length
    );
  }

  console.log('========================================');
  console.log('OC-OS CURRENT TARGET EPISODE LOCK');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Clear only the target-lock properties owned by this module.
 * NOTION token and unrelated Script Properties are untouched.
 */
function clearTargetEpisodeLockV01() {
  const props = PropertiesService.getScriptProperties();
  const previous = targetLockV01ReadCurrent_();

  props.deleteProperty(OC_TARGET_LOCK_V01.TARGET_KEY_PROPERTY);
  props.deleteProperty(OC_TARGET_LOCK_V01.TARGET_MODE_PROPERTY);
  props.deleteProperty(OC_TARGET_LOCK_V01.TARGET_LOCKED_AT_PROPERTY);

  const out = {
    write: 'TARGET_EPISODE_LOCK_CLEARED',
    version: OC_TARGET_LOCK_V01.VERSION,
    previous: previous,
    current: targetLockV01ReadCurrent_()
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function targetLockV01BuildPlan_(mode) {
  if (
    mode !== OC_TARGET_LOCK_V01.PRE_MODE &&
    mode !== OC_TARGET_LOCK_V01.POST_MODE
  ) {
    throw new Error('Unknown target lock mode: ' + mode);
  }

  const today = Utilities.formatDate(
    new Date(),
    OC_TARGET_LOCK_V01.TIME_ZONE,
    'yyyy-MM-dd'
  );
  const currentLock = targetLockV01ReadCurrent_();

  const pages = mode === OC_TARGET_LOCK_V01.PRE_MODE
    ? targetLockV01GetPreCandidates_()
    : targetLockV01GetPostCandidates_(today);

  const candidates = pages.map(targetLockV01EpisodeSummary_);
  const warnings = [];
  let proposed = null;
  let safeToLock = false;
  let rule = '';

  if (mode === OC_TARGET_LOCK_V01.PRE_MODE) {
    rule = '準備中 / 収録準備済 がちょうど1件なら、そのEPISODEを収録前対象とする。';

    if (candidates.length === 1) {
      proposed = candidates[0];
      safeToLock = Boolean(proposed.episodeKey);
    } else if (candidates.length === 0) {
      warnings.push('収録前対象EPISODEがありません。Weekly Episode Bootstrapを確認してください。');
    } else {
      warnings.push(
        '収録前対象EPISODEが複数あります。自動選択しません。count=' +
        candidates.length
      );
    }
  } else {
    rule =
      'Recording_Date <= today かつ 収録済 / 放送済 / アーカイブ処理済 のうち、' +
      'Recording_Dateが最も新しいEPISODEを収録後対象とする。';

    if (candidates.length === 0) {
      warnings.push('収録後対象EPISODEがありません。Production_Status / Recording_Dateを確認してください。');
    } else {
      proposed = candidates[0];
      const topDate = proposed.recordingDate || '';
      const sameTopDate = candidates.filter(x => x.recordingDate === topDate);

      if (!proposed.episodeKey) {
        warnings.push('最上位候補にEpisode_Keyがありません。');
      } else if (!topDate) {
        warnings.push('最上位候補にRecording_Dateがありません。');
      } else if (sameTopDate.length > 1) {
        warnings.push(
          '最新Recording_Dateが同日のEPISODEが複数あります。自動Lockしません。date=' +
          topDate + ' count=' + sameTopDate.length
        );
      } else {
        safeToLock = true;
      }
    }
  }

  return {
    write: 'NONE',
    version: OC_TARGET_LOCK_V01.VERSION,
    mode: mode,
    today: today,
    rule: rule,
    currentLock: currentLock,
    proposed: proposed,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 20),
    safeToLock: safeToLock,
    warnings: warnings
  };
}

function targetLockV01LogPlan_(title, plan) {
  console.log('========================================');
  console.log(title);
  console.log('VERSION = ' + OC_TARGET_LOCK_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(plan, null, 2));
  return plan;
}

function targetLockV01ApplyPlan_(mode) {
  const plan = targetLockV01BuildPlan_(mode);

  if (!plan.safeToLock || !plan.proposed || !plan.proposed.episodeKey) {
    throw new Error(
      'Target lock is not safe. Run preview first. mode=' + mode +
      ' warnings=' + (plan.warnings || []).join(' | ')
    );
  }

  const matches = targetLockV01FindByKey_(plan.proposed.episodeKey);
  if (matches.length !== 1) {
    throw new Error(
      'Proposed Episode_Key does not resolve to exactly one EPISODE. key=' +
      plan.proposed.episodeKey + ' count=' + matches.length
    );
  }

  const props = PropertiesService.getScriptProperties();
  const previous = targetLockV01ReadCurrent_();
  const lockedAt = new Date().toISOString();

  props.setProperties({
    [OC_TARGET_LOCK_V01.TARGET_KEY_PROPERTY]: plan.proposed.episodeKey,
    [OC_TARGET_LOCK_V01.TARGET_MODE_PROPERTY]: mode,
    [OC_TARGET_LOCK_V01.TARGET_LOCKED_AT_PROPERTY]: lockedAt
  }, false);

  const current = targetLockV01ReadCurrent_();

  if (current.episodeKey !== plan.proposed.episodeKey) {
    throw new Error(
      'OC_TARGET_EPISODE_KEY verification failed. expected=' +
      plan.proposed.episodeKey + ' actual=' + current.episodeKey
    );
  }

  const out = {
    write: 'TARGET_EPISODE_LOCK_SET',
    version: OC_TARGET_LOCK_V01.VERSION,
    previous: previous,
    current: current,
    episode: targetLockV01EpisodeSummary_(matches[0]),
    nextAction:
      mode === OC_TARGET_LOCK_V01.PRE_MODE
        ? 'Run the intended PRE_RECORDING workflow preview before any WRITE.'
        : 'Run previewPostRecordingIntegrationV01() before any post-recording WRITE.'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * CANDIDATES
 * ========================================================= */

function targetLockV01GetPreCandidates_() {
  const statusFilters = OC_TARGET_LOCK_V01.PRE_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  return targetLockV01QueryAll_(OC_TARGET_LOCK_V01.EPISODES_DS, {
    filter: { or: statusFilters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 50
  });
}

function targetLockV01GetPostCandidates_(today) {
  const statusFilters = OC_TARGET_LOCK_V01.POST_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  return targetLockV01QueryAll_(OC_TARGET_LOCK_V01.EPISODES_DS, {
    filter: {
      and: [
        { or: statusFilters },
        {
          property: 'Recording_Date',
          date: { on_or_before: today }
        }
      ]
    },
    sorts: [
      { property: 'Recording_Date', direction: 'descending' },
      { property: 'Air_Date', direction: 'descending' }
    ],
    page_size: 50
  });
}

function targetLockV01FindByKey_(episodeKey) {
  return targetLockV01QueryAll_(OC_TARGET_LOCK_V01.EPISODES_DS, {
    filter: {
      property: 'Episode_Key',
      title: { equals: String(episodeKey || '') }
    },
    page_size: 10
  });
}

/* =========================================================
 * CURRENT LOCK
 * ========================================================= */

function targetLockV01ReadCurrent_() {
  const props = PropertiesService.getScriptProperties();
  return {
    episodeKey: String(
      props.getProperty(OC_TARGET_LOCK_V01.TARGET_KEY_PROPERTY) || ''
    ).trim(),
    mode: String(
      props.getProperty(OC_TARGET_LOCK_V01.TARGET_MODE_PROPERTY) || ''
    ).trim(),
    lockedAt: String(
      props.getProperty(OC_TARGET_LOCK_V01.TARGET_LOCKED_AT_PROPERTY) || ''
    ).trim()
  };
}

/* =========================================================
 * NOTION API
 * ========================================================= */

function targetLockV01Token_() {
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

function targetLockV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + targetLockV01Token_(),
      'Notion-Version': OC_TARGET_LOCK_V01.NOTION_VERSION
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

function targetLockV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = targetLockV01Request_(
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

function targetLockV01EpisodeSummary_(page) {
  if (!page) return null;
  return {
    pageId: page.id,
    url: page.url || '',
    episodeKey: targetLockV01Title_(page.properties['Episode_Key']),
    recordingDate: targetLockV01DateStart_(page.properties['Recording_Date']),
    airDate: targetLockV01DateStart_(page.properties['Air_Date']),
    productionStatus: targetLockV01Select_(page.properties['Production_Status']),
    episodeFolderUrl: targetLockV01Url_(page.properties['Episode_Folder_URL'])
  };
}

function targetLockV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function targetLockV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function targetLockV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function targetLockV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}


// ============================================================
// CURRENT MODULE: Studio Automation
// ============================================================

/**
 * OC-OS STUDIO Automation v0.1.0
 * Candidate Seeder + STUDIO PACK
 *
 * IMPORTANT
 * - This module never decides what should be used on air.
 * - It only creates Studio_Status="候補".
 * - It never changes 使用済 / 保留 / 見送り.
 * - It never changes EPISODES.Production_Status.
 *
 * Required Script Property:
 *   NOTION_API_TOKEN
 * or NOTION_TOKEN
 * or NOTION_SECRET
 *
 * Run in this order:
 *   1. previewStudioCandidateSeederV01()
 *   2. runStudioCandidateSeederV01()
 *   3. previewStudioPackV01()
 *   4. generateStudioPackV01()
 *   5. installStudioAutomationTriggersV01()
 */

const OC_STUDIO_V01 = {
  VERSION: '0.1.0',
  PACK_VERSION: 'v0.1.0',
  TIMEZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',

  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  EVENTS_DS: '76508d6c-7771-46d4-850c-ca256c1080be',
  MESSAGES_DS: '4e56b186-74b3-4ee9-87a8-048a1b7cc650',
  SONGS_DS: 'a3c08149-498d-4e02-aded-0c5640e5a033',
  SOURCES_DS: '9ba27a8b-7f2e-4025-b943-d6e24e82b7a9',
  STUDIO_ITEMS_DS: '9591403b-709c-41cc-b3a6-1917b0042abf',

  SEED_HANDLER: 'runStudioCandidateSeederV01',
  PACK_HANDLER: 'generateStudioPackV01'
};


/* =========================================================
 * PUBLIC
 * ========================================================= */

function previewStudioCandidateSeederV01() {
  const plan = studioV01BuildSeedPlan_();

  const out = {
    write: 'NONE',
    version: OC_STUDIO_V01.VERSION,
    episode: plan.episodeKey,
    episodePageId: plan.episode.id,
    recordingDate: plan.recordingDate,
    windowStart: plan.windowStart,
    existingStudioItems: plan.existingCount,
    newCandidates: plan.toCreate.length,
    byType: studioV01CountBy_(plan.toCreate, 'materialType'),
    candidates: plan.toCreate.map(x => ({
      materialType: x.materialType,
      title: x.title,
      origin: x.origin,
      reason: x.reason,
      seedKey: x.seedKey
    }))
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function runStudioCandidateSeederV01() {
  const plan = studioV01BuildSeedPlan_();

  const createdRows = [];

  plan.toCreate.forEach(seed => {
    const page = studioV01CreateStudioItem_(plan.episode.id, seed);

    createdRows.push({
      id: page.id,
      title: seed.title,
      materialType: seed.materialType,
      origin: seed.origin
    });

    Utilities.sleep(150);
  });

  const out = {
    write: 'CREATE_MISSING_ONLY',
    version: OC_STUDIO_V01.VERSION,
    episode: plan.episodeKey,
    windowStart: plan.windowStart,
    existingStudioItems: plan.existingCount,
    created: createdRows.length,
    createdRows: createdRows
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function previewStudioPackV01() {
  const episode = studioV01GetActiveEpisode_();
  const items = studioV01GetStudioItemsForEpisode_(episode.id);

  const out = {
    write: 'NONE',
    packVersion: OC_STUDIO_V01.PACK_VERSION,
    episode: studioV01Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: studioV01DateStart_(episode.properties['Recording_Date']),
    airDate: studioV01DateStart_(episode.properties['Air_Date']),
    episodeFolderUrl: studioV01PropUrl_(episode.properties['Episode_Folder_URL']),
    studioItemCount: items.length,
    byType: studioV01CountBy_(
      items.map(studioV01StudioItemSummary_),
      'materialType'
    ),
    byStatus: studioV01CountBy_(
      items.map(studioV01StudioItemSummary_),
      'status'
    ),
    items: items.map(studioV01StudioItemSummary_)
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function generateStudioPackV01() {
  const episode = studioV01GetActiveEpisode_();
  const items = studioV01GetStudioItemsForEpisode_(episode.id);

  if (!items.length) {
    throw new Error('STUDIO ITEMSが0件です。Pack生成前に候補を確認してください。');
  }

  const episodeKey = studioV01Title_(episode.properties['Episode_Key']);
  const episodeFolderUrl =
    studioV01PropUrl_(episode.properties['Episode_Folder_URL']);

  const episodeFolderId =
    studioV01ExtractDriveFolderId_(episodeFolderUrl);

  if (!episodeFolderId) {
    throw new Error(
      'Episode_Folder_URLからDrive folder IDを取得できません。'
    );
  }

  const episodeFolder = DriveApp.getFolderById(episodeFolderId);
  const studioFolder =
    studioV01GetOrCreateChildFolder_(episodeFolder, 'STUDIO');

  const generatedAt = new Date();

  const stamp = Utilities.formatDate(
    generatedAt,
    OC_STUDIO_V01.TIMEZONE,
    'yyyyMMdd_HHmmss'
  );

  const baseName =
    'STUDIO_PACK_' +
    episodeKey +
    '_' +
    stamp +
    '_' +
    OC_STUDIO_V01.PACK_VERSION;

  const cache = {};

  const pack =
    studioV01BuildPackData_(episode, items, cache, generatedAt);

  // Google Doc
  const doc = DocumentApp.create(baseName);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(studioFolder);

  studioV01RenderDoc_(doc, pack);
  doc.saveAndClose();

  // PDF
  Utilities.sleep(400);

  const pdfBlob = DriveApp
    .getFileById(doc.getId())
    .getAs(MimeType.PDF)
    .setName(baseName + '.pdf');

  const pdfFile = studioFolder.createFile(pdfBlob);

  // HTML
  const html = studioV01RenderHtml_(pack);

  const htmlFile = studioFolder.createFile(
    baseName + '.html',
    html,
    MimeType.HTML
  );

  // Update EPISODE only with pack metadata.
  // Production_Status is intentionally untouched.
  studioV01PatchPage_(episode.id, {
    'Studio_Pack_URL': {
      url: pdfFile.getUrl()
    },
    'Studio_Pack_Generated_At': {
      date: {
        start: generatedAt.toISOString()
      }
    },
    'Studio_Pack_Version':
      studioV01RichTextProp_(OC_STUDIO_V01.PACK_VERSION)
  });

  const out = {
    write: 'PACK_CREATED',
    episode: episodeKey,
    packVersion: OC_STUDIO_V01.PACK_VERSION,
    generatedAt: generatedAt.toISOString(),
    studioItemCount: items.length,
    folderUrl: studioFolder.getUrl(),
    googleDocUrl: docFile.getUrl(),
    pdfUrl: pdfFile.getUrl(),
    htmlUrl: htmlFile.getUrl()
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}


function installStudioAutomationTriggersV01() {
  const handlers = [
    OC_STUDIO_V01.SEED_HANDLER,
    OC_STUDIO_V01.PACK_HANDLER
  ];

  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Seeder: hourly
  ScriptApp
    .newTrigger(OC_STUDIO_V01.SEED_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();

  // Pack: Wednesday around 20:00 JST
  ScriptApp
    .newTrigger(OC_STUDIO_V01.PACK_HANDLER)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(20)
    .inTimezone(OC_STUDIO_V01.TIMEZONE)
    .create();

  const result = ScriptApp
    .getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) >= 0)
    .map(t => ({
      handler: t.getHandlerFunction(),
      eventType: String(t.getEventType()),
      source: String(t.getTriggerSource())
    }));

  console.log('STUDIO automation triggers installed.');
  console.log(JSON.stringify(result, null, 2));

  return result;
}


/* =========================================================
 * CANDIDATE SEEDER
 * ========================================================= */

function studioV01BuildSeedPlan_() {
  const episode = studioV01GetActiveEpisode_();

  const episodeKey =
    studioV01Title_(episode.properties['Episode_Key']);

  const recordingDate =
    studioV01DateStart_(episode.properties['Recording_Date']);

  if (!recordingDate) {
    throw new Error(
      'Active EPISODEにRecording_Dateがありません。'
    );
  }

  const windowStart =
    studioV01CandidateWindowStart_(episode);

  const existingItems =
    studioV01GetStudioItemsForEpisode_(episode.id);

  const existingKeys = {};

  existingItems.forEach(p => {
    const key =
      studioV01RichText_(p.properties['Seed_Key']);

    if (key) existingKeys[key] = true;
  });

  const cache = {};
  const seeds = [];
  const seedMap = {};

  // -------------------------------------------------------
  // EVENT
  // Human_Status=確認済
  // and edited since previous recording boundary.
  // -------------------------------------------------------

  const events = studioV01QueryAll_(
    OC_STUDIO_V01.EVENTS_DS,
    {
      filter: {
        and: [
          {
            property: 'Human_Status',
            select: {
              equals: '確認済'
            }
          },
          {
            timestamp: 'last_edited_time',
            last_edited_time: {
              on_or_after: windowStart
            }
          }
        ]
      },
      sorts: [
        {
          timestamp: 'last_edited_time',
          direction: 'descending'
        }
      ],
      page_size: 100
    }
  );

  events.forEach(eventPage => {
    cache[eventPage.id] = eventPage;

    const title =
      studioV01Title_(
        eventPage.properties['Event_Title']
      ) || 'EVENT';

    studioV01AddSeed_(seeds, seedMap, {
      seedKey:
        studioV01SeedKey_(
          episode.id,
          'EVENT',
          eventPage.id
        ),
      materialType: 'EVENT',
      title: 'EVENT｜' + title,
      origin: 'AUTO_EVENT',
      reason:
        '人間確認済EVENT（前回収録以降に更新）',
      eventId: eventPage.id
    });

    // Explicit Related_Songs only.
    studioV01RelationIds_(
      eventPage.properties['Related_Songs']
    ).forEach(songId => {
      const songPage =
        studioV01GetPageCached_(songId, cache);

      const songTitle =
        studioV01Title_(
          songPage.properties['Song_Title']
        ) || songId;

      studioV01AddSeed_(seeds, seedMap, {
        seedKey:
          studioV01SeedKey_(
            episode.id,
            'SONG',
            songId
          ),
        materialType: 'SONG',
        title: 'SONG｜' + songTitle,
        origin: 'AUTO_RELATED_SONG',
        reason: 'EVENT関連曲: ' + title,
        songId: songId
      });
    });
  });

  // -------------------------------------------------------
  // MESSAGE
  // Received since previous recording boundary.
  // Review_Status = 未確認 or 確認済
  // -------------------------------------------------------

  const messages = studioV01QueryAll_(
    OC_STUDIO_V01.MESSAGES_DS,
    {
      filter: {
        and: [
          {
            property: 'Received_At',
            date: {
              on_or_after: windowStart
            }
          },
          {
            or: [
              {
                property: 'Review_Status',
                select: {
                  equals: '未確認'
                }
              },
              {
                property: 'Review_Status',
                select: {
                  equals: '確認済'
                }
              }
            ]
          }
        ]
      },
      sorts: [
        {
          property: 'Received_At',
          direction: 'descending'
        }
      ],
      page_size: 100
    }
  );

  messages.forEach(messagePage => {
    cache[messagePage.id] = messagePage;

    const radioName =
      studioV01RichText_(
        messagePage.properties['Radio_Name']
      ) || 'ラジオネーム不明';

    const msgType =
      studioV01RichText_(
        messagePage.properties['Message_Type']
      ) || 'お便り';

    const permission =
      studioV01Select_(
        messagePage.properties['Broadcast_Permission']
      ) || '未回答';

    studioV01AddSeed_(seeds, seedMap, {
      seedKey:
        studioV01SeedKey_(
          episode.id,
          'MESSAGE',
          messagePage.id
        ),
      materialType: 'MESSAGE',
      title:
        'MESSAGE｜' +
        radioName +
        '｜' +
        msgType,
      origin: 'AUTO_MESSAGE',
      reason:
        '前回収録以降に受信 / 紹介可否: ' +
        permission,
      messageId: messagePage.id
    });

    // Explicit Requested_Songs only.
    studioV01RelationIds_(
      messagePage.properties['Requested_Songs']
    ).forEach(songId => {
      const songPage =
        studioV01GetPageCached_(songId, cache);

      const songTitle =
        studioV01Title_(
          songPage.properties['Song_Title']
        ) || songId;

      studioV01AddSeed_(seeds, seedMap, {
        seedKey:
          studioV01SeedKey_(
            episode.id,
            'SONG',
            songId
          ),
        materialType: 'SONG',
        title: 'SONG｜' + songTitle,
        origin: 'AUTO_REQUEST',
        reason:
          'リクエスト曲: ' + radioName,
        songId: songId
      });
    });
  });

  // Existing STUDIO ITEMS always win.
  // Seeder never modifies an existing item.
  const toCreate =
    seeds.filter(s => !existingKeys[s.seedKey]);

  return {
    episode: episode,
    episodeKey: episodeKey,
    recordingDate: recordingDate,
    windowStart: windowStart,
    existingCount: existingItems.length,
    seeds: seeds,
    toCreate: toCreate
  };
}


function studioV01AddSeed_(
  seeds,
  seedMap,
  seed
) {
  const current = seedMap[seed.seedKey];

  if (!current) {
    seedMap[seed.seedKey] = seed;
    seeds.push(seed);
    return;
  }

  if (
    seed.reason &&
    current.reason.indexOf(seed.reason) < 0
  ) {
    current.reason += ' / ' + seed.reason;
  }

  if (seed.origin === 'AUTO_REQUEST') {
    current.origin = 'AUTO_REQUEST';
  }
}


function studioV01CreateStudioItem_(
  episodeId,
  seed
) {
  const properties = {
    'Material':
      studioV01TitleProp_(seed.title),

    'Episode':
      studioV01RelationProp_([episodeId]),

    'Material_Type': {
      select: {
        name: seed.materialType
      }
    },

    'Studio_Status': {
      select: {
        name: '候補'
      }
    },

    'Candidate_Origin': {
      select: {
        name: seed.origin
      }
    },

    'Candidate_Reason':
      studioV01RichTextProp_(
        seed.reason || ''
      ),

    'Seed_Key':
      studioV01RichTextProp_(
        seed.seedKey
      ),

    'Studio_Memo':
      studioV01RichTextProp_('')
  };

  if (seed.eventId) {
    properties['Event'] =
      studioV01RelationProp_(
        [seed.eventId]
      );
  }

  if (seed.messageId) {
    properties['Message'] =
      studioV01RelationProp_(
        [seed.messageId]
      );
  }

  if (seed.songId) {
    properties['Song'] =
      studioV01RelationProp_(
        [seed.songId]
      );
  }

  if (seed.sourceId) {
    properties['Source'] =
      studioV01RelationProp_(
        [seed.sourceId]
      );
  }

  return studioV01CreatePage_(
    OC_STUDIO_V01.STUDIO_ITEMS_DS,
    properties
  );
}


function studioV01SeedKey_(
  episodeId,
  type,
  materialId
) {
  return (
    'EP:' +
    String(episodeId).replace(/-/g, '') +
    '|' +
    type +
    ':' +
    String(materialId).replace(/-/g, '')
  );
}


/* =========================================================
 * PACK
 * ========================================================= */

function studioV01BuildPackData_(
  episode,
  items,
  cache,
  generatedAt
) {
  const episodeKey =
    studioV01Title_(
      episode.properties['Episode_Key']
    );

  const recordingDate =
    studioV01DateStart_(
      episode.properties['Recording_Date']
    );

  const airDate =
    studioV01DateStart_(
      episode.properties['Air_Date']
    );

  const groups = {
    EVENT: [],
    MESSAGE: [],
    SONG: [],
    SOURCE: [],
    OTHER: []
  };

  items.forEach(item => {
    const summary =
      studioV01StudioItemSummary_(item);

    if (summary.eventId) {
      groups.EVENT.push(
        studioV01PackEvent_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.messageId) {
      groups.MESSAGE.push(
        studioV01PackMessage_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.songId) {
      groups.SONG.push(
        studioV01PackSong_(
          summary,
          cache
        )
      );
      return;
    }

    if (summary.sourceId) {
      groups.SOURCE.push(
        studioV01PackSourceItem_(
          summary,
          cache
        )
      );
      return;
    }

    groups.OTHER.push({
      title: summary.material,
      status: summary.status,
      origin: summary.origin,
      reason: summary.reason,
      lines: [
        'Studio Memo: ' +
        (summary.studioMemo || '')
      ]
    });
  });

  return {
    title:
      'おひさまコネクト STUDIO PACK',

    note:
      'これは台本ではなく、収録時点の候補材料を静的に持ち出すためのスナップショットです。',

    episodeKey: episodeKey,
    recordingDate: recordingDate,
    airDate: airDate,

    generatedAt:
      Utilities.formatDate(
        generatedAt,
        OC_STUDIO_V01.TIMEZONE,
        'yyyy-MM-dd HH:mm:ss'
      ),

    packVersion:
      OC_STUDIO_V01.PACK_VERSION,

    groups: groups
  };
}


function studioV01PackEvent_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.eventId,
      cache
    );

  const p = page.properties;

  const sources =
    studioV01RelationIds_(
      p['Sources']
    ).map(id => {
      const sourcePage =
        studioV01GetPageCached_(
          id,
          cache
        );

      return studioV01SourceDetail_(
        sourcePage
      );
    });

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    '日時: ' +
      (studioV01DateStart_(
        p['DateTime']
      ) || ''),
    '種別: ' +
      (studioV01Select_(
        p['Event_Type']
      ) || ''),
    'EVENT状態: ' +
      (studioV01Select_(
        p['Event_Status']
      ) || ''),
    '場所 / Platform: ' +
      (studioV01RichText_(
        p['Location_Platform']
      ) || ''),
    '確認済み要約: ' +
      (studioV01RichText_(
        p['Summary']
      ) || ''),
    'Notion: ' +
      (page.url || '')
  ];

  sources.forEach((s, i) => {
    lines.push(
      '原典' + (i + 1) + ': ' + s.title
    );

    if (s.publisher) {
      lines.push(
        '  Publisher: ' + s.publisher
      );
    }

    if (s.facts) {
      lines.push(
        '  Facts: ' + s.facts
      );
    }

    if (s.url) {
      lines.push(
        '  URL: ' + s.url
      );
    }
  });

  return {
    title:
      studioV01Title_(
        p['Event_Title']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackMessage_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.messageId,
      cache
    );

  const p = page.properties;

  const body =
    studioV01GetPageText_(
      page.id
    );

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    '受信日時: ' +
      (studioV01DateStart_(
        p['Received_At']
      ) || ''),
    'Channel: ' +
      (studioV01Select_(
        p['Channel']
      ) || ''),
    'ラジオネーム: ' +
      (studioV01RichText_(
        p['Radio_Name']
      ) || ''),
    '種別: ' +
      (studioV01RichText_(
        p['Message_Type']
      ) || ''),
    '紹介可否: ' +
      (studioV01Select_(
        p['Broadcast_Permission']
      ) || '未回答'),
    'リクエスト曲（生テキスト）: ' +
      (studioV01RichText_(
        p['Request_Song_Text']
      ) || ''),
    'Gmail原文: ' +
      (studioV01PropUrl_(
        p['Gmail_URL']
      ) || ''),
    'Notion: ' +
      (page.url || ''),
    '',
    '--- お便り本文 ---',
    body ||
      '(本文を取得できませんでした)'
  ];

  return {
    title:
      studioV01Title_(
        p['Message']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackSong_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.songId,
      cache
    );

  const p = page.properties;

  const durationSec =
    studioV01Number_(
      p['Duration_Sec']
    );

  const duration =
    durationSec !== null
      ? studioV01FormatDuration_(
          durationSec
        )
      : '';

  const lines = [
    '状態: ' + summary.status,
    '候補理由: ' + (summary.reason || ''),
    'Song_ID: ' +
      (
        studioV01Number_(
          p['Song_ID']
        ) || ''
      ),
    '尺: ' + duration,
    '期: ' +
      (studioV01Select_(
        p['Target_Generation']
      ) || ''),
    '歌唱形態: ' +
      (studioV01Select_(
        p['Vocal_Formation_Type']
      ) || ''),
    'FULL音源: ' +
      (studioV01PropUrl_(
        p['Full_Mix_File_URL']
      ) || ''),
    'OFF VOCAL: ' +
      (studioV01PropUrl_(
        p['Off_Vocal_File_URL']
      ) || ''),
    'Notion: ' +
      (page.url || '')
  ];

  return {
    title:
      studioV01Title_(
        p['Song_Title']
      ) || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,
    lines: lines
  };
}


function studioV01PackSourceItem_(
  summary,
  cache
) {
  const page =
    studioV01GetPageCached_(
      summary.sourceId,
      cache
    );

  const s =
    studioV01SourceDetail_(page);

  return {
    title:
      s.title || summary.material,

    status: summary.status,
    origin: summary.origin,
    reason: summary.reason,

    lines: [
      '状態: ' + summary.status,
      '候補理由: ' +
        (summary.reason || ''),
      'Publisher: ' +
        (s.publisher || ''),
      'Facts: ' +
        (s.facts || ''),
      'URL: ' +
        (s.url || ''),
      'Notion: ' +
        (page.url || '')
    ]
  };
}


function studioV01SourceDetail_(page) {
  const p = page.properties || {};

  return {
    title:
      studioV01Title_(
        p['Source_Title']
      ) || 'SOURCE',

    publisher:
      studioV01RichText_(
        p['Publisher']
      ) || '',

    facts:
      studioV01RichText_(
        p['Source_Facts']
      ) || '',

    url:
      studioV01PropUrl_(
        p['URL']
      ) ||
      studioV01PropUrl_(
        p['userDefined:URL']
      ) ||
      ''
  };
}


function studioV01RenderDoc_(
  doc,
  pack
) {
  const body = doc.getBody();

  body.clear();

  body
    .appendParagraph(pack.title)
    .setHeading(
      DocumentApp.ParagraphHeading.TITLE
    );

  body.appendParagraph(pack.note);
  body.appendParagraph(
    'EPISODE: ' + pack.episodeKey
  );
  body.appendParagraph(
    '収録日: ' +
    (pack.recordingDate || '')
  );
  body.appendParagraph(
    '放送日: ' +
    (pack.airDate || '')
  );
  body.appendParagraph(
    '生成: ' + pack.generatedAt
  );
  body.appendParagraph(
    'Pack Version: ' +
    pack.packVersion
  );

  body.appendHorizontalRule();

  [
    'EVENT',
    'MESSAGE',
    'SONG',
    'SOURCE',
    'OTHER'
  ].forEach(type => {
    const rows =
      pack.groups[type] || [];

    if (!rows.length) return;

    body
      .appendParagraph(type)
      .setHeading(
        DocumentApp
          .ParagraphHeading
          .HEADING1
      );

    rows.forEach((row, index) => {
      body
        .appendParagraph(
          (index + 1) +
          '. ' +
          row.title
        )
        .setHeading(
          DocumentApp
            .ParagraphHeading
            .HEADING2
        );

      row.lines.forEach(line => {
        body.appendParagraph(line || '');
      });

      body.appendHorizontalRule();
    });
  });

  body
    .appendParagraph(
      'このPACKは正本ではありません。最終判断・実際の収録内容はあさくら本人と放送実績を正本とします。'
    )
    .setItalic(true);
}


function studioV01RenderHtml_(pack) {
  const parts = [];

  parts.push(
    '<!doctype html>' +
    '<html lang="ja">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' +
    studioV01Html_(
      pack.title + ' ' + pack.episodeKey
    ) +
    '</title>' +
    '<style>' +
    'body{font-family:sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;line-height:1.65}' +
    'h1,h2,h3{line-height:1.3}' +
    '.meta{background:#f3f3f3;padding:1rem}' +
    '.item{border-top:1px solid #ccc;padding:1rem 0}' +
    '.line{white-space:pre-wrap;word-break:break-word}' +
    '.notice{margin-top:2rem;font-weight:bold}' +
    '</style>' +
    '</head><body>'
  );

  parts.push(
    '<h1>' +
    studioV01Html_(pack.title) +
    '</h1>'
  );

  parts.push(
    '<p>' +
    studioV01Html_(pack.note) +
    '</p>'
  );

  parts.push('<div class="meta">');

  parts.push(
    '<div>EPISODE: ' +
    studioV01Html_(pack.episodeKey) +
    '</div>'
  );

  parts.push(
    '<div>収録日: ' +
    studioV01Html_(
      pack.recordingDate || ''
    ) +
    '</div>'
  );

  parts.push(
    '<div>放送日: ' +
    studioV01Html_(
      pack.airDate || ''
    ) +
    '</div>'
  );

  parts.push(
    '<div>生成: ' +
    studioV01Html_(pack.generatedAt) +
    '</div>'
  );

  parts.push(
    '<div>Pack Version: ' +
    studioV01Html_(pack.packVersion) +
    '</div>'
  );

  parts.push('</div>');

  [
    'EVENT',
    'MESSAGE',
    'SONG',
    'SOURCE',
    'OTHER'
  ].forEach(type => {
    const rows =
      pack.groups[type] || [];

    if (!rows.length) return;

    parts.push(
      '<h2>' + type + '</h2>'
    );

    rows.forEach((row, index) => {
      parts.push(
        '<section class="item">'
      );

      parts.push(
        '<h3>' +
        (index + 1) +
        '. ' +
        studioV01Html_(row.title) +
        '</h3>'
      );

      row.lines.forEach(line => {
        parts.push(
          '<div class="line">' +
          studioV01AutoLinkHtml_(line) +
          '</div>'
        );
      });

      parts.push('</section>');
    });
  });

  parts.push(
    '<p class="notice">' +
    'このPACKは正本ではありません。最終判断・実際の収録内容はあさくら本人と放送実績を正本とします。' +
    '</p>'
  );

  parts.push('</body></html>');

  return parts.join('\n');
}


/* =========================================================
 * EPISODE / DATA QUERIES
 * ========================================================= */

function studioV01GetActiveEpisode_() {
  const pages =
    studioV01QueryAll_(
      OC_STUDIO_V01.EPISODES_DS,
      {
        filter: {
          or: [
            {
              property:
                'Production_Status',
              select: {
                equals: '準備中'
              }
            },
            {
              property:
                'Production_Status',
              select: {
                equals: '収録準備済'
              }
            }
          ]
        },
        sorts: [
          {
            property:
              'Recording_Date',
            direction: 'ascending'
          }
        ],
        page_size: 50
      }
    );

  if (!pages.length) {
    throw new Error(
      'Production_Statusが「準備中 / 収録準備済」のEPISODEがありません。'
    );
  }

  const today =
    studioV01JstDateOnly_(
      new Date()
    );

  const yesterday =
    studioV01ShiftDateOnly_(
      today,
      -1
    );

  const usable =
    pages.filter(p => {
      const d =
        studioV01DateStart_(
          p.properties[
            'Recording_Date'
          ]
        );

      return (
        d &&
        d.slice(0, 10) >= yesterday
      );
    });

  return usable[0] || pages[0];
}


function studioV01CandidateWindowStart_(episode) {
  const currentRecording =
    studioV01DateStart_(
      episode.properties[
        'Recording_Date'
      ]
    );

  const currentDate =
    currentRecording.slice(0, 10);

  const prev =
    studioV01QueryAll_(
      OC_STUDIO_V01.EPISODES_DS,
      {
        filter: {
          property: 'Recording_Date',
          date: {
            before: currentDate
          }
        },
        sorts: [
          {
            property:
              'Recording_Date',
            direction: 'descending'
          }
        ],
        page_size: 1
      }
    );

  if (prev.length) {
    const prevDate =
      studioV01DateStart_(
        prev[0].properties[
          'Recording_Date'
        ]
      ).slice(0, 10);

    return (
      prevDate +
      'T21:00:00+09:00'
    );
  }

  return (
    studioV01ShiftDateOnly_(
      currentDate,
      -7
    ) +
    'T00:00:00+09:00'
  );
}


function studioV01GetStudioItemsForEpisode_(
  episodeId
) {
  return studioV01QueryAll_(
    OC_STUDIO_V01.STUDIO_ITEMS_DS,
    {
      filter: {
        property: 'Episode',
        relation: {
          contains: episodeId
        }
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'ascending'
        }
      ],
      page_size: 100
    }
  );
}


function studioV01StudioItemSummary_(page) {
  const p = page.properties || {};

  return {
    id: page.id,

    material:
      studioV01Title_(
        p['Material']
      ),

    materialType:
      studioV01Select_(
        p['Material_Type']
      ) || 'OTHER',

    status:
      studioV01Select_(
        p['Studio_Status']
      ) || '',

    origin:
      studioV01Select_(
        p['Candidate_Origin']
      ) || '',

    reason:
      studioV01RichText_(
        p['Candidate_Reason']
      ) || '',

    studioMemo:
      studioV01RichText_(
        p['Studio_Memo']
      ) || '',

    eventId:
      studioV01RelationIds_(
        p['Event']
      )[0] || '',

    messageId:
      studioV01RelationIds_(
        p['Message']
      )[0] || '',

    songId:
      studioV01RelationIds_(
        p['Song']
      )[0] || '',

    sourceId:
      studioV01RelationIds_(
        p['Source']
      )[0] || ''
  };
}


/* =========================================================
 * NOTION REST
 * ========================================================= */

function studioV01Token_() {
  const p =
    PropertiesService
      .getScriptProperties();

  const token =
    p.getProperty(
      'NOTION_API_TOKEN'
    ) ||
    p.getProperty(
      'NOTION_TOKEN'
    ) ||
    p.getProperty(
      'NOTION_SECRET'
    );

  if (!token) {
    throw new Error(
      'Script PropertiesにNOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRETのいずれかが必要です。'
    );
  }

  return token;
}


function studioV01Request_(
  method,
  path,
  payload
) {
  const url =
    'https://api.notion.com/v1' +
    path;

  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization:
        'Bearer ' +
        studioV01Token_(),

      'Notion-Version':
        OC_STUDIO_V01
          .NOTION_VERSION,

      'Content-Type':
        'application/json'
    }
  };

  if (
    payload !== undefined &&
    payload !== null
  ) {
    options.payload =
      JSON.stringify(payload);
  }

  let lastCode = 0;
  let lastText = '';

  for (
    let attempt = 0;
    attempt < 4;
    attempt++
  ) {
    const res =
      UrlFetchApp.fetch(
        url,
        options
      );

    const code =
      res.getResponseCode();

    const text =
      res.getContentText();

    lastCode = code;
    lastText = text;

    if (
      code >= 200 &&
      code < 300
    ) {
      return text
        ? JSON.parse(text)
        : {};
    }

    if (
      code === 429 ||
      code >= 500
    ) {
      Utilities.sleep(
        700 *
        Math.pow(2, attempt)
      );

      continue;
    }

    throw new Error(
      'Notion API error ' +
      code +
      ' ' +
      method +
      ' ' +
      path +
      '\n' +
      text
    );
  }

  throw new Error(
    'Notion API retry exhausted: ' +
    lastCode +
    '\n' +
    lastText
  );
}


function studioV01QueryAll_(
  dataSourceId,
  body
) {
  const out = [];

  let cursor = null;

  do {
    const requestBody =
      JSON.parse(
        JSON.stringify(
          body || {}
        )
      );

    requestBody.page_size =
      Math.min(
        requestBody.page_size || 100,
        100
      );

    if (cursor) {
      requestBody.start_cursor =
        cursor;
    }

    const r =
      studioV01Request_(
        'post',
        '/data_sources/' +
        dataSourceId +
        '/query',
        requestBody
      );

    (r.results || [])
      .forEach(x => out.push(x));

    cursor =
      r.has_more
        ? r.next_cursor
        : null;

  } while (cursor);

  return out;
}


function studioV01GetPage_(pageId) {
  return studioV01Request_(
    'get',
    '/pages/' + pageId
  );
}


function studioV01GetPageCached_(
  pageId,
  cache
) {
  if (!cache[pageId]) {
    cache[pageId] =
      studioV01GetPage_(pageId);

    Utilities.sleep(100);
  }

  return cache[pageId];
}


function studioV01CreatePage_(
  dataSourceId,
  properties
) {
  return studioV01Request_(
    'post',
    '/pages',
    {
      parent: {
        type:
          'data_source_id',

        data_source_id:
          dataSourceId
      },

      properties:
        properties
    }
  );
}


function studioV01PatchPage_(
  pageId,
  properties
) {
  return studioV01Request_(
    'patch',
    '/pages/' + pageId,
    {
      properties:
        properties
    }
  );
}


function studioV01GetPageText_(pageId) {
  const lines = [];

  studioV01CollectBlockText_(
    pageId,
    lines,
    0
  );

  return lines
    .join('\n')
    .trim();
}


function studioV01CollectBlockText_(
  blockId,
  lines,
  depth
) {
  if (depth > 4) return;

  let cursor = null;

  do {
    const path =
      '/blocks/' +
      blockId +
      '/children?page_size=100' +
      (
        cursor
          ? '&start_cursor=' +
            encodeURIComponent(
              cursor
            )
          : ''
      );

    const r =
      studioV01Request_(
        'get',
        path
      );

    (r.results || [])
      .forEach(block => {
        const text =
          studioV01BlockPlainText_(
            block
          );

        if (text) {
          lines.push(text);
        }

        if (block.has_children) {
          studioV01CollectBlockText_(
            block.id,
            lines,
            depth + 1
          );
        }
      });

    cursor =
      r.has_more
        ? r.next_cursor
        : null;

  } while (cursor);
}


function studioV01BlockPlainText_(block) {
  if (
    !block ||
    !block.type
  ) {
    return '';
  }

  const data =
    block[block.type] || {};

  const rich =
    data.rich_text ||
    data.caption ||
    [];

  if (!Array.isArray(rich)) {
    return '';
  }

  return rich
    .map(x => x.plain_text || '')
    .join('');
}


/* =========================================================
 * PROPERTY HELPERS
 * ========================================================= */

function studioV01Title_(prop) {
  if (
    !prop ||
    !prop.title
  ) {
    return '';
  }

  return prop.title
    .map(
      x => x.plain_text || ''
    )
    .join('');
}


function studioV01RichText_(prop) {
  if (
    !prop ||
    !prop.rich_text
  ) {
    return '';
  }

  return prop.rich_text
    .map(
      x => x.plain_text || ''
    )
    .join('');
}


function studioV01Select_(prop) {
  return (
    prop &&
    prop.select
  )
    ? (
        prop.select.name || ''
      )
    : '';
}


function studioV01Number_(prop) {
  if (
    !prop ||
    prop.number === null ||
    prop.number === undefined
  ) {
    return null;
  }

  return Number(prop.number);
}


function studioV01DateStart_(prop) {
  return (
    prop &&
    prop.date
  )
    ? (
        prop.date.start || ''
      )
    : '';
}


function studioV01PropUrl_(prop) {
  return (
    prop &&
    prop.url
  )
    ? prop.url
    : '';
}


function studioV01RelationIds_(prop) {
  if (
    !prop ||
    !Array.isArray(
      prop.relation
    )
  ) {
    return [];
  }

  return prop.relation
    .map(x => x.id)
    .filter(Boolean);
}


function studioV01TitleProp_(text) {
  return {
    title: [
      {
        type: 'text',
        text: {
          content:
            String(text || '')
        }
      }
    ]
  };
}


function studioV01RichTextProp_(text) {
  const s =
    String(text || '');

  return {
    rich_text:
      s
        ? [
            {
              type: 'text',
              text: {
                content:
                  s.slice(
                    0,
                    1900
                  )
              }
            }
          ]
        : []
  };
}


function studioV01RelationProp_(ids) {
  return {
    relation:
      (ids || [])
        .filter(Boolean)
        .map(id => ({
          id: id
        }))
  };
}


/* =========================================================
 * DRIVE / HTML
 * ========================================================= */

function studioV01ExtractDriveFolderId_(url) {
  const m =
    String(url || '')
      .match(
        /\/folders\/([A-Za-z0-9_-]+)/
      );

  return m ? m[1] : '';
}


function studioV01GetOrCreateChildFolder_(
  parentFolder,
  name
) {
  const it =
    parentFolder
      .getFoldersByName(name);

  return it.hasNext()
    ? it.next()
    : parentFolder.createFolder(
        name
      );
}


function studioV01FormatDuration_(sec) {
  sec = Math.round(
    Number(sec || 0)
  );

  const m =
    Math.floor(sec / 60);

  const s =
    sec % 60;

  return (
    m +
    ':' +
    String(s).padStart(2, '0')
  );
}


function studioV01Html_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function studioV01AutoLinkHtml_(line) {
  const escaped =
    studioV01Html_(line || '');

  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
}


/* =========================================================
 * MISC
 * ========================================================= */

function studioV01JstDateOnly_(date) {
  return Utilities.formatDate(
    date,
    OC_STUDIO_V01.TIMEZONE,
    'yyyy-MM-dd'
  );
}


function studioV01ShiftDateOnly_(
  dateOnly,
  days
) {
  const d =
    new Date(
      dateOnly +
      'T12:00:00+09:00'
    );

  d.setTime(
    d.getTime() +
    Number(days) *
    86400000
  );

  return studioV01JstDateOnly_(d);
}


function studioV01CountBy_(
  rows,
  key
) {
  const out = {};

  (rows || []).forEach(r => {
    const value =
      r[key] || '(blank)';

    out[value] =
      (out[value] || 0) + 1;
  });

  return out;
}

// ============================================================
// CURRENT MODULE: Weekly Review Queue Resolver
// ============================================================

/**
 * OC-OS Weekly Review Queue Resolver
 * v0.2.0 (2026-09-29)
 *
 * Responsibilities:
 * - Resolve the weekly Review Queue window from EPISODES.
 * - Inspect the four saved INBOX views used by Weekly Control.
 * - Preview the Detected_At boundary changes without writing.
 * - Apply only the approved filter changes when sync is explicitly run.
 *
 * Safety:
 * - Preview is always READ ONLY.
 * - Sync performs a complete preflight before the first write.
 * - Only the four configured View IDs may be PATCHed.
 * - PATCH body is restricted to { filter: ... } only.
 * - Unchanged Views are skipped.
 * - Every changed View is re-fetched and verified immediately after PATCH.
 * - No trigger installer is included.
 * - No EPISODE, INBOX row, page, data-source schema, Drive file, or Script Property is modified.
 * - On ambiguity or verification failure, stop instead of guessing.
 */

const OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01 = Object.freeze({
  VERSION: '0.2.0',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  INBOX_DS: '7e3a247d-8d7b-4ed7-a4b1-cfac6ec45f16',
  ACTIVE_STATUSES: ['準備中', '収録準備済'],
  DETECTED_AT_PROPERTY: 'Detected_At',
  BOOTSTRAP_ANCHORS: Object.freeze({
    '2026-10-04': '2026-09-23'
  }),
  REVIEW_VIEWS: Object.freeze([
    Object.freeze({ key: 'GENERAL', name: '要判断・要確認 INBOX', id: '3e7031bc-0d45-810d-994e-000c5ce4ea76' }),
    Object.freeze({ key: 'OFFICIAL_UNDECIDED', name: '① 公式優先｜未判断', id: '3e7031bc-0d45-810c-b376-000ce812b80a' }),
    Object.freeze({ key: 'EXTERNAL_UNDECIDED', name: '② 外部未判定｜未判断', id: '3e7031bc-0d45-8116-823f-000ce92f1635' }),
    Object.freeze({ key: 'DECIDED_PROCESSOR_WAIT', name: '③ 判断済み｜Processor待ち', id: '3e7031bc-0d45-81af-b5b7-000c31b455e1' })
  ])
});

/** READ ONLY entry point. */
function previewWeeklyReviewQueueResolverV01() {
  const plan = weeklyReviewV01BuildPlan_();
  const out = weeklyReviewV01PreviewOutput_(plan);

  console.log('========================================');
  console.log('OC-OS WEEKLY REVIEW QUEUE RESOLVER PREVIEW');
  console.log('VERSION = ' + OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Explicit WRITE entry point.
 * No trigger is installed by this file. Run manually only after Preview review.
 */
function syncWeeklyReviewQueueResolverV01() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    const locked = {
      write: 'NONE',
      version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
      action: 'BLOCK_LOCK_UNAVAILABLE',
      reason: '別のReview Queue Resolver実行が進行中のため停止しました。',
      writeCount: 0,
      results: []
    };
    weeklyReviewV01LogSync_(locked);
    return locked;
  }

  try {
    const plan = weeklyReviewV01BuildPlan_();

    if (plan.action !== 'READY') {
      const blocked = {
        write: 'NONE',
        version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
        action: plan.action,
        reason: plan.reason,
        currentEpisode: plan.currentEpisode,
        previous: plan.previous,
        window: plan.window,
        detectedAtProperty: plan.detectedAtProperty,
        writeCount: 0,
        results: [],
        warnings: plan.warnings || []
      };
      weeklyReviewV01LogSync_(blocked);
      return blocked;
    }

    if (!plan.views || plan.views.length !== OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.length) {
      const incomplete = weeklyReviewV01SyncBlockFromPlan_(
        plan,
        'BLOCK_PREFLIGHT_VIEW_COUNT_MISMATCH',
        '4 Viewすべての事前検査が揃っていません。'
      );
      weeklyReviewV01LogSync_(incomplete);
      return incomplete;
    }

    for (let i = 0; i < plan.views.length; i++) {
      if (plan.views[i].action !== 'READY') {
        const failedPreflight = weeklyReviewV01SyncBlockFromPlan_(
          plan,
          'BLOCK_PREFLIGHT_NOT_READY',
          '4 ViewすべてがREADYではないため書込みを開始しません。'
        );
        weeklyReviewV01LogSync_(failedPreflight);
        return failedPreflight;
      }
    }

    const results = [];
    let writeCount = 0;
    let changedCount = 0;

    for (let i = 0; i < plan.views.length; i++) {
      const viewPlan = plan.views[i];

      if (!viewPlan.wouldChange) {
        results.push({
          key: viewPlan.key,
          name: viewPlan.name,
          viewId: viewPlan.viewId,
          action: 'SKIP_ALREADY_CURRENT',
          before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
          after: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
          verified: true
        });
        continue;
      }

      changedCount++;

      try {
        weeklyReviewV01PatchViewFilter_(viewPlan.viewId, viewPlan.proposedFilter);
        writeCount++;
      } catch (err) {
        const patchFailed = {
          write: writeCount > 0 ? 'PARTIAL' : 'NONE',
          version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
          action: writeCount > 0 ? 'ERROR_PATCH_FAILED_PARTIAL_WRITE_RISK' : 'ERROR_PATCH_FAILED',
          reason: String(err && err.message ? err.message : err),
          currentEpisode: plan.currentEpisode,
          previous: plan.previous,
          window: plan.window,
          detectedAtProperty: plan.detectedAtProperty,
          changedCount: changedCount,
          writeCount: writeCount,
          results: results.concat([{
            key: viewPlan.key,
            name: viewPlan.name,
            viewId: viewPlan.viewId,
            action: 'PATCH_FAILED',
            before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
            after: null,
            verified: false
          }]),
          warnings: plan.warnings || []
        };
        weeklyReviewV01LogSync_(patchFailed);
        return patchFailed;
      }

      const verification = weeklyReviewV01VerifyPatchedView_(
        viewPlan,
        plan.window,
        plan.detectedAtProperty
      );

      results.push({
        key: viewPlan.key,
        name: viewPlan.name,
        viewId: viewPlan.viewId,
        action: verification.verified ? 'VERIFIED' : 'VERIFY_FAILED',
        before: weeklyReviewV01Clone_(viewPlan.dateAudit.current),
        after: verification.after,
        verified: verification.verified,
        filterEquivalent: verification.filterEquivalent,
        reason: verification.reason
      });

      if (!verification.verified) {
        const verifyFailed = {
          write: 'PARTIAL',
          version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
          action: 'ERROR_VERIFY_FAILED_PARTIAL_WRITE_RISK',
          reason: verification.reason,
          currentEpisode: plan.currentEpisode,
          previous: plan.previous,
          window: plan.window,
          detectedAtProperty: plan.detectedAtProperty,
          changedCount: changedCount,
          writeCount: writeCount,
          results: results,
          warnings: plan.warnings || []
        };
        weeklyReviewV01LogSync_(verifyFailed);
        return verifyFailed;
      }
    }

    const out = {
      write: writeCount === 0 ? 'NONE' : 'COMPLETED',
      version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
      action: writeCount === 0 ? 'SKIP_ALREADY_CURRENT' : 'VERIFIED',
      reason: writeCount === 0
        ? '4 Viewすべて既に現在のReview Windowと一致しているため書込みはありません。'
        : '変更対象ViewのPATCHと再取得検証が完了しました。',
      currentEpisode: plan.currentEpisode,
      previous: plan.previous,
      window: plan.window,
      detectedAtProperty: plan.detectedAtProperty,
      changedCount: changedCount,
      writeCount: writeCount,
      results: results,
      warnings: plan.warnings || []
    };
    weeklyReviewV01LogSync_(out);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function weeklyReviewV01PreviewOutput_(plan) {
  return {
    write: 'NONE',
    version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
    action: plan.action,
    reason: plan.reason,
    currentEpisode: plan.currentEpisode,
    previous: plan.previous,
    window: plan.window,
    detectedAtProperty: plan.detectedAtProperty,
    views: plan.views,
    warnings: plan.warnings
  };
}

function weeklyReviewV01LogSync_(out) {
  console.log('========================================');
  console.log('OC-OS WEEKLY REVIEW QUEUE RESOLVER SYNC');
  console.log('VERSION = ' + OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION);
  console.log('WRITE = ' + (out.write || 'NONE'));
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
}

function weeklyReviewV01SyncBlockFromPlan_(plan, action, reason) {
  return {
    write: 'NONE',
    version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
    action: action,
    reason: reason,
    currentEpisode: plan.currentEpisode,
    previous: plan.previous,
    window: plan.window,
    detectedAtProperty: plan.detectedAtProperty,
    writeCount: 0,
    results: [],
    warnings: plan.warnings || []
  };
}

function weeklyReviewV01BuildPlan_() {
  const warnings = [];
  const activeEpisodes = weeklyReviewV01GetActiveEpisodes_();

  if (activeEpisodes.length === 0) {
    return weeklyReviewV01Blocked_('BLOCK_NO_ACTIVE_EPISODE', '準備中 / 収録準備済 のEPISODEが存在しません。', null, null, null, null, warnings);
  }
  if (activeEpisodes.length > 1) {
    warnings.push('Active EPISODE count=' + activeEpisodes.length);
    return weeklyReviewV01Blocked_('BLOCK_MULTIPLE_ACTIVE_EPISODES', '準備中 / 収録準備済 のEPISODEが複数存在します。', null, null, null, null, warnings);
  }

  const currentEpisode = weeklyReviewV01EpisodeSummary_(activeEpisodes[0]);
  const currentRecordingDate = weeklyReviewV01DateOnly_(currentEpisode.recordingDate);

  if (!currentEpisode.episodeKey) {
    return weeklyReviewV01Blocked_('BLOCK_CURRENT_EPISODE_KEY_MISSING', 'Current EPISODEにEpisode_Keyがありません。', currentEpisode, null, null, null, null, warnings);
  }
  if (!currentRecordingDate) {
    return weeklyReviewV01Blocked_('BLOCK_CURRENT_RECORDING_DATE_MISSING', 'Current EPISODEにRecording_Dateがありません。', currentEpisode, null, null, null, null, warnings);
  }

  const previousResolved = weeklyReviewV01ResolvePrevious_(currentEpisode.episodeKey, currentRecordingDate);
  if (previousResolved.action !== 'READY') {
    return weeklyReviewV01Blocked_(previousResolved.action, previousResolved.reason, currentEpisode, previousResolved.previous, null, null, warnings.concat(previousResolved.warnings || []));
  }

  const previousDate = weeklyReviewV01DateOnly_(previousResolved.previous.recordingDate);
  if (!previousDate) {
    return weeklyReviewV01Blocked_('BLOCK_PREVIOUS_RECORDING_DATE_MISSING', 'Previous Recording_Dateを安全に確定できません。', currentEpisode, previousResolved.previous, null, null, warnings);
  }
  if (previousDate > currentRecordingDate) {
    return weeklyReviewV01Blocked_('BLOCK_INVALID_WINDOW_ORDER', 'Previous Recording_DateがCurrent Recording_Dateより後です。', currentEpisode, previousResolved.previous, null, null, warnings);
  }

  const window = { from: previousDate, to: currentRecordingDate, inclusive: true };
  const detectedResolved = weeklyReviewV01ResolveDetectedAtProperty_();
  if (detectedResolved.action !== 'READY') {
    return weeklyReviewV01Blocked_(detectedResolved.action, detectedResolved.reason, currentEpisode, previousResolved.previous, window, detectedResolved.property, warnings.concat(detectedResolved.warnings || []));
  }

  const detectedAtProperty = detectedResolved.property;
  const viewPlans = [];
  for (let i = 0; i < OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.length; i++) {
    const spec = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS[i];
    const viewPlan = weeklyReviewV01InspectView_(spec, window, detectedAtProperty);
    viewPlans.push(viewPlan);
    if (viewPlan.action !== 'READY') {
      return {
        action: viewPlan.action,
        reason: viewPlan.reason,
        currentEpisode: currentEpisode,
        previous: previousResolved.previous,
        window: window,
        detectedAtProperty: detectedAtProperty,
        views: viewPlans,
        warnings: warnings.concat(viewPlan.warnings || [])
      };
    }
  }

  return {
    action: 'READY',
    reason: 'EPISODESからReview Windowを一意に解決し、4 Viewの予定Filterを安全に生成できました。',
    currentEpisode: currentEpisode,
    previous: previousResolved.previous,
    window: window,
    detectedAtProperty: detectedAtProperty,
    views: viewPlans,
    warnings: warnings
  };
}

function weeklyReviewV01Blocked_(action, reason, currentEpisode, previous, window, detectedAtProperty, warnings) {
  return {
    action: action,
    reason: reason,
    currentEpisode: currentEpisode || null,
    previous: previous || null,
    window: window || null,
    detectedAtProperty: detectedAtProperty || null,
    views: [],
    warnings: warnings || []
  };
}

function weeklyReviewV01GetActiveEpisodes_() {
  const filters = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.ACTIVE_STATUSES.map(function(status) {
    return { property: 'Production_Status', select: { equals: status } };
  });
  return weeklyReviewV01QueryAll_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 100
  });
}

function weeklyReviewV01ResolvePrevious_(currentEpisodeKey, currentRecordingDate) {
  const warnings = [];
  const result = weeklyReviewV01QueryPage_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: { property: 'Recording_Date', date: { before: currentRecordingDate } },
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 2
  });
  const pages = result.results || [];

  if (pages.length === 0) {
    const anchor = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.BOOTSTRAP_ANCHORS[currentEpisodeKey];
    if (!anchor) {
      return { action: 'BLOCK_NO_PREVIOUS_EPISODE', reason: '前回EPISODEが存在せず、このEpisode_KeyにはBootstrap Anchorもありません。', previous: null, warnings: warnings };
    }
    return {
      action: 'READY',
      reason: '初回Pilotの承認済みBootstrap Anchorを使用します。',
      previous: { source: 'BOOTSTRAP_ANCHOR', episodeKey: null, recordingDate: anchor, pageId: null, url: null },
      warnings: warnings
    };
  }

  const first = weeklyReviewV01EpisodeSummary_(pages[0]);
  const firstDate = weeklyReviewV01DateOnly_(first.recordingDate);
  if (!firstDate) {
    return { action: 'BLOCK_PREVIOUS_RECORDING_DATE_MISSING', reason: '直前EPISODE候補にRecording_Dateがありません。', previous: first, warnings: warnings };
  }

  if (pages.length > 1) {
    const secondDate = weeklyReviewV01DateOnly_(weeklyReviewV01EpisodeSummary_(pages[1]).recordingDate);
    if (secondDate && secondDate === firstDate) {
      warnings.push('Duplicate previous Recording_Date=' + firstDate);
      return { action: 'BLOCK_DUPLICATE_PREVIOUS_RECORDING_DATE', reason: '直前Recording_Dateを持つEPISODEが複数存在します。', previous: first, warnings: warnings };
    }
  }

  return {
    action: 'READY',
    reason: 'EPISODESの直前Recording_Dateを使用します。',
    previous: { source: 'EPISODES', episodeKey: first.episodeKey, recordingDate: firstDate, pageId: first.pageId, url: first.url },
    warnings: warnings
  };
}

function weeklyReviewV01ResolveDetectedAtProperty_() {
  const warnings = [];
  let dataSource;
  try {
    dataSource = weeklyReviewV01GetDataSource_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.INBOX_DS);
  } catch (err) {
    return { action: 'BLOCK_INBOX_DATA_SOURCE_FETCH_FAILED', reason: String(err && err.message ? err.message : err), property: null, warnings: warnings };
  }

  const properties = dataSource && dataSource.properties ? dataSource.properties : null;
  if (!properties || !Object.prototype.hasOwnProperty.call(properties, OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY)) {
    return { action: 'BLOCK_DETECTED_AT_PROPERTY_NOT_FOUND', reason: 'INBOX Data SourceにDetected_At propertyがありません。', property: null, warnings: warnings };
  }

  const prop = properties[OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY] || {};
  if (!prop.id) {
    return {
      action: 'BLOCK_DETECTED_AT_PROPERTY_ID_MISSING',
      reason: 'Detected_At propertyのIDを取得できません。',
      property: { name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY, id: null, type: prop.type || '' },
      warnings: warnings
    };
  }
  if (prop.type && prop.type !== 'date') {
    return {
      action: 'BLOCK_DETECTED_AT_PROPERTY_TYPE_MISMATCH',
      reason: 'Detected_At propertyがdate型ではありません。type=' + prop.type,
      property: { name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY, id: prop.id, type: prop.type },
      warnings: warnings
    };
  }

  return {
    action: 'READY',
    reason: 'Detected_Atのproperty name / IDを解決しました。',
    property: {
      name: prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY,
      id: String(prop.id),
      type: prop.type || 'date',
      acceptedRefs: weeklyReviewV01UniqueStrings_([
        prop.name || OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY,
        String(prop.id),
        weeklyReviewV01SafeDecode_(String(prop.id))
      ])
    },
    warnings: warnings
  };
}

function weeklyReviewV01EpisodeSummary_(page) {
  if (!page) return null;
  return {
    pageId: page.id || '',
    url: page.url || '',
    episodeKey: weeklyReviewV01Title_(page.properties && page.properties['Episode_Key']),
    recordingDate: weeklyReviewV01DateStart_(page.properties && page.properties['Recording_Date']),
    airDate: weeklyReviewV01DateStart_(page.properties && page.properties['Air_Date']),
    productionStatus: weeklyReviewV01Select_(page.properties && page.properties['Production_Status'])
  };
}

function weeklyReviewV01InspectView_(spec, window, detectedAtProperty) {
  const warnings = [];
  let view;
  try {
    view = weeklyReviewV01GetView_(spec.id);
  } catch (err) {
    return weeklyReviewV01ViewBlocked_(spec, null, 'BLOCK_VIEW_FETCH_FAILED', String(err && err.message ? err.message : err), { lower: [], upper: [], observedDatePropertyRefs: [] }, warnings);
  }

  if (!view || !view.filter) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_FILTER_MISSING', '保存ViewにFilterがありません。', { lower: [], upper: [], observedDatePropertyRefs: [] }, warnings);
  }
  if (view.name && view.name !== spec.name) {
    warnings.push('Configured name differs from actual view name: ' + view.name);
  }

  const proposedFilter = weeklyReviewV01Clone_(view.filter);
  const matches = weeklyReviewV01FindDetectedAtBoundaries_(proposedFilter, detectedAtProperty);

  if (matches.lower.length !== 1) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_LOWER_BOUNDARY_AMBIGUOUS', 'Detected_At on_or_after が1件ちょうどではありません。count=' + matches.lower.length, matches, warnings);
  }
  if (matches.upper.length !== 1) {
    return weeklyReviewV01ViewBlocked_(spec, view, 'BLOCK_VIEW_UPPER_BOUNDARY_AMBIGUOUS', 'Detected_At on_or_before が1件ちょうどではありません。count=' + matches.upper.length, matches, warnings);
  }

  const beforeLower = matches.lower[0].date.on_or_after;
  const beforeUpper = matches.upper[0].date.on_or_before;
  matches.lower[0].date.on_or_after = window.from;
  matches.upper[0].date.on_or_before = window.to;

  return {
    key: spec.key,
    name: spec.name,
    viewId: spec.id,
    actualName: view.name || '',
    action: 'READY',
    reason: '既存Filterを保持し、Detected_At境界だけを置換可能です。',
    wouldChange: beforeLower !== window.from || beforeUpper !== window.to,
    dateAudit: {
      matchedPropertyRefs: weeklyReviewV01UniqueStrings_(matches.lower.concat(matches.upper).map(function(node) { return String(node.property || ''); })),
      observedDatePropertyRefs: matches.observedDatePropertyRefs,
      current: { onOrAfter: beforeLower, onOrBefore: beforeUpper },
      proposed: { onOrAfter: window.from, onOrBefore: window.to },
      lowerMatchCount: matches.lower.length,
      upperMatchCount: matches.upper.length
    },
    proposedFilter: proposedFilter,
    warnings: warnings
  };
}

function weeklyReviewV01ViewBlocked_(spec, view, action, reason, matches, warnings) {
  return {
    key: spec.key,
    name: spec.name,
    viewId: spec.id,
    actualName: view && view.name ? view.name : '',
    action: action,
    reason: reason,
    wouldChange: null,
    dateAudit: {
      lowerMatchCount: matches && matches.lower ? matches.lower.length : 0,
      upperMatchCount: matches && matches.upper ? matches.upper.length : 0,
      observedDatePropertyRefs: matches && matches.observedDatePropertyRefs ? matches.observedDatePropertyRefs : []
    },
    proposedFilter: null,
    warnings: warnings || []
  };
}

function weeklyReviewV01FindDetectedAtBoundaries_(filter, detectedAtProperty) {
  const out = { lower: [], upper: [], observedDatePropertyRefs: [] };
  weeklyReviewV01WalkObject_(filter, function(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (!node.date || typeof node.date !== 'object') return;

    if (node.property !== undefined && node.property !== null) {
      out.observedDatePropertyRefs.push(String(node.property));
    }
    if (!weeklyReviewV01PropertyRefMatches_(node.property, detectedAtProperty)) return;

    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_after')) out.lower.push(node);
    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_before')) out.upper.push(node);
  });
  out.observedDatePropertyRefs = weeklyReviewV01UniqueStrings_(out.observedDatePropertyRefs);
  return out;
}

function weeklyReviewV01PropertyRefMatches_(ref, detectedAtProperty) {
  if (ref === undefined || ref === null || !detectedAtProperty) return false;
  const candidate = String(ref);
  const accepted = weeklyReviewV01UniqueStrings_([
    detectedAtProperty.name,
    detectedAtProperty.id,
    weeklyReviewV01SafeDecode_(detectedAtProperty.id)
  ]);
  const decodedCandidate = weeklyReviewV01SafeDecode_(candidate);
  return accepted.indexOf(candidate) >= 0 || accepted.indexOf(decodedCandidate) >= 0;
}

function weeklyReviewV01VerifyPatchedView_(viewPlan, window, detectedAtProperty) {
  try {
    const view = weeklyReviewV01GetView_(viewPlan.viewId);
    if (!view || !view.filter) {
      return { verified: false, filterEquivalent: false, after: null, reason: '再取得したViewにFilterがありません。' };
    }

    const matches = weeklyReviewV01FindDetectedAtBoundaries_(view.filter, detectedAtProperty);
    if (matches.lower.length !== 1 || matches.upper.length !== 1) {
      return {
        verified: false,
        filterEquivalent: false,
        after: null,
        reason: '再取得後のDetected_At境界が一意ではありません。lower=' + matches.lower.length + ' upper=' + matches.upper.length
      };
    }

    const after = {
      onOrAfter: matches.lower[0].date.on_or_after,
      onOrBefore: matches.upper[0].date.on_or_before
    };
    const boundaryOk = after.onOrAfter === window.from && after.onOrBefore === window.to;
    const filterEquivalent = weeklyReviewV01FiltersEquivalent_(view.filter, viewPlan.proposedFilter);

    return {
      verified: boundaryOk && filterEquivalent,
      filterEquivalent: filterEquivalent,
      after: after,
      reason: boundaryOk && filterEquivalent
        ? 'PATCH後の境界値とFilter全体が予定値と一致しました。'
        : 'PATCH後の再検証が予定値と一致しません。boundaryOk=' + boundaryOk + ' filterEquivalent=' + filterEquivalent
    };
  } catch (err) {
    return {
      verified: false,
      filterEquivalent: false,
      after: null,
      reason: String(err && err.message ? err.message : err)
    };
  }
}

function weeklyReviewV01FiltersEquivalent_(a, b) {
  return JSON.stringify(weeklyReviewV01Canonicalize_(a)) === JSON.stringify(weeklyReviewV01Canonicalize_(b));
}

function weeklyReviewV01Canonicalize_(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(function(item) { return weeklyReviewV01Canonicalize_(item); });
    return normalized.sort(function(a, b) {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : (sa > sb ? 1 : 0);
    });
  }
  if (!value || typeof value !== 'object') return value;

  const out = {};
  Object.keys(value).sort().forEach(function(key) {
    out[key] = weeklyReviewV01Canonicalize_(value[key]);
  });
  return out;
}

function weeklyReviewV01WalkObject_(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach(function(item) { weeklyReviewV01WalkObject_(item, visitor); });
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value);
  Object.keys(value).forEach(function(key) { weeklyReviewV01WalkObject_(value[key], visitor); });
}

function weeklyReviewV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') || p.getProperty('NOTION_TOKEN') || p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function weeklyReviewV01GetView_(viewId) {
  return weeklyReviewV01ReadRequest_('get', '/views/' + encodeURIComponent(viewId), null);
}

function weeklyReviewV01GetDataSource_(dataSourceId) {
  return weeklyReviewV01ReadRequest_('get', '/data_sources/' + encodeURIComponent(dataSourceId), null);
}

function weeklyReviewV01QueryPage_(dataSourceId, body) {
  const req = weeklyReviewV01Clone_(body || {});
  req.page_size = Math.min(req.page_size || 100, 100);
  return weeklyReviewV01ReadRequest_('post', '/data_sources/' + encodeURIComponent(dataSourceId) + '/query', req);
}

function weeklyReviewV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = weeklyReviewV01Clone_(body || {});
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = weeklyReviewV01ReadRequest_('post', '/data_sources/' + encodeURIComponent(dataSourceId) + '/query', req);
    (r.results || []).forEach(function(item) { out.push(item); });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

/** GET and query POST only. */
function weeklyReviewV01ReadRequest_(method, path, payload) {
  const normalizedMethod = String(method || '').toLowerCase();
  const normalizedPath = String(path || '');
  const isReadGet = normalizedMethod === 'get';
  const isReadQuery = normalizedMethod === 'post' && /\/query$/.test(normalizedPath);

  if (!isReadGet && !isReadQuery) {
    throw new Error('READ guard blocked Notion request: method=' + normalizedMethod + ' path=' + normalizedPath);
  }

  return weeklyReviewV01FetchNotion_(normalizedMethod, normalizedPath, payload);
}

/**
 * Dedicated write gate.
 * Only configured Review View IDs are allowed and only {filter: ...} is sent.
 */
function weeklyReviewV01PatchViewFilter_(viewId, filter) {
  const allowedIds = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.map(function(spec) { return spec.id; });
  if (allowedIds.indexOf(String(viewId)) < 0) {
    throw new Error('WRITE guard blocked unconfigured View ID: ' + viewId);
  }
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    throw new Error('WRITE guard requires a filter object.');
  }

  const payload = { filter: weeklyReviewV01Clone_(filter) };
  return weeklyReviewV01FetchNotion_(
    'patch',
    '/views/' + encodeURIComponent(viewId),
    payload
  );
}

function weeklyReviewV01FetchNotion_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + weeklyReviewV01Token_(),
      'Notion-Version': OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.NOTION_VERSION
    }
  };
  if (payload !== undefined && payload !== null) options.payload = JSON.stringify(payload);

  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion API ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function weeklyReviewV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(function(x) { return x.plain_text || ''; }).join('') : '';
}

function weeklyReviewV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function weeklyReviewV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function weeklyReviewV01DateOnly_(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function weeklyReviewV01SafeDecode_(value) {
  const s = String(value || '');
  try { return decodeURIComponent(s); } catch (err) { return s; }
}

function weeklyReviewV01UniqueStrings_(values) {
  const out = [];
  (values || []).forEach(function(value) {
    if (value === undefined || value === null) return;
    const s = String(value);
    if (!s) return;
    if (out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

function weeklyReviewV01Clone_(value) {
  return JSON.parse(JSON.stringify(value));
}


// ============================================================
// CURRENT FAMILY FACADE
// ============================================================

const OCOS_WEEKLY_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  FAMILY: 'weekly-production',
  MODULES: Object.freeze([
    'episode-bootstrap',
    'target-episode-lock',
    'studio-automation',
    'weekly-review-queue'
  ])
});

function previewWeeklyCurrentOverview() {
  return {
    version: OCOS_WEEKLY_CURRENT.VERSION,
    family: OCOS_WEEKLY_CURRENT.FAMILY,
    modules: OCOS_WEEKLY_CURRENT.MODULES,
    bootstrap: previewWeeklyEpisodeBootstrapV01(),
    targetLocks: previewTargetEpisodeLocksV01(),
    studioPack: previewStudioPackV01(),
    reviewQueue: previewWeeklyReviewQueueResolverV01()
  };
}