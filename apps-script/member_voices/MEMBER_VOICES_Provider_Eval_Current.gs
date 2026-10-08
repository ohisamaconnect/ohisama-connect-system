/**
 * MEMBER VOICES Production Provider Evaluation Runner v0.2
 *
 * Evaluation-only Apps Script runner for the recovered original Calibration 10.
 *
 * Safety:
 * - reuses existing Script Property GEMINI_API_KEY
 * - manifest is commit-pinned; optional Drive/URL override is explicit
 * - recovered gold bundle is commit-pinned AND SHA256 checked
 * - exact original 10 Article_IDs only; no replacement sampling
 * - one invocation processes at most one article
 * - local semantic invariants are checked before evidence is accepted
 * - no Notion writes
 * - no production SQLite writes
 * - no permanent Voice_ID allocation
 * - no cross-provider fallback
 * - outputs evaluation evidence to Drive only
 */

const MEMBER_VOICES_EVAL_V02 = Object.freeze({
  VERSION: '0.2.0',
  MODEL: 'gemini-3.8-flash',
  THINKING_LEVEL: 'medium',
  INTERACTIONS_URL: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  GEMINI_KEY_PROPERTY: 'GEMINI_API_KEY',
  MANIFEST_FILE_ID_PROPERTY: 'MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID',
  MANIFEST_URL_PROPERTY: 'MEMBER_VOICES_CALIBRATION_MANIFEST_URL',
  PROMPT_FILE_ID_PROPERTY: 'MEMBER_VOICES_EVAL_PROMPT_FILE_ID',
  SCHEMA_FILE_ID_PROPERTY: 'MEMBER_VOICES_EVAL_PROVIDER_SCHEMA_FILE_ID',
  STATE_PROPERTY: 'MEMBER_VOICES_EVAL_STATE_V02',
  MEMBER_VOICES_DRIVE_FOLDER_ID: '10OOVq7c5PelCb-Yinr7xy_csYTic60VE',
  MANIFEST_PINNED_URL:
    'https://raw.githubusercontent.com/ohisamaconnect/ohisama-connect-system/' +
    'a1e60999da8342ee7aa00569be304d5d78842708/' +
    'member_voices/eval/CALIBRATION_10_MANIFEST.ready.json',
  PROMPT_PINNED_URL:
    'https://raw.githubusercontent.com/ohisamaconnect/ohisama-connect-system/' +
    'a9cea5d48af7bee87b8b779f07716c6bebeec8a1/' +
    'member_voices/prompts/MEMBER_VOICES_SEMANTIC_PROMPT_v0.1.md',
  SCHEMA_PINNED_URL:
    'https://raw.githubusercontent.com/ohisamaconnect/ohisama-connect-system/' +
    '0b0b69a8cbcf790a1e184044a40947c20855cb93/' +
    'member_voices/schemas/member_voices_provider_payload_v0_1.schema.json',
  EXPECTED_ARTICLE_IDS: Object.freeze([
    '25481','26676','33683','35133','65922',
    '67706','50967','55209','25939','44109'
  ])
});

