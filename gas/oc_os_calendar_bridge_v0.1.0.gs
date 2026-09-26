/**
 * OC-OS Calendar Bridge
 * v0.1.0-preview (2026-09-26)
 *
 * STATUS: LEGACY / DO NOT RUN.
 * Superseded by: oc_os_episode_calendar_sync_v0.1.0.gs
 * Current contract: docs/OC-OS_CALENDAR_INTEGRATION_v1.0.md
 *
 * This file is retained only as implementation history.
 * Its WRITE handler is intentionally blocked to prevent accidental dual Calendar writes.
 *
 * Purpose (historical):
 * - Mirror OC-OS EPISODE production/broadcast markers to the user's
 *   writable "おひさまコネクト" Google Calendar.
 * - Keep Calendar as a schedule/display layer, never as Canonical truth.
 *
 * Initial event set per EPISODE:
 * - Recording start marker: Recording_Date 21:00–21:15 JST (transparent)
 * - Main broadcast: Air_Date 19:30–19:58 JST (transparent)
 * - Repeat broadcast: Air_Date + 1 day 20:00–20:28 JST (transparent)
 *
 * Safety:
 * - Preview is historical/read-only reference.
 * - WRITE IS DISABLED because this module is Legacy.
 * - Existing events are never deleted.
 * - No trigger is installed.
 */

const OC_CALENDAR_BRIDGE_V01 = Object.freeze({
  VERSION: '0.1.0-preview-LEGACY',
  TIME_ZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  CALENDAR_ID_PROPERTY: 'OC_CALENDAR_ID',
  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済', 'アーカイブ処理済', '完了']
});

function previewEpisodeCalendarBridgeV01() {
  const resolved = calendarV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const calendar = calendarV01GetCalendar_();
  const specs = calendarV01BuildSpecs_(episode);
  const plan = calendarV01BuildPlan_(calendar, specs);

  const out = {
    write: 'NONE',
    legacy: true,
    doNotRunWrite: true,
    supersededBy: 'previewEpisodeCalendarSyncV01 / syncEpisodeCalendarV01',
    version: OC_CALENDAR_BRIDGE_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: calendarV01Title_(episode.properties['Episode_Key']),
    calendar: {
      id: calendar.getId(),
      name: calendar.getName()
    },
    events: plan,
    createCount: plan.filter(x => x.action === 'CREATE').length,
    existingCount: plan.filter(x => x.action === 'KEEP_EXISTING').length,
    blockedCount: plan.filter(x => x.action === 'BLOCK').length,
    warnings: ['LEGACY module: do not execute syncEpisodeCalendarBridgeV01().'].concat(calendarV01PlanWarnings_(plan)),
    principle: 'Historical preview only. Current Calendar Sync is canonical candidate.'
  };

  console.log('========================================');
  console.log('OC-OS EPISODE CALENDAR BRIDGE PREVIEW [LEGACY]');
  console.log('VERSION = ' + OC_CALENDAR_BRIDGE_V01.VERSION);
  console.log('WRITE = DISABLED');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function syncEpisodeCalendarBridgeV01() {
  throw new Error(
    'LEGACY / WRITE DISABLED: syncEpisodeCalendarBridgeV01() は使用しません。' +
    ' 現行は previewEpisodeCalendarSyncV01() → syncEpisodeCalendarV01() を使用してください。'
  );
}

function calendarV01BuildSpecs_(episode) {
  const episodeKey = calendarV01Title_(episode.properties['Episode_Key']);
  const recordingDate = calendarV01DateStart_(episode.properties['Recording_Date']);
  const airDate = calendarV01DateStart_(episode.properties['Air_Date']);

  if (!episodeKey) throw new Error('Episode_Key missing');
  if (!recordingDate) throw new Error('Recording_Date missing');
  if (!airDate) throw new Error('Air_Date missing');

  const recDate = recordingDate.slice(0, 10);
  const airDateOnly = airDate.slice(0, 10);
  const repeatDate = calendarV01AddDays_(airDateOnly, 1);

  return [
    calendarV01Spec_(
      'RECORDING',
      '🎙️ おひさまコネクト収録開始｜' + episodeKey,
      recDate,
      '21:00',
      '21:15',
      episodeKey,
      '収録開始目安。終了時刻を意味しない15分の透明Marker Event。'
    ),
    calendarV01Spec_(
      'AIR',
      '☀️ おひさまコネクト 本放送｜' + episodeKey,
      airDateOnly,
      '19:30',
      '19:58',
      episodeKey,
      'DARAZ FM 本放送。'
    ),
    calendarV01Spec_(
      'REPEAT',
      '🔁 おひさまコネクト 再放送｜' + episodeKey,
      repeatDate,
      '20:00',
      '20:28',
      episodeKey,
      'DARAZ FM 再放送。放送枠変更時はOC-OS Calendar Contractを見直す。'
    )
  ];
}

function calendarV01Spec_(type, title, date, startHm, endHm, episodeKey, note) {
  const marker = 'OC-OS-CALENDAR:' + episodeKey + ':' + type;
  return {
    type: type,
    marker: marker,
    title: title,
    start: calendarV01JstDate_(date, startHm),
    end: calendarV01JstDate_(date, endHm),
    description: [
      marker,
      'Episode_Key: ' + episodeKey,
      note,
      '',
      'Calendar is an OC-OS display layer. EPISODES remains Canonical.'
    ].join('\n')
  };
}

function calendarV01BuildPlan_(calendar, specs) {
  return specs.map(spec => {
    const hits = calendarV01FindExactMarkerEvents_(calendar, spec);

    if (hits.length > 1) {
      return {
        type: spec.type,
        marker: spec.marker,
        action: 'BLOCK',
        reason: 'multiple exact marker events',
        matchCount: hits.length,
        spec: calendarV01SpecSummary_(spec),
        existing: hits.map(calendarV01EventSummary_)
      };
    }

    if (hits.length === 1) {
      const event = hits[0];
      const timeMatches = event.getStartTime().getTime() === spec.start.getTime() &&
        event.getEndTime().getTime() === spec.end.getTime();
      return {
        type: spec.type,
        marker: spec.marker,
        action: 'KEEP_EXISTING',
        existingEventId: event.getId(),
        timeMatches: timeMatches,
        warning: timeMatches ? '' : 'Existing event time differs from EPISODE proposal; create-missing-only does not overwrite it.',
        spec: calendarV01SpecSummary_(spec),
        existing: calendarV01EventSummary_(event)
      };
    }

    return {
      type: spec.type,
      marker: spec.marker,
      action: 'CREATE',
      spec: calendarV01SpecSummary_(spec)
    };
  });
}

function calendarV01FindExactMarkerEvents_(calendar, spec) {
  const y = Number(Utilities.formatDate(spec.start, OC_CALENDAR_BRIDGE_V01.TIME_ZONE, 'yyyy'));
  const searchStart = new Date((y - 1) + '-01-01T00:00:00+09:00');
  const searchEnd = new Date((y + 2) + '-01-01T00:00:00+09:00');
  const candidates = calendar.getEvents(searchStart, searchEnd, { search: spec.marker });
  return candidates.filter(e => String(e.getDescription() || '').split(/\r?\n/).indexOf(spec.marker) >= 0);
}

function calendarV01PlanWarnings_(plan) {
  const out = [];
  plan.forEach(item => {
    if (item.warning) out.push(item.type + ': ' + item.warning);
    if (item.action === 'BLOCK') out.push(item.type + ': ' + item.reason);
  });
  return out;
}

function calendarV01SpecSummary_(spec) {
  return {
    title: spec.title,
    start: spec.start.toISOString(),
    end: spec.end.toISOString(),
    marker: spec.marker
  };
}

function calendarV01EventSummary_(event) {
  return {
    eventId: event.getId(),
    title: event.getTitle(),
    start: event.getStartTime().toISOString(),
    end: event.getEndTime().toISOString(),
    description: event.getDescription() || ''
  };
}

function calendarV01GetCalendar_() {
  const id = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_CALENDAR_BRIDGE_V01.CALENDAR_ID_PROPERTY
    ) || ''
  ).trim();

  if (!id) return CalendarApp.getDefaultCalendar();
  const calendar = CalendarApp.getCalendarById(id);
  if (!calendar) throw new Error('OC_CALENDAR_ID のCalendarを取得できません。');
  return calendar;
}

