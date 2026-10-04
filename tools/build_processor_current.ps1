param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Processor_Current.gs'

$basePath = Join-Path $gasDir 'ohisama_inbox_processor_v0.1.gs'
$guardPath = Join-Path $gasDir 'ohisama_inbox_processor_revision_guard_v0.1.1.gs'
$readyPath = Join-Path $gasDir 'ohisama_inbox_processor_ready_only_v0.1.2.gs'

@($basePath, $guardPath, $readyPath) | ForEach-Object {
  if (-not (Test-Path $_)) { throw "Missing source: $_" }
}

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

function Read-Source([string]$Path) {
  return [System.IO.File]::ReadAllText($Path)
}

function Slice-Between([string]$Text, [string]$StartMarker, [string]$EndMarker) {
  $start = $Text.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  if ($start -lt 0) { throw "Start marker not found: $StartMarker" }

  $end = $Text.IndexOf($EndMarker, $start, [System.StringComparison]::Ordinal)
  if ($end -lt 0) { throw "End marker not found: $EndMarker" }

  return $Text.Substring($start, $end - $start).Trim()
}

function Slice-From([string]$Text, [string]$StartMarker) {
  $start = $Text.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  if ($start -lt 0) { throw "Start marker not found: $StartMarker" }
  return $Text.Substring($start).Trim()
}

$base = Read-Source $basePath
$guard = Read-Source $guardPath
$ready = Read-Source $readyPath

# Base configuration. Old public runners and old candidate loader are excluded.
$baseConfig = Slice-Between $base 'const OCOS_PROCESSOR = Object.freeze({' 'function testInboxProcessorConnectionV01()'
$baseParseValidation = Slice-Between $base 'function processorParseInboxPage_(' 'function processorProcessItem_('
$baseDataCore = Slice-From $base 'function processorGetOrCreateSource_('

# Revision guard: retain only the helpers required by the READY-only runtime.
$guardConfig = Slice-Between $guard 'const OCOS_PROCESSOR_REVISION_GUARD_011 = Object.freeze({' 'function previewInboxProcessorV011()'
$guardCore = Slice-From $guard 'function processorLoadRevisionExposureV011_()'

# READY-only: its public preview/run become the Current public preview/run.
$readyConfig = Slice-Between $ready 'const OCOS_PROCESSOR_READY_ONLY_012 = Object.freeze({' 'function previewInboxProcessorProductionV012()'
$readyPublic = Slice-Between $ready 'function previewInboxProcessorProductionV012()' 'function processorScanReadyOnlyV012_()'
$readyCore = Slice-From $ready 'function processorScanReadyOnlyV012_()'

# Current naming. Keep base helper names stable where they are not versioned, but
# remove generation-specific symbols from the deployed runtime.
$baseConfig = $baseConfig.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')
$baseConfig = $baseConfig.Replace("VERSION: '0.1.0'", "VERSION: 'current-2026-10-04'")
$baseParseValidation = $baseParseValidation.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')
$baseDataCore = $baseDataCore.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')

$guardConfig = $guardConfig.Replace('OCOS_PROCESSOR_REVISION_GUARD_011', 'OCOS_PROCESSOR_CURRENT_GUARD')
$guardConfig = $guardConfig.Replace("VERSION: '0.1.1-revision-guard'", "VERSION: 'current-revision-guard'")
$guardCore = $guardCore.Replace('OCOS_PROCESSOR_REVISION_GUARD_011', 'OCOS_PROCESSOR_CURRENT_GUARD')
$guardCore = $guardCore.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')
$guardCore = $guardCore.Replace('V011_', 'Current_')

$readyConfig = $readyConfig.Replace('OCOS_PROCESSOR_READY_ONLY_012', 'OCOS_PROCESSOR_CURRENT_RUNTIME')
$readyConfig = $readyConfig.Replace("VERSION: '0.1.2-ready-only'", "VERSION: 'current-2026-10-04-ready-only'")

$readyPublic = $readyPublic.Replace('previewInboxProcessorProductionV012', 'previewInboxProcessorCurrent')
$readyPublic = $readyPublic.Replace('runInboxProcessorV012', 'runInboxProcessorCurrent')
$readyPublic = $readyPublic.Replace('OCOS_PROCESSOR_READY_ONLY_012', 'OCOS_PROCESSOR_CURRENT_RUNTIME')
$readyPublic = $readyPublic.Replace('OCOS_PROCESSOR_REVISION_GUARD_011', 'OCOS_PROCESSOR_CURRENT_GUARD')
$readyPublic = $readyPublic.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')
$readyPublic = $readyPublic.Replace('V011_', 'Current_')
$readyPublic = $readyPublic.Replace('V012_', 'Current_')

$readyCore = $readyCore.Replace('OCOS_PROCESSOR_READY_ONLY_012', 'OCOS_PROCESSOR_CURRENT_RUNTIME')
$readyCore = $readyCore.Replace('OCOS_PROCESSOR_REVISION_GUARD_011', 'OCOS_PROCESSOR_CURRENT_GUARD')
$readyCore = $readyCore.Replace('OCOS_PROCESSOR', 'OCOS_PROCESSOR_CURRENT')
$readyCore = $readyCore.Replace('V011_', 'Current_')
$readyCore = $readyCore.Replace('V012_', 'Current_')