function memberVoicesEvalPreflightV02() {
  const report = memberVoicesEvalPreflightInternalV02_();
  console.log(JSON.stringify(report, null, 2));
  return report;
}
function memberVoicesEvalStartPass1V02() { return memberVoicesEvalStartPassV02_(1); }
function memberVoicesEvalStartPass2V02() { return memberVoicesEvalStartPassV02_(2); }
function memberVoicesEvalStartPass3V02() { return memberVoicesEvalStartPassV02_(3); }
function memberVoicesEvalStatusV02() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    MEMBER_VOICES_EVAL_V02.STATE_PROPERTY
  );
  const state = raw ? JSON.parse(raw) : { status: 'NOT_STARTED' };
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalRunNextV02() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(MEMBER_VOICES_EVAL_V02.STATE_PROPERTY);
  if (!raw) throw new Error('Evaluation pass not started. Run a V02 StartPass function first.');

  const state = JSON.parse(raw);
  if (state.status !== 'RUNNING') {
    console.log(JSON.stringify(state, null, 2));
    return state;
  }

  const loaded = memberVoicesEvalLoadManifestV02_();
  const manifest = loaded.manifest;
  memberVoicesEvalValidateReadyManifestV02_(manifest);
  const manifestSha = memberVoicesEvalSha256HexV02_(loaded.text);
  if (manifestSha !== state.manifestSha256) {
    throw new Error('Calibration manifest changed after pass start.');
  }

  const gold = memberVoicesEvalLoadGoldBundleV02_(manifest);
  if (gold.sha256 !== state.goldBundleSha256) {
    throw new Error('Recovered gold bundle changed after pass start.');
  }

  const cases = manifest.cases.slice().sort((a,b) => a.case_no - b.case_no);
  if (state.nextCaseIndex >= cases.length) {
    return memberVoicesEvalCompleteStateV02_(state);
  }

  const evalCase = cases[state.nextCaseIndex];
  const goldCase = memberVoicesEvalGoldCaseV02_(gold.bundle, evalCase);
  const result = memberVoicesEvalRunCaseV02_(state, manifest, evalCase, goldCase);

  state.completedCases = state.completedCases || [];
  state.completedCases.push({
    caseNo: evalCase.case_no,
    articleId: evalCase.article_id,
    resultFileId: result.resultFileId,
    interactionId: result.interactionId,
    providerStatus: result.providerStatus,
    runtimeInvariantsPass: result.runtimeInvariantsPass,
    acceptedVoiceCount: result.acceptedVoiceCount
  });
  state.nextCaseIndex += 1;
  state.lastUpdatedAt = new Date().toISOString();

  if (state.nextCaseIndex >= cases.length) {
    state.status = 'COMPLETED';
    state.completedAt = new Date().toISOString();
  }
  props.setProperty(MEMBER_VOICES_EVAL_V02.STATE_PROPERTY, JSON.stringify(state));
  memberVoicesEvalWriteRunStateV02_(state);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalStartPassV02_(passNo) {
  if (![1,2,3].includes(passNo)) throw new Error('passNo must be 1, 2, or 3.');

  const preflight = memberVoicesEvalPreflightInternalV02_();
  if (preflight.status !== 'READY') {
    console.log(JSON.stringify(preflight, null, 2));
    throw new Error('Evaluation preflight is not READY: ' + preflight.reason);
  }

  const loaded = memberVoicesEvalLoadManifestV02_();
  const manifest = loaded.manifest;
  const gold = memberVoicesEvalLoadGoldBundleV02_(manifest);
  const prompt = memberVoicesEvalLoadPinnedTextV02_(
    MEMBER_VOICES_EVAL_V02.PROMPT_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V02.PROMPT_PINNED_URL
  );
  const schemaText = memberVoicesEvalLoadPinnedTextV02_(
    MEMBER_VOICES_EVAL_V02.SCHEMA_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V02.SCHEMA_PINNED_URL
  );
  JSON.parse(schemaText);

  const manifestSha = memberVoicesEvalSha256HexV02_(loaded.text);
  const promptSha = memberVoicesEvalSha256HexV02_(prompt);
  const schemaSha = memberVoicesEvalSha256HexV02_(schemaText);
  const extractorVersion = [
    'mv-semantic','p0.1','ps0.1','google-gemini',
    MEMBER_VOICES_EVAL_V02.MODEL,
    MEMBER_VOICES_EVAL_V02.THINKING_LEVEL,
    'ph'+promptSha.slice(0,12),
    'sh'+schemaSha.slice(0,12)
  ].join('-');

  const outputRoot = memberVoicesEvalEnsureFolderV02_(
    DriveApp.getFolderById(MEMBER_VOICES_EVAL_V02.MEMBER_VOICES_DRIVE_FOLDER_ID),
    'EVAL_RUNS'
  );
  const runId =
    'CAL10-P'+passNo+'-'+
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  const runFolder = outputRoot.createFolder(runId);

  const state = {
    runnerVersion: MEMBER_VOICES_EVAL_V02.VERSION,
    status: 'RUNNING',
    runId,
    passNo,
    model: MEMBER_VOICES_EVAL_V02.MODEL,
    thinkingLevel: MEMBER_VOICES_EVAL_V02.THINKING_LEVEL,
    extractorVersion,
    manifestSource: loaded.source,
    manifestSha256: manifestSha,
    goldBundleSha256: gold.sha256,
    promptSha256: promptSha,
    providerSchemaSha256: schemaSha,
    runFolderId: runFolder.getId(),
    nextCaseIndex: 0,
    completedCases: [],
    startedAt: new Date().toISOString(),
    evaluationGoldScope: 'RECOVERED_APPROVED_CORE',
    writeBoundary: 'DRIVE_EVAL_EVIDENCE_ONLY',
    notionWrite: false,
    permanentVoiceIdAllocation: false,
    productionSqliteMutation: false
  };
  PropertiesService.getScriptProperties().setProperty(
    MEMBER_VOICES_EVAL_V02.STATE_PROPERTY, JSON.stringify(state)
  );
  memberVoicesEvalWriteRunStateV02_(state);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

function memberVoicesEvalPreflightInternalV02_() {
  const props = PropertiesService.getScriptProperties();
  const keyPresent = !!props.getProperty(MEMBER_VOICES_EVAL_V02.GEMINI_KEY_PROPERTY);
  if (!keyPresent) {
    return { status:'BLOCKED', reason:'Missing existing Script Property GEMINI_API_KEY.', geminiKeyPresent:false };
  }

  try {
    const loaded = memberVoicesEvalLoadManifestV02_();
    memberVoicesEvalValidateReadyManifestV02_(loaded.manifest);
    const gold = memberVoicesEvalLoadGoldBundleV02_(loaded.manifest);
    const prompt = memberVoicesEvalLoadPinnedTextV02_(
      MEMBER_VOICES_EVAL_V02.PROMPT_FILE_ID_PROPERTY,
      MEMBER_VOICES_EVAL_V02.PROMPT_PINNED_URL
    );
    const schemaText = memberVoicesEvalLoadPinnedTextV02_(
      MEMBER_VOICES_EVAL_V02.SCHEMA_FILE_ID_PROPERTY,
      MEMBER_VOICES_EVAL_V02.SCHEMA_PINNED_URL
    );
    JSON.parse(schemaText);

    return {
      status:'READY',
      reason:'Exact recovered Calibration 10, source hashes, gold bundle hash, prompt, schema, and Gemini credential path are available.',
      runnerVersion:MEMBER_VOICES_EVAL_V02.VERSION,
      manifestSource:loaded.source,
      manifestSha256:memberVoicesEvalSha256HexV02_(loaded.text),
      goldBundleSha256:gold.sha256,
      model:MEMBER_VOICES_EVAL_V02.MODEL,
      thinkingLevel:MEMBER_VOICES_EVAL_V02.THINKING_LEVEL,
      calibrationCases:loaded.manifest.cases.length,
      articleIds:loaded.manifest.cases.map(c => String(c.article_id)),
      recoveredGoldFullArtifactV11:false,
      scoringScope:loaded.manifest.gold_bundle.evaluation_scope,
      notionWrite:false,
      permanentVoiceIdAllocation:false,
      productionSqliteMutation:false
    };
  } catch (err) {
    return {
      status:'BLOCKED',
      reason:String(err && err.message ? err.message : err),
      geminiKeyPresent:true
    };
  }
}

function memberVoicesEvalValidateReadyManifestV02_(manifest) {
  if (!manifest || manifest.manifest_version !== '0.2') {
    throw new Error('Calibration manifest_version must be 0.2.');
  }
  if (manifest.pilot_phase !== 'CALIBRATION_10') {
    throw new Error('Manifest pilot_phase must be CALIBRATION_10.');
  }
  if (manifest.approved_delta !== 'VOICE-20261007-18') {
    throw new Error('Manifest approved_delta mismatch.');
  }
  if (manifest.status !== 'READY') throw new Error('Calibration manifest is not READY.');
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 10) {
    throw new Error('READY Calibration manifest must contain exactly 10 cases.');
  }
  const expected = MEMBER_VOICES_EVAL_V02.EXPECTED_ARTICLE_IDS.slice().sort().join(',');
  const actual = manifest.cases.map(c => String(c.article_id)).slice().sort().join(',');
  if (actual !== expected) throw new Error('Calibration Article_ID set differs from the recovered approved 10.');

  const articleIds = new Set();
  const caseNos = new Set();
  manifest.cases.forEach(c => {
    if (!c.article_id || !c.expected_speaker || !c.local_dir ||
        !c.article_text_drive_file_id || !c.metadata_drive_file_id ||
        !/^[0-9a-f]{64}$/.test(String(c.article_sha256 || '')) ||
        c.gold_case_key !== c.article_id ||
        c.gold_status !== 'RECOVERED_APPROVED_CORE' ||
        !Number.isInteger(c.expected_accepted_voice_count) ||
        typeof c.boundary_review_expected !== 'boolean') {
      throw new Error('Calibration case missing or invalid recovered source/gold fields: '+c.article_id);
    }
    if (articleIds.has(String(c.article_id))) throw new Error('Duplicate Article_ID: '+c.article_id);
    if (caseNos.has(Number(c.case_no))) throw new Error('Duplicate case_no: '+c.case_no);
    articleIds.add(String(c.article_id));
    caseNos.add(Number(c.case_no));
  });

  const gb = manifest.gold_bundle || {};
  if (gb.gold_type !== 'RECOVERED_APPROVED_CORE' ||
      gb.full_artifact_v1_1_recovered !== false ||
      !gb.raw_url || !/^[0-9a-f]{64}$/.test(String(gb.sha256 || ''))) {
    throw new Error('Recovered gold bundle declaration is invalid.');
  }
}

