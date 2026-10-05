param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Diagnostics_Current.gs'

$sources = @(
  @{ Name = 'Episode Lifecycle Auditor'; Path = (Join-Path $gasDir 'oc_os_episode_lifecycle_auditor_v0.1.0.gs') },
  @{ Name = 'Episode Completion Gate'; Path = (Join-Path $gasDir 'oc_os_episode_completion_gate_v0.1.0.gs') },
  @{ Name = 'Weekly Readiness Report'; Path = (Join-Path $gasDir 'oc_os_weekly_readiness_report_v0.1.0.gs') }
)
foreach ($src in $sources) {
  if (-not (Test-Path $src.Path)) { throw "Missing source: $($src.Path)" }
}
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir | Out-Null }

$header = @'
/**
 * OC-OS Diagnostics Current - SUPPORT / READ ONLY Runtime
 *
 * This family intentionally replaces the old runtime audit assumptions that
 * treated V128 / V012 handlers as Current.
 *
 * Safety:
 * - Diagnostics never change Notion, Drive, Calendar, Gmail, Sheets,
 *   Script Properties, or Production_Status.
 * - Missing signals never block Wednesday recording.
 */
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)
foreach ($src in $sources) {
  $body = [System.IO.File]::ReadAllText($src.Path)
  $parts.Add("`r`n// ============================================================`r`n// SUPPORT SOURCE: $($src.Name)`r`n// ============================================================`r`n")
  $parts.Add($body)
}

$currentAudit = @'

// ============================================================
// CURRENT RUNTIME AUDIT
// ============================================================

const OCOS_RUNTIME_AUDIT_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-05.1',
  EXPECTED_PROPERTIES: [
    'NOTION_API_TOKEN', 'NOTION_TOKEN', 'NOTION_SECRET', 'YOUTUBE_API_KEY',
    'OC_TARGET_EPISODE_KEY', 'OC_TARGET_EPISODE_LOCK_MODE',
    'OC_TARGET_EPISODE_LOCKED_AT', 'OC_CALENDAR_ID',
    'OC_AIR_START_TIME', 'OC_AIR_DURATION_MIN'
  ],
  LEGACY_TRIGGER_HANDLERS: [
    'runFrequentCrawler', 'runScheduleCrawler', 'runDailyCrawler',
    'runFrequentCrawlerV127', 'runScheduleCrawlerV127', 'runDailyCrawlerV127',
    'runFrequentCrawlerV128', 'runScheduleCrawlerV128', 'runDailyCrawlerV128',
    'runInboxProcessorV01', 'runInboxProcessorV011', 'runInboxProcessorV012',
    'syncEpisodeCalendarBridgeV01'
  ],
  CURRENT_CORE_TRIGGER_HANDLERS: [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent',
    'runInboxProcessorCurrent',
    'onMessageFormSubmitV01',
    'runHhaMemberRosterWatchCurrent',
    'runHhaMemberProfileWatchCurrent',
    'runHhaMemberCanonicalAuditCurrent'
  ]
});

