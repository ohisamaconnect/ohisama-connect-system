/**
 * OC-OS Post Recording Current - Production Runtime family
 *
 * This file consolidates four same-generation responsibility modules:
 * - Episode Actuals Finalizer
 * - Post-Recording Intake
 * - Transcript Materializer
 * - Post-Recording Integrator
 *
 * Runtime policy:
 * - These are responsibility boundaries, not historical version inheritance.
 * - Existing public function names are preserved for compatibility.
 * - OC_TARGET_EPISODE_KEY remains the explicit WRITE safety lock where required.
 * - Only Studio_Status = 菴ｿ逕ｨ貂・contributes to actual on-air relations.
 * - Existing Audio_URL / Transcript_URL values are never overwritten.
 * - No Production_Status or STUDIO ITEM status is changed here.
 * - No automatic trigger is installed by this family.
 */

// ============================================================
// CURRENT MODULE: Episode Actuals Finalizer v0.1.0
// ============================================================

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


// ============================================================
// CURRENT MODULE: Post-Recording Intake v0.2.0
// ============================================================

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


// ============================================================
// CURRENT MODULE: Transcript Materializer v0.1.0
// ============================================================

/**
 * OC-OS Transcript Materializer
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Keep machine transcript artifacts under EPISODE/TRANSCRIPT/MACHINE.
 * - Create exactly one human-facing Google Doc in EPISODE/TRANSCRIPT root
 *   from exactly one *_CLEAN_HHA.txt.
 * - Leave EPISODES.Transcript_URL synchronization to
 *   oc_os_post_recording_integrator_v0.1.0.gs.
 *
 * Canonical structure:
 *   EPISODE/
 *     TRANSCRIPT/
 *       <one formal Google Doc>
 *       MACHINE/
 *         *_TRANSCRIPT.json
 *         *_AUDIT.txt
 *         *_CLEAN_HHA.txt
 *         *_HHA_CORRECTION_REPORT.txt
 *         *_HHA_CORRECTIONS.json
 *         (optional SRT/VTT etc.)
 *
 * Authority:
 * - TRANSCRIPT.json = machine evidence.
 * - *_CLEAN_HHA.txt = grounded transcript source text.
 * - Google Doc = human-facing OC-OS reference artifact.
 *
 * Corrections:
 * - Do not independently rewrite the Google Doc transcript body.
 * - Correct confirmed ASR errors through Alias / explicit boundary rules,
 *   rerun the pipeline, then deliberately regenerate the Doc.
 *
 * Target safety:
 * - Preview may fall back to nearest Recording_Date when OC_TARGET_EPISODE_KEY
 *   is absent.
 * - Drive/Doc WRITE requires OC_TARGET_EPISODE_KEY.
 *
 * Safety:
 * - Does NOT transcribe.
 * - Does NOT edit machine evidence.
 * - Does NOT update Notion.
 * - Does NOT overwrite or replace an existing formal Google Doc.
 * - Does NOT move machine files automatically.
 * - No trigger is installed.
 *
 * Required Script Properties:
 * - NOTION_API_TOKEN (preferred)
 *   Fallbacks: NOTION_TOKEN / NOTION_SECRET
 * - OC_TARGET_EPISODE_KEY for WRITE (example: 2026-10-04)
 */

const OC_TRANSCRIPT_MATERIALIZER_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  TIME_ZONE: 'Asia/Tokyo',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',
  MACHINE_FOLDER: 'MACHINE',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  TARGET_STATUSES: ['準備中', '収録準備済', '収録済', '放送済'],
  MAX_EPISODES: 50
});

