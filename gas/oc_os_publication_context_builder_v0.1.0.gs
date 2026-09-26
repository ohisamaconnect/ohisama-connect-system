/**
 * OC-OS Publication Context Pack Builder
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Build one provider-neutral context artifact for Publication Draft generation.
 * - Gather the official Transcript, EPISODE actual memos/relations, and
 *   human-confirmed STATEMENTS.
 * - Do not summarize, decide importance, or generate publication copy.
 *
 * Output:
 *   EPISODE/TRANSCRIPT/MACHINE/<Episode_Key>_PUBLICATION_CONTEXT.json
 *
 * WRITE requires Script Property:
 *   OC_TARGET_EPISODE_KEY
 */

const OC_PUBLICATION_CONTEXT_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  SCHEMA_VERSION: '1.0',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STATEMENTS_DS: '0019d30d-da69-4c8d-a24a-07ee4573fb4f',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',
  MACHINE_FOLDER: 'MACHINE'
});

/** Read-only inspection. Does not create/update files. */
function previewPublicationContextPackV01() {
  const resolved = pubCtxV01ResolveEpisode_(false);
  const pack = pubCtxV01BuildPack_(resolved.episode);
  const out = {
    write: 'NONE',
    version: OC_PUBLICATION_CONTEXT_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: pack.episode_key,
    transcriptChars: pack.transcript.text.length,
    actualCounts: {
      events: pack.actuals.events.length,
      songs: pack.actuals.songs.length,
      sources: pack.actuals.sources.length
    },
    confirmedStatements: pack.confirmed_statements.length,
    outputName: pubCtxV01OutputName_(pack.episode_key)
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Build/update the derived machine context artifact.
 * This file is reproducible; it is not a human-authored canonical record.
 */
function buildPublicationContextPackV01() {
  const resolved = pubCtxV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const pack = pubCtxV01BuildPack_(episode);
  const machineFolder = pubCtxV01GetMachineFolder_(episode);
  const name = pubCtxV01OutputName_(pack.episode_key);
  const content = JSON.stringify(pack, null, 2);

  const it = machineFolder.getFilesByName(name);
  const hits = [];
  while (it.hasNext()) hits.push(it.next());
  if (hits.length > 1) {
    throw new Error('PUBLICATION_CONTEXT同名ファイルが複数あります。count=' + hits.length);
  }

  let file;
  let mode;
  if (hits.length === 1) {
    file = hits[0];
    file.setContent(content);
    mode = 'UPDATED_DERIVED_ARTIFACT';
  } else {
    file = machineFolder.createFile(name, content, MimeType.PLAIN_TEXT);
    mode = 'CREATED_DERIVED_ARTIFACT';
  }

  const out = {
    write: mode,
    version: OC_PUBLICATION_CONTEXT_V01.VERSION,
    episodeKey: pack.episode_key,
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    transcriptChars: pack.transcript.text.length,
    actualCounts: {
      events: pack.actuals.events.length,
      songs: pack.actuals.songs.length,
      sources: pack.actuals.sources.length
    },
    confirmedStatements: pack.confirmed_statements.length,
    nextAction: 'このJSONと Publication Draft Prompt Contract v1.0 をAIへ渡し、*_PUBLICATION_DRAFTS.json を生成する。'
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PACK
 * ========================================================= */

function pubCtxV01BuildPack_(episode) {
  const episodeKey = pubCtxV01Title_(episode.properties['Episode_Key']);
  if (!episodeKey) throw new Error('Episode_Key missing');

  const transcriptUrl = pubCtxV01PropUrl_(episode.properties['Transcript_URL']);
  if (!transcriptUrl) throw new Error('Transcript_URL missing; official Transcript is required');
  const transcriptText = pubCtxV01ReadGoogleDocText_(transcriptUrl);
  if (!transcriptText.trim()) throw new Error('official Transcript is empty');

  return {
    schema_version: OC_PUBLICATION_CONTEXT_V01.SCHEMA_VERSION,
    builder_version: OC_PUBLICATION_CONTEXT_V01.VERSION,
    generated_at: new Date().toISOString(),
    episode_key: episodeKey,
    episode: {
      episode_no: pubCtxV01Number_(episode.properties['Episode_No']),
      episode_title: pubCtxV01RichText_(episode.properties['Episode_Title']),
      recording_date: pubCtxV01DateStart_(episode.properties['Recording_Date']),
      air_date: pubCtxV01DateStart_(episode.properties['Air_Date']),
      production_status: pubCtxV01Select_(episode.properties['Production_Status']),
      structure_memo: pubCtxV01RichText_(episode.properties['Structure_Memo']),
      setlist_memo: pubCtxV01RichText_(episode.properties['Setlist_Memo'])
    },
    transcript: {
      url: transcriptUrl,
      text: transcriptText
    },
    actuals: {
      events: pubCtxV01SummarizeRelations_(episode.properties['Events']),
      songs: pubCtxV01SummarizeRelations_(episode.properties['Songs']),
      sources: pubCtxV01SummarizeRelations_(episode.properties['Sources'])
    },
    confirmed_statements: pubCtxV01LoadConfirmedStatements_(episode.id),
    generation_guardrails: {
      transcript_is_primary_for_spoken_content: true,
      do_not_invent_first_person_emotion: true,
      do_not_correct_spoken_claims_with_hha: true,
      output_is_draft_only: true,
      final_judgment_by: 'あさくらじゅん'
    }
  };
}

function pubCtxV01SummarizeRelations_(prop) {
  const rel = prop && Array.isArray(prop.relation) ? prop.relation : [];
  return rel.map(r => pubCtxV01SummarizePage_(r.id));
}

function pubCtxV01SummarizePage_(pageId) {
  const p = pubCtxV01Request_('get', '/pages/' + pageId, null);
  const props = p.properties || {};
  const facts = {};
  let title = '';

  Object.keys(props).forEach(name => {
    const prop = props[name] || {};
    if (prop.type === 'title') {
      const v = pubCtxV01Title_(prop);
      if (!title && v) title = v;
      return;
    }
    if (prop.type === 'url' && prop.url) {
      facts[name] = prop.url;
      return;
    }
    if (prop.type === 'date' && prop.date && prop.date.start) {
      facts[name] = prop.date.end
        ? { start: prop.date.start, end: prop.date.end }
        : prop.date.start;
      return;
    }
    if (prop.type === 'select' && prop.select && prop.select.name) {
      facts[name] = prop.select.name;
    }
  });

  return {
    id: pageId,
    title: title,
    notion_url: p.url || '',
    facts: facts
  };
}

function pubCtxV01LoadConfirmedStatements_(episodeId) {
  const pages = pubCtxV01QueryAll_(OC_PUBLICATION_CONTEXT_V01.STATEMENTS_DS, {
    filter: {
      and: [
        { property: 'Episode', relation: { contains: episodeId } },
        { property: 'Review_Status', select: { equals: '確定' } }
      ]
    },
    page_size: 100
  });

  return pages.map(p => ({
    statement: pubCtxV01Title_(p.properties['Statement']),
    spoken_text: pubCtxV01RichText_(p.properties['Spoken_Text']),
    source_timecode: pubCtxV01RichText_(p.properties['Source_Timecode']),
    statement_type: pubCtxV01Select_(p.properties['Statement_Type']),
    emotion_tags: pubCtxV01MultiSelect_(p.properties['Emotion_Tags']),
    human_memo: pubCtxV01RichText_(p.properties['Human_Memo'])
  }));
}

/* =========================================================
 * EPISODE / DRIVE / DOC
 * ========================================================= */

function pubCtxV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_PUBLICATION_CONTEXT_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = pubCtxV01QueryAll_(OC_PUBLICATION_CONTEXT_V01.EPISODES_DS, {
      filter: { property: 'Episode_Key', title: { equals: requestedKey } },
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

  const pages = pubCtxV01QueryAll_(OC_PUBLICATION_CONTEXT_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 10
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'LATEST_EPISODE_PREVIEW', requestedKey: '' };
}

function pubCtxV01GetMachineFolder_(episode) {
  const folderUrl = pubCtxV01PropUrl_(episode.properties['Episode_Folder_URL']);
  const folderId = pubCtxV01ExtractDriveFolderId_(folderUrl);
  if (!folderId) throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  const episodeFolder = DriveApp.getFolderById(folderId);
  const transcript = pubCtxV01FindChildFolder_(episodeFolder, OC_PUBLICATION_CONTEXT_V01.TRANSCRIPT_FOLDER);
  if (!transcript) throw new Error('TRANSCRIPT folder missing');
  const machine = pubCtxV01FindChildFolder_(transcript, OC_PUBLICATION_CONTEXT_V01.MACHINE_FOLDER);
  if (!machine) throw new Error('TRANSCRIPT/MACHINE folder missing');
  return machine;
}

function pubCtxV01FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function pubCtxV01ExtractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function pubCtxV01ReadGoogleDocText_(url) {
  const s = String(url || '');
  const m = s.match(/\/document\/d\/([A-Za-z0-9_-]+)/);
  if (!m) {
    throw new Error('Transcript_URL is not a Google Docs URL: ' + s);
  }
  return DocumentApp.openById(m[1]).getBody().getText();
}

function pubCtxV01OutputName_(episodeKey) {
  return episodeKey + '_PUBLICATION_CONTEXT.json';
}

/* =========================================================
 * NOTION
 * ========================================================= */

function pubCtxV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function pubCtxV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + pubCtxV01Token_(),
      'Notion-Version': OC_PUBLICATION_CONTEXT_V01.NOTION_VERSION
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

function pubCtxV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = pubCtxV01Request_(
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

function pubCtxV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubCtxV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubCtxV01PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function pubCtxV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function pubCtxV01MultiSelect_(prop) {
  const a = prop && prop.multi_select;
  return Array.isArray(a) ? a.map(x => x.name || '').filter(Boolean) : [];
}

function pubCtxV01DateStart_(prop) {
  return prop && prop.date && prop.date.start ? prop.date.start : '';
}

function pubCtxV01Number_(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}