function reportGasRuntimeInventoryCurrent() {
  const modules = [
    runtimeAuditCurrentModule_('Crawler Current',
      typeof runFrequentCrawlerCurrent === 'function' &&
      typeof runScheduleCrawlerCurrent === 'function' &&
      typeof runDailyCrawlerCurrent === 'function' &&
      typeof previewCrawlerCurrentDecisionGate === 'function'),
    runtimeAuditCurrentModule_('Processor Current',
      typeof previewInboxProcessorCurrent === 'function' &&
      typeof runInboxProcessorCurrent === 'function'),
    runtimeAuditCurrentModule_('Suggestion Current / Pilot',
      typeof previewSuggestionCurrentProductionGate === 'function' &&
      typeof previewAndStageSuggestionCurrent === 'function' &&
      typeof commitSuggestionCurrentStage === 'function'),
    runtimeAuditCurrentModule_('Weekly Current',
      typeof previewWeeklyEpisodeBootstrapV01 === 'function' &&
      typeof previewTargetEpisodeLocksV01 === 'function' &&
      typeof previewStudioCandidateSeederV01 === 'function' &&
      typeof previewWeeklyReviewQueueResolverV01 === 'function'),
    runtimeAuditCurrentModule_('Post Recording Current',
      typeof previewPostRecordingIntegrationV01 === 'function' &&
      typeof materializeFormalTranscriptDocV01 === 'function'),
    runtimeAuditCurrentModule_('Messages Current',
      typeof onMessageFormSubmitV01 === 'function' &&
      typeof syncLabeledGmailMessagesV01 === 'function'),
    runtimeAuditCurrentModule_('Calendar Current / Pilot',
      typeof previewCalendarCurrent === 'function' &&
      typeof syncCalendarCurrent === 'function'),
    runtimeAuditCurrentModule_('Archive Publishing Current / Pilot',
      typeof previewStatementArchiveCurrent === 'function' &&
      typeof previewPublicationContextCurrent === 'function' &&
      typeof previewPublicationDraftsCurrent === 'function'),
    runtimeAuditCurrentModule_('HHA Member Maintenance Current / Pilot',
      typeof previewHhaMemberMaintenanceCurrent === 'function' &&
      typeof previewHhaMemberCanonicalIntegrityCurrent === 'function' &&
      typeof previewHhaMemberRosterMaintenanceCurrent === 'function' &&
      typeof previewHhaMemberProfileMaintenanceCurrent === 'function' &&
      typeof previewHhaMemberRawSnapshotPlanCurrent === 'function' &&
      typeof saveHhaMemberRawSnapshotsCurrentPilot === 'function' &&
      typeof runHhaMemberRosterWatchCurrent === 'function' &&
      typeof runHhaMemberProfileWatchCurrent === 'function' &&
      typeof runHhaMemberCanonicalAuditCurrent === 'function' &&
      typeof installHhaMemberWatchTriggersCurrent === 'function' &&
      typeof auditHhaMemberWatchTriggersCurrent === 'function' &&
      typeof removeHhaMemberWatchTriggersCurrent === 'function'),
    runtimeAuditCurrentModule_('Lifecycle Auditor', typeof auditEpisodeLifecycleV01 === 'function'),
    runtimeAuditCurrentModule_('Completion Gate', typeof previewEpisodeCompletionGateV01 === 'function'),
    runtimeAuditCurrentModule_('Weekly Readiness', typeof reportWeeklyReadinessV01 === 'function')
  ];

  const triggers = ScriptApp.getProjectTriggers().map((t, i) => ({
    index: i + 1,
    handler: t.getHandlerFunction(),
    eventType: String(t.getEventType()),
    source: String(t.getTriggerSource()),
    sourceId: runtimeAuditCurrentSafe_(() => t.getTriggerSourceId() || '')
  }));

  const triggerCounts = {};
  triggers.forEach(t => {
    triggerCounts[t.handler] = (triggerCounts[t.handler] || 0) + 1;
  });

  const missingCoreTriggers = OCOS_RUNTIME_AUDIT_CURRENT.CURRENT_CORE_TRIGGER_HANDLERS
    .filter(h => (triggerCounts[h] || 0) !== 1)
    .map(h => h + '=' + (triggerCounts[h] || 0));

  const legacyTriggers = OCOS_RUNTIME_AUDIT_CURRENT.LEGACY_TRIGGER_HANDLERS
    .filter(h => (triggerCounts[h] || 0) > 0)
    .map(h => ({ handler: h, count: triggerCounts[h] }));

  const duplicateTriggers = Object.keys(triggerCounts)
    .filter(h => triggerCounts[h] > 1)
    .map(h => ({ handler: h, count: triggerCounts[h] }));

  const props = PropertiesService.getScriptProperties().getProperties();
  const propertyPresence = {};
  OCOS_RUNTIME_AUDIT_CURRENT.EXPECTED_PROPERTIES.forEach(k => {
    propertyPresence[k] = Object.prototype.hasOwnProperty.call(props, k) &&
      String(props[k] || '').length > 0;
  });

  const notionTokenPresent =
    propertyPresence.NOTION_API_TOKEN ||
    propertyPresence.NOTION_TOKEN ||
    propertyPresence.NOTION_SECRET;

  const missingModules = modules.filter(m => !m.present).map(m => m.name);
  const warnings = [];
  if (missingModules.length) warnings.push('Missing Current module(s): ' + missingModules.join(', '));
  if (!notionTokenPresent) warnings.push('No Notion token property is present.');
  if (missingCoreTriggers.length) warnings.push('Current core trigger count mismatch: ' + missingCoreTriggers.join(', '));
  if (legacyTriggers.length) warnings.push('Legacy trigger(s) still installed; migration not complete.');
  if (duplicateTriggers.length) warnings.push('Duplicate trigger(s) detected.');

  const out = {
    write: 'NONE',
    version: OCOS_RUNTIME_AUDIT_CURRENT.VERSION,
    timestamp: new Date().toISOString(),
    modules: modules,
    triggers: triggers,
    triggerCounts: triggerCounts,
    missingCoreTriggers: missingCoreTriggers,
    legacyTriggers: legacyTriggers,
    duplicateTriggers: duplicateTriggers,
    scriptPropertyPresence: propertyPresence,
    notionTokenPresent: notionTokenPresent,
    warnings: warnings,
    migrationComplete:
      missingModules.length === 0 &&
      missingCoreTriggers.length === 0 &&
      legacyTriggers.length === 0 &&
      duplicateTriggers.length === 0 &&
      notionTokenPresent,
    note: 'Secret values are never printed. HHA Member Watch triggers are required by this audit after Production trigger installation. Other optional/manual triggers remain informational.'
  };

  console.log('========================================');
  console.log('OC-OS CURRENT RUNTIME AUDIT');
  console.log('WRITE = NONE');
  console.log('========================================');
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function runtimeAuditCurrentModule_(name, present) {
  return { name: name, present: !!present };
}

function runtimeAuditCurrentSafe_(fn) {
  try { return fn(); } catch (e) { return ''; }
}
'@
$parts.Add($currentAudit)

$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

$checkFile = Join-Path $runtimeDir 'OCOS_Diagnostics_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Diagnostics runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

$matches = [regex]::Matches($text, '(?m)^function\s+([A-Za-z0-9_$]+)\s*\(')
$names = @{}
foreach ($m in $matches) {
  $name = $m.Groups[1].Value
  if ($names.ContainsKey($name)) { throw "Duplicate function declaration in Diagnostics Current: $name" }
  $names[$name] = $true
}

$required = @(
  'function auditEpisodeLifecycleV01()',
  'function previewEpisodeCompletionGateV01()',
  'function reportWeeklyReadinessV01()',
  'function reportGasRuntimeInventoryCurrent()'
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) { throw "Required Diagnostics declaration missing: $needle" }
}

if ($text.Contains('function reportGasRuntimeInventoryV01()')) {
  throw 'Legacy runtime audit leaked into Diagnostics Current.'
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count) + Current Runtime Audit"
Write-Host "Mode: Diagnostics Current / SUPPORT READ ONLY"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Legacy runtime audit exclusion check: PASS"
Write-Host "Current runtime audit check: PASS"
Write-Host "Writes: NONE"
Write-Host "Do NOT run clasp push yet."
