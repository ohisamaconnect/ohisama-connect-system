/**
 * OC-OS Post-Recording Intake
 * v0.1.0-preview (2026-09-25)
 *
 * Purpose:
 * - Establish a stable post-recording handoff into EPISODES.
 * - Episode folder convention:
 *     STUDIO/
 *     AUDIO/
 *     TRANSCRIPT/
 * - Detect files already placed by the human/operator.
 * - Preview mapping to EPISODES.Audio_URL / Transcript_URL.
 *
 * Canonical safety:
 * - Does NOT transcribe audio.
 * - Does NOT infer what was used on air.
 * - Does NOT change STUDIO ITEMS.
 * - Does NOT change Production_Status.
 * - Does NOT overwrite existing Audio_URL / Transcript_URL.
 * - No trigger is installed by this file.
 *
 * Required Script Property:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_POST_RECORDING_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  TIME_ZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  AUDIO_FOLDER: 'AUDIO',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',
  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済'],
  MAX_EPISODES: 50
});

/** Read-only preview. */
function previewPostRecordingIntakeV01() {
  const episode = postV01GetTargetEpisode_();
  const plan = postV01BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_POST_RECORDING_V01.VERSION,
    episodeKey: postV01Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: postV01DateStart_(episode.properties['Recording_Date']),
    productionStatus: postV01Select_(episode.properties['Production_Status']),
    episodeFolderUrl: postV01PropUrl_(episode.properties['Episode_Folder_URL']),
    currentAudioUrl: postV01PropUrl_(episode.properties['Audio_URL']),
    currentTranscriptUrl: postV01PropUrl_(episode.properties['Transcript_URL']),
    audioFolder: plan.audioFolder,
    transcriptFolder: plan.transcriptFolder,
    audioCandidates: plan.audioCandidates,
    transcriptCandidates: plan.transcriptCandidates,
    proposedAudioUrl: plan.proposedAudioUrl,
    proposedTranscriptUrl: plan.proposedTranscriptUrl,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS POST-RECORDING INTAKE PREVIEW');
  console.log('VERSION = ' + OC_POST_RECORDING_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));

  return out;
}

/**
 * Safe helper for future episodes.
 * Creates AUDIO / TRANSCRIPT folders only when missing.
 * Does not touch Notion.
 */
