/**
 * OC-OS Weekly Review Queue Resolver
 * v0.1.0-preview (2026-09-29)
 *
 * Purpose:
 * - Resolve the weekly Review Queue window from EPISODES.
 * - Inspect the four saved INBOX views used by Weekly Control.
 * - Produce a read-only preview of the Detected_At date changes that would be needed.
 *
 * Safety:
 * - READ ONLY. This file contains no PATCH/DELETE/CREATE operation.
 * - Notion access is limited to GET and data-source query POST requests.
 * - No trigger installer is included.
 * - No Notion page, data-source row, view, Drive file, or Script Property is modified.
 * - Existing view conditions other than the two Detected_At boundary conditions are never rebuilt.
 * - If the expected structure is ambiguous, the resolver BLOCKs instead of guessing.
 *
 * Window rule:
 * - Current = the single active EPISODE (準備中 / 収録準備済).
 * - Previous = latest EPISODE whose Recording_Date is before Current Recording_Date.
 * - Window is inclusive: Previous Recording_Date <= Detected_At <= Current Recording_Date.
 * - Only the initial 2026-10-04 Pilot may use the approved Bootstrap Anchor 2026-09-23
 *   when no previous EPISODE exists.
 *
 * Required Script Property:
 * - NOTION_API_TOKEN (preferred; NOTION_TOKEN / NOTION_SECRET fallback)
 */

const OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  ACTIVE_STATUSES: ['準備中', '収録準備済'],
  DETECTED_AT_PROPERTY: 'Detected_At',
  BOOTSTRAP_ANCHORS: Object.freeze({
    '2026-10-04': '2026-09-23'
  }),
  REVIEW_VIEWS: Object.freeze([
    Object.freeze({
      key: 'GENERAL',
      name: '要判断・要確認 INBOX',
      id: '3e7031bc-0d45-810d-994e-000c5ce4ea76'
    }),
    Object.freeze({
      key: 'OFFICIAL_UNDECIDED',
      name: '① 公式優先｜未判断',
      id: '3e7031bc-0d45-810c-b376-000ce812b80a'
    }),
    Object.freeze({
      key: 'EXTERNAL_UNDECIDED',
      name: '② 外部未判定｜未判断',
      id: '3e7031bc-0d45-8116-823f-000ce92f1635'
    }),
    Object.freeze({
      key: 'DECIDED_PROCESSOR_WAIT',
      name: '③ 判断済み｜Processor待ち',
      id: '3e7031bc-0d45-81af-b5b7-000c31b455e1'
    })
  ])
});