$header = @'
/**
 * OC-OS Inbox Processor Current - Production Runtime
 * Generated from the verified Processor lineage.
 *
 * Runtime policy:
 * - Human Decision/Event ownership is unchanged.
 * - SOURCE_REVISION is excluded from normal processing.
 * - BLOCKED candidates are READ ONLY and are not patched.
 * - READY candidates are reloaded and revalidated immediately before commit.
 * - No older Processor runtime file is required in Apps Script.
 * - Historical versions remain in GitHub only.
 */
'@

$currentHelpers = @'

// ============================================================
// CURRENT CONNECTION / TRIGGER HELPERS
// ============================================================

function testInboxProcessorConnectionCurrent() {
  processorValidateConfig_();
  const result = processorNotionRequest_(
    `/v1/data_sources/${OCOS_PROCESSOR_CURRENT.INBOX_DATA_SOURCE_ID}/query`,
    'post',
    { page_size: 1 }
  );
  console.log(`Inbox Processor Current connection OK. results=${(result.results || []).length}`);
}

function installInboxProcessorHourlyTriggerCurrent() {
  const legacyHandlers = ['runInboxProcessorV01', 'runInboxProcessorV011', 'runInboxProcessorV012'];
  const currentHandler = 'runInboxProcessorCurrent';
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (legacyHandlers.includes(h) || h === currentHandler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  ScriptApp.newTrigger(currentHandler)
    .timeBased()
    .everyHours(1)
    .create();

  console.log(`Inbox Processor Current hourly trigger installed. removed=${removed}, installed=1`);
  auditInboxProcessorTriggersCurrent();
}

function removeInboxProcessorTriggerCurrent() {
  const handler = 'runInboxProcessorCurrent';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log(`Inbox Processor Current triggers removed=${removed}`);
}

function auditInboxProcessorTriggersCurrent() {
  const handlers = [
    'runInboxProcessorV01',
    'runInboxProcessorV011',
    'runInboxProcessorV012',
    'runInboxProcessorCurrent'
  ];
  const counts = {};
  handlers.forEach(h => counts[h] = 0);

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(counts, h)) counts[h]++;
  });

  console.log('========================================');
  console.log('OC-OS INBOX PROCESSOR CURRENT TRIGGER AUDIT');
  handlers.forEach(h => console.log(`${h} = ${counts[h]}`));
  console.log('EXPECTED: runInboxProcessorCurrent=1; all legacy handlers=0');
  console.log('========================================');
}
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)
$parts.Add($baseConfig)
$parts.Add($guardConfig)
$parts.Add($readyConfig)
$parts.Add("`r`n// ============================================================`r`n// CURRENT BASE PARSE / VALIDATION`r`n// ============================================================`r`n")
$parts.Add($baseParseValidation)
$parts.Add("`r`n// ============================================================`r`n// CURRENT BASE DATA / API CORE`r`n// ============================================================`r`n")
$parts.Add($baseDataCore)
$parts.Add("`r`n// ============================================================`r`n// CURRENT REVISION GUARD CORE`r`n// ============================================================`r`n")
$parts.Add($guardCore)
$parts.Add("`r`n// ============================================================`r`n// CURRENT READY-ONLY PUBLIC RUNTIME`r`n// ============================================================`r`n")
$parts.Add($readyPublic)
$parts.Add("`r`n// ============================================================`r`n// CURRENT READY-ONLY CORE`r`n// ============================================================`r`n")
$parts.Add($readyCore)
$parts.Add($currentHelpers)

$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

# Syntax check generated GAS as JavaScript.
$checkFile = Join-Path $runtimeDir 'OCOS_Processor_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated processor failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

# Legacy public entry points must not be deployed.
$forbiddenDeclarations = @(
  'function testInboxProcessorConnectionV01()',
  'function previewInboxProcessorV01()',
  'function runInboxProcessorV01()',
  'function previewInboxProcessorV011()',
  'function runInboxProcessorV011()',
  'function previewInboxProcessorProductionV012()',
  'function runInboxProcessorV012()',
  'function installInboxProcessorHourlyTriggerV012()'
)

foreach ($needle in $forbiddenDeclarations) {
  if ($text.Contains($needle)) {
    throw "Legacy public declaration leaked into Current Runtime: $needle"
  }
}

$requiredDeclarations = @(
  'function previewInboxProcessorCurrent()',
  'function runInboxProcessorCurrent()',
  'function testInboxProcessorConnectionCurrent()',
  'function installInboxProcessorHourlyTriggerCurrent()'
)

foreach ($needle in $requiredDeclarations) {
  if (-not $text.Contains($needle)) {
    throw "Required Current declaration missing: $needle"
  }
}

Write-Host "Generated: $outFile"
Write-Host "Mode: Current-only Processor runtime"
Write-Host "Syntax check: PASS"
Write-Host "Legacy public declaration check: PASS"
Write-Host "Required Current declaration check: PASS"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