function memberVoicesEvalLoadGoldBundleV02_(manifest) {
  const gb = manifest.gold_bundle;
  const response = UrlFetchApp.fetch(gb.raw_url, { muteHttpExceptions:true });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Recovered gold fetch HTTP '+code);
  const bytes = response.getBlob().getBytes();
  const actualSha = memberVoicesEvalSha256BytesHexV02_(bytes);
  if (actualSha !== gb.sha256) {
    throw new Error('Recovered gold SHA256 mismatch: expected='+gb.sha256+' actual='+actualSha);
  }
  const text = response.getContentText('UTF-8');
  const bundle = JSON.parse(text);
  if (bundle.recovered_gold_version !== '0.1' ||
      bundle.pilot_phase !== 'CALIBRATION_10' ||
      bundle.approved_delta !== 'VOICE-20261007-18' ||
      bundle.full_artifact_v1_1_recovered !== false ||
      !Array.isArray(bundle.cases) || bundle.cases.length !== 10) {
    throw new Error('Recovered gold bundle identity/shape mismatch.');
  }
  manifest.cases.forEach(c => memberVoicesEvalGoldCaseV02_(bundle, c));
  return { bundle, sha256:actualSha };
}

function memberVoicesEvalGoldCaseV02_(bundle, evalCase) {
  const goldCase = bundle.cases.find(x => String(x.article_id) === String(evalCase.gold_case_key));
  if (!goldCase) throw new Error('Gold case missing for Article_ID='+evalCase.article_id);
  if (goldCase.author !== evalCase.expected_speaker ||
      Number(goldCase.expected_voice_count) !== Number(evalCase.expected_accepted_voice_count) ||
      goldCase.article_text_sha256 !== evalCase.article_sha256) {
    throw new Error('Recovered gold case mismatch for Article_ID='+evalCase.article_id);
  }
  return goldCase;
}

