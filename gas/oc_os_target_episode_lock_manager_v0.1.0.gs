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
