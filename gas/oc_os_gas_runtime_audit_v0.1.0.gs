/**
 * OC-OS GAS Runtime Audit
 * v0.1.2-preview (2026-10-04)
 *
 * Purpose:
 * - Read-only runtime self-check for the currently open Apps Script project.
 * - Detect current OC-OS production runners and their required base dependencies.
 * - List installed triggers and detect missing/duplicate current triggers.
 * - Check only PRESENCE of expected Script Properties; never print secret values.
 * - Warn when known Legacy handlers are present.
 *
 * This file NEVER writes Notion, Drive, Calendar, Gmail, Sheets, or Script Properties.
 * It does not install/remove triggers.
 *
 * Limitation:
 * Apps Script runtime cannot enumerate source file names directly. This audit checks
 * callable handlers / known constants, which is the closest safe runtime inventory.
 */

const OC_GAS_RUNTIME_AUDIT_V01 = Object.freeze({
  VERSION: '0.1.2-preview',
  EXPECTED_PROPERTIES: [
    'NOTION_API_TOKEN',
    'NOTION_TOKEN',
    'NOTION_SECRET',
    'YOUTUBE_API_KEY',
    'OC_TARGET_EPISODE_KEY',
    'OC_TARGET_EPISODE_LOCK_MODE',
    'OC_TARGET_EPISODE_LOCKED_AT',
    'OC_CALENDAR_ID',
    'OC_AIR_START_TIME',
    'OC_AIR_DURATION_MIN'
  ],
  CURRENT_TRIGGER_HANDLERS: [
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128',
    'runInboxProcessorV012'
  ]
});