/** Read-only preview. */
function previewTranscriptMaterializerV01() {
  const resolved = transcriptV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const plan = transcriptV01BuildPlan_(episode);

  const out = {
    write: 'NONE',
    version: OC_TRANSCRIPT_MATERIALIZER_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: transcriptV01Title_(episode.properties['Episode_Key']),
    episodeId: transcriptV01Text_(episode.properties['Episode_ID']),
    recordingDate: transcriptV01DateStart_(episode.properties['Recording_Date']),
    airDate: transcriptV01DateStart_(episode.properties['Air_Date']),
    productionStatus: transcriptV01Select_(episode.properties['Production_Status']),
    currentTranscriptUrl: transcriptV01PropUrl_(episode.properties['Transcript_URL']),
    transcriptFolder: plan.transcriptFolder,
    machineFolder: plan.machineFolder,
    cleanHhaCandidates: plan.cleanHhaCandidates,
    formalTranscriptCandidates: plan.formalTranscriptCandidates,
    machineArtifacts: plan.machineArtifacts,
    unexpectedRootArtifacts: plan.unexpectedRootArtifacts,
    readyToMaterialize:
      !!plan.transcriptFolder &&
      !!plan.machineFolder &&
      plan.cleanHhaCandidates.length === 1 &&
      plan.formalTranscriptCandidates.length === 0,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS TRANSCRIPT MATERIALIZER PREVIEW');
  console.log('VERSION = ' + OC_TRANSCRIPT_MATERIALIZER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Creates TRANSCRIPT/MACHINE if missing.
 * Does not move any existing file.
 * WRITE requires explicit OC_TARGET_EPISODE_KEY.
 */
function ensureTranscriptMachineFolderV01() {
  const resolved = transcriptV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const episodeFolder = transcriptV01GetEpisodeFolder_(episode);
  const transcriptFolder = transcriptV01GetOrCreateChildFolder_(
    episodeFolder,
    OC_TRANSCRIPT_MATERIALIZER_V01.TRANSCRIPT_FOLDER
  );
  const machineFolder = transcriptV01GetOrCreateChildFolder_(
    transcriptFolder,
    OC_TRANSCRIPT_MATERIALIZER_V01.MACHINE_FOLDER
  );

  const out = {
    write: 'DRIVE_FOLDER_ONLY',
    version: OC_TRANSCRIPT_MATERIALIZER_V01.VERSION,
    episodeKey: transcriptV01Title_(episode.properties['Episode_Key']),
    transcriptFolder: {
      id: transcriptFolder.getId(),
      url: transcriptFolder.getUrl()
    },
    machineFolder: {
      id: machineFolder.getId(),
      url: machineFolder.getUrl()
    }
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Create the formal human-facing Google Doc from exactly one *_CLEAN_HHA.txt
 * in TRANSCRIPT/MACHINE.
 *
 * The function stops rather than guessing when:
 * - OC_TARGET_EPISODE_KEY is not explicitly set
 * - TRANSCRIPT/MACHINE is missing
 * - CLEAN_HHA count is not exactly one
 * - a formal Google Doc already exists in TRANSCRIPT root
 *
 * After review, run previewPostRecordingIntegrationV01() and then
 * syncPostRecordingIntegrationV01() to populate EPISODES.Transcript_URL.
 */
function materializeFormalTranscriptDocV01() {
  const resolved = transcriptV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const plan = transcriptV01BuildPlan_(episode);

  if (!plan.transcriptFolder || !plan.machineFolder) {
    throw new Error(
      'TRANSCRIPT / TRANSCRIPT/MACHINE がありません。ensureTranscriptMachineFolderV01() を先に実行してください。'
    );
  }

  if (plan.formalTranscriptCandidates.length > 0) {
    throw new Error(
      'TRANSCRIPT直下に既存のGoogle Docsがあります。上書き・置換は行いません。count=' +
      plan.formalTranscriptCandidates.length
    );
  }

  if (plan.cleanHhaCandidates.length !== 1) {
    throw new Error(
      'TRANSCRIPT/MACHINE の *_CLEAN_HHA.txt が1件ではありません。count=' +
      plan.cleanHhaCandidates.length
    );
  }

  const sourceSummary = plan.cleanHhaCandidates[0];
  const sourceFile = DriveApp.getFileById(sourceSummary.id);
  const cleanText = sourceFile
    .getBlob()
    .getDataAsString('UTF-8')
    .replace(/^\uFEFF/, '');

  if (!String(cleanText || '').trim()) {
    throw new Error('*_CLEAN_HHA.txt が空です。');
  }

  const episodeKey = transcriptV01Title_(episode.properties['Episode_Key']);
  const episodeId = transcriptV01Text_(episode.properties['Episode_ID']);
  const recordingDate = transcriptV01DateStart_(episode.properties['Recording_Date']);
  const airDate = transcriptV01DateStart_(episode.properties['Air_Date']);

  const title = transcriptV01DocTitle_(episodeKey, episodeId);
  const doc = DocumentApp.create(title);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('おひさまコネクト 文字起こし')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Episode_Key: ' + episodeKey);
  if (episodeId) body.appendParagraph('Episode_ID: ' + episodeId);
  if (recordingDate) body.appendParagraph('Recording_Date: ' + recordingDate);
  if (airDate) body.appendParagraph('Air_Date: ' + airDate);
  body.appendParagraph('Generated_From: ' + sourceFile.getName());
  body.appendParagraph(
    'Policy: CLEAN_HHAの内容を人間参照用に複製。修正はAlias／明示ルール→Pipeline再生成で行う。'
  );
  body.appendHorizontalRule();

  String(cleanText).split(/\r?\n/).forEach(line => {
    body.appendParagraph(line);
  });

  doc.saveAndClose();

  const docFile = DriveApp.getFileById(doc.getId());
  const transcriptFolder = DriveApp.getFolderById(plan.transcriptFolder.id);
  docFile.moveTo(transcriptFolder);

  const out = {
    write: 'FORMAL_TRANSCRIPT_DOC_CREATED',
    version: OC_TRANSCRIPT_MATERIALIZER_V01.VERSION,
    episodeKey: episodeKey,
    sourceCleanHha: sourceSummary,
    formalTranscript: transcriptV01FileSummary_(docFile),
    nextAction: 'Review Doc, then run previewPostRecordingIntegrationV01().',
    warnings: plan.warnings
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function transcriptV01BuildPlan_(episode) {
  const episodeFolder = transcriptV01GetEpisodeFolder_(episode);
  const transcriptFolder = transcriptV01FindChildFolder_(
    episodeFolder,
    OC_TRANSCRIPT_MATERIALIZER_V01.TRANSCRIPT_FOLDER
  );
  const machineFolder = transcriptFolder
    ? transcriptV01FindChildFolder_(
        transcriptFolder,
        OC_TRANSCRIPT_MATERIALIZER_V01.MACHINE_FOLDER
      )
    : null;

  const formalTranscriptCandidates = transcriptFolder
    ? transcriptV01ListFormalDocs_(transcriptFolder)
    : [];
  const unexpectedRootArtifacts = transcriptFolder
    ? transcriptV01ListUnexpectedRootFiles_(transcriptFolder)
    : [];
  const machineArtifacts = machineFolder
    ? transcriptV01ListAllFiles_(machineFolder)
    : [];
  const cleanHhaCandidates = machineFolder
    ? transcriptV01ListCleanHha_(machineFolder)
    : [];

  const warnings = [];
  if (!transcriptFolder) warnings.push('TRANSCRIPT folder missing');
  if (!machineFolder) warnings.push('TRANSCRIPT/MACHINE folder missing');
  if (formalTranscriptCandidates.length > 1) {
    warnings.push('TRANSCRIPT root has multiple Google Docs; formal transcript is ambiguous');
  }
  if (cleanHhaCandidates.length > 1) {
    warnings.push('TRANSCRIPT/MACHINE has multiple *_CLEAN_HHA.txt files');
  }
  if (unexpectedRootArtifacts.length) {
    warnings.push(
      'TRANSCRIPT root contains non-Google-Doc files; machine artifacts belong in TRANSCRIPT/MACHINE: ' +
      unexpectedRootArtifacts.length
    );
  }

  return {
    transcriptFolder: transcriptV01FolderSummary_(transcriptFolder),
    machineFolder: transcriptV01FolderSummary_(machineFolder),
    formalTranscriptCandidates: formalTranscriptCandidates,
    unexpectedRootArtifacts: unexpectedRootArtifacts,
    machineArtifacts: machineArtifacts,
    cleanHhaCandidates: cleanHhaCandidates,
    warnings: warnings
  };
}

function transcriptV01DocTitle_(episodeKey, episodeId) {
  const key = String(episodeKey || '').trim() || 'UNKNOWN_EPISODE';
  const id = String(episodeId || '').trim();
  return id
    ? key + '｜' + id + '｜おひさまコネクト文字起こし'
    : key + '｜おひさまコネクト文字起こし';
}

function transcriptV01FolderSummary_(folder) {
  if (!folder) return null;
  return { id: folder.getId(), url: folder.getUrl() };
}

function transcriptV01ListFormalDocs_(folder) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (String(f.getMimeType() || '') === MimeType.GOOGLE_DOCS) {
      out.push(transcriptV01FileSummary_(f));
    }
  }
  return out;
}

function transcriptV01ListUnexpectedRootFiles_(folder) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (String(f.getMimeType() || '') !== MimeType.GOOGLE_DOCS) {
      out.push(transcriptV01FileSummary_(f));
    }
  }
  return out;
}

function transcriptV01ListAllFiles_(folder) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) out.push(transcriptV01FileSummary_(files.next()));
  return out;
}

function transcriptV01ListCleanHha_(folder) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const name = String(f.getName() || '');
    if (/_CLEAN_HHA\.txt$/i.test(name)) {
      out.push(transcriptV01FileSummary_(f));
    }
  }
  return out;
}

