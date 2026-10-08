/**
 * MEMBER VOICES Production Provider Evaluation Runner v0.1
 *
 * Evaluation-only Apps Script runner.
 *
 * Safety:
 * - uses existing Script Property GEMINI_API_KEY
 * - refuses to run until approved Calibration 10 manifest status=READY
 * - one invocation processes at most one article
 * - no Notion writes
 * - no production SQLite writes
 * - no permanent Voice_ID allocation
 * - no cross-provider fallback
 * - outputs raw evaluation evidence to Drive only
 *
 * Public entry points:
 *   memberVoicesEvalPreflightV01()
 *   memberVoicesEvalStartPass1V01()
 *   memberVoicesEvalStartPass2V01()
 *   memberVoicesEvalStartPass3V01()
 *   memberVoicesEvalRunNextV01()
 *   memberVoicesEvalStatusV01()
 */

const MEMBER_VOICES_EVAL_V01 = Object.freeze({
  VERSION: '0.1.0',
  MODEL: 'gemini-3.8-flash',
  THINKING_LEVEL: 'medium',
  INTERACTIONS_URL: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  GEMINI_KEY_PROPERTY: 'GEMINI_API_KEY',
  MANIFEST_FILE_ID_PROPERTY: 'MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID',
  PROMPT_FILE_ID_PROPERTY: 'MEMBER_VOICES_EVAL_PROMPT_FILE_ID',
  SCHEMA_FILE_ID_PROPERTY: 'MEMBER_VOICES_EVAL_PROVIDER_SCHEMA_FILE_ID',
  STATE_PROPERTY: 'MEMBER_VOICES_EVAL_STATE_V01',
  MEMBER_VOICES_DRIVE_FOLDER_ID: '10OOVq7c5PelCb-Yinr7xy_csYTic60VE',
  PROMPT_PINNED_URL:
    'https://raw.githubusercontent.com/ohisamaconnect/ohisama-connect-system/' +
    'a9cea5d48af7bee87b8b779f07716c6bebeec8a1/' +
    'member_voices/prompts/MEMBER_VOICES_SEMANTIC_PROMPT_v0.1.md',
  SCHEMA_PINNED_URL:
    'https://raw.githubusercontent.com/ohisamaconnect/ohisama-connect-system/' +
    '0b0b69a8cbcf790a1e184044a40947c20855cb93/' +
    'member_voices/schemas/member_voices_provider_payload_v0_1.schema.json'
});

