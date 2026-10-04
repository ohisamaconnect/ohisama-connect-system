param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Suggestion_Current.gs'

$paths = @{
  Engine = Join-Path $gasDir 'oc_os_inbox_suggestion_engine_v0.1.0.gs'
  Rules = Join-Path $gasDir 'oc_os_inbox_suggestion_rules_v0.1.1.gs'
  Parent = Join-Path $gasDir 'oc_os_inbox_parent_backfill_preview_v0.1.2.gs'
  Revision = Join-Path $gasDir 'oc_os_inbox_suggestion_revision_guard_v0.1.1.gs'
  AI020 = Join-Path $gasDir 'oc_os_inbox_ai_suggestion_v0.2.0.gs'
  AI021 = Join-Path $gasDir 'oc_os_inbox_ai_suggestion_v0.2.1.gs'
  AI023 = Join-Path $gasDir 'oc_os_inbox_ai_suggestion_guardrails_v0.2.3.gs'
  AI024 = Join-Path $gasDir 'oc_os_inbox_ai_suggestion_staged_commit_v0.2.4.gs'
  AI025 = Join-Path $gasDir 'oc_os_inbox_ai_suggestion_revision_guard_v0.2.5.gs'
}

$paths.Values | ForEach-Object {
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

$engine = Read-Source $paths.Engine
$rules = Read-Source $paths.Rules
$parent = Read-Source $paths.Parent
$revision = Read-Source $paths.Revision
$ai020 = Read-Source $paths.AI020
$ai021 = Read-Source $paths.AI021
$ai023 = Read-Source $paths.AI023
$ai024 = Read-Source $paths.AI024
$ai025 = Read-Source $paths.AI025

# Phase 2 strategy:
# - Preserve the latest verified internal implementation chain.
# - Remove all historical/public entry points from source generations.
# - For duplicate v0.1.1 deterministic runner functions, keep only the later
#   revision-guard implementation (the same implementation that wins in Phase 1).
# - Expose only the Current/Pilot facade appended below.

$engineConfig = Slice-Between $engine `
  'const OCOS_SUGGESTION = Object.freeze({' `
  'function testInboxSuggestionConnectionV010()'
$engineCore = Slice-From $engine 'function suggestionPreviewRun_(mode)'

# Rules: keep classification improvements only. Runner/loader definitions are
# superseded by the revision-guard source later in the lineage.
$rulesCore = Slice-From $rules 'function suggestionBuildProposalV011_(item, events)'

$parentConfig = Slice-Between $parent `
  'const OCOS_PARENT_BACKFILL_012 = Object.freeze({' `
  'function previewInboxParentEventBackfillV012()'
$parentCore = Slice-From $parent 'function suggestionLoadOfficialNewsBackfillAllV012_()'

$revisionConfig = Slice-Between $revision `
  'const OCOS_SUGGESTION_REVISION_GUARD_011 = Object.freeze({' `
  'function previewInboxSuggestionV011()'
$revisionCore = Slice-From $revision 'function suggestionPreviewRunV011_(mode)'

$ai020Config = Slice-Between $ai020 `
  'const OCOS_AI_SUGGESTION_020 = Object.freeze({' `
  'function testInboxAiSuggestionConnectionV020()'
$ai020Core = Slice-From $ai020 'function aiSuggestionRunV020_(opts)'

$ai021Config = Slice-Between $ai021 `
  'const OCOS_AI_SUGGESTION_021 = Object.freeze({' `
  'function previewInboxAiSuggestionBackfillV021()'
$ai021Core = Slice-From $ai021 'function aiSuggestionRunV021_(opts)'

$ai023Config = Slice-Between $ai023 `
  'const OCOS_AI_SUGGESTION_023 = Object.freeze({' `
  'function previewInboxAiSuggestionBackfillV023()'
$ai023Core = Slice-From $ai023 'function aiSuggestionRunV023_(opts)'

$ai024Config = Slice-Between $ai024 `
  'const OCOS_AI_SUGGESTION_024 = Object.freeze({' `
  'function previewAndStageInboxAiSuggestionBackfillV024()'
$ai024Core = Slice-From $ai024 'function aiSuggestionPreviewAndStageV024_(mode)'

$ai025Config = Slice-Between $ai025 `
  'const OCOS_AI_SUGGESTION_025 = Object.freeze({' `
  'function previewInboxAiSuggestionProductionGateV025()'
$ai025Core = Slice-From $ai025 'function aiSuggestionLoadGuardedCandidatesV025_(mode, events)'

$header = @'
/**
 * OC-OS Suggestion Current - PILOT Runtime
 * Current public-surface consolidation generated from the verified Suggestion lineage.
 *
 * Runtime policy:
 * - Suggestion only; human Decision / Event / Status remain authoritative.
 * - SOURCES / EVENTS are never created by this layer.
 * - SOURCE_REVISION and unexpected Observation_Type values are excluded.
 * - Rule suggestion and AI suggestion remain separate responsibilities.
 * - AI Preview/Stage and Commit remain separated by human review.
 * - Commit never calls Gemini; only the reviewed staged snapshot can be written.
 * - No automatic trigger exists while Suggestion remains PILOT.
 * - Historical public entry points remain in GitHub source/history, not Runtime.
 *
 * Internal versioned helper names are intentionally retained until real Apps Script
 * parity validation is complete. Runtime users should invoke only the Current facade.
 */
'@

$currentConfig = @'

const OCOS_SUGGESTION_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  ENGINE: 'rules + v0.2.5-equivalent guarded staged AI',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});
'@

