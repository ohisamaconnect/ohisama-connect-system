param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$sourcePath = Join-Path $gasDir 'oc_os_episode_calendar_sync_v0.1.0.gs'
$outFile = Join-Path $runtimeDir 'OCOS_Calendar_Current.gs'

if (-not (Test-Path $sourcePath)) { throw "Missing source: $sourcePath" }
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir | Out-Null }

$source = [System.IO.File]::ReadAllText($sourcePath)

$header = @'
/**
 * OC-OS Calendar Current - PILOT Runtime
 *
 * Canonical boundary:
 * - Notion EPISODES remains canonical for Recording_Date / Air_Date.
 * - Google Calendar is a mirror only.
 * - Legacy oc_os_calendar_bridge_v0.1.0.gs is intentionally NOT included.
 * - WRITE requires explicit OC_TARGET_EPISODE_KEY.
 * - No automatic trigger is installed by this module.
 */
'@

$facade = @'

// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

const OCOS_CALENDAR_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});

function previewCalendarCurrent() {
  return previewEpisodeCalendarSyncV01();
}

function syncCalendarCurrent() {
  return syncEpisodeCalendarV01();
}
'@

$text = $header + "`r`n" + $source + "`r`n" + $facade
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

$checkFile = Join-Path $runtimeDir 'OCOS_Calendar_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Calendar runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

$required = @(
  'function previewEpisodeCalendarSyncV01()',
  'function syncEpisodeCalendarV01()',
  'function previewCalendarCurrent()',
  'function syncCalendarCurrent()'
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) { throw "Required Calendar declaration missing: $needle" }
}

$forbidden = @(
  'function syncEpisodeCalendarBridgeV01()',
  'OC_CALENDAR_BRIDGE'
)
foreach ($needle in $forbidden) {
  if ($text.Contains($needle)) { throw "Legacy Calendar declaration leaked into Current Runtime: $needle" }
}

Write-Host "Generated: $outFile"
Write-Host "Mode: Calendar Current / PILOT"
Write-Host "Syntax check: PASS"
Write-Host "Legacy bridge exclusion check: PASS"
Write-Host "Current facade check: PASS"
Write-Host "Automatic trigger: NONE"
Write-Host "Do NOT run clasp push yet."