function calendarV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_CALENDAR_BRIDGE_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = calendarV01QueryAll_(OC_CALENDAR_BRIDGE_V01.EPISODES_DS, {
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

  if (requireExplicit) {
    throw new Error('WRITEには Script Property OC_TARGET_EPISODE_KEY が必要です。');
  }

  const filters = OC_CALENDAR_BRIDGE_V01.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));
  const pages = calendarV01QueryAll_(OC_CALENDAR_BRIDGE_V01.EPISODES_DS, {
    filter: { or: filters },
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 50
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');

  const today = calendarV01DateOnly_(new Date());
  const scored = pages
    .map(p => {
      const d = calendarV01DateStart_(p.properties['Recording_Date']);
      if (!d) return null;
      return { page: p, distance: Math.abs(calendarV01DaysBetween_(today, d.slice(0, 10))) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return {
    episode: scored.length ? scored[0].page : pages[0],
    mode: 'NEAREST_RECORDING_DATE_PREVIEW',
    requestedKey: ''
  };
}

function calendarV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_API_TOKEN') || p.getProperty('NOTION_TOKEN') || p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function calendarV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + calendarV01Token_(),
      'Notion-Version': OC_CALENDAR_BRIDGE_V01.NOTION_VERSION
    }
  };
  if (payload !== undefined && payload !== null) options.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion API ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function calendarV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = calendarV01Request_('post', '/data_sources/' + dataSourceId + '/query', req);
    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

function calendarV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function calendarV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function calendarV01JstDate_(date, hm) {
  return new Date(date + 'T' + hm + ':00+09:00');
}

function calendarV01AddDays_(date, days) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('invalid date: ' + date);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function calendarV01DateOnly_(date) {
  return Utilities.formatDate(date, OC_CALENDAR_BRIDGE_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function calendarV01DaysBetween_(a, b) {
  const am = String(a).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const bm = String(b).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!am || !bm) return 9999;
  const ad = Date.UTC(Number(am[1]), Number(am[2]) - 1, Number(am[3]));
  const bd = Date.UTC(Number(bm[1]), Number(bm[2]) - 1, Number(bm[3]));
  return Math.round((bd - ad) / 86400000);
}