$facade = @'

// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

function previewSuggestionRuleCurrent() {
  return suggestionPreviewRunV011_({ backfill: false });
}

function runSuggestionRuleCurrent() {
  return suggestionWriteRunV011_({ backfill: false });
}

function previewSuggestionRuleBackfill() {
  return suggestionPreviewRunV011_({ backfill: true });
}

function previewSuggestionParentBackfill() {
  suggestionValidateConfig_();

  const events = suggestionLoadEvents_();
  const rawPages = suggestionLoadOfficialNewsBackfillAllV012_();
  const pages = suggestionDedupeInboxPagesV012_(rawPages);

  const rows = pages.map(page => {
    const item = suggestionParseInboxPageV011_(page);
    return {
      item,
      result: suggestionClassifyParentBackfillV012_(item, events)
    };
  });

  const counts = {};
  rows.forEach(x => {
    counts[x.result.kind] = (counts[x.result.kind] || 0) + 1;
  });

  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / PARENT BACKFILL PREVIEW');
  console.log('WRITE = NONE');
  console.log(`WINDOW = ${OCOS_PARENT_BACKFILL_012.FROM} .. ${OCOS_PARENT_BACKFILL_012.TO}`);
  console.log(`RAW_INBOX = ${rawPages.length}`);
  console.log(`UNIQUE_URLS = ${pages.length}`);
  console.log(`COUNTS = ${JSON.stringify(counts)}`);
  console.log('========================================');

  let n = 0;
  rows.forEach(x => {
    if (x.result.kind === 'SOURCE_ONLY') return;
    n++;
    console.log(`${n}. [${x.result.kind}] ${x.item.title}`);
    console.log(`   event=${x.result.eventTitle || '-'}`);
    console.log(`   reason=${x.result.reason}`);
  });

  console.log('========================================');
  console.log(`REVIEW_ROWS = ${n}`);
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function previewSuggestionCurrentProductionGate() {
  suggestionValidateConfig_();
  const events = suggestionLoadEvents_();

  const currentAudit = aiSuggestionAuditCurrentCandidatesV025_(events);
  const backfillAudit = aiSuggestionAuditBackfillCandidatesV025_(events);

  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / AI PRODUCTION GATE');
  console.log('WRITE = NONE');
  console.log('GEMINI_CALL = NONE');
  console.log('========================================');
  console.log('CURRENT');
  console.log(`CURRENT_LEGACY_AI_CANDIDATES = ${currentAudit.legacyCandidates}`);
  console.log(`CURRENT_GUARDED_CANDIDATES = ${currentAudit.guardedCandidates}`);
  console.log(`CURRENT_SOURCE_REVISION_EXCLUDED = ${currentAudit.revisionExcluded}`);
  console.log(`CURRENT_UNEXPECTED_OBSERVATION_EXCLUDED = ${currentAudit.unexpectedExcluded}`);
  console.log('----------------------------------------');
  console.log('BACKFILL');
  console.log(`BACKFILL_LEGACY_AI_CANDIDATES = ${backfillAudit.legacyCandidates}`);
  console.log(`BACKFILL_GUARDED_CANDIDATES = ${backfillAudit.guardedCandidates}`);
  console.log(`BACKFILL_SOURCE_REVISION_EXCLUDED = ${backfillAudit.revisionExcluded}`);
  console.log(`BACKFILL_UNEXPECTED_OBSERVATION_EXCLUDED = ${backfillAudit.unexpectedExcluded}`);
  console.log('----------------------------------------');
  console.log('STAGE_POLICY = blank / NORMAL only');
  console.log('COMMIT_POLICY = live blank / NORMAL only');
  console.log('SOURCE_REVISION / unexpected = READ ONLY SKIP');
  console.log('Decision / Event / Status = UNCHANGED');
  console.log('RESULT = SAFE PREVIEW');
  console.log('========================================');
}

function previewAndStageSuggestionCurrent() {
  return aiSuggestionPreviewAndStageV025_('CURRENT_AI_FALLBACK');
}

function previewAndStageSuggestionBackfill() {
  return aiSuggestionPreviewAndStageV025_('BACKFILL_AI_REVIEW');
}

function commitSuggestionCurrentStage() {
  return aiSuggestionCommitStageV025_('CURRENT_AI_FALLBACK');
}

function commitSuggestionBackfillStage() {
  return aiSuggestionCommitStageV025_('BACKFILL_AI_REVIEW');
}

function inspectSuggestionCurrentStage() {
  const stage = aiSuggestionLoadStageV025_();
  console.log('========================================');
  console.log('OC-OS SUGGESTION CURRENT / STAGE');
  console.log(`stage_id=${stage.meta.stageId}`);
  console.log(`mode=${stage.meta.mode}`);
  console.log(`classifier_version=${stage.meta.classifierVersion}`);
  console.log(`created_at=${stage.meta.createdAt}`);
  console.log(`count=${stage.meta.count}`);
  console.log(`sha256=${stage.meta.sha256}`);
  console.log(`committed_at=${stage.meta.committedAt || '-'}`);
  console.log('========================================');
}

function clearSuggestionCurrentStage() {
  aiSuggestionClearStageV025_();
  console.log('Suggestion Current staged snapshot cleared.');
}
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)
$parts.Add($engineConfig)
$parts.Add($currentConfig)
$parts.Add("`r`n// CURRENT BASE ENGINE CORE`r`n")
$parts.Add($engineCore)
$parts.Add("`r`n// CURRENT RULE CLASSIFICATION CORE`r`n")
$parts.Add($rulesCore)
$parts.Add("`r`n// CURRENT PARENT BACKFILL CORE`r`n")
$parts.Add($parentConfig)
$parts.Add($parentCore)
$parts.Add("`r`n// CURRENT REVISION-GUARDED RULE RUNNER`r`n")
$parts.Add($revisionConfig)
$parts.Add($revisionCore)
$parts.Add("`r`n// CURRENT AI BASE CORE`r`n")
$parts.Add($ai020Config)
$parts.Add($ai020Core)
$parts.Add("`r`n// CURRENT AI RETRY CORE`r`n")
$parts.Add($ai021Config)
$parts.Add($ai021Core)
$parts.Add("`r`n// CURRENT AI GUARDRAIL CORE`r`n")
$parts.Add($ai023Config)
$parts.Add($ai023Core)
$parts.Add("`r`n// CURRENT AI STAGE SUPPORT CORE`r`n")
$parts.Add($ai024Config)
$parts.Add($ai024Core)
$parts.Add("`r`n// CURRENT AI REVISION-GUARDED STAGE CORE`r`n")
$parts.Add($ai025Config)
$parts.Add($ai025Core)
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

