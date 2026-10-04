param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Weekly_Current.gs'

$sources = @(
  @{ Name = 'Weekly Episode Bootstrap'; Path = (Join-Path $gasDir 'oc_os_weekly_episode_bootstrap_v0.1.0.gs') },
  @{ Name = 'Target Episode Lock Manager'; Path = (Join-Path $gasDir 'oc_os_target_episode_lock_manager_v0.1.0.gs') },
  @{ Name = 'Studio Automation'; Path = (Join-Path $gasDir 'ocos_studio_automation_v0.1.0.gs') },
  @{ Name = 'Weekly Review Queue Resolver'; Path = (Join-Path $gasDir 'oc_os_weekly_review_queue_resolver_v0.1.0.gs') }
)

foreach ($src in $sources) {
  if (-not (Test-Path $src.Path)) { throw "Missing source: $($src.Path)" }
}

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$header = @'
/**
 * OC-OS Weekly Current - Production Runtime
 * Consolidated weekly-production family.
 *
 * Responsibilities retained as separate namespaces inside one Current family:
 * - create/reuse the next weekly EPISODE + Drive skeleton
 * - manage explicit PRE/POST target episode lock
 * - seed STUDIO ITEMS and generate STUDIO PACK
 * - resolve/sync the Weekly Review Queue window
 *
 * Runtime policy:
 * - Human editorial judgement remains authoritative.
 * - Existing handler names are preserved for trigger compatibility.
 * - No trigger is installed merely by building this file.
 * - This is family consolidation, not a semantic rewrite.
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
// CURRENT FAMILY FACADE
// ============================================================

const OCOS_WEEKLY_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  FAMILY: 'weekly-production',
  MODULES: Object.freeze([
    'episode-bootstrap',
    'target-episode-lock',
    'studio-automation',
    'weekly-review-queue'
  ])
});

function previewWeeklyCurrentOverview() {
  return {
    version: OCOS_WEEKLY_CURRENT.VERSION,
    family: OCOS_WEEKLY_CURRENT.FAMILY,
    modules: OCOS_WEEKLY_CURRENT.MODULES,
    bootstrap: previewWeeklyEpisodeBootstrapV01(),
    targetLocks: previewTargetEpisodeLocksV01(),
    studioPack: previewStudioPackV01(),
    reviewQueue: previewWeeklyReviewQueueResolverV01()
  };
}
'@

$parts.Add($facade)
$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

# Syntax check.
$checkFile = Join-Path $runtimeDir 'OCOS_Weekly_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Weekly runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

# Duplicate function declarations are unsafe in one Apps Script project.
$matches = [regex]::Matches($text, '(?m)^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
$counts = @{}
foreach ($m in $matches) {
  $name = $m.Groups[1].Value
  if (-not $counts.ContainsKey($name)) { $counts[$name] = 0 }
  $counts[$name]++
}
$duplicates = @($counts.GetEnumerator() | Where-Object { $_.Value -gt 1 } | Sort-Object Name)
if ($duplicates.Count -gt 0) {
  $detail = ($duplicates | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', '
  throw "Duplicate function declarations in Weekly Current: $detail"
}

# Preserve known handler/entry-point compatibility.
$required = @(
  'function previewWeeklyEpisodeBootstrapV01()',
  'function createNextWeeklyEpisodeV01()',
  'function installWeeklyEpisodeBootstrapTriggerV01()',
  'function previewTargetEpisodeLocksV01()',
  'function lockPreRecordingTargetV01()',
  'function lockPostRecordingTargetV01()',
  'function runStudioCandidateSeederV01()',
  'function generateStudioPackV01()',
  'function installStudioAutomationTriggersV01()',
  'function previewWeeklyReviewQueueResolverV01()',
  'function syncWeeklyReviewQueueResolverV01()',
  'function previewWeeklyCurrentOverview()'
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) {
    throw "Required Weekly declaration missing: $needle"
  }
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Mode: Weekly Current / Production family consolidation"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Handler compatibility check: PASS"
Write-Host "Automatic trigger install during build: NONE"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