function memberVoicesEvalPreflightV01() {
  const report = memberVoicesEvalPreflightInternalV01_();
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function memberVoicesEvalStartPass1V01() {
  return memberVoicesEvalStartPassV01_(1);
}

function memberVoicesEvalStartPass2V01() {
  return memberVoicesEvalStartPassV01_(2);
}

function memberVoicesEvalStartPass3V01() {
  return memberVoicesEvalStartPassV01_(3);
}

function memberVoicesEvalStatusV01() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    MEMBER_VOICES_EVAL_V01.STATE_PROPERTY
  );
  const state = raw ? JSON.parse(raw) : { status: 'NOT_STARTED' };
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalRunNextV01() {
  const props = PropertiesService.getScriptProperties();
  const rawState = props.getProperty(MEMBER_VOICES_EVAL_V01.STATE_PROPERTY);
  if (!rawState) {
    throw new Error('Evaluation pass not started. Run memberVoicesEvalStartPass1V01/2/3 first.');
  }

  const state = JSON.parse(rawState);
  if (state.status !== 'RUNNING') {
    console.log(JSON.stringify(state, null, 2));
    return state;
  }

  const manifest = memberVoicesEvalLoadManifestV01_();
  memberVoicesEvalValidateReadyManifestV01_(manifest);

  if (state.manifestSha256 !== memberVoicesEvalSha256HexV01_(
      JSON.stringify(manifest))) {
    throw new Error('Calibration manifest changed after pass start. Abort and start a new pass.');
  }

  const cases = manifest.cases.slice().sort((a, b) => a.case_no - b.case_no);
  if (state.nextCaseIndex >= cases.length) {
    state.status = 'COMPLETED';
    state.completedAt = new Date().toISOString();
    props.setProperty(MEMBER_VOICES_EVAL_V01.STATE_PROPERTY, JSON.stringify(state));
    memberVoicesEvalWriteRunStateV01_(state);
    return state;
  }

  const evalCase = cases[state.nextCaseIndex];
  const result = memberVoicesEvalRunCaseV01_(state, manifest, evalCase);

  state.completedCases = state.completedCases || [];
  state.completedCases.push({
    caseNo: evalCase.case_no,
    articleId: evalCase.article_id,
    resultFileId: result.resultFileId,
    interactionId: result.interactionId,
    providerStatus: result.providerStatus
  });
  state.nextCaseIndex += 1;
  state.lastUpdatedAt = new Date().toISOString();

  if (state.nextCaseIndex >= cases.length) {
    state.status = 'COMPLETED';
    state.completedAt = new Date().toISOString();
  }

  props.setProperty(MEMBER_VOICES_EVAL_V01.STATE_PROPERTY, JSON.stringify(state));
  memberVoicesEvalWriteRunStateV01_(state);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalStartPassV01_(passNo) {
  if (![1, 2, 3].includes(passNo)) {
    throw new Error('passNo must be 1, 2, or 3.');
  }

  const preflight = memberVoicesEvalPreflightInternalV01_();
  if (preflight.status !== 'READY') {
    console.log(JSON.stringify(preflight, null, 2));
    throw new Error('Evaluation preflight is not READY: ' + preflight.reason);
  }

  const manifest = memberVoicesEvalLoadManifestV01_();
  const manifestSha = memberVoicesEvalSha256HexV01_(JSON.stringify(manifest));
  const prompt = memberVoicesEvalLoadPinnedTextV01_(
    MEMBER_VOICES_EVAL_V01.PROMPT_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V01.PROMPT_PINNED_URL
  );
  const schemaText = memberVoicesEvalLoadPinnedTextV01_(
    MEMBER_VOICES_EVAL_V01.SCHEMA_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V01.SCHEMA_PINNED_URL
  );
  const promptSha = memberVoicesEvalSha256HexV01_(prompt);
  const schemaSha = memberVoicesEvalSha256HexV01_(schemaText);
  const extractorVersion = [
    'mv-semantic',
    'p0.1',
    'ps0.1',
    'google-gemini',
    MEMBER_VOICES_EVAL_V01.MODEL,
    MEMBER_VOICES_EVAL_V01.THINKING_LEVEL,
    'ph' + promptSha.slice(0, 12),
    'sh' + schemaSha.slice(0, 12)
  ].join('-');

  const outputRoot = memberVoicesEvalEnsureFolderV01_(
    DriveApp.getFolderById(MEMBER_VOICES_EVAL_V01.MEMBER_VOICES_DRIVE_FOLDER_ID),
    'EVAL_RUNS'
  );
  const runId =
    'CAL10-P' + passNo + '-' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  const runFolder = outputRoot.createFolder(runId);

  const state = {
    runnerVersion: MEMBER_VOICES_EVAL_V01.VERSION,
    status: 'RUNNING',
    runId: runId,
    passNo: passNo,
    model: MEMBER_VOICES_EVAL_V01.MODEL,
    thinkingLevel: MEMBER_VOICES_EVAL_V01.THINKING_LEVEL,
    extractorVersion: extractorVersion,
    manifestSha256: manifestSha,
    promptSha256: promptSha,
    providerSchemaSha256: schemaSha,
    runFolderId: runFolder.getId(),
    nextCaseIndex: 0,
    completedCases: [],
    startedAt: new Date().toISOString(),
    writeBoundary: 'DRIVE_EVAL_EVIDENCE_ONLY',
    notionWrite: false,
    permanentVoiceIdAllocation: false,
    productionSqliteMutation: false
  };

  PropertiesService.getScriptProperties().setProperty(
    MEMBER_VOICES_EVAL_V01.STATE_PROPERTY,
    JSON.stringify(state)
  );
  memberVoicesEvalWriteRunStateV01_(state);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalPreflightInternalV01_() {
  const props = PropertiesService.getScriptProperties();
  const keyPresent = !!props.getProperty(MEMBER_VOICES_EVAL_V01.GEMINI_KEY_PROPERTY);
  const manifestId = props.getProperty(MEMBER_VOICES_EVAL_V01.MANIFEST_FILE_ID_PROPERTY);

  if (!keyPresent) {
    return {
      status: 'BLOCKED',
      reason: 'Missing existing Script Property GEMINI_API_KEY.',
      geminiKeyPresent: false
    };
  }
  if (!manifestId) {
    return {
      status: 'BLOCKED',
      reason: 'Missing Script Property MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID.',
      geminiKeyPresent: true
    };
  }

  let manifest;
  try {
    manifest = memberVoicesEvalLoadManifestV01_();
    memberVoicesEvalValidateReadyManifestV01_(manifest);
  } catch (err) {
    return {
      status: 'BLOCKED',
      reason: String(err && err.message ? err.message : err),
      geminiKeyPresent: true,
      manifestFileIdPresent: true
    };
  }

  let prompt;
  let schemaText;
  try {
    prompt = memberVoicesEvalLoadPinnedTextV01_(
      MEMBER_VOICES_EVAL_V01.PROMPT_FILE_ID_PROPERTY,
      MEMBER_VOICES_EVAL_V01.PROMPT_PINNED_URL
    );
    schemaText = memberVoicesEvalLoadPinnedTextV01_(
      MEMBER_VOICES_EVAL_V01.SCHEMA_FILE_ID_PROPERTY,
      MEMBER_VOICES_EVAL_V01.SCHEMA_PINNED_URL
    );
    JSON.parse(schemaText);
  } catch (err) {
    return {
      status: 'BLOCKED',
      reason: 'Prompt/provider schema could not be loaded: ' +
        String(err && err.message ? err.message : err),
      geminiKeyPresent: true,
      manifestStatus: manifest.status
    };
  }

  return {
    status: 'READY',
    reason: 'Calibration 10 manifest, existing Gemini credential path, prompt, and provider schema are available.',
    model: MEMBER_VOICES_EVAL_V01.MODEL,
    thinkingLevel: MEMBER_VOICES_EVAL_V01.THINKING_LEVEL,
    calibrationCases: manifest.cases.length,
    manifestSha256: memberVoicesEvalSha256HexV01_(JSON.stringify(manifest)),
    promptSha256: memberVoicesEvalSha256HexV01_(prompt),
    providerSchemaSha256: memberVoicesEvalSha256HexV01_(schemaText),
    notionWrite: false,
    permanentVoiceIdAllocation: false,
    productionSqliteMutation: false
  };
}

function memberVoicesEvalValidateReadyManifestV01_(manifest) {
  if (!manifest || manifest.manifest_version !== '0.1') {
    throw new Error('Unsupported or missing Calibration manifest_version.');
  }
  if (manifest.pilot_phase !== 'CALIBRATION_10') {
    throw new Error('Manifest pilot_phase must be CALIBRATION_10.');
  }
  if (manifest.approved_delta !== 'VOICE-20261007-18') {
    throw new Error('Manifest approved_delta must be VOICE-20261007-18.');
  }
  if (manifest.status !== 'READY') {
    throw new Error(
      'Calibration manifest is not READY. Do not reselect replacement articles; recover the approved corpus first.'
    );
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 10) {
    throw new Error('READY Calibration manifest must contain exactly 10 cases.');
  }

  const articleIds = new Set();
  const caseNos = new Set();
  manifest.cases.forEach(c => {
    if (!c.article_id || !c.expected_speaker ||
        !c.article_text_drive_file_id || !c.gold_artifact_drive_file_id ||
        !c.article_sha256 || !c.gold_artifact_sha256) {
      throw new Error('Calibration case is missing required source/gold fields.');
    }
    if (articleIds.has(String(c.article_id))) {
      throw new Error('Duplicate Calibration article_id: ' + c.article_id);
    }
    if (caseNos.has(Number(c.case_no))) {
      throw new Error('Duplicate Calibration case_no: ' + c.case_no);
    }
    articleIds.add(String(c.article_id));
    caseNos.add(Number(c.case_no));
  });
}

function memberVoicesEvalRunCaseV01_(state, manifest, evalCase) {
  const articleBlob = DriveApp.getFileById(evalCase.article_text_drive_file_id).getBlob();
  const articleBytes = articleBlob.getBytes();
  const articleText = articleBlob.getDataAsString('UTF-8');
  const actualArticleSha = memberVoicesEvalSha256BytesHexV01_(articleBytes);
  if (actualArticleSha !== evalCase.article_sha256) {
    throw new Error(
      'article.txt SHA256 mismatch for Article_ID=' + evalCase.article_id
    );
  }

  const goldBlob = DriveApp.getFileById(evalCase.gold_artifact_drive_file_id).getBlob();
  const actualGoldSha = memberVoicesEvalSha256BytesHexV01_(goldBlob.getBytes());
  if (actualGoldSha !== evalCase.gold_artifact_sha256) {
    throw new Error(
      'Gold Artifact SHA256 mismatch for Article_ID=' + evalCase.article_id
    );
  }

  const prompt = memberVoicesEvalLoadPinnedTextV01_(
    MEMBER_VOICES_EVAL_V01.PROMPT_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V01.PROMPT_PINNED_URL
  );
  const schemaText = memberVoicesEvalLoadPinnedTextV01_(
    MEMBER_VOICES_EVAL_V01.SCHEMA_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V01.SCHEMA_PINNED_URL
  );
  const schema = memberVoicesEvalWireSchemaV01_(JSON.parse(schemaText));

  if (memberVoicesEvalSha256HexV01_(prompt) !== state.promptSha256 ||
      memberVoicesEvalSha256HexV01_(schemaText) !== state.providerSchemaSha256) {
    throw new Error('Prompt/provider schema changed after pass start.');
  }

  const input = {
    confirmed_speaker: evalCase.expected_speaker,
    published_at: evalCase.published_at || null,
    spoken_at: evalCase.spoken_at || null,
    relation_context: evalCase.relation_context || {},
    comparison_context: evalCase.comparison_context || [],
    article_text: articleText
  };

  const apiKey = PropertiesService.getScriptProperties().getProperty(
    MEMBER_VOICES_EVAL_V01.GEMINI_KEY_PROPERTY
  );
  const requestBody = {
    model: MEMBER_VOICES_EVAL_V01.MODEL,
    store: false,
    system_instruction: prompt,
    input: JSON.stringify(input),
    generation_config: {
      thinking_level: MEMBER_VOICES_EVAL_V01.THINKING_LEVEL
    },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: schema
    }
  };

  const interaction = memberVoicesEvalGeminiRequestV01_(apiKey, requestBody);
  const outputText = memberVoicesEvalInteractionTextV01_(interaction);
  let providerPayload;
  try {
    providerPayload = JSON.parse(outputText);
  } catch (err) {
    throw new Error(
      'Gemini structured output JSON parse failed for Article_ID=' +
      evalCase.article_id
    );
  }

  const evidence = {
    evaluation_record_version: '0.1',
    run_id: state.runId,
    pass_no: state.passNo,
    case_no: evalCase.case_no,
    article_id: String(evalCase.article_id),
    expected_speaker: evalCase.expected_speaker,
    model: state.model,
    thinking_level: state.thinkingLevel,
    extractor_version: state.extractorVersion,
    manifest_sha256: state.manifestSha256,
    prompt_sha256: state.promptSha256,
    provider_schema_sha256: state.providerSchemaSha256,
    article_sha256: actualArticleSha,
    gold_artifact_drive_file_id: evalCase.gold_artifact_drive_file_id,
    gold_artifact_sha256: actualGoldSha,
    provider_status: interaction.status || null,
    interaction_id: interaction.id || null,
    provider_payload: providerPayload,
    usage: interaction.usage || null,
    created_at: new Date().toISOString(),
    boundaries: {
      notion_write: false,
      permanent_voice_id_allocation: false,
      production_sqlite_mutation: false
    }
  };

  const runFolder = DriveApp.getFolderById(state.runFolderId);
  const name =
    String(evalCase.case_no).padStart(2, '0') + '_' +
    String(evalCase.article_id) + '_provider.json';
  const file = runFolder.createFile(
    name,
    JSON.stringify(evidence, null, 2),
    MimeType.PLAIN_TEXT
  );

  return {
    resultFileId: file.getId(),
    interactionId: interaction.id || null,
    providerStatus: interaction.status || null
  };
}

function memberVoicesEvalGeminiRequestV01_(apiKey, body) {
  let lastError = null;
  const waits = [0, 2000, 8000];

  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) Utilities.sleep(waits[attempt]);

    try {
      const response = UrlFetchApp.fetch(MEMBER_VOICES_EVAL_V01.INTERACTIONS_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': apiKey },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      const code = response.getResponseCode();
      const text = response.getContentText();
      if (code >= 200 && code < 300) {
        const json = JSON.parse(text);
        if (json.status !== 'completed') {
          throw new Error(
            'Gemini interaction status=' + String(json.status || 'unknown')
          );
        }
        return json;
      }

      const retryable = code === 429 || code >= 500;
      const err = new Error(
        'Gemini HTTP ' + code + ': ' + text.slice(0, 1200)
      );
      if (!retryable || attempt === waits.length - 1) throw err;
      lastError = err;
    } catch (err) {
      lastError = err;
      if (attempt === waits.length - 1) throw err;
    }
  }
  throw lastError || new Error('Unknown Gemini interaction failure.');
}

