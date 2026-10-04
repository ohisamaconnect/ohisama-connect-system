param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Suggestion_Current.gs'

$sources = @(
  @{ Name = 'Suggestion Engine v0.1.0'; Path = (Join-Path $gasDir 'oc_os_inbox_suggestion_engine_v0.1.0.gs') },
  @{ Name = 'Suggestion Rules v0.1.1'; Path = (Join-Path $gasDir 'oc_os_inbox_suggestion_rules_v0.1.1.gs') },
  @{ Name = 'Parent Backfill v0.1.2'; Path = (Join-Path $gasDir 'oc_os_inbox_parent_backfill_preview_v0.1.2.gs') },
  @{ Name = 'Suggestion Revision Guard v0.1.1'; Path = (Join-Path $gasDir 'oc_os_inbox_suggestion_revision_guard_v0.1.1.gs') },
  @{ Name = 'AI Suggestion v0.2.0'; Path = (Join-Path $gasDir 'oc_os_inbox_ai_suggestion_v0.2.0.gs') },
  @{ Name = 'AI Suggestion v0.2.1'; Path = (Join-Path $gasDir 'oc_os_inbox_ai_suggestion_v0.2.1.gs') },
  @{ Name = 'AI Guardrails v0.2.3'; Path = (Join-Path $gasDir 'oc_os_inbox_ai_suggestion_guardrails_v0.2.3.gs') },
  @{ Name = 'AI Staged Commit v0.2.4'; Path = (Join-Path $gasDir 'oc_os_inbox_ai_suggestion_staged_commit_v0.2.4.gs') },
  @{ Name = 'AI Revision Guard v0.2.5'; Path = (Join-Path $gasDir 'oc_os_inbox_ai_suggestion_revision_guard_v0.2.5.gs') }
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
 * OC-OS Suggestion Current - consolidated PILOT Runtime
 * Generated from the latest verified Suggestion dependency chain.
 *
 * Runtime policy:
 * - Suggestion only; human Decision / Event / Status remain authoritative.
 * - SOURCES / EVENTS are not created here.
 * - SOURCE_REVISION is excluded by the v0.2.5 guard path.
 * - Preview/Stage and Commit remain separated.
 * - Commit does not call Gemini; it writes only the reviewed staged snapshot.
 * - No automatic trigger is installed while this layer remains Pilot.
 * - Phase 1 preserves verified internal versioned symbols while removing
 *   deployment-time cross-file dependency.
 */
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)

foreach ($src in $sources) {
  $body = [System.IO.File]::ReadAllText($src.Path)
  $parts.Add("`r`n// ============================================================`r`n// CONSOLIDATED SOURCE: $($src.Name)`r`n// ============================================================`r`n")
  $parts.Add($body)
}

$facade = @'

// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

const OCOS_SUGGESTION_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  ENGINE: 'v0.2.5-equivalent',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});

function previewSuggestionCurrentProductionGate() {
  return previewInboxAiSuggestionProductionGateV025();
}

function previewAndStageSuggestionCurrent() {
  return previewAndStageInboxAiSuggestionCurrentV025();
}

function previewAndStageSuggestionBackfill() {
  return previewAndStageInboxAiSuggestionBackfillV025();
}

function commitSuggestionCurrentStage() {
  return commitInboxAiSuggestionCurrentStageV025();
}

function commitSuggestionBackfillStage() {
  return commitInboxAiSuggestionBackfillStageV025();
}

function inspectSuggestionCurrentStage() {
  return inspectInboxAiSuggestionStageV025();
}

function clearSuggestionCurrentStage() {
  return clearInboxAiSuggestionStageV025();
}
'@

$parts.Add($facade)
$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

# Syntax-check as JavaScript because Node does not recognize .gs directly.
$checkFile = Join-Path $runtimeDir 'OCOS_Suggestion_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Suggestion runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

$required = @(
  'function previewSuggestionCurrentProductionGate()',
  'function previewAndStageSuggestionCurrent()',
  'function commitSuggestionCurrentStage()'
)

foreach ($needle in $required) {
  if (-not $text.Contains($needle)) {
    throw "Required Current Suggestion declaration missing: $needle"
  }
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Mode: Suggestion Current / PILOT Phase 1"
Write-Host "Syntax check: PASS"
Write-Host "Current facade check: PASS"
Write-Host "Automatic trigger: NONE"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