function transcriptV01FileSummary_(f) {
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

function transcriptV01ResolveEpisode_(requireExplicit) {
  const key = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_TRANSCRIPT_MATERIALIZER_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (key) {
    const pages = transcriptV01QueryAll_(
      OC_TRANSCRIPT_MATERIALIZER_V01.EPISODES_DS,
      {
        filter: {
          property: 'Episode_Key',
          title: { equals: key }
        },
        page_size: 10
      }
    );

    if (pages.length !== 1) {
      throw new Error(
        'OC_TARGET_EPISODE_KEY=' + key +
        ' に一致するEPISODEが1件ではありません。count=' + pages.length
      );
    }

    return {
      episode: pages[0],
      mode: 'EXPLICIT_KEY',
      requestedKey: key
    };
  }

  if (requireExplicit) {
    throw new Error(
      'WRITEにはScript Property OC_TARGET_EPISODE_KEY が必要です。' +
      '例: 2026-10-04'
    );
  }

  return {
    episode: transcriptV01GetTargetEpisode_(),
    mode: 'PREVIEW_NEAREST_RECORDING_DATE',
    requestedKey: ''
  };
}

function transcriptV01GetTargetEpisode_() {
  const filters = OC_TRANSCRIPT_MATERIALIZER_V01.TARGET_STATUSES.map(s => ({
    property: 'Production_Status',
    select: { equals: s }
  }));

  const pages = transcriptV01QueryAll_(
    OC_TRANSCRIPT_MATERIALIZER_V01.EPISODES_DS,
    {
      filter: { or: filters },
      sorts: [{ property: 'Recording_Date', direction: 'ascending' }],
      page_size: OC_TRANSCRIPT_MATERIALIZER_V01.MAX_EPISODES
    }
  );

  if (!pages.length) throw new Error('対象EPISODEがありません。');

  const today = transcriptV01DateOnly_(new Date());
  const scored = pages
    .map(p => {
      const d = transcriptV01DateStart_(p.properties['Recording_Date']);
      if (!d) return null;
      return {
        page: p,
        distance: Math.abs(transcriptV01DaysBetween_(today, d.slice(0, 10)))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return scored.length ? scored[0].page : pages[0];
}

function transcriptV01GetEpisodeFolder_(episode) {
  const url = transcriptV01PropUrl_(episode.properties['Episode_Folder_URL']);
  const id = transcriptV01ExtractDriveFolderId_(url);
  if (!id) throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  return DriveApp.getFolderById(id);
}

function transcriptV01FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function transcriptV01GetOrCreateChildFolder_(parent, name) {
  const found = transcriptV01FindChildFolder_(parent, name);
  return found || parent.createFolder(name);
}

function transcriptV01ExtractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function transcriptV01DateOnly_(date) {
  return Utilities.formatDate(date, OC_TRANSCRIPT_MATERIALIZER_V01.TIME_ZONE, 'yyyy-MM-dd');
}

function transcriptV01DaysBetween_(a, b) {
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

function transcriptV01Token_() {
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

function transcriptV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + transcriptV01Token_(),
      'Notion-Version': OC_TRANSCRIPT_MATERIALIZER_V01.NOTION_VERSION
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

function transcriptV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = transcriptV01Request_(
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
 * NOTION PROPERTY HELPERS
 * ========================================================= */

function transcriptV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function transcriptV01Text_(prop) {
  if (!prop) return '';

  if (prop.unique_id && typeof prop.unique_id.number === 'number') {
    const prefix = String(prop.unique_id.prefix || '').trim();
    return prefix
      ? prefix + '-' + prop.unique_id.number
      : String(prop.unique_id.number);
  }

  const a = prop.rich_text || prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function transcriptV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function transcriptV01PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function transcriptV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}


// ============================================================
// CURRENT MODULE: Post-Recording Integrator v0.1.0
// ============================================================

/**
 * OC-OS Post-Recording Integrator
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Bind Episode Actuals Finalizer and Post-Recording Intake to the SAME EPISODE.
 * - Preview one combined post-recording patch.
 * - On explicit execution, add only missing used relations and fill only empty
 *   Audio_URL / Transcript_URL values.
 *
 * Dependencies (same Apps Script project):
 * - oc_os_episode_actuals_finalizer_v0.1.0.gs
 * - oc_os_post_recording_intake_v0.2.0.gs
 * - oc_os_transcript_materializer_v0.1.0.gs
 *
 * Required Script Property for WRITE:
 * - OC_TARGET_EPISODE_KEY (example: 2026-10-04)
 *
 * Preview may fall back to the existing nearest-Recording_Date selector when
 * OC_TARGET_EPISODE_KEY is absent, but WRITE never does.
 *
 * Safety:
 * - Does NOT change STUDIO ITEM statuses.
 * - Only Studio_Status = 使用済 contributes to actual relations.
 * - Existing EPISODE relations are preserved; only missing used relations add.
 * - Existing Audio_URL / Transcript_URL are never overwritten.
 * - Audio_URL comes only from exactly one AUDIO/MASTER candidate.
 * - Transcript_URL comes only from exactly one formal Google Doc in TRANSCRIPT.
 * - Does NOT change Production_Status, Structure_Memo, or Setlist_Memo.
 * - Does NOT infer usage from transcript, AI, candidate origin, or memo.
 * - No trigger is installed.
 */

const OC_POST_INTEGRATOR_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY'
});

/** Read-only combined preview. */
function previewPostRecordingIntegrationV01() {
  integrationV01AssertDependencies_();

  const resolved = integrationV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const actuals = actualsV01BuildPlan_(episode);
  const intake = postV02BuildPlan_(episode);
  const transcript = transcriptV01BuildPlan_(episode);
  const patchPlan = integrationV01BuildPatchPlan_(episode, actuals, intake, transcript);

  const out = {
    write: 'NONE',
    version: OC_POST_INTEGRATOR_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: postV02Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    recordingDate: postV02DateStart_(episode.properties['Recording_Date']),
    productionStatus: postV02Select_(episode.properties['Production_Status']),

    actuals: {
      studioItemCount: actuals.allItems.length,
      usedItemCount: actuals.usedItems.length,
      additions: {
        Events: actuals.additions.eventIds.length,
        Songs: actuals.additions.songIds.length,
        Sources: actuals.additions.sourceIds.length
      },
      usedMessages: actuals.usedMessageIds.length
    },

    artifacts: {
      masterCandidates: intake.masterCandidates,
      currentAudioUrl: postV02PropUrl_(episode.properties['Audio_URL']),
      proposedAudioUrl: patchPlan.proposedAudioUrl,
      formalTranscriptCandidates: transcript.formalTranscriptCandidates,
      cleanHhaCandidates: transcript.cleanHhaCandidates,
      currentTranscriptUrl: postV02PropUrl_(episode.properties['Transcript_URL']),
      proposedTranscriptUrl: patchPlan.proposedTranscriptUrl
    },

    proposedActions: patchPlan.actions,
    ready: {
      targetExplicit: resolved.mode === 'EXPLICIT_KEY',
      audioReady: intake.masterCandidates.length === 1,
      transcriptReady: transcript.formalTranscriptCandidates.length === 1,
      actualsReady: actuals.usedItems.length >= 1
    },
    warnings: patchPlan.warnings
  };

  console.log('========================================');
  console.log('OC-OS POST-RECORDING INTEGRATION PREVIEW');
  console.log('VERSION = ' + OC_POST_INTEGRATOR_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Combined safe sync.
 * WRITE requires an explicit OC_TARGET_EPISODE_KEY Script Property.
 */
function syncPostRecordingIntegrationV01() {
  integrationV01AssertDependencies_();

  const resolved = integrationV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const actuals = actualsV01BuildPlan_(episode);
  const intake = postV02BuildPlan_(episode);
  const transcript = transcriptV01BuildPlan_(episode);
  const patchPlan = integrationV01BuildPatchPlan_(episode, actuals, intake, transcript);

  if (!patchPlan.actions.length) {
    const out = {
      write: 'NONE',
      version: OC_POST_INTEGRATOR_V01.VERSION,
      episodeKey: postV02Title_(episode.properties['Episode_Key']),
      actions: [],
      warnings: patchPlan.warnings
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  postV02PatchPage_(episode.id, patchPlan.patch);

  const out = {
    write: 'EPISODE_POST_RECORDING_ACTUALS_AND_LINKS',
    version: OC_POST_INTEGRATOR_V01.VERSION,
    episodeKey: postV02Title_(episode.properties['Episode_Key']),
    episodePageId: episode.id,
    actions: patchPlan.actions,
    added: {
      Events: actuals.additions.eventIds.length,
      Songs: actuals.additions.songIds.length,
      Sources: actuals.additions.sourceIds.length
    },
    usedMessages: actuals.usedMessageIds.length,
    audioUrl: patchPlan.proposedAudioUrl || postV02PropUrl_(episode.properties['Audio_URL']) || '',
    transcriptUrl: patchPlan.proposedTranscriptUrl || postV02PropUrl_(episode.properties['Transcript_URL']) || '',
    warnings: patchPlan.warnings
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PATCH PLAN
 * ========================================================= */

function integrationV01BuildPatchPlan_(episode, actuals, intake, transcript) {
  const patch = {};
  const actions = [];
  const warnings = [];

  (actuals.warnings || []).forEach(x => warnings.push('ACTUALS: ' + x));
  (intake.warnings || []).forEach(x => warnings.push('INTAKE: ' + x));
  (transcript.warnings || []).forEach(x => warnings.push('TRANSCRIPT: ' + x));

  if (actuals.additions.eventIds.length) {
    patch['Events'] = actualsV01RelationProp_(actuals.proposed.eventIds);
    actions.push('ADD USED Events');
  }

  if (actuals.additions.songIds.length) {
    patch['Songs'] = actualsV01RelationProp_(actuals.proposed.songIds);
    actions.push('ADD USED Songs');
  }

  if (actuals.additions.sourceIds.length) {
    patch['Sources'] = actualsV01RelationProp_(actuals.proposed.sourceIds);
    actions.push('ADD USED Sources');
  }

  const currentAudio = postV02PropUrl_(episode.properties['Audio_URL']);
  const currentTranscript = postV02PropUrl_(episode.properties['Transcript_URL']);

  const proposedAudioUrl =
    intake.masterCandidates.length === 1 ? intake.masterCandidates[0].url : '';

  const proposedTranscriptUrl =
    transcript.formalTranscriptCandidates.length === 1
      ? transcript.formalTranscriptCandidates[0].url
      : '';

  if (!currentAudio && proposedAudioUrl) {
    patch['Audio_URL'] = { url: proposedAudioUrl };
    actions.push('SET Audio_URL FROM MASTER');
  }

  if (!currentTranscript && proposedTranscriptUrl) {
    patch['Transcript_URL'] = { url: proposedTranscriptUrl };
    actions.push('SET Transcript_URL FROM FORMAL GOOGLE DOC');
  }

  if (!currentAudio && intake.masterCandidates.length > 1) {
    warnings.push('INTEGRATION: Audio_URL is empty but MASTER candidate is ambiguous');
  }

  if (!currentTranscript && transcript.formalTranscriptCandidates.length > 1) {
    warnings.push('INTEGRATION: Transcript_URL is empty but formal Google Doc is ambiguous');
  }

  if (!currentTranscript && transcript.formalTranscriptCandidates.length === 0) {
    warnings.push('INTEGRATION: Transcript_URL is empty and formal Google Doc is not ready');
  }

  return {
    patch: patch,
    actions: actions,
    proposedAudioUrl: proposedAudioUrl,
    proposedTranscriptUrl: proposedTranscriptUrl,
    warnings: warnings
  };
}

/* =========================================================
 * TARGET EPISODE
 * ========================================================= */

function integrationV01ResolveEpisode_(requireExplicit) {
  const key = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_POST_INTEGRATOR_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (key) {
    const pages = postV02QueryAll_(
      OC_POST_RECORDING_V02.EPISODES_DS,
      {
        filter: {
          property: 'Episode_Key',
          title: { equals: key }
        },
        page_size: 10
      }
    );

    if (pages.length !== 1) {
      throw new Error(
        'OC_TARGET_EPISODE_KEY=' + key +
        ' に一致するEPISODEが1件ではありません。count=' + pages.length
      );
    }

    return {
      episode: pages[0],
      mode: 'EXPLICIT_KEY',
      requestedKey: key
    };
  }

  if (requireExplicit) {
    throw new Error(
      'WRITEにはScript Property OC_TARGET_EPISODE_KEY が必要です。' +
      '例: 2026-10-04'
    );
  }

  return {
    episode: postV02GetTargetEpisode_(),
    mode: 'PREVIEW_NEAREST_RECORDING_DATE',
    requestedKey: ''
  };
}

/* =========================================================
 * DEPENDENCY CHECK
 * ========================================================= */

function integrationV01AssertDependencies_() {
  const missing = [];

  if (typeof actualsV01BuildPlan_ !== 'function') {
    missing.push('oc_os_episode_actuals_finalizer_v0.1.0.gs');
  }
  if (typeof actualsV01RelationProp_ !== 'function') {
    missing.push('actualsV01RelationProp_');
  }
  if (typeof postV02BuildPlan_ !== 'function') {
    missing.push('oc_os_post_recording_intake_v0.2.0.gs');
  }
  if (typeof postV02PatchPage_ !== 'function') {
    missing.push('postV02PatchPage_');
  }
  if (typeof transcriptV01BuildPlan_ !== 'function') {
    missing.push('oc_os_transcript_materializer_v0.1.0.gs');
  }

  if (missing.length) {
    throw new Error('Post-Recording Integrator dependency missing: ' + missing.join(', '));
  }
}


// ============================================================
// CURRENT PUBLIC FACADE
// ============================================================

const OCOS_POST_RECORDING_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  STATUS: 'PRODUCTION',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  AUTO_TRIGGER: false
});

function previewPostRecordingCurrent() {
  return previewPostRecordingIntegrationV01();
}

function syncPostRecordingCurrent() {
  return syncPostRecordingIntegrationV01();
}

function previewEpisodeActualsCurrent() {
  return previewEpisodeActualsFinalizerV01();
}

function previewPostRecordingIntakeCurrent() {
  return previewPostRecordingIntakeV02();
}

function ensurePostRecordingFoldersCurrent() {
  return ensurePostRecordingFoldersV02();
}

function previewTranscriptCurrent() {
  return previewTranscriptMaterializerV01();
}

function materializeTranscriptCurrent() {
  return materializeFormalTranscriptDocV01();
}