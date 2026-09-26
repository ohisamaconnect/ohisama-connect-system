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