function memberVoicesEvalInteractionTextV01_(interaction) {
  const chunks = [];
  (interaction.steps || []).forEach(step => {
    if (step.type !== 'model_output') return;
    (step.content || []).forEach(item => {
      if (item.type === 'text' && item.text) chunks.push(String(item.text));
    });
  });
  const out = chunks.join('');
  if (!out) throw new Error('Gemini interaction returned no model text.');
  return out;
}

function memberVoicesEvalLoadManifestV01_() {
  const id = PropertiesService.getScriptProperties().getProperty(
    MEMBER_VOICES_EVAL_V01.MANIFEST_FILE_ID_PROPERTY
  );
  if (!id) throw new Error('Calibration manifest file ID Script Property is missing.');
  const text = DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8');
  return JSON.parse(text);
}

function memberVoicesEvalLoadPinnedTextV01_(fileIdProperty, pinnedUrl) {
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty(fileIdProperty);
  if (fileId) {
    return DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
  }

  const response = UrlFetchApp.fetch(pinnedUrl, { muteHttpExceptions: true });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Pinned GitHub artifact fetch failed HTTP ' + code +
      '. Optionally mirror it to Drive and set ' + fileIdProperty + '.'
    );
  }
  return response.getContentText();
}

function memberVoicesEvalWireSchemaV01_(value) {
  if (Array.isArray(value)) {
    return value.map(memberVoicesEvalWireSchemaV01_);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      if (['$schema', '$id', 'uniqueItems', 'pattern'].includes(key)) return;
      out[key] = memberVoicesEvalWireSchemaV01_(value[key]);
    });
    return out;
  }
  return value;
}

function memberVoicesEvalWriteRunStateV01_(state) {
  const folder = DriveApp.getFolderById(state.runFolderId);
  const name = 'run_state.json';
  const files = folder.getFilesByName(name);
  const body = JSON.stringify(state, null, 2);
  if (files.hasNext()) {
    files.next().setContent(body);
  } else {
    folder.createFile(name, body, MimeType.PLAIN_TEXT);
  }
}

function memberVoicesEvalEnsureFolderV01_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function memberVoicesEvalSha256HexV01_(text) {
  return memberVoicesEvalSha256BytesHexV01_(
    Utilities.newBlob(String(text), 'text/plain').getBytes()
  );
}

function memberVoicesEvalSha256BytesHexV01_(bytes) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes
  );
  return digest.map(b => {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
