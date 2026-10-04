/**
 * OC-OS Archive / Publishing Current - PILOT Runtime
 *
 * Pipeline:
 *   Transcript -> STATEMENT candidates -> human review -> Publication context
 *   -> AI draft artifact -> PUBLICATIONS drafts -> human publication decision.
 *
 * Safety:
 * - STATEMENTS are created only as candidates.
 * - PUBLICATIONS are created only as drafts.
 * - No module confirms a statement or publishes content automatically.
 * - WRITE paths require explicit OC_TARGET_EPISODE_KEY where defined upstream.
 * - No automatic trigger is installed by this family.
 */

// ============================================================
// CURRENT SOURCE: STATEMENTS Candidate Importer
// ============================================================

/**
 * OC-OS STATEMENTS Candidate Importer
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Import provider-agnostic STATEMENT candidate JSON from
 *   EPISODE/TRANSCRIPT/MACHINE.
 * - Create STATEMENTS rows as Review_Status=候補 / Origin=AI抽出 only.
 * - Never confirm, rewrite, delete, or update existing STATEMENTS.
 *
 * Required Script Properties:
 * - NOTION_API_TOKEN (preferred; NOTION_TOKEN / NOTION_SECRET fallback)
 * - OC_TARGET_EPISODE_KEY for WRITE
 *
 * Candidate artifact suffix:
 * - *_STATEMENT_CANDIDATES.json
 */

const OC_STATEMENT_IMPORTER_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  STATEMENTS_DS: '0019d30d-da69-4c8d-a24a-07ee4573fb4f',
  MEMBERS_DS: 'df86e0ba-5478-4fc6-b30a-49cb1bd6c83d',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',
  MACHINE_FOLDER: 'MACHINE',
  CANDIDATE_SUFFIX: '_STATEMENT_CANDIDATES.json',
  ALLOWED_TYPES: ['名言', '価値観', '変化', '瞬間', 'その他'],
  ALLOWED_EMOTIONS: ['喜び', '感謝', '誇り', '驚き', '期待', '愛着', '寂しさ', '葛藤', '熱量', 'その他']
});

