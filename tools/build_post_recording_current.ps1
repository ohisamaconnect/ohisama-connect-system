param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_PostRecording_Current.gs'

$sources = @(
  @{ Name = 'Episode Actuals Finalizer v0.1.0'; Path = (Join-Path $gasDir 'oc_os_episode_actuals_finalizer_v0.1.0.gs') },
  @{ Name = 'Post-Recording Intake v0.2.0'; Path = (Join-Path $gasDir 'oc_os_post_recording_intake_v0.2.0.gs') },
  @{ Name = 'Transcript Materializer v0.1.0'; Path = (Join-Path $gasDir 'oc_os_transcript_materializer_v0.1.0.gs') },
  @{ Name = 'Post-Recording Integrator v0.1.0'; Path = (Join-Path $gasDir 'oc_os_post_recording_integrator_v0.1.0.gs') }
)

foreach ($src in $sources) {
  if (-not (Test-Path $src.Path)) {
    throw "Missing source: $($src.Path)"
  }
}

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$header = @'
/**
 * OC-OS Post Recording Current - Production Runtime family
 *
 * This file consolidates four same-generation responsibility modules:
 * - Episode Actuals Finalizer
 * - Post-Recording Intake
 * - Transcript Materializer
 * - Post-Recording Integrator
 *
 * Runtime policy:
 * - These are responsibility boundaries, not historical version inheritance.
 * - Existing public function names are preserved for compatibility.
 * - OC_TARGET_EPISODE_KEY remains the explicit WRITE safety lock where required.
 * - Only Studio_Status = 使用済 contributes to actual on-air relations.
 * - Existing Audio_URL / Transcript_URL values are never overwritten.
 * - No Production_Status or STUDIO ITEM status is changed here.
 * - No automatic trigger is installed by this family.
 */
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)

foreach ($src in $sources) {
  $body = [System.IO.File]::ReadAllText($src.Path)
  $parts.Add("`r`n// ============================================================`r`n// CURRENT MODULE: $($src.Name)`r`n// ============================================================`r`n")
  $parts.Add($body)
}

$facade = @'

// ============================================================
// CURRENT PUBLIC FACADE
// ============================================================

const OCOS_POST_RECORDING_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  STATUS: 'PRODUCTION',
  TARGET_KEY_PROPERTY: 'OC_TARGET_EPISODE_KEY',
  AUTO_TRIGGER: false
});

function previewPostRecordingCurrent() {
  return previewPostRecordingIntegrationV01();
}

function syncPostRecordingCurrent() {
  return syncPostRecordingIntegrationV01();
}

function previewEpisodeActualsCurrent() {
  return previewEpisodeActualsFinalizerV01();
}

function previewPostRecordingIntakeCurrent() {
  return previewPostRecordingIntakeV02();
}

function ensurePostRecordingFoldersCurrent() {
  return ensurePostRecordingFoldersV02();
}

function previewTranscriptCurrent() {
  return previewTranscriptMaterializerV01();
}

function materializeTranscriptCurrent() {
  return materializeFormalTranscriptDocV01();
}
'@

$parts.Add($facade)
$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

# Syntax-check as JavaScript because Node does not recognize .gs directly.
$checkFile = Join-Path $runtimeDir 'OCOS_PostRecording_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) {
    throw 'Generated Post Recording runtime failed node --check.'
  }
} finally {
  if (Test-Path $checkFile) {
    Remove-Item $checkFile -Force
  }
}

# No duplicate function declarations are allowed in the consolidated runtime.
$functionMatches = [regex]::Matches(
  $text,
  '(?m)^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\('
)
$functionNames = @($functionMatches | ForEach-Object { $_.Groups[1].Value })
$duplicates = @(
  $functionNames |
    Group-Object |
    Where-Object { $_.Count -gt 1 } |
    ForEach-Object { $_.Name }
)
if ($duplicates.Count -gt 0) {
  throw ('Duplicate function declaration(s): ' + ($duplicates -join ', '))
}

$required = @(
  'function previewPostRecordingIntegrationV01()',
  'function syncPostRecordingIntegrationV01()',
  'function actualsV01BuildPlan_(',
  'function postV02BuildPlan_(',
  'function transcriptV01BuildPlan_(',
  'function previewPostRecordingCurrent()',
  'function syncPostRecordingCurrent()',
  'function materializeTranscriptCurrent()'
)

foreach ($needle in $required) {
  if (-not $text.Contains($needle)) {
    throw "Required Post Recording declaration missing: $needle"
  }
}

if ($text -match 'ScriptApp\.newTrigger\s*\(') {
  throw 'Unexpected automatic trigger installer detected in Post Recording Current runtime.'
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Mode: Post Recording Current / Production family consolidation"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Dependency declaration check: PASS"
Write-Host "Automatic trigger: NONE"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
