/**
 * OC-OS EPISODE Calendar Sync
 * v0.1.0-preview (2026-09-26)
 *
 * STATUS: CURRENT / Canonical operation candidate.
 * Legacy predecessor: oc_os_calendar_bridge_v0.1.0.gs (DO NOT RUN).
 *
 * Mirror EPISODES Recording_Date / Air_Date to the writable
 * "おひさまコネクト" Google Calendar.
 *
 * This module does NOT copy the read-only 日向坂46カレンダー.
 * Calendar is a mirror; Notion EPISODES remains canonical for dates.
 *
 * Required Script Properties:
 * - NOTION_API_TOKEN (preferred; NOTION_TOKEN / NOTION_SECRET fallback)
 * - OC_TARGET_EPISODE_KEY for WRITE
 *
 * Optional Script Properties:
 * - OC_CALENDAR_ID       default labo@ohisamaconnect.com
 * - OC_AIR_START_TIME    default 19:30
 * - OC_AIR_DURATION_MIN  default 28
 */

const OC_EPISODE_CALENDAR_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  TIME_ZONE: 'Asia/Tokyo',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  DEFAULT_CALENDAR_ID: 'labo@ohisamaconnect.com',
  DEFAULT_AIR_START_TIME: '19:30',
  DEFAULT_AIR_DURATION_MIN: 28
});