function memberVoicesEvalRunCaseV02_(state, manifest, evalCase, goldCase) {
  const articleBlob = DriveApp.getFileById(evalCase.article_text_drive_file_id).getBlob();
  const articleBytes = articleBlob.getBytes();
  const articleText = articleBlob.getDataAsString('UTF-8');
  const actualArticleSha = memberVoicesEvalSha256BytesHexV02_(articleBytes);
  if (actualArticleSha !== evalCase.article_sha256) {
    throw new Error('article.txt SHA256 mismatch for Article_ID='+evalCase.article_id);
  }

  const prompt = memberVoicesEvalLoadPinnedTextV02_(
    MEMBER_VOICES_EVAL_V02.PROMPT_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V02.PROMPT_PINNED_URL
  );
  const schemaText = memberVoicesEvalLoadPinnedTextV02_(
    MEMBER_VOICES_EVAL_V02.SCHEMA_FILE_ID_PROPERTY,
    MEMBER_VOICES_EVAL_V02.SCHEMA_PINNED_URL
  );
  if (memberVoicesEvalSha256HexV02_(prompt) !== state.promptSha256 ||
      memberVoicesEvalSha256HexV02_(schemaText) !== state.providerSchemaSha256) {
    throw new Error('Prompt/provider schema changed after pass start.');
  }

  const input = {
    confirmed_speaker:evalCase.expected_speaker,
    published_at:evalCase.published_at || null,
    spoken_at:evalCase.spoken_at || null,
    relation_context:evalCase.relation_context || {},
    comparison_context:evalCase.comparison_context || [],
    article_text:articleText
  };
  const requestBody = {
    model:MEMBER_VOICES_EVAL_V02.MODEL,
    store:false,
    system_instruction:prompt,
    input:JSON.stringify(input),
    generation_config:{ thinking_level:MEMBER_VOICES_EVAL_V02.THINKING_LEVEL },
    response_format:{
      type:'text',
      mime_type:'application/json',
      schema:memberVoicesEvalWireSchemaV02_(JSON.parse(schemaText))
    }
  };

  const apiKey = PropertiesService.getScriptProperties().getProperty(
    MEMBER_VOICES_EVAL_V02.GEMINI_KEY_PROPERTY
  );
  const interaction = memberVoicesEvalGeminiRequestV02_(apiKey, requestBody);
  const outputText = memberVoicesEvalInteractionTextV02_(interaction);
  let providerPayload;
  try { providerPayload = JSON.parse(outputText); }
  catch (err) { throw new Error('Gemini structured JSON parse failed for Article_ID='+evalCase.article_id); }

  const invariant = memberVoicesEvalValidateProviderPayloadV02_(
    providerPayload, articleText, evalCase.relation_context || {}
  );
  const acceptedVoiceCount = (providerPayload.voice_candidates || [])
    .filter(x => x.candidate_decision === 'ACCEPT').length;

  const evidence = {
    evaluation_record_version:'0.2',
    run_id:state.runId,
    pass_no:state.passNo,
    case_no:evalCase.case_no,
    article_id:String(evalCase.article_id),
    expected_speaker:evalCase.expected_speaker,
    model:state.model,
    thinking_level:state.thinkingLevel,
    extractor_version:state.extractorVersion,
    manifest_sha256:state.manifestSha256,
    gold_bundle_url:manifest.gold_bundle.raw_url,
    gold_bundle_sha256:state.goldBundleSha256,
    gold_case_key:evalCase.gold_case_key,
    gold_expected_accepted_voice_count:evalCase.expected_accepted_voice_count,
    gold_boundary_review_expected:evalCase.boundary_review_expected,
    gold_semantic_core:goldCase.voices || [],
    article_sha256:actualArticleSha,
    provider_status:interaction.status || null,
    interaction_id:interaction.id || null,
    provider_payload:providerPayload,
    runtime_invariants_pass:invariant.errors.length === 0,
    runtime_invariant_errors:invariant.errors,
    runtime_metrics:invariant.metrics,
    accepted_voice_count:acceptedVoiceCount,
    exact_gold_voice_count:acceptedVoiceCount === evalCase.expected_accepted_voice_count,
    zero_voice_false_positive:
      evalCase.expected_accepted_voice_count === 0 && acceptedVoiceCount > 0,
    semantic_core_requires_human_audit:true,
    usage:interaction.usage || null,
    created_at:new Date().toISOString(),
    boundaries:{
      recovered_gold_full_artifact_v1_1:false,
      notion_write:false,
      permanent_voice_id_allocation:false,
      production_sqlite_mutation:false
    }
  };

  const runFolder = DriveApp.getFolderById(state.runFolderId);
  const name=String(evalCase.case_no).padStart(2,'0')+'_'+String(evalCase.article_id)+'_provider.json';
  const file=runFolder.createFile(name, JSON.stringify(evidence,null,2), MimeType.PLAIN_TEXT);
  return {
    resultFileId:file.getId(),
    interactionId:interaction.id || null,
    providerStatus:invariant.errors.length ? 'COMPLETED_SEMANTIC_REVIEW' : (interaction.status || null),
    runtimeInvariantsPass:invariant.errors.length === 0,
    acceptedVoiceCount
  };
}

