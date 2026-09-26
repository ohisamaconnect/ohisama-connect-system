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