/** READ ONLY public entry point. */
function previewWeeklyReviewQueueResolverV01() {
  const plan = weeklyReviewV01BuildPlan_();
  const out = {
    write: 'NONE',
    version: OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION,
    action: plan.action,
    reason: plan.reason,
    currentEpisode: plan.currentEpisode,
    previous: plan.previous,
    window: plan.window,
    views: plan.views,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS WEEKLY REVIEW QUEUE RESOLVER PREVIEW');
  console.log('VERSION = ' + OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function weeklyReviewV01BuildPlan_() {
  const warnings = [];
  const activeEpisodes = weeklyReviewV01GetActiveEpisodes_();

  if (activeEpisodes.length === 0) {
    return weeklyReviewV01Blocked_(
      'BLOCK_NO_ACTIVE_EPISODE',
      '準備中 / 収録準備済 のEPISODEが存在しません。',
      null,
      null,
      warnings
    );
  }

  if (activeEpisodes.length > 1) {
    warnings.push('Active EPISODE count=' + activeEpisodes.length);
    return weeklyReviewV01Blocked_(
      'BLOCK_MULTIPLE_ACTIVE_EPISODES',
      '準備中 / 収録準備済 のEPISODEが複数存在します。',
      null,
      null,
      warnings
    );
  }

  const currentPage = activeEpisodes[0];
  const currentEpisode = weeklyReviewV01EpisodeSummary_(currentPage);
  const currentRecordingDate = weeklyReviewV01DateOnly_(currentEpisode.recordingDate);

  if (!currentEpisode.episodeKey) {
    return weeklyReviewV01Blocked_(
      'BLOCK_CURRENT_EPISODE_KEY_MISSING',
      'Current EPISODEにEpisode_Keyがありません。',
      currentEpisode,
      null,
      warnings
    );
  }

  if (!currentRecordingDate) {
    return weeklyReviewV01Blocked_(
      'BLOCK_CURRENT_RECORDING_DATE_MISSING',
      'Current EPISODEにRecording_Dateがありません。',
      currentEpisode,
      null,
      warnings
    );
  }

  const previousResolved = weeklyReviewV01ResolvePrevious_(
    currentEpisode.episodeKey,
    currentRecordingDate
  );

  if (previousResolved.action !== 'READY') {
    return weeklyReviewV01Blocked_(
      previousResolved.action,
      previousResolved.reason,
      currentEpisode,
      previousResolved.previous,
      warnings.concat(previousResolved.warnings || [])
    );
  }

  const previousDate = weeklyReviewV01DateOnly_(previousResolved.previous.recordingDate);
  if (!previousDate) {
    return weeklyReviewV01Blocked_(
      'BLOCK_PREVIOUS_RECORDING_DATE_MISSING',
      'Previous Recording_Dateを安全に確定できません。',
      currentEpisode,
      previousResolved.previous,
      warnings
    );
  }

  if (previousDate > currentRecordingDate) {
    return weeklyReviewV01Blocked_(
      'BLOCK_INVALID_WINDOW_ORDER',
      'Previous Recording_DateがCurrent Recording_Dateより後です。',
      currentEpisode,
      previousResolved.previous,
      warnings
    );
  }

  const window = {
    from: previousDate,
    to: currentRecordingDate,
    inclusive: true
  };

  const viewPlans = [];
  for (let i = 0; i < OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS.length; i++) {
    const spec = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.REVIEW_VIEWS[i];
    const viewPlan = weeklyReviewV01InspectView_(spec, window);
    viewPlans.push(viewPlan);

    if (viewPlan.action !== 'READY') {
      return {
        action: viewPlan.action,
        reason: viewPlan.reason,
        currentEpisode: currentEpisode,
        previous: previousResolved.previous,
        window: window,
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
    views: viewPlans,
    warnings: warnings
  };
}

function weeklyReviewV01Blocked_(action, reason, currentEpisode, previous, warnings) {
  return {
    action: action,
    reason: reason,
    currentEpisode: currentEpisode || null,
    previous: previous || null,
    window: null,
    views: [],
    warnings: warnings || []
  };
}

function weeklyReviewV01GetActiveEpisodes_() {
  const filters = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.ACTIVE_STATUSES.map(function(status) {
    return {
      property: 'Production_Status',
      select: { equals: status }
    };
  });

  return weeklyReviewV01QueryAll_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 100
  });
}

function weeklyReviewV01ResolvePrevious_(currentEpisodeKey, currentRecordingDate) {
  const warnings = [];

  // Two rows are enough to detect whether the latest prior Recording_Date is duplicated.
  const result = weeklyReviewV01QueryPage_(OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.EPISODES_DS, {
    filter: {
      property: 'Recording_Date',
      date: { before: currentRecordingDate }
    },
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 2
  });

  const pages = result.results || [];

  if (pages.length === 0) {
    const anchor = OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.BOOTSTRAP_ANCHORS[currentEpisodeKey];
    if (!anchor) {
      return {
        action: 'BLOCK_NO_PREVIOUS_EPISODE',
        reason: '前回EPISODEが存在せず、このEpisode_KeyにはBootstrap Anchorもありません。',
        previous: null,
        warnings: warnings
      };
    }

    return {
      action: 'READY',
      reason: '初回Pilotの承認済みBootstrap Anchorを使用します。',
      previous: {
        source: 'BOOTSTRAP_ANCHOR',
        episodeKey: null,
        recordingDate: anchor,
        pageId: null,
        url: null
      },
      warnings: warnings
    };
  }

  const first = weeklyReviewV01EpisodeSummary_(pages[0]);
  const firstDate = weeklyReviewV01DateOnly_(first.recordingDate);
  if (!firstDate) {
    return {
      action: 'BLOCK_PREVIOUS_RECORDING_DATE_MISSING',
      reason: '直前EPISODE候補にRecording_Dateがありません。',
      previous: first,
      warnings: warnings
    };
  }

  if (pages.length > 1) {
    const second = weeklyReviewV01EpisodeSummary_(pages[1]);
    const secondDate = weeklyReviewV01DateOnly_(second.recordingDate);
    if (secondDate && secondDate === firstDate) {
      warnings.push('Duplicate previous Recording_Date=' + firstDate);
      return {
        action: 'BLOCK_DUPLICATE_PREVIOUS_RECORDING_DATE',
        reason: '直前Recording_Dateを持つEPISODEが複数存在します。',
        previous: first,
        warnings: warnings
      };
    }
  }

  return {
    action: 'READY',
    reason: 'EPISODESの直前Recording_Dateを使用します。',
    previous: {
      source: 'EPISODES',
      episodeKey: first.episodeKey,
      recordingDate: firstDate,
      pageId: first.pageId,
      url: first.url
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

function weeklyReviewV01InspectView_(spec, window) {
  const warnings = [];
  let view;

  try {
    view = weeklyReviewV01GetView_(spec.id);
  } catch (err) {
    return {
      key: spec.key,
      name: spec.name,
      viewId: spec.id,
      action: 'BLOCK_VIEW_FETCH_FAILED',
      reason: String(err && err.message ? err.message : err),
      wouldChange: null,
      dateAudit: null,
      proposedFilter: null,
      warnings: warnings
    };
  }

  if (!view || !view.filter) {
    return {
      key: spec.key,
      name: spec.name,
      viewId: spec.id,
      actualName: view && view.name ? view.name : '',
      action: 'BLOCK_VIEW_FILTER_MISSING',
      reason: '保存ViewにFilterがありません。',
      wouldChange: null,
      dateAudit: null,
      proposedFilter: null,
      warnings: warnings
    };
  }

  if (view.name && view.name !== spec.name) {
    warnings.push('Configured name differs from actual view name: ' + view.name);
  }

  const proposedFilter = weeklyReviewV01Clone_(view.filter);
  const matches = weeklyReviewV01FindDetectedAtBoundaries_(proposedFilter);

  if (matches.lower.length !== 1) {
    return weeklyReviewV01ViewBlocked_(
      spec,
      view,
      'BLOCK_VIEW_LOWER_BOUNDARY_AMBIGUOUS',
      'Detected_At on_or_after が1件ちょうどではありません。count=' + matches.lower.length,
      matches,
      warnings
    );
  }

  if (matches.upper.length !== 1) {
    return weeklyReviewV01ViewBlocked_(
      spec,
      view,
      'BLOCK_VIEW_UPPER_BOUNDARY_AMBIGUOUS',
      'Detected_At on_or_before が1件ちょうどではありません。count=' + matches.upper.length,
      matches,
      warnings
    );
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
      current: {
        onOrAfter: beforeLower,
        onOrBefore: beforeUpper
      },
      proposed: {
        onOrAfter: window.from,
        onOrBefore: window.to
      },
      lowerMatchCount: matches.lower.length,
      upperMatchCount: matches.upper.length
    },
    // Preview only. This object is never PATCHed by v0.1.0-preview.
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
      upperMatchCount: matches && matches.upper ? matches.upper.length : 0
    },
    proposedFilter: null,
    warnings: warnings || []
  };
}

/**
 * Find the two date-boundary leaf filters in the native Notion filter object.
 * The traversal is intentionally generic so AND/OR nesting may evolve without
 * requiring this resolver to rebuild unrelated conditions.
 */
function weeklyReviewV01FindDetectedAtBoundaries_(filter) {
  const out = { lower: [], upper: [] };
  weeklyReviewV01WalkObject_(filter, function(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (node.property !== OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.DETECTED_AT_PROPERTY) return;
    if (!node.date || typeof node.date !== 'object') return;

    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_after')) {
      out.lower.push(node);
    }
    if (Object.prototype.hasOwnProperty.call(node.date, 'on_or_before')) {
      out.upper.push(node);
    }
  });
  return out;
}

function weeklyReviewV01WalkObject_(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach(function(item) {
      weeklyReviewV01WalkObject_(item, visitor);
    });
    return;
  }

  if (!value || typeof value !== 'object') return;
  visitor(value);

  Object.keys(value).forEach(function(key) {
    weeklyReviewV01WalkObject_(value[key], visitor);
  });
}

function weeklyReviewV01Token_() {
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

function weeklyReviewV01GetView_(viewId) {
  return weeklyReviewV01Request_('get', '/views/' + encodeURIComponent(viewId), null);
}

function weeklyReviewV01QueryPage_(dataSourceId, body) {
  const req = weeklyReviewV01Clone_(body || {});
  req.page_size = Math.min(req.page_size || 100, 100);

  return weeklyReviewV01Request_(
    'post',
    '/data_sources/' + encodeURIComponent(dataSourceId) + '/query',
    req
  );
}

function weeklyReviewV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = weeklyReviewV01Clone_(body || {});
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = weeklyReviewV01Request_(
      'post',
      '/data_sources/' + encodeURIComponent(dataSourceId) + '/query',
      req
    );

    (r.results || []).forEach(function(item) {
      out.push(item);
    });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  return out;
}

/**
 * Hard read-only gate.
 * GET is permitted for view retrieval.
 * POST is permitted only for /query endpoints, which are read operations.
 * Any other method/path combination throws before UrlFetchApp is called.
 */
function weeklyReviewV01Request_(method, path, payload) {
  const normalizedMethod = String(method || '').toLowerCase();
  const normalizedPath = String(path || '');
  const isReadGet = normalizedMethod === 'get';
  const isReadQuery = normalizedMethod === 'post' && /\/query$/.test(normalizedPath);

  if (!isReadGet && !isReadQuery) {
    throw new Error(
      'READ ONLY guard blocked Notion request: method=' +
      normalizedMethod + ' path=' + normalizedPath
    );
  }

  const options = {
    method: normalizedMethod,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + weeklyReviewV01Token_(),
      'Notion-Version': OC_WEEKLY_REVIEW_QUEUE_RESOLVER_V01.NOTION_VERSION
    }
  };

  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + normalizedPath, options);
  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Notion API ' + code + ': ' + text);
  }

  return text ? JSON.parse(text) : {};
}

function weeklyReviewV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(function(x) {
    return x.plain_text || '';
  }).join('') : '';
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

function weeklyReviewV01Clone_(value) {
  return JSON.parse(JSON.stringify(value));
}
