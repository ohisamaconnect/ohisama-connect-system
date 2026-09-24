/**
 * OC-OS Post-Recording Intake
 * v0.2.0-preview (2026-09-25)
 *
 * Canonical post-recording structure:
 *   EPISODE/
 *     STUDIO/
 *     AUDIO/
 *       MASTER/
 *       TRANSCRIPTION_PROXY/
 *       SPEECH_STEM/
 *     TRANSCRIPT/
 *
 * Meaning:
 * - MASTER: completed broadcast master. Canonical audio for EPISODES.Audio_URL.
 * - TRANSCRIPTION_PROXY: derived audio with full-size song sections silenced
 *   while preserving the master timeline.
 * - SPEECH_STEM: UVR output focused on spoken voice.
 * - TRANSCRIPT: transcription output / final transcript document.
 *
 * Safety:
 * - Does NOT edit audio or transcribe.
 * - Does NOT infer what was used on air.
 * - Does NOT change STUDIO ITEMS or Production_Status.
 * - Does NOT overwrite existing Audio_URL / Transcript_URL.
 * - Proxy / Speech Stem are processing derivatives and never become Audio_URL.
 * - No trigger is installed by this file.
 *
 * Required Script Property:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 */

const OC_POST_RECORDING_V02 = Object.freeze({
  VERSION: '0.2.0-preview',
  TIME_ZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',

  AUDIO_FOLDER: 'AUDIO',
  MASTER_FOLDER: 'MASTER',
  PROXY_FOLDER: 'TRANSCRIPTION_PROXY',
  SPEECH_FOLDER: 'SPEECH_STEM',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',

  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済'],
  MAX_EPISODES: 50
});

/** Read-only preview. */
function previewPostRecordingIntakeV02() {
  const episode = postV02GetTargetEpisode_();
  const plan = postV02BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_POST_RECORDING_V02.VERSION,
    episodeKey: postV02Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: postV02DateStart_(episode.properties['Recording_Date']),
    productionStatus: postV02Select_(episode.properties['Production_Status']),
    episodeFolderUrl: postV02PropUrl_(episode.properties['Episode_Folder_URL']),
    currentAudioUrl: postV02PropUrl_(episode.properties['Audio_URL']),
    currentTranscriptUrl: postV02PropUrl_(episode.properties['Transcript_URL']),

    folders: {
      audio: plan.audioFolder,
      master: plan.masterFolder,
      transcriptionProxy: plan.proxyFolder,
      speechStem: plan.speechFolder,
      transcript: plan.transcriptFolder
    },

    masterCandidates: plan.masterCandidates,
    proxyCandidates: plan.proxyCandidates,
    speechStemCandidates: plan.speechCandidates,
    transcriptCandidates: plan.transcriptCandidates,

    proposedAudioUrl: plan.proposedAudioUrl,
    proposedTranscriptUrl: plan.proposedTranscriptUrl,

    pipelineReady: {
      masterReady: plan.masterCandidates.length === 1,
      proxyReady: plan.proxyCandidates.length >= 1,
      speechStemReady: plan.speechCandidates.length >= 1,
      transcriptReady: plan.transcriptCandidates.length === 1
    },

    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS POST-RECORDING INTAKE PREVIEW');
  console.log('VERSION = ' + OC_POST_RECORDING_V02.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));

  return out;
}

/**
 * Safe helper for future episodes.
 * Creates the full post-recording folder structure only.
 * Does not touch Notion.
 */