function memberVoicesEvalValidateProviderPayloadV02_(payload, articleText, relationContext) {
  const errors=[], metrics={ vague_theme_auto_thread_count:0, false_explicit_change_count:0 };
  const arrays=['meaning_units','voice_candidates','thread_candidates','comparison_candidates','warnings'];
  arrays.forEach(k => { if (!Array.isArray(payload[k])) errors.push(k+' must be an array'); });
  if (errors.length) return {errors,metrics};

  const muRefs=new Set(), vcRefs=new Set(), threadRefs=new Set();
  const vague=new Set(['夢','成長','努力','感情','活動','頑張る','がんばる']);
  const checkAnchor=(anchor,label) => {
    if (anchor == null) return;
    (anchor.evidence || []).forEach(e => {
      if (!articleText.includes(String(e))) errors.push(label+' anchor evidence is not exact ARTICLE_TEXT');
    });
    if (anchor.status === 'PROVISIONAL' && anchor.object_id != null) {
      errors.push(label+' PROVISIONAL anchor contains object_id');
    }
    if (anchor.status === 'CANONICAL') {
      const allowed=(relationContext || {})[String(anchor.object_type || '')] || {};
      if (!anchor.object_id || !Object.prototype.hasOwnProperty.call(allowed, anchor.object_id)) {
        errors.push(label+' CANONICAL anchor ID is outside RELATION_CONTEXT');
      }
    }
  };

  payload.meaning_units.forEach(mu => {
    const ref=String(mu.unit_ref || '');
    if (!/^U[1-9][0-9]*$/.test(ref) || muRefs.has(ref)) errors.push('invalid/duplicate unit_ref '+ref);
    muRefs.add(ref);
    if (!mu.evidence_excerpt || !articleText.includes(String(mu.evidence_excerpt))) {
      errors.push(ref+' evidence_excerpt is not exact ARTICLE_TEXT');
    }
    checkAnchor(mu.candidate_primary_anchor, ref);
  });

  const relationFields={
    related_members:'MEMBER',related_songs:'SONG',related_lives:'LIVE',
    related_events:'EVENT',related_releases:'RELEASE'
  };
  payload.voice_candidates.forEach(vc => {
    const ref=String(vc.candidate_ref || '');
    if (!/^V[1-9][0-9]*$/.test(ref) || vcRefs.has(ref)) errors.push('invalid/duplicate candidate_ref '+ref);
    vcRefs.add(ref);
    (vc.meaning_unit_refs || []).forEach(u => {
      if (!muRefs.has(String(u))) errors.push(ref+' references unknown Meaning Unit '+u);
    });
    checkAnchor(vc.primary_anchor, ref);
    Object.keys(relationFields).forEach(field => {
      const allowed=(relationContext || {})[relationFields[field]] || {};
      (vc[field] || []).forEach(id => {
        if (!Object.prototype.hasOwnProperty.call(allowed,id)) {
          errors.push(ref+' '+field+' ID is outside RELATION_CONTEXT: '+id);
        }
      });
    });
  });

  payload.thread_candidates.forEach(t => {
    const ref=String(t.thread_ref || '');
    if (!/^T[1-9][0-9]*$/.test(ref) || threadRefs.has(ref)) errors.push('invalid/duplicate thread_ref '+ref);
    threadRefs.add(ref);
    (t.voice_candidate_refs || []).forEach(v => {
      if (!vcRefs.has(String(v))) errors.push(ref+' references unknown VOICE '+v);
    });
    checkAnchor(t.anchor, ref);
    if (t.thread_type === 'THEME' && vague.has(String(t.normalized_primary_topic || '').trim())) {
      metrics.vague_theme_auto_thread_count += 1;
      errors.push(ref+' vague THEME thread is prohibited');
    }
  });

  payload.comparison_candidates.forEach(c => {
    if (!vcRefs.has(String(c.prior_candidate_ref || '')) ||
        !vcRefs.has(String(c.current_candidate_ref || ''))) {
      errors.push(String(c.comparison_ref || 'comparison')+' references unknown VOICE');
    }
    if (c.thread_ref != null && !threadRefs.has(String(c.thread_ref))) {
      errors.push(String(c.comparison_ref || 'comparison')+' references unknown thread');
    }
    if (c.relation_to_prior === 'EXPLICIT_CHANGE' && c.explicit_change_claimed !== true) {
      errors.push(String(c.comparison_ref || 'comparison')+' EXPLICIT_CHANGE lacks explicit claim');
    }
    if (c.explicit_change_claimed === true && c.relation_to_prior !== 'EXPLICIT_CHANGE') {
      errors.push(String(c.comparison_ref || 'comparison')+' explicit claim used outside EXPLICIT_CHANGE');
    }
    (c.evidence || []).forEach(e => {
      if (!articleText.includes(String(e))) errors.push(String(c.comparison_ref || 'comparison')+' evidence is not exact ARTICLE_TEXT');
    });
    if (c.relation_to_prior === 'EXPLICIT_CHANGE') metrics.false_explicit_change_count += 1;
  });
  return {errors,metrics};
}