function ensurePostRecordingFoldersV01() {
  const episode = postV01GetTargetEpisode_();
  const episodeFolder = postV01GetEpisodeFolder_(episode);

  const audio = postV01GetOrCreateChildFolder_(episodeFolder, OC_POST_RECORDING_V01.AUDIO_FOLDER);
  const transcript = postV01GetOrCreateChildFolder_(episodeFolder, OC_POST_RECORDING_V01.TRANSCRIPT_FOLDER);

  const out = {
    write: 'DRIVE_FOLDERS_ONLY',
    episodeKey: postV01Title_(episode.properties['Episode_Key']),
    audioFolderUrl: audio.getUrl(),
    transcriptFolderUrl: transcript.getUrl()
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Manual link sync.
 * Writes only when exactly one candidate exists and target property is empty.
 * Never overwrites existing URLs.
 */
function syncPostRecordingLinksV01() {
  const episode = postV01GetTargetEpisode_();
  const plan = postV01BuildPlan_(episode);
  const patch = {};
  const actions = [];

  const currentAudio = postV01PropUrl_(episode.properties['Audio_URL']);
  const currentTranscript = postV01PropUrl_(episode.properties['Transcript_URL']);

  if (!currentAudio && plan.proposedAudioUrl) {
    patch['Audio_URL'] = { url: plan.proposedAudioUrl };
    actions.push('SET Audio_URL');
  }

  if (!currentTranscript && plan.proposedTranscriptUrl) {
    patch['Transcript_URL'] = { url: plan.proposedTranscriptUrl };
    actions.push('SET Transcript_URL');
  }

  if (!actions.length) {
    const out = {
      write: 'NONE',
      episodeKey: postV01Title_(episode.properties['Episode_Key']),
      actions: [],
      warnings: plan.warnings
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  postV01PatchPage_(episode.id, patch);

  const out = {
    write: 'EPISODE_LINKS_ONLY',
    episodeKey: postV01Title_(episode.properties['Episode_Key']),
    actions: actions,
    audioUrl: plan.proposedAudioUrl || currentAudio || '',
    transcriptUrl: plan.proposedTranscriptUrl || currentTranscript || '',
    warnings: plan.warnings
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function postV01BuildPlan_(episode) {
  const episodeFolder = postV01GetEpisodeFolder_(episode);

  const audioFolder = postV01FindChildFolder_(episodeFolder, OC_POST_RECORDING_V01.AUDIO_FOLDER);
  const transcriptFolder = postV01FindChildFolder_(episodeFolder, OC_POST_RECORDING_V01.TRANSCRIPT_FOLDER);

  const warnings = [];

  if (!audioFolder) warnings.push('AUDIO folder missing');
  if (!transcriptFolder) warnings.push('TRANSCRIPT folder missing');

  const audioCandidates = audioFolder
    ? postV01ListAudioCandidates_(audioFolder)
    : [];

  const transcriptCandidates = transcriptFolder
    ? postV01ListTranscriptCandidates_(transcriptFolder)
    : [];

  if (audioCandidates.length > 1) {
    warnings.push('AUDIO has multiple candidates; Audio_URL will not be auto-selected');
  }

  if (transcriptCandidates.length > 1) {
    warnings.push('TRANSCRIPT has multiple candidates; Transcript_URL will not be auto-selected');
  }

  return {
    audioFolder: audioFolder ? {
      id: audioFolder.getId(),
      url: audioFolder.getUrl()
    } : null,
    transcriptFolder: transcriptFolder ? {
      id: transcriptFolder.getId(),
      url: transcriptFolder.getUrl()
    } : null,
    audioCandidates: audioCandidates,
    transcriptCandidates: transcriptCandidates,
    proposedAudioUrl: audioCandidates.length === 1 ? audioCandidates[0].url : '',
    proposedTranscriptUrl: transcriptCandidates.length === 1 ? transcriptCandidates[0].url : '',
    warnings: warnings
  };
}

function postV01ListAudioCandidates_(folder) {
  const out = [];
  const files = folder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    const name = String(f.getName() || '');
    const mime = String(f.getMimeType() || '');

    if (
      mime.indexOf('audio/') === 0 ||
      /\.(mp3|wav|m4a|aac|flac)$/i.test(name)
    ) {
      out.push(postV01FileSummary_(f));
    }
  }

  return out;
}

function postV01ListTranscriptCandidates_(folder) {
  const out = [];
  const files = folder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    const name = String(f.getName() || '');
    const mime = String(f.getMimeType() || '');

    if (
      mime === MimeType.GOOGLE_DOCS ||
      mime === MimeType.PLAIN_TEXT ||
      mime === MimeType.PDF ||
      /\.(txt|md|docx|pdf)$/i.test(name)
    ) {
      out.push(postV01FileSummary_(f));
    }
  }

  return out;
}

function postV01FileSummary_(f) {
  return {
    id: f.getId(),
    name: f.getName(),
    mimeType: f.getMimeType(),
    size: f.getSize(),
    url: f.getUrl(),
    lastUpdated: f.getLastUpdated().toISOString()
  };
}

/* =========================================================
 * EPISODE / DRIVE
 * ========================================================= */

function postV01GetTargetEpisode_() {
  const filters = OC_POST_RECORDING_V01.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  const pages = postV01QueryAll_(
    OC_POST_RECORDING_V01.EPISODES_DS,
    {
      filter: { or: filters },
      sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
      page_size: OC_POST_RECORDING_V01.MAX_EPISODES
    }
  );

  if (!pages.length) {
    throw new Error('対象EPISODEがありません。');
  }

  const today = postV01DateOnly_(new Date());

  const scored = pages
    .map(p => {
      const d = postV01DateStart_(p.properties['Recording_Date']);
      if (!d) return null;
      return {
        page: p,
        distance: Math.abs(postV01DaysBetween_(today, d.slice(0, 10)))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return scored.length ? scored[0].page : pages[0];
}

function postV01GetEpisodeFolder_(episode) {
  const url = postV01PropUrl_(episode.properties['Episode_Folder_URL']);
  const id = postV01ExtractDriveFolderId_(url);

  if (!id) {
    throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  }

  return DriveApp.getFolderById(id);
}

function postV01FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function postV01GetOrCreateChildFolder_(parent, name) {
  const found = postV01FindChildFolder_(parent, name);
  return found || parent.createFolder(name);
}

function postV01ExtractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];

  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function postV01DateOnly_(date) {
  return Utilities.formatDate(date, OC_POST_RECORDING_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function postV01DaysBetween_(a, b) {
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

function postV01Token_() {
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

function postV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + postV01Token_(),
      'Notion-Version': OC_POST_RECORDING_V01.NOTION_VERSION
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

function postV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;

    const r = postV01Request_(
      'post',
      '/data_sources/' + dataSourceId + '/query',
      req
    );

    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  return out;
}

function postV01PatchPage_(pageId, properties) {
  return postV01Request_(
    'patch',
    '/pages/' + pageId,
    { properties: properties }
  );
}

/* =========================================================
 * NOTION PROPERTY HELPERS
 * ========================================================= */

function postV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function postV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function postV01PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function postV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}