# No duplicate function declarations are allowed in Current Runtime.
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
  throw "Duplicate function declarations in Current Suggestion Runtime: $($duplicates -join ', ')"
}

# Current public surface only. Internal helpers must end with underscore.
$allowedPublic = @(
  'previewSuggestionRuleCurrent',
  'runSuggestionRuleCurrent',
  'previewSuggestionRuleBackfill',
  'previewSuggestionParentBackfill',
  'previewSuggestionCurrentProductionGate',
  'previewAndStageSuggestionCurrent',
  'previewAndStageSuggestionBackfill',
  'commitSuggestionCurrentStage',
  'commitSuggestionBackfillStage',
  'inspectSuggestionCurrentStage',
  'clearSuggestionCurrentStage'
)

$unexpectedPublic = @(
  $functionNames |
    Where-Object {
      -not $_.EndsWith('_') -and $allowedPublic -notcontains $_
    } |
    Select-Object -Unique
)
if ($unexpectedPublic.Count -gt 0) {
  throw "Legacy/unexpected public functions leaked into Current Runtime: $($unexpectedPublic -join ', ')"
}

foreach ($name in $allowedPublic) {
  if ($functionNames -notcontains $name) {
    throw "Required Current Suggestion public function missing: $name"
  }
}

Write-Host "Generated: $outFile"
Write-Host "Mode: Suggestion Current / PILOT Phase 2"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Current-only public surface check: PASS"
Write-Host "Automatic trigger: NONE"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