function memberVoicesEvalGeminiRequestV02_(apiKey, body) {
  let lastError=null;
  const waits=[0,2000,8000];
  for (let attempt=0; attempt<waits.length; attempt++) {
    if (waits[attempt]) Utilities.sleep(waits[attempt]);
    try {
      const response=UrlFetchApp.fetch(MEMBER_VOICES_EVAL_V02.INTERACTIONS_URL,{
        method:'post',contentType:'application/json',
        headers:{'x-goog-api-key':apiKey},
        payload:JSON.stringify(body),muteHttpExceptions:true
      });
      const code=response.getResponseCode(), text=response.getContentText();
      if (code>=200 && code<300) {
        const json=JSON.parse(text);
        if (json.status !== 'completed') throw new Error('Gemini interaction status='+String(json.status || 'unknown'));
        return json;
      }
      const retryable=code===429 || code>=500;
      const err=new Error('Gemini HTTP '+code+': '+text.slice(0,1200));
      if (!retryable || attempt===waits.length-1) throw err;
      lastError=err;
    } catch(err) {
      lastError=err;
      if (attempt===waits.length-1) throw err;
    }
  }
  throw lastError || new Error('Unknown Gemini interaction failure.');
}

function memberVoicesEvalInteractionTextV02_(interaction) {
  const chunks=[];
  (interaction.steps || []).forEach(step => {
    if (step.type !== 'model_output') return;
    (step.content || []).forEach(item => {
      if (item.type === 'text' && item.text) chunks.push(String(item.text));
    });
  });
  const out=chunks.join('');
  if (!out) throw new Error('Gemini interaction returned no model text.');
  return out;
}