function ensurePostRecordingFoldersV02() {
  const episode = postV02GetTargetEpisode_();
  const episodeFolder = postV02GetEpisodeFolder_(episode);

  const audio = postV02GetOrCreateChildFolder_(
    episodeFolder,
    OC_POST_RECORDING_V02.AUDIO_FOLDER
  );

  const master = postV02GetOrCreateChildFolder_(
    audio,
    OC_POST_RECORDING_V02.MASTER_FOLDER
  );

  const proxy = postV02GetOrCreateChildFolder_(
    audio,
    OC_POST_RECORDING_V02.PROXY_FOLDER
  );

  const speech = postV02GetOrCreateChildFolder_(
    audio,
    OC_POST_RECORDING_V02.SPEECH_FOLDER
  );

  const transcript = postV02GetOrCreateChildFolder_(
    episodeFolder,
    OC_POST_RECORDING_V02.TRANSCRIPT_FOLDER
  );

  const out = {
    write: 'DRIVE_FOLDERS_ONLY',
    episodeKey: postV02Title_(episode.properties['Episode_Key']),
    folders: {
      audio: audio.getUrl(),
      master: master.getUrl(),
      transcriptionProxy: proxy.getUrl(),
      speechStem: speech.getUrl(),
      transcript: transcript.getUrl()
    }
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Manual link sync.
 * - Audio_URL: exactly one audio candidate in AUDIO/MASTER.
 * - Transcript_URL: exactly one transcript candidate in TRANSCRIPT.
 * - Never overwrites existing values.
 */
function syncPostRecordingLinksV02() {
  const episode = postV02GetTargetEpisode_();
  const plan = postV02BuildPlan_(episode);

  const patch = {};
  const actions = [];

  const currentAudio = postV02PropUrl_(episode.properties['Audio_URL']);
  const currentTranscript = postV02PropUrl_(episode.properties['Transcript_URL']);

  if (!currentAudio && plan.proposedAudioUrl) {
    patch['Audio_URL'] = { url: plan.proposedAudioUrl };
    actions.push('SET Audio_URL FROM MASTER');
  }

  if (!currentTranscript && plan.proposedTranscriptUrl) {
    patch['Transcript_URL'] = { url: plan.proposedTranscriptUrl };
    actions.push('SET Transcript_URL');
  }

  if (!actions.length) {
    const out = {
      write: 'NONE',
      version: OC_POST_RECORDING_V02.VERSION,
      episodeKey: postV02Title_(episode.properties['Episode_Key']),
      actions: [],
      warnings: plan.warnings
    };

    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  postV02PatchPage_(episode.id, patch);

  const out = {
    write: 'EPISODE_LINKS_ONLY',
    version: OC_POST_RECORDING_V02.VERSION,
    episodeKey: postV02Title_(episode.properties['Episode_Key']),
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

function postV02BuildPlan_(episode) {
  const episodeFolder = postV02GetEpisodeFolder_(episode);

  const audioFolder = postV02FindChildFolder_(
    episodeFolder,
    OC_POST_RECORDING_V02.AUDIO_FOLDER
  );

  const transcriptFolder = postV02FindChildFolder_(
    episodeFolder,
    OC_POST_RECORDING_V02.TRANSCRIPT_FOLDER
  );

  const masterFolder = audioFolder
    ? postV02FindChildFolder_(audioFolder, OC_POST_RECORDING_V02.MASTER_FOLDER)
    : null;

  const proxyFolder = audioFolder
    ? postV02FindChildFolder_(audioFolder, OC_POST_RECORDING_V02.PROXY_FOLDER)
    : null;

  const speechFolder = audioFolder
    ? postV02FindChildFolder_(audioFolder, OC_POST_RECORDING_V02.SPEECH_FOLDER)
    : null;

  const warnings = [];

  if (!audioFolder) warnings.push('AUDIO folder missing');
  if (!masterFolder) warnings.push('AUDIO/MASTER folder missing');
  if (!proxyFolder) warnings.push('AUDIO/TRANSCRIPTION_PROXY folder missing');
  if (!speechFolder) warnings.push('AUDIO/SPEECH_STEM folder missing');
  if (!transcriptFolder) warnings.push('TRANSCRIPT folder missing');

  const masterCandidates = masterFolder
    ? postV02ListAudioCandidates_(masterFolder)
    : [];

  const proxyCandidates = proxyFolder
    ? postV02ListAudioCandidates_(proxyFolder)
    : [];

  const speechCandidates = speechFolder
    ? postV02ListAudioCandidates_(speechFolder)
    : [];

  const transcriptCandidates = transcriptFolder
    ? postV02ListTranscriptCandidates_(transcriptFolder)
    : [];

  if (masterCandidates.length > 1) {
    warnings.push(
      'AUDIO/MASTER has multiple audio candidates; Audio_URL will not be auto-selected'
    );
  }

  if (proxyCandidates.length > 1) {
    warnings.push(
      'AUDIO/TRANSCRIPTION_PROXY has multiple candidates; processing source is ambiguous'
    );
  }

  if (speechCandidates.length > 1) {
    warnings.push(
      'AUDIO/SPEECH_STEM has multiple candidates; transcription source is ambiguous'
    );
  }

  if (transcriptCandidates.length > 1) {
    warnings.push(
      'TRANSCRIPT has multiple candidates; Transcript_URL will not be auto-selected'
    );
  }

  return {
    audioFolder: postV02FolderSummary_(audioFolder),
    masterFolder: postV02FolderSummary_(masterFolder),
    proxyFolder: postV02FolderSummary_(proxyFolder),
    speechFolder: postV02FolderSummary_(speechFolder),
    transcriptFolder: postV02FolderSummary_(transcriptFolder),

    masterCandidates: masterCandidates,
    proxyCandidates: proxyCandidates,
    speechCandidates: speechCandidates,
    transcriptCandidates: transcriptCandidates,

    proposedAudioUrl:
      masterCandidates.length === 1 ? masterCandidates[0].url : '',

    proposedTranscriptUrl:
      transcriptCandidates.length === 1 ? transcriptCandidates[0].url : '',

    warnings: warnings
  };
}

function postV02FolderSummary_(folder) {
  if (!folder) return null;

  return {
    id: folder.getId(),
    url: folder.getUrl()
  };
}

function postV02ListAudioCandidates_(folder) {
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
      out.push(postV02FileSummary_(f));
    }
  }

  return out;
}

function postV02ListTranscriptCandidates_(folder) {
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
      out.push(postV02FileSummary_(f));
    }
  }

  return out;
}

function postV02FileSummary_(f) {
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

function postV02GetTargetEpisode_() {
  const filters = OC_POST_RECORDING_V02.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  const pages = postV02QueryAll_(
    OC_POST_RECORDING_V02.EPISODES_DS,
    {
      filter: { or: filters },
      sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
      page_size: OC_POST_RECORDING_V02.MAX_EPISODES
    }
  );

  if (!pages.length) {
    throw new Error('対象EPISODEがありません。');
  }

  const today = postV02DateOnly_(new Date());

  const scored = pages
    .map(p => {
      const d = postV02DateStart_(p.properties['Recording_Date']);
      if (!d) return null;

      return {
        page: p,
        distance: Math.abs(postV02DaysBetween_(today, d.slice(0, 10)))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return scored.length ? scored[0].page : pages[0];
}

function postV02GetEpisodeFolder_(episode) {
  const url = postV02PropUrl_(episode.properties['Episode_Folder_URL']);
  const id = postV02ExtractDriveFolderId_(url);

  if (!id) {
    throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  }

  return DriveApp.getFolderById(id);
}

function postV02FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function postV02GetOrCreateChildFolder_(parent, name) {
  const found = postV02FindChildFolder_(parent, name);
  return found || parent.createFolder(name);
}

function postV02ExtractDriveFolderId_(url) {
  const s = String(url || '');

  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];

  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function postV02DateOnly_(date) {
  return Utilities.formatDate(
    date,
    OC_POST_RECORDING_V02.TIME_ZONE,
    'yyyy-MM-dd'
  );
}

function postV02DaysBetween_(a, b) {
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

function postV02Token_() {
  const p = PropertiesService.getScriptProperties();

  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');

  if (!token) {
    throw new Error(
      'NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。'
    );
  }

  return token;
}

function postV02Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + postV02Token_(),
      'Notion-Version': OC_POST_RECORDING_V02.NOTION_VERSION
    }
  };

  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const res = UrlFetchApp.fetch(
    'https://api.notion.com/v1' + path,
    options
  );

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Notion API ' + code + ': ' + text);
  }

  return text ? JSON.parse(text) : {};
}

function postV02QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;

  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);

    if (cursor) req.start_cursor = cursor;

    const r = postV02Request_(
      'post',
      '/data_sources/' + dataSourceId + '/query',
      req
    );

    (r.results || []).forEach(x => out.push(x));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  return out;
}

function postV02PatchPage_(pageId, properties) {
  return postV02Request_(
    'patch',
    '/pages/' + pageId,
    { properties: properties }
  );
}

/* =========================================================
 * NOTION PROPERTY HELPERS
 * ========================================================= */

function postV02Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a)
    ? a.map(x => x.plain_text || '').join('')
    : '';
}

function postV02Select_(prop) {
  return prop && prop.select && prop.select.name
    ? prop.select.name
    : '';
}

function postV02PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function postV02DateStart_(prop) {
  return prop && prop.date && prop.date.start
    ? prop.date.start
    : '';
}