/** Read-only preview. */
function previewEpisodeCalendarSyncV01() {
  const resolved = episodeCalV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const plan = episodeCalV01BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_EPISODE_CALENDAR_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    calendarId: plan.calendarId,
    episode: plan.episode,
    recording: plan.recording,
    air: plan.air,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS EPISODE CALENDAR SYNC PREVIEW');
  console.log('VERSION = ' + OC_EPISODE_CALENDAR_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Create/update Recording + Air events for exactly one explicit EPISODE.
 */
function syncEpisodeCalendarV01() {
  const resolved = episodeCalV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const plan = episodeCalV01BuildPlan_(episode);

  if (plan.warnings.length) {
    throw new Error('Calendar sync BLOCK: ' + plan.warnings.join(' / '));
  }

  const calendar = CalendarApp.getCalendarById(plan.calendarId);
  if (!calendar) {
    throw new Error('Calendar not found or not writable: ' + plan.calendarId);
  }

  const recordingResult = episodeCalV01UpsertRecording_(calendar, episode, plan);
  const airResult = episodeCalV01UpsertAir_(calendar, episode, plan);
  const syncedAt = new Date();

  episodeCalV01PatchPage_(episode.id, {
    Recording_Calendar_Event_ID:
      episodeCalV01RichTextProp_(recordingResult.eventId),
    Air_Calendar_Event_ID:
      episodeCalV01RichTextProp_(airResult.eventId),
    Calendar_Synced_At: {
      date: { start: syncedAt.toISOString() }
    }
  });

  const out = {
    write: 'CALENDAR_SYNCED',
    version: OC_EPISODE_CALENDAR_V01.VERSION,
    episodeKey: plan.episode.episodeKey,
    calendarId: plan.calendarId,
    recording: recordingResult,
    air: airResult,
    syncedAt: syncedAt.toISOString(),
    note: 'Production_Status and 日向坂46カレンダー are untouched.'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function episodeCalV01BuildPlan_(episode) {
  const p = episode.properties || {};
  const episodeKey = episodeCalV01Title_(p['Episode_Key']);
  const recordingDate = episodeCalV01DateStart_(p['Recording_Date']);
  const airDate = episodeCalV01DateStart_(p['Air_Date']);
  const recordingEventId = episodeCalV01RichText_(p['Recording_Calendar_Event_ID']);
  const airEventId = episodeCalV01RichText_(p['Air_Calendar_Event_ID']);
  const calendarId = episodeCalV01CalendarId_();
  const airStartTime = episodeCalV01AirStartTime_();
  const airDurationMin = episodeCalV01AirDurationMin_();
  const warnings = [];

  if (!episodeKey) warnings.push('Episode_Key missing');
  if (!recordingDate) warnings.push('Recording_Date missing');
  if (!airDate) warnings.push('Air_Date missing');
  if (!/^\d{2}:\d{2}$/.test(airStartTime)) {
    warnings.push('OC_AIR_START_TIME invalid: ' + airStartTime);
  }
  if (!(airDurationMin > 0)) {
    warnings.push('OC_AIR_DURATION_MIN must be > 0');
  }

  const calendar = CalendarApp.getCalendarById(calendarId);
  const existingRecording = calendar && recordingEventId
    ? calendar.getEventById(recordingEventId)
    : null;
  const existingAir = calendar && airEventId
    ? calendar.getEventById(airEventId)
    : null;

  return {
    calendarId: calendarId,
    episode: {
      id: episode.id,
      url: episode.url || '',
      episodeKey: episodeKey,
      recordingDate: recordingDate,
      airDate: airDate,
      episodeFolderUrl: episodeCalV01Url_(p['Episode_Folder_URL'])
    },
    recording: {
      title: '🎙️ おひさまコネクト収録｜' + episodeKey,
      date: recordingDate ? recordingDate.slice(0, 10) : '',
      storedEventId: recordingEventId,
      existingEventFound: !!existingRecording,
      action: existingRecording ? 'UPDATE' : 'CREATE'
    },
    air: {
      title: '📻 おひさまコネクト本放送｜' + episodeKey,
      date: airDate ? airDate.slice(0, 10) : '',
      startTime: airStartTime,
      durationMinutes: airDurationMin,
      storedEventId: airEventId,
      existingEventFound: !!existingAir,
      action: existingAir ? 'UPDATE' : 'CREATE'
    },
    warnings: warnings
  };
}

/* =========================================================
 * CALENDAR UPSERT
 * ========================================================= */

function episodeCalV01UpsertRecording_(calendar, episode, plan) {
  const p = episode.properties || {};
  const storedId = episodeCalV01RichText_(p['Recording_Calendar_Event_ID']);
  let event = storedId ? calendar.getEventById(storedId) : null;
  const date = episodeCalV01DateOnlyToDate_(plan.recording.date);
  const description = episodeCalV01Description_(plan, 'recording');
  let action = 'UPDATE';

  if (!event) {
    event = calendar.createAllDayEvent(plan.recording.title, date, {
      description: description
    });
    action = storedId ? 'RECREATE_MISSING_EVENT' : 'CREATE';
  } else {
    event.setTitle(plan.recording.title);
    event.setAllDayDate(date);
    event.setDescription(description);
  }

  return {
    action: action,
    eventId: event.getId(),
    title: event.getTitle(),
    allDay: true,
    start: episodeCalV01FormatDate_(event.getStartTime()),
    htmlLink: episodeCalV01CalendarEventUrl_(event.getId())
  };
}

function episodeCalV01UpsertAir_(calendar, episode, plan) {
  const p = episode.properties || {};
  const storedId = episodeCalV01RichText_(p['Air_Calendar_Event_ID']);
  let event = storedId ? calendar.getEventById(storedId) : null;
  const start = episodeCalV01DateTime_(plan.air.date, plan.air.startTime);
  const end = new Date(start.getTime() + plan.air.durationMinutes * 60000);
  const description = episodeCalV01Description_(plan, 'air');
  let action = 'UPDATE';

  if (!event) {
    event = calendar.createEvent(plan.air.title, start, end, {
      description: description
    });
    action = storedId ? 'RECREATE_MISSING_EVENT' : 'CREATE';
  } else {
    event.setTitle(plan.air.title);
    event.setTime(start, end);
    event.setDescription(description);
  }

  return {
    action: action,
    eventId: event.getId(),
    title: event.getTitle(),
    allDay: false,
    start: episodeCalV01FormatDateTime_(event.getStartTime()),
    end: episodeCalV01FormatDateTime_(event.getEndTime()),
    htmlLink: episodeCalV01CalendarEventUrl_(event.getId())
  };
}

function episodeCalV01Description_(plan, type) {
  const lines = [
    'OC-OS EPISODE: ' + plan.episode.episodeKey,
    'Notion: ' + (plan.episode.url || ''),
    'Drive: ' + (plan.episode.episodeFolderUrl || '')
  ];

  if (type === 'recording') {
    lines.push('収録日のマーカー。実際のスタジオ入り時刻はこのCalendar eventでは固定しない。');
  } else {
    lines.push('本放送。時刻はOC_AIR_START_TIME / OC_AIR_DURATION_MIN設定から同期。');
  }

  lines.push('CalendarはMirror。日付変更はEPISODESを修正してから再同期する。');
  return lines.join('\n');
}

/* =========================================================
 * TARGET
 * ========================================================= */

function episodeCalV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_EPISODE_CALENDAR_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = episodeCalV01QueryAll_(OC_EPISODE_CALENDAR_V01.EPISODES_DS, {
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

  const pages = episodeCalV01QueryAll_(OC_EPISODE_CALENDAR_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
    page_size: 50
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'FIRST_EPISODE_PREVIEW', requestedKey: '' };
}

/* =========================================================
 * CONFIG / DATE
 * ========================================================= */

function episodeCalV01CalendarId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty('OC_CALENDAR_ID') ||
    OC_EPISODE_CALENDAR_V01.DEFAULT_CALENDAR_ID
  ).trim();
}

function episodeCalV01AirStartTime_() {
  return String(
    PropertiesService.getScriptProperties().getProperty('OC_AIR_START_TIME') ||
    OC_EPISODE_CALENDAR_V01.DEFAULT_AIR_START_TIME
  ).trim();
}

function episodeCalV01AirDurationMin_() {
  const raw = PropertiesService.getScriptProperties().getProperty('OC_AIR_DURATION_MIN');
  const n = raw === null || raw === ''
    ? OC_EPISODE_CALENDAR_V01.DEFAULT_AIR_DURATION_MIN
    : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function episodeCalV01DateOnlyToDate_(dateOnly) {
  return new Date(String(dateOnly) + 'T00:00:00+09:00');
}

function episodeCalV01DateTime_(dateOnly, hhmm) {
  return new Date(String(dateOnly) + 'T' + String(hhmm) + ':00+09:00');
}

function episodeCalV01FormatDate_(date) {
  return Utilities.formatDate(date, OC_EPISODE_CALENDAR_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function episodeCalV01FormatDateTime_(date) {
  return Utilities.formatDate(date, OC_EPISODE_CALENDAR_V01.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function episodeCalV01CalendarEventUrl_(eventId) {
  // CalendarApp does not expose htmlLink. Keep a stable UI search URL rather than fabricate provider event IDs.
  return 'https://calendar.google.com/calendar/u/0/r/search?q=' +
    encodeURIComponent(String(eventId || ''));
}

/* =========================================================
 * NOTION API
 * ========================================================= */

function episodeCalV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function episodeCalV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + episodeCalV01Token_(),
      'Notion-Version': OC_EPISODE_CALENDAR_V01.NOTION_VERSION
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

function episodeCalV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = episodeCalV01Request_(
      'post',
      '/data_sources/' + dataSourceId + '/query',
      req
    );
    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

function episodeCalV01PatchPage_(pageId, properties) {
  return episodeCalV01Request_(
    'patch',
    '/pages/' + pageId,
    { properties: properties }
  );
}

/* =========================================================
 * PROPERTY HELPERS
 * ========================================================= */

function episodeCalV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function episodeCalV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function episodeCalV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function episodeCalV01Url_(prop) {
  return prop && prop.url ? prop.url : '';
}

function episodeCalV01RichTextProp_(text) {
  const s = String(text || '');
  return s
    ? { rich_text: [{ type: 'text', text: { content: s.slice(0, 2000) } }] }
    : { rich_text: [] };
}