function reportGasRuntimeInventoryV01() {
  const modules = [
    auditGasModuleV01_(
      'INBOX Crawler',
      'CURRENT / v1.2.8 RUNNER',
      typeof runFrequentCrawlerV128 === 'function' &&
        typeof runScheduleCrawlerV128 === 'function' &&
        typeof runDailyCrawlerV128 === 'function',
      auditGasConstVersionV01_('V128_PRODUCTION')
    ),
    auditGasModuleV01_(
      'INBOX Crawler Base',
      'CURRENT DEPENDENCY / v1.2.6',
      typeof runFrequentCrawler === 'function' &&
        typeof runScheduleCrawler === 'function' &&
        typeof runDailyCrawler === 'function',
      auditGasSafeV01_(() =>
        typeof OCOS !== 'undefined' && OCOS && OCOS.HTTP_USER_AGENT
          ? String(OCOS.HTTP_USER_AGENT)
          : ''
      )
    ),
    auditGasModuleV01_(
      'INBOX Processor',
      'CURRENT / v0.1.2 READY-ONLY',
      typeof runInboxProcessorV012 === 'function' &&
        typeof previewInboxProcessorProductionV012 === 'function',
      auditGasConstVersionV01_('OCOS_PROCESSOR_READY_ONLY_012')
    ),
    auditGasModuleV01_(
      'INBOX Processor Base',
      'CURRENT DEPENDENCY / v0.1',
      typeof runInboxProcessorV01 === 'function',
      ''
    ),
    auditGasModuleV01_(
      'STUDIO Automation',
      'CURRENT',
      typeof previewStudioCandidateSeederV01 === 'function' &&
        typeof runStudioCandidateSeederV01 === 'function' &&
        typeof previewStudioPackV01 === 'function' &&
        typeof generateStudioPackV01 === 'function',
      auditGasConstVersionV01_('OC_STUDIO_V01')
    ),
    auditGasModuleV01_(
      'MESSAGES Form Sync',
      'CURRENT',
      typeof onMessageFormSubmitV01 === 'function' &&
        typeof installMessagesFormSubmitTriggerV01 === 'function',
      auditGasConstVersionV01_('OC_MESSAGES_V01')
    ),
    auditGasModuleV01_(
      'MESSAGES Gmail Preview',
      'CURRENT / PREVIEW',
      typeof previewLabeledGmailMessagesSyncV01 === 'function',
      auditGasConstVersionV01_('OC_MESSAGES_GMAIL_PREVIEW_V01')
    ),
    auditGasModuleV01_(
      'MESSAGES Gmail Sync',
      'CURRENT / MANUAL',
      typeof syncLabeledGmailMessagesV01 === 'function',
      auditGasConstVersionV01_('OC_MESSAGES_GMAIL_SYNC_V01')
    ),
    auditGasModuleV01_(
      'Weekly Episode Bootstrap',
      'CURRENT / PREVIEW+MANUAL WRITE',
      typeof previewWeeklyEpisodeBootstrapV01 === 'function' &&
        typeof createNextWeeklyEpisodeV01 === 'function',
      auditGasConstVersionV01_('OC_WEEKLY_BOOTSTRAP_V01')
    ),
    auditGasModuleV01_(
      'Target Episode Lock Manager',
      'CURRENT / PREVIEW+MANUAL LOCK',
      typeof previewTargetEpisodeLocksV01 === 'function' &&
        typeof previewPreRecordingTargetLockV01 === 'function' &&
        typeof lockPreRecordingTargetV01 === 'function' &&
        typeof previewPostRecordingTargetLockV01 === 'function' &&
        typeof lockPostRecordingTargetV01 === 'function' &&
        typeof clearTargetEpisodeLockV01 === 'function',
      auditGasConstVersionV01_('OC_TARGET_LOCK_V01')
    ),
    auditGasModuleV01_(
      'Episode Actuals Finalizer',
      'CURRENT',
      typeof actualsV01BuildPlan_ === 'function' &&
        typeof previewEpisodeActualsFinalizerV01 === 'function',
      auditGasConstVersionV01_('OC_ACTUALS_V01')
    ),
    auditGasModuleV01_(
      'Post-Recording Intake',
      'CURRENT',
      typeof postV02BuildPlan_ === 'function',
      auditGasConstVersionV01_('OC_POST_RECORDING_V02')
    ),
    auditGasModuleV01_(
      'Transcript Materializer',
      'CURRENT / PREVIEW+MANUAL WRITE',
      typeof previewTranscriptMaterializerV01 === 'function' &&
        typeof materializeFormalTranscriptDocV01 === 'function',
      auditGasConstVersionV01_('OC_TRANSCRIPT_MATERIALIZER_V01')
    ),
    auditGasModuleV01_(
      'Post-Recording Integrator',
      'CURRENT / PREVIEW+MANUAL WRITE',
      typeof previewPostRecordingIntegrationV01 === 'function' &&
        typeof syncPostRecordingIntegrationV01 === 'function',
      auditGasConstVersionV01_('OC_POST_INTEGRATOR_V01')
    ),
    auditGasModuleV01_(
      'STATEMENTS Candidate Importer',
      'CURRENT / PREVIEW',
      typeof previewStatementCandidateImportV01 === 'function' &&
        typeof importStatementCandidatesV01 === 'function',
      auditGasConstVersionV01_('OC_STATEMENT_IMPORTER_V01')
    ),
    auditGasModuleV01_(
      'Publication Context Builder',
      'CURRENT / PREVIEW',
      typeof previewPublicationContextPackV01 === 'function' &&
        typeof buildPublicationContextPackV01 === 'function',
      auditGasConstVersionV01_('OC_PUBLICATION_CONTEXT_V01')
    ),
    auditGasModuleV01_(
      'Publication Draft Importer',
      'CURRENT / PREVIEW',
      typeof previewPublicationDraftImportV01 === 'function' &&
        typeof importPublicationDraftsV01 === 'function',
      auditGasConstVersionV01_('OC_PUBLICATION_DRAFT_IMPORTER_V01')
    ),
    auditGasModuleV01_(
      'Calendar Sync',
      'CURRENT / PREVIEW',
      typeof previewEpisodeCalendarSyncV01 === 'function' &&
        typeof syncEpisodeCalendarV01 === 'function',
      auditGasConstVersionV01_('OC_EPISODE_CALENDAR_V01')
    ),
    auditGasModuleV01_(
      'Lifecycle Auditor',
      'CURRENT / READ ONLY',
      typeof auditEpisodeLifecycleV01 === 'function',
      auditGasConstVersionV01_('OC_LIFECYCLE_AUDITOR_V01')
    ),
    auditGasModuleV01_(
      'Completion Gate',
      'CURRENT / READ ONLY',
      typeof previewEpisodeCompletionGateV01 === 'function',
      auditGasConstVersionV01_('OC_COMPLETION_GATE_V01')
    ),
    auditGasModuleV01_(
      'Weekly Readiness',
      'CURRENT / READ ONLY',
      typeof reportWeeklyReadinessV01 === 'function',
      auditGasConstVersionV01_('OC_READINESS_V01')
    )
  ];

  const legacy = [
    {
      name: 'Calendar Bridge legacy',
      present: typeof syncEpisodeCalendarBridgeV01 === 'function',
      handler: 'syncEpisodeCalendarBridgeV01'
    },
    {
      name: 'PUBLICATIONS Plan Seeder legacy',
      present: typeof seedPublicationPlanV01 === 'function',
      handler: 'seedPublicationPlanV01'
    }
  ];

  const triggers = ScriptApp.getProjectTriggers().map((t, i) => ({
    index: i + 1,
    handler: t.getHandlerFunction(),
    eventType: String(t.getEventType()),
    source: String(t.getTriggerSource()),
    sourceId: auditGasSafeV01_(() => t.getTriggerSourceId() || '')
  }));

  const triggerCounts = {};
  OC_GAS_RUNTIME_AUDIT_V01.CURRENT_TRIGGER_HANDLERS.forEach(h => {
    triggerCounts[h] = triggers.filter(t => t.handler === h).length;
  });

  const props = PropertiesService.getScriptProperties().getProperties();
  const propertyPresence = {};
  OC_GAS_RUNTIME_AUDIT_V01.EXPECTED_PROPERTIES.forEach(k => {
    propertyPresence[k] = Object.prototype.hasOwnProperty.call(props, k) &&
      String(props[k] || '').length > 0;
  });

  const notionTokenPresent =
    propertyPresence.NOTION_API_TOKEN ||
    propertyPresence.NOTION_TOKEN ||
    propertyPresence.NOTION_SECRET;

  const missingCritical = [];
  [
    'INBOX Crawler',
    'INBOX Crawler Base',
    'INBOX Processor',
    'INBOX Processor Base',
    'STUDIO Automation',
    'Weekly Episode Bootstrap',
    'Target Episode Lock Manager'
  ].forEach(name => {
    const m = modules.find(x => x.name === name);
    if (!m || !m.present) missingCritical.push(name + ' missing');
  });
  if (!notionTokenPresent) {
    missingCritical.push('No Notion token property is present');
  }

  const warnings = [];

  const crawler = modules.find(x => x.name === 'INBOX Crawler');
  if (crawler && crawler.versionHint && crawler.versionHint !== '1.2.8') {
    warnings.push('Crawler current runner version is not 1.2.8: ' + crawler.versionHint);
  }

  const crawlerBase = modules.find(x => x.name === 'INBOX Crawler Base');
  if (crawlerBase && crawlerBase.versionHint && crawlerBase.versionHint.indexOf('/1.2.6') < 0) {
    warnings.push('Crawler base dependency user-agent is not 1.2.6: ' + crawlerBase.versionHint);
  }

  const processor = modules.find(x => x.name === 'INBOX Processor');
  if (processor && processor.versionHint && processor.versionHint !== '0.1.2-ready-only') {
    warnings.push('Processor current runner version is not 0.1.2-ready-only: ' + processor.versionHint);
  }

  Object.keys(triggerCounts).forEach(h => {
    if (triggerCounts[h] !== 1) {
      warnings.push('Current trigger count must be 1: ' + h + '=' + triggerCounts[h]);
    }
  });

  const legacyPresent = legacy.filter(x => x.present);
  if (legacyPresent.length) {
    warnings.push(
      'Legacy handlers are present. Verify guarded LEGACY status or remove: ' +
      legacyPresent.map(x => x.handler).join(', ')
    );
  }

  const out = {
    write: 'NONE',
    version: OC_GAS_RUNTIME_AUDIT_V01.VERSION,
    timestamp: new Date().toISOString(),
    modules: modules,
    legacy: legacy,
    triggers: triggers,
    currentTriggerCounts: triggerCounts,
    scriptPropertyPresence: propertyPresence,
    notionTokenPresent: notionTokenPresent,
    missingCritical: missingCritical,
    warnings: warnings,
    note: 'Secret values are never printed. Apps Script source file names cannot be enumerated from runtime.'
  };

  console.log('========================================');
  console.log('OC-OS GAS RUNTIME AUDIT');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function auditGasModuleV01_(name, status, present, versionHint) {
  return {
    name: name,
    status: status,
    present: !!present,
    versionHint: versionHint || ''
  };
}

function auditGasConstVersionV01_(constantName) {
  const value = auditGasGlobalValueV01_(constantName);
  return value && typeof value === 'object' && value.VERSION
    ? String(value.VERSION)
    : '';
}

function auditGasGlobalValueV01_(name) {
  // Avoid eval. Explicit known-name switch keeps the audit safe and static.
  switch (name) {
    case 'V128_PRODUCTION':
      return typeof V128_PRODUCTION !== 'undefined' ? V128_PRODUCTION : null;
    case 'OCOS_PROCESSOR_READY_ONLY_012':
      return typeof OCOS_PROCESSOR_READY_ONLY_012 !== 'undefined' ? OCOS_PROCESSOR_READY_ONLY_012 : null;
    case 'OC_STUDIO_V01':
      return typeof OC_STUDIO_V01 !== 'undefined' ? OC_STUDIO_V01 : null;
    case 'OC_MESSAGES_V01':
      return typeof OC_MESSAGES_V01 !== 'undefined' ? OC_MESSAGES_V01 : null;
    case 'OC_MESSAGES_GMAIL_PREVIEW_V01':
      return typeof OC_MESSAGES_GMAIL_PREVIEW_V01 !== 'undefined' ? OC_MESSAGES_GMAIL_PREVIEW_V01 : null;
    case 'OC_MESSAGES_GMAIL_SYNC_V01':
      return typeof OC_MESSAGES_GMAIL_SYNC_V01 !== 'undefined' ? OC_MESSAGES_GMAIL_SYNC_V01 : null;
    case 'OC_WEEKLY_BOOTSTRAP_V01':
      return typeof OC_WEEKLY_BOOTSTRAP_V01 !== 'undefined' ? OC_WEEKLY_BOOTSTRAP_V01 : null;
    case 'OC_TARGET_LOCK_V01':
      return typeof OC_TARGET_LOCK_V01 !== 'undefined' ? OC_TARGET_LOCK_V01 : null;
    case 'OC_ACTUALS_V01':
      return typeof OC_ACTUALS_V01 !== 'undefined' ? OC_ACTUALS_V01 : null;
    case 'OC_POST_RECORDING_V02':
      return typeof OC_POST_RECORDING_V02 !== 'undefined' ? OC_POST_RECORDING_V02 : null;
    case 'OC_TRANSCRIPT_MATERIALIZER_V01':
      return typeof OC_TRANSCRIPT_MATERIALIZER_V01 !== 'undefined' ? OC_TRANSCRIPT_MATERIALIZER_V01 : null;
    case 'OC_POST_INTEGRATOR_V01':
      return typeof OC_POST_INTEGRATOR_V01 !== 'undefined' ? OC_POST_INTEGRATOR_V01 : null;
    case 'OC_STATEMENT_IMPORTER_V01':
      return typeof OC_STATEMENT_IMPORTER_V01 !== 'undefined' ? OC_STATEMENT_IMPORTER_V01 : null;
    case 'OC_PUBLICATION_CONTEXT_V01':
      return typeof OC_PUBLICATION_CONTEXT_V01 !== 'undefined' ? OC_PUBLICATION_CONTEXT_V01 : null;
    case 'OC_PUBLICATION_DRAFT_IMPORTER_V01':
      return typeof OC_PUBLICATION_DRAFT_IMPORTER_V01 !== 'undefined' ? OC_PUBLICATION_DRAFT_IMPORTER_V01 : null;
    case 'OC_EPISODE_CALENDAR_V01':
      return typeof OC_EPISODE_CALENDAR_V01 !== 'undefined' ? OC_EPISODE_CALENDAR_V01 : null;
    case 'OC_LIFECYCLE_AUDITOR_V01':
      return typeof OC_LIFECYCLE_AUDITOR_V01 !== 'undefined' ? OC_LIFECYCLE_AUDITOR_V01 : null;
    case 'OC_COMPLETION_GATE_V01':
      return typeof OC_COMPLETION_GATE_V01 !== 'undefined' ? OC_COMPLETION_GATE_V01 : null;
    case 'OC_READINESS_V01':
      return typeof OC_READINESS_V01 !== 'undefined' ? OC_READINESS_V01 : null;
    default:
      return null;
  }
}

function auditGasSafeV01_(fn) {
  try {
    return fn();
  } catch (e) {
    return '';
  }
}