/** Read-only preview. */
function previewStatementCandidateImportV01() {
  const resolved = stmtV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const artifact = stmtV01LoadCandidateArtifact_(episode);
  const existingKeys = stmtV01LoadExistingCandidateKeys_(episode.id);
  const members = stmtV01LoadMemberMap_();
  const plan = stmtV01BuildPlan_(episode, artifact, existingKeys, members);

  const out = {
    write: 'NONE',
    version: OC_STATEMENT_IMPORTER_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: stmtV01Title_(episode.properties['Episode_Key']),
    artifact: artifact.summary,
    counts: {
      candidates: plan.items.length,
      readyToCreate: plan.items.filter(x => x.action === 'CREATE').length,
      duplicateSkip: plan.items.filter(x => x.action === 'SKIP_DUPLICATE').length,
      blocked: plan.items.filter(x => x.action === 'BLOCK').length
    },
    items: plan.items,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS STATEMENT CANDIDATE IMPORT PREVIEW');
  console.log('VERSION = ' + OC_STATEMENT_IMPORTER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Safe importer.
 * WRITE requires OC_TARGET_EPISODE_KEY.
 */
function importStatementCandidatesV01() {
  const resolved = stmtV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const artifact = stmtV01LoadCandidateArtifact_(episode);
  const existingKeys = stmtV01LoadExistingCandidateKeys_(episode.id);
  const members = stmtV01LoadMemberMap_();
  const plan = stmtV01BuildPlan_(episode, artifact, existingKeys, members);

  const blocked = plan.items.filter(x => x.action === 'BLOCK');
  if (blocked.length) {
    throw new Error(
      'BLOCK candidateがあります。Previewを確認してください。count=' + blocked.length
    );
  }

  const created = [];
  const skipped = [];

  plan.items.forEach(item => {
    if (item.action === 'SKIP_DUPLICATE') {
      skipped.push({ candidateKey: item.candidateKey, reason: 'duplicate' });
      return;
    }
    if (item.action !== 'CREATE') return;

    const page = stmtV01CreateStatementPage_(episode, artifact, item);
    created.push({
      candidateKey: item.candidateKey,
      pageId: page.id,
      url: page.url || ''
    });
  });

  const out = {
    write: 'STATEMENT_CANDIDATES_CREATED',
    version: OC_STATEMENT_IMPORTER_V01.VERSION,
    episodeKey: stmtV01Title_(episode.properties['Episode_Key']),
    createdCount: created.length,
    skippedCount: skipped.length,
    created: created,
    skipped: skipped,
    warnings: plan.warnings,
    nextAction: 'Notion STATEMENTS / 01｜要確認 で人間確認し、確定または見送りへ変更する。'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function stmtV01BuildPlan_(episode, artifact, existingKeys, members) {
  const episodeKey = stmtV01Title_(episode.properties['Episode_Key']);
  const transcriptUrl = stmtV01PropUrl_(episode.properties['Transcript_URL']);
  const warnings = [];

  if (artifact.data.source_transcript_url && transcriptUrl &&
      artifact.data.source_transcript_url !== transcriptUrl) {
    warnings.push('source_transcript_url differs from current EPISODES.Transcript_URL');
  }

  const raw = Array.isArray(artifact.data.candidates)
    ? artifact.data.candidates
    : [];

  const items = raw.map((c, index) => {
    const statement = stmtV01Trim_(c.statement);
    const spokenText = stmtV01Trim_(c.spoken_text);
    const timecode = stmtV01Trim_(c.source_timecode);
    const type = stmtV01Trim_(c.statement_type);
    const reason = stmtV01Trim_(c.ai_candidate_reason);
    const memberHints = stmtV01StringArray_(c.related_member_names);
    const requestedEmotions = stmtV01StringArray_(c.emotion_tags);
    const emotions = requestedEmotions.filter(x =>
      OC_STATEMENT_IMPORTER_V01.ALLOWED_EMOTIONS.indexOf(x) >= 0
    );
    const invalidEmotions = requestedEmotions.filter(x =>
      OC_STATEMENT_IMPORTER_V01.ALLOWED_EMOTIONS.indexOf(x) < 0
    );

    const candidateKey = stmtV01CandidateKey_(episodeKey, timecode, spokenText);
    const matchedMembers = [];
    const unmatchedMembers = [];

    memberHints.forEach(name => {
      const hit = members[name];
      if (hit) matchedMembers.push(hit);
      else unmatchedMembers.push(name);
    });

    const errors = [];
    if (!spokenText) errors.push('spoken_text empty');
    if (!timecode) errors.push('source_timecode empty');
    if (OC_STATEMENT_IMPORTER_V01.ALLOWED_TYPES.indexOf(type) < 0) {
      errors.push('invalid statement_type: ' + type);
    }
    if (artifact.data.episode_key !== episodeKey) {
      errors.push('episode_key mismatch');
    }

    let action = 'CREATE';
    if (errors.length) action = 'BLOCK';
    else if (existingKeys[candidateKey]) action = 'SKIP_DUPLICATE';

    return {
      index: index + 1,
      action: action,
      candidateKey: candidateKey,
      statement: statement || stmtV01FallbackTitle_(spokenText),
      spokenText: spokenText,
      sourceTimecode: timecode,
      statementType: type,
      emotionTags: emotions,
      invalidEmotionTags: invalidEmotions,
      relatedMemberHints: memberHints,
      matchedMembers: matchedMembers.map(x => ({ id: x.id, name: x.name })),
      unmatchedMembers: unmatchedMembers,
      aiCandidateReason: reason,
      errors: errors
    };
  });

  if (!raw.length) warnings.push('candidates is empty; 0件は正常です。');
  return { items: items, warnings: warnings };
}

function stmtV01CreateStatementPage_(episode, artifact, item) {
  const sourceUrl = stmtV01Trim_(artifact.data.source_transcript_url) ||
    stmtV01PropUrl_(episode.properties['Transcript_URL']);

  const props = {
    Statement: stmtV01TitleProp_(item.statement),
    Review_Status: { select: { name: '候補' } },
    Statement_Type: { select: { name: item.statementType } },
    Origin: { select: { name: 'AI抽出' } },
    Episode: { relation: [{ id: episode.id }] },
    Spoken_Text: stmtV01RichTextProp_(item.spokenText),
    Source_Timecode: stmtV01RichTextProp_(item.sourceTimecode),
    AI_Candidate_Reason: stmtV01RichTextProp_(item.aiCandidateReason),
    Candidate_Key: stmtV01RichTextProp_(item.candidateKey),
    Extractor_Version: stmtV01RichTextProp_(
      stmtV01Trim_(artifact.data.extractor_version) || 'unknown'
    ),
    Related_Member_Hints: stmtV01RichTextProp_(item.relatedMemberHints.join(' / ')),
    Related_Members: {
      relation: item.matchedMembers.map(x => ({ id: x.id }))
    }
  };

  if (sourceUrl) props.Source_Transcript_URL = { url: sourceUrl };
  if (item.emotionTags.length) {
    props.Emotion_Tags = {
      multi_select: item.emotionTags.map(x => ({ name: x }))
    };
  }

  return stmtV01Request_('post', '/pages', {
    parent: { data_source_id: OC_STATEMENT_IMPORTER_V01.STATEMENTS_DS },
    properties: props
  });
}

/* =========================================================
 * CANDIDATE ARTIFACT
 * ========================================================= */

function stmtV01LoadCandidateArtifact_(episode) {
  const episodeFolder = stmtV01GetEpisodeFolder_(episode);
  const transcriptFolder = stmtV01FindChildFolder_(
    episodeFolder,
    OC_STATEMENT_IMPORTER_V01.TRANSCRIPT_FOLDER
  );
  if (!transcriptFolder) throw new Error('TRANSCRIPT folder missing');

  const machineFolder = stmtV01FindChildFolder_(
    transcriptFolder,
    OC_STATEMENT_IMPORTER_V01.MACHINE_FOLDER
  );
  if (!machineFolder) throw new Error('TRANSCRIPT/MACHINE folder missing');

  const files = machineFolder.getFiles();
  const hits = [];
  while (files.hasNext()) {
    const f = files.next();
    if (String(f.getName() || '').toUpperCase().endsWith(
      OC_STATEMENT_IMPORTER_V01.CANDIDATE_SUFFIX.toUpperCase()
    )) {
      hits.push(f);
    }
  }

  if (hits.length !== 1) {
    throw new Error(
      '*_STATEMENT_CANDIDATES.json が1件ではありません。count=' + hits.length
    );
  }

  const file = hits[0];
  const text = file.getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, '');
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('STATEMENT candidate JSON parse failed: ' + e.message);
  }

  if (!data || typeof data !== 'object') throw new Error('candidate JSON root invalid');
  if (data.schema_version !== '1.0') {
    throw new Error(
      'unsupported schema_version: ' + String(data.schema_version || '')
    );
  }
  if (!stmtV01Trim_(data.episode_key)) throw new Error('episode_key missing');
  if (!Array.isArray(data.candidates)) throw new Error('candidates array missing');

  return {
    data: data,
    summary: {
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      lastUpdated: file.getLastUpdated().toISOString(),
      candidateCount: data.candidates.length,
      schemaVersion: data.schema_version || '',
      extractorVersion: data.extractor_version || '',
      episodeKey: data.episode_key || ''
    }
  };
}

/* =========================================================
 * EPISODE / MEMBER / DEDUP
 * ========================================================= */

function stmtV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_STATEMENT_IMPORTER_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = stmtV01QueryAll_(OC_STATEMENT_IMPORTER_V01.EPISODES_DS, {
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

  const pages = stmtV01QueryAll_(OC_STATEMENT_IMPORTER_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 10
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'LATEST_EPISODE_PREVIEW', requestedKey: '' };
}

function stmtV01LoadExistingCandidateKeys_(episodeId) {
  const pages = stmtV01QueryAll_(OC_STATEMENT_IMPORTER_V01.STATEMENTS_DS, {
    filter: {
      property: 'Episode',
      relation: { contains: episodeId }
    },
    page_size: 100
  });

  const out = {};
  pages.forEach(p => {
    const key = stmtV01RichText_(p.properties['Candidate_Key']);
    if (key) out[key] = true;
  });
  return out;
}

function stmtV01LoadMemberMap_() {
  const pages = stmtV01QueryAll_(OC_STATEMENT_IMPORTER_V01.MEMBERS_DS, {
    page_size: 100
  });
  const out = {};
  pages.forEach(p => {
    const name = stmtV01Title_(p.properties['Member_Name']);
    if (name) out[name] = { id: p.id, name: name };
  });
  return out;
}

function stmtV01GetEpisodeFolder_(episode) {
  const url = stmtV01PropUrl_(episode.properties['Episode_Folder_URL']);
  const id = stmtV01ExtractDriveFolderId_(url);
  if (!id) throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  return DriveApp.getFolderById(id);
}

function stmtV01FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function stmtV01ExtractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

/* =========================================================
 * KEYS / VALIDATION
 * ========================================================= */

function stmtV01CandidateKey_(episodeKey, timecode, spokenText) {
  const base = [
    stmtV01Normalize_(episodeKey),
    stmtV01Normalize_(timecode),
    stmtV01Normalize_(spokenText)
  ].join('|');

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    base,
    Utilities.Charset.UTF_8
  );
  const hex = bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return 'STM-CAND-' + hex.slice(0, 24);
}

function stmtV01Normalize_(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function stmtV01FallbackTitle_(spokenText) {
  const s = stmtV01Normalize_(spokenText);
  return s.length > 42 ? s.slice(0, 42) + '…' : s;
}

function stmtV01Trim_(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function stmtV01StringArray_(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => stmtV01Trim_(x)).filter(Boolean);
}

/* =========================================================
 * NOTION
 * ========================================================= */

function stmtV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function stmtV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + stmtV01Token_(),
      'Notion-Version': OC_STATEMENT_IMPORTER_V01.NOTION_VERSION
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

function stmtV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = stmtV01Request_(
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

function stmtV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function stmtV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function stmtV01PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function stmtV01TitleProp_(text) {
  return {
    title: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }]
  };
}

function stmtV01RichTextProp_(text) {
  const s = String(text || '');
  if (!s) return { rich_text: [] };
  const chunks = [];
  for (let i = 0; i < s.length; i += 1900) {
    chunks.push({
      type: 'text',
      text: { content: s.slice(i, i + 1900) }
    });
  }
  return { rich_text: chunks };
}


// ============================================================
// CURRENT SOURCE: Publication Context Builder
// ============================================================

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


// ============================================================
// CURRENT SOURCE: Publication Draft Importer
// ============================================================

/**
 * OC-OS PUBLICATIONS Draft Importer
 * v0.1.0-preview (2026-09-26)
 *
 * Purpose:
 * - Read provider-neutral *_PUBLICATION_DRAFTS.json from
 *   EPISODE/TRANSCRIPT/MACHINE.
 * - Create new PUBLICATIONS rows only as Publication_Status=下書き / Origin=AI下書き.
 * - Never update an existing Publication_Key automatically.
 * - Materialize long-form ショーノート drafts as Google Docs under
 *   EPISODE/PUBLICATIONS.
 *
 * WRITE requires Script Property:
 * - OC_TARGET_EPISODE_KEY
 *
 * Notion token properties:
 * - NOTION_API_TOKEN (preferred)
 * - NOTION_TOKEN / NOTION_SECRET fallback
 */

const OC_PUBLICATION_DRAFT_IMPORTER_V01 = Object.freeze({
  VERSION: '0.1.0-preview',
  NOTION_VERSION: '2026-03-11',
  EPISODES_DS: '163867a7-e71c-44d6-8fd3-333c2810746c',
  PUBLICATIONS_DS: 'f192f616-6d18-44b3-a591-825ee285283b',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  TRANSCRIPT_FOLDER: 'TRANSCRIPT',
  MACHINE_FOLDER: 'MACHINE',
  PUBLICATION_FOLDER: 'PUBLICATIONS',
  ARTIFACT_SUFFIX: '_PUBLICATION_DRAFTS.json',
  ALLOWED_TYPES: ['トーク音声', 'ショーノート', 'SNS投稿', 'オーディオグラム', 'その他'],
  ALLOWED_PLATFORMS: ['未定', 'Spotify', 'note', 'X', 'Instagram', 'YouTube', 'その他']
});

/** Read-only preview. */
function previewPublicationDraftImportV01() {
  const resolved = pubV01ResolveEpisode_(false);
  const episode = resolved.episode;
  const artifact = pubV01LoadArtifact_(episode);
  const existing = pubV01LoadExistingPublicationKeys_(episode.id);
  const plan = pubV01BuildPlan_(episode, artifact, existing);

  const out = {
    write: 'NONE',
    version: OC_PUBLICATION_DRAFT_IMPORTER_V01.VERSION,
    targetMode: resolved.mode,
    explicitTargetKey: resolved.requestedKey,
    episodeKey: pubV01Title_(episode.properties['Episode_Key']),
    artifact: artifact.summary,
    counts: {
      drafts: plan.items.length,
      readyToCreate: plan.items.filter(x => x.action === 'CREATE').length,
      existingSkip: plan.items.filter(x => x.action === 'SKIP_EXISTING').length,
      blocked: plan.items.filter(x => x.action === 'BLOCK').length
    },
    items: plan.items,
    warnings: plan.warnings
  };

  console.log('========================================');
  console.log('OC-OS PUBLICATION DRAFT IMPORT PREVIEW');
  console.log('VERSION = ' + OC_PUBLICATION_DRAFT_IMPORTER_V01.VERSION);
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/** Safe create-missing-only importer. */
function importPublicationDraftsV01() {
  const resolved = pubV01ResolveEpisode_(true);
  const episode = resolved.episode;
  const artifact = pubV01LoadArtifact_(episode);
  const existing = pubV01LoadExistingPublicationKeys_(episode.id);
  const plan = pubV01BuildPlan_(episode, artifact, existing);

  const blocked = plan.items.filter(x => x.action === 'BLOCK');
  if (blocked.length) {
    throw new Error('BLOCK draftがあります。Previewを確認してください。count=' + blocked.length);
  }

  const created = [];
  const skipped = [];

  plan.items.forEach(item => {
    if (item.action === 'SKIP_EXISTING') {
      skipped.push({
        publicationKey: item.publicationKey,
        draftKey: item.draftKey,
        reason: 'existing Publication_Key; automatic update prohibited'
      });
      return;
    }
    if (item.action !== 'CREATE') return;

    const draftUrl = item.requiresGoogleDoc
      ? pubV01CreateLongFormDraftDoc_(episode, item)
      : '';

    const page = pubV01CreatePublicationPage_(episode, artifact, item, draftUrl);
    created.push({
      publicationKey: item.publicationKey,
      draftKey: item.draftKey,
      pageId: page.id,
      url: page.url || '',
      draftUrl: draftUrl
    });
  });

  const out = {
    write: 'PUBLICATION_DRAFTS_CREATED',
    version: OC_PUBLICATION_DRAFT_IMPORTER_V01.VERSION,
    episodeKey: pubV01Title_(episode.properties['Episode_Key']),
    createdCount: created.length,
    skippedCount: skipped.length,
    created: created,
    skipped: skipped,
    warnings: plan.warnings,
    nextAction: 'Notion PUBLICATIONS / 05｜下書き確認 で人間確認。AIは公開準備済・公開済へ進めない。'
  };

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* =========================================================
 * PLAN
 * ========================================================= */

function pubV01BuildPlan_(episode, artifact, existing) {
  const episodeKey = pubV01Title_(episode.properties['Episode_Key']);
  const episodeTranscriptUrl = pubV01PropUrl_(episode.properties['Transcript_URL']);
  const warnings = [];
  const seenArtifactKeys = {};

  if (artifact.data.episode_key !== episodeKey) {
    warnings.push('artifact episode_key mismatch');
  }
  if (artifact.data.source_transcript_url && episodeTranscriptUrl &&
      artifact.data.source_transcript_url !== episodeTranscriptUrl) {
    warnings.push('source_transcript_url differs from current EPISODES.Transcript_URL');
  }

  const raw = Array.isArray(artifact.data.drafts) ? artifact.data.drafts : [];
  const items = raw.map((d, index) => {
    const outputType = pubV01Trim_(d.output_type);
    const platform = pubV01Trim_(d.platform);
    const publicationKey = pubV01Trim_(d.publication_key);
    const draftKey = pubV01Trim_(d.draft_key);
    const publication = pubV01Trim_(d.publication) ||
      [episodeKey, outputType, platform].filter(Boolean).join('｜');
    const titleCandidates = pubV01StringArray_(d.title_candidates);
    const draftText = typeof d.draft_text === 'string' ? d.draft_text : '';
    const reviewNotes = typeof d.review_notes === 'string' ? d.review_notes : '';
    const expectedPublicationKey = [episodeKey, outputType, platform].join('|');
    const errors = [];

    if (OC_PUBLICATION_DRAFT_IMPORTER_V01.ALLOWED_TYPES.indexOf(outputType) < 0) {
      errors.push('invalid output_type: ' + outputType);
    }
    if (OC_PUBLICATION_DRAFT_IMPORTER_V01.ALLOWED_PLATFORMS.indexOf(platform) < 0) {
      errors.push('invalid platform: ' + platform);
    }
    if (!publicationKey) errors.push('publication_key empty');
    if (!draftKey) errors.push('draft_key empty');
    if (!draftText) errors.push('draft_text empty');
    if (artifact.data.episode_key !== episodeKey) errors.push('episode_key mismatch');
    if (publicationKey && publicationKey !== expectedPublicationKey) {
      errors.push(
        'publication_key must equal Episode_Key|Output_Type|Platform: expected=' +
        expectedPublicationKey
      );
    }
    if (publicationKey && seenArtifactKeys[publicationKey]) {
      errors.push('duplicate publication_key inside artifact');
    }
    if (publicationKey) seenArtifactKeys[publicationKey] = true;

    let action = 'CREATE';
    if (errors.length) action = 'BLOCK';
    else if (existing[publicationKey]) action = 'SKIP_EXISTING';

    return {
      index: index + 1,
      action: action,
      publicationKey: publicationKey,
      draftKey: draftKey,
      publication: publication,
      outputType: outputType,
      platform: platform,
      titleCandidates: titleCandidates,
      draftText: draftText,
      reviewNotes: reviewNotes,
      requiresGoogleDoc: outputType === 'ショーノート',
      existing: existing[publicationKey] || null,
      errors: errors
    };
  });

  if (!raw.length) warnings.push('drafts is empty; 0件は正常です。');
  return { items: items, warnings: warnings };
}

/* =========================================================
 * CREATE
 * ========================================================= */

function pubV01CreatePublicationPage_(episode, artifact, item, draftUrl) {
  const sourceUrl = pubV01Trim_(artifact.data.source_transcript_url) ||
    pubV01PropUrl_(episode.properties['Transcript_URL']);

  const props = {
    Publication: pubV01TitleProp_(item.publication),
    Episode: { relation: [{ id: episode.id }] },
    Publication_Key: pubV01RichTextProp_(item.publicationKey),
    Draft_Key: pubV01RichTextProp_(item.draftKey),
    Output_Type: { select: { name: item.outputType } },
    Platform: { select: { name: item.platform } },
    Publication_Status: { select: { name: '下書き' } },
    Origin: { select: { name: 'AI下書き' } },
    AI_Title_Candidates: pubV01RichTextProp_(item.titleCandidates.join('\n')),
    AI_Review_Notes: pubV01RichTextProp_(item.reviewNotes),
    Generator_Version: pubV01RichTextProp_(
      pubV01Trim_(artifact.data.generator_version) || 'unknown'
    )
  };

  // Short-form drafts live in Notion. Long-form drafts live in Google Docs.
  if (!item.requiresGoogleDoc) {
    props.AI_Draft_Text = pubV01RichTextProp_(item.draftText);
  }
  if (draftUrl) props.Draft_URL = { url: draftUrl };
  if (sourceUrl) props.Source_Transcript_URL = { url: sourceUrl };

  const generatedAt = pubV01Trim_(artifact.data.generated_at);
  if (generatedAt) {
    props.Draft_Generated_At = { date: { start: generatedAt } };
  }

  return pubV01Request_('post', '/pages', {
    parent: { data_source_id: OC_PUBLICATION_DRAFT_IMPORTER_V01.PUBLICATIONS_DS },
    properties: props
  });
}

function pubV01CreateLongFormDraftDoc_(episode, item) {
  const episodeFolder = pubV01GetEpisodeFolder_(episode);
  const publicationFolder = pubV01GetOrCreateChildFolder_(
    episodeFolder,
    OC_PUBLICATION_DRAFT_IMPORTER_V01.PUBLICATION_FOLDER
  );

  const docName = 'DRAFT_' + pubV01SafeName_(
    (item.titleCandidates[0] || item.publication || item.publicationKey)
  );

  // Create-missing-only importer never reaches this function for an existing
  // Publication_Key, so the document cannot silently replace an earlier draft.
  const doc = DocumentApp.create(docName);
  const body = doc.getBody();
  body.clear();
  body.appendParagraph(item.draftText);
  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(publicationFolder);
  return doc.getUrl();
}

/* =========================================================
 * ARTIFACT
 * ========================================================= */

function pubV01LoadArtifact_(episode) {
  const episodeFolder = pubV01GetEpisodeFolder_(episode);
  const transcriptFolder = pubV01FindChildFolder_(
    episodeFolder,
    OC_PUBLICATION_DRAFT_IMPORTER_V01.TRANSCRIPT_FOLDER
  );
  if (!transcriptFolder) throw new Error('TRANSCRIPT folder missing');

  const machineFolder = pubV01FindChildFolder_(
    transcriptFolder,
    OC_PUBLICATION_DRAFT_IMPORTER_V01.MACHINE_FOLDER
  );
  if (!machineFolder) throw new Error('TRANSCRIPT/MACHINE folder missing');

  const files = machineFolder.getFiles();
  const hits = [];
  while (files.hasNext()) {
    const f = files.next();
    if (String(f.getName() || '').toUpperCase().endsWith(
      OC_PUBLICATION_DRAFT_IMPORTER_V01.ARTIFACT_SUFFIX.toUpperCase()
    )) {
      hits.push(f);
    }
  }

  if (hits.length !== 1) {
    throw new Error(
      '*_PUBLICATION_DRAFTS.json が1件ではありません。count=' + hits.length
    );
  }

  const file = hits[0];
  const text = file.getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, '');
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('PUBLICATION draft JSON parse failed: ' + e.message);
  }

  if (!data || typeof data !== 'object') throw new Error('artifact root invalid');
  if (data.schema_version !== '1.0') {
    throw new Error('unsupported schema_version: ' + String(data.schema_version || ''));
  }
  if (!pubV01Trim_(data.episode_key)) throw new Error('episode_key missing');
  if (!Array.isArray(data.drafts)) throw new Error('drafts array missing');

  return {
    data: data,
    summary: {
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      lastUpdated: file.getLastUpdated().toISOString(),
      draftCount: data.drafts.length,
      schemaVersion: data.schema_version || '',
      generatorVersion: data.generator_version || '',
      episodeKey: data.episode_key || ''
    }
  };
}

/* =========================================================
 * EPISODE / EXISTING / DRIVE
 * ========================================================= */

function pubV01ResolveEpisode_(requireExplicit) {
  const requestedKey = String(
    PropertiesService.getScriptProperties().getProperty(
      OC_PUBLICATION_DRAFT_IMPORTER_V01.TARGET_KEY_PROPERTY
    ) || ''
  ).trim();

  if (requestedKey) {
    const pages = pubV01QueryAll_(OC_PUBLICATION_DRAFT_IMPORTER_V01.EPISODES_DS, {
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

  const pages = pubV01QueryAll_(OC_PUBLICATION_DRAFT_IMPORTER_V01.EPISODES_DS, {
    sorts: [{ property: 'Recording_Date', direction: 'descending' }],
    page_size: 10
  });
  if (!pages.length) throw new Error('対象EPISODEがありません。');
  return { episode: pages[0], mode: 'LATEST_EPISODE_PREVIEW', requestedKey: '' };
}

function pubV01LoadExistingPublicationKeys_(episodeId) {
  const pages = pubV01QueryAll_(OC_PUBLICATION_DRAFT_IMPORTER_V01.PUBLICATIONS_DS, {
    filter: { property: 'Episode', relation: { contains: episodeId } },
    page_size: 100
  });
  const out = {};
  pages.forEach(p => {
    const key = pubV01RichText_(p.properties['Publication_Key']);
    if (key) {
      out[key] = {
        id: p.id,
        url: p.url || '',
        status: pubV01Select_(p.properties['Publication_Status']),
        currentDraftKey: pubV01RichText_(p.properties['Draft_Key'])
      };
    }
  });
  return out;
}

function pubV01GetEpisodeFolder_(episode) {
  const url = pubV01PropUrl_(episode.properties['Episode_Folder_URL']);
  const id = pubV01ExtractDriveFolderId_(url);
  if (!id) throw new Error('Episode_Folder_URLからDrive folder IDを取得できません。');
  return DriveApp.getFolderById(id);
}

function pubV01FindChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function pubV01GetOrCreateChildFolder_(parent, name) {
  const hit = pubV01FindChildFolder_(parent, name);
  return hit || parent.createFolder(name);
}

function pubV01ExtractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function pubV01SafeName_(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '＿')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Publication Draft';
}

/* =========================================================
 * NOTION
 * ========================================================= */

function pubV01Token_() {
  const p = PropertiesService.getScriptProperties();
  const token =
    p.getProperty('NOTION_API_TOKEN') ||
    p.getProperty('NOTION_TOKEN') ||
    p.getProperty('NOTION_SECRET');
  if (!token) throw new Error('NOTION_API_TOKEN / NOTION_TOKEN / NOTION_SECRET が必要です。');
  return token;
}

function pubV01Request_(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + pubV01Token_(),
      'Notion-Version': OC_PUBLICATION_DRAFT_IMPORTER_V01.NOTION_VERSION
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

function pubV01QueryAll_(dataSourceId, body) {
  const out = [];
  let cursor = null;
  do {
    const req = JSON.parse(JSON.stringify(body || {}));
    req.page_size = Math.min(req.page_size || 100, 100);
    if (cursor) req.start_cursor = cursor;
    const r = pubV01Request_(
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

function pubV01Trim_(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function pubV01StringArray_(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => pubV01Trim_(x)).filter(Boolean);
}

function pubV01Title_(prop) {
  const a = prop && prop.title;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubV01RichText_(prop) {
  const a = prop && prop.rich_text;
  return Array.isArray(a) ? a.map(x => x.plain_text || '').join('') : '';
}

function pubV01Select_(prop) {
  return prop && prop.select && prop.select.name ? prop.select.name : '';
}

function pubV01PropUrl_(prop) {
  return prop && prop.url ? prop.url : '';
}

function pubV01TitleProp_(text) {
  return {
    title: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }]
  };
}

function pubV01RichTextProp_(text) {
  const s = String(text || '');
  if (!s) return { rich_text: [] };
  const chunks = [];
  for (let i = 0; i < s.length; i += 1900) {
    chunks.push({ type: 'text', text: { content: s.slice(i, i + 1900) } });
  }
  return { rich_text: chunks };
}


// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

const OCOS_ARCHIVE_PUBLISHING_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});

function previewStatementArchiveCurrent() {
  return previewStatementCandidateImportV01();
}

function importStatementArchiveCurrent() {
  return importStatementCandidatesV01();
}

function previewPublicationContextCurrent() {
  return previewPublicationContextPackV01();
}

function buildPublicationContextCurrent() {
  return buildPublicationContextPackV01();
}

function previewPublicationDraftsCurrent() {
  return previewPublicationDraftImportV01();
}

function importPublicationDraftsCurrent() {
  return importPublicationDraftsV01();
}