function memberVoicesEvalLoadManifestV02_() {
  const props=PropertiesService.getScriptProperties();
  const fileId=props.getProperty(MEMBER_VOICES_EVAL_V02.MANIFEST_FILE_ID_PROPERTY);
  if (fileId) {
    const text=DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
    return {manifest:JSON.parse(text),text,source:'DRIVE:'+fileId};
  }
  const override=props.getProperty(MEMBER_VOICES_EVAL_V02.MANIFEST_URL_PROPERTY);
  const url=override || MEMBER_VOICES_EVAL_V02.MANIFEST_PINNED_URL;
  const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
  const code=response.getResponseCode();
  if (code<200 || code>=300) throw new Error('Calibration manifest fetch HTTP '+code);
  const text=response.getContentText('UTF-8');
  return {manifest:JSON.parse(text),text,source:override ? 'URL_OVERRIDE' : 'PINNED_GITHUB'};
}

function memberVoicesEvalLoadPinnedTextV02_(fileIdProperty,pinnedUrl) {
  const fileId=PropertiesService.getScriptProperties().getProperty(fileIdProperty);
  if (fileId) return DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
  const response=UrlFetchApp.fetch(pinnedUrl,{muteHttpExceptions:true});
  const code=response.getResponseCode();
  if (code<200 || code>=300) throw new Error('Pinned artifact fetch HTTP '+code);
  return response.getContentText('UTF-8');
}

function memberVoicesEvalWireSchemaV02_(value) {
  if (Array.isArray(value)) return value.map(memberVoicesEvalWireSchemaV02_);
  if (value && typeof value === 'object') {
    const out={};
    Object.keys(value).forEach(key => {
      if (['$schema','$id','uniqueItems','pattern'].includes(key)) return;
      out[key]=memberVoicesEvalWireSchemaV02_(value[key]);
    });
    return out;
  }
  return value;
}
function memberVoicesEvalCompleteStateV02_(state) {
  state.status='COMPLETED';
  state.completedAt=new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    MEMBER_VOICES_EVAL_V02.STATE_PROPERTY,JSON.stringify(state)
  );
  memberVoicesEvalWriteRunStateV02_(state);
  return state;
}
function memberVoicesEvalWriteRunStateV02_(state) {
  const folder=DriveApp.getFolderById(state.runFolderId);
  const files=folder.getFilesByName('run_state.json');
  const body=JSON.stringify(state,null,2);
  if (files.hasNext()) files.next().setContent(body);
  else folder.createFile('run_state.json',body,MimeType.PLAIN_TEXT);
}
function memberVoicesEvalEnsureFolderV02_(parent,name) {
  const folders=parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
function memberVoicesEvalSha256HexV02_(text) {
  return memberVoicesEvalSha256BytesHexV02_(
    Utilities.newBlob(String(text),'text/plain').getBytes()
  );
}
function memberVoicesEvalSha256BytesHexV02_(bytes) {
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes);
  return digest.map(b => {
    const n=b<0 ? b+256 : b;
    return ('0'+n.toString(16)).slice(-2);
  }).join('');
}
