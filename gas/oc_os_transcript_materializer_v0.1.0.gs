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
