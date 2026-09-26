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
