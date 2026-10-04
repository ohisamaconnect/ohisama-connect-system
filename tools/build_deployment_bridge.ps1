param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Deployment_Bridge.gs'
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir | Out-Null }

$text = @'
/**
 * OC-OS Temporary Deployment Bridge
 *
 * PURPOSE:
 * - Keep pre-consolidation trigger handler names callable during the FIRST
 *   clasp deployment only.
 * - Delegate old trigger names to the new Current handlers.
 * - Prevent scheduled trigger failures between first push and trigger migration.
 *
 * REMOVE AFTER:
 * 1. Current Crawler triggers are installed and audited.
 * 2. Current Processor trigger is installed and audited.
 * 3. reportGasRuntimeInventoryCurrent() shows no legacy trigger handlers.
 *
 * This file is temporary migration infrastructure, not permanent Production Runtime.
 */

const OCOS_DEPLOYMENT_BRIDGE = Object.freeze({
  VERSION: 'first-clasp-migration-2026-10-04',
  TEMPORARY: true
});

// Crawler legacy trigger shims.
function runFrequentCrawler() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawler() { return runScheduleCrawlerCurrent(); }
function runDailyCrawler() { return runDailyCrawlerCurrent(); }
function runFrequentCrawlerV127() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawlerV127() { return runScheduleCrawlerCurrent(); }
function runDailyCrawlerV127() { return runDailyCrawlerCurrent(); }
function runFrequentCrawlerV128() { return runFrequentCrawlerCurrent(); }
function runScheduleCrawlerV128() { return runScheduleCrawlerCurrent(); }
function runDailyCrawlerV128() { return runDailyCrawlerCurrent(); }

// Processor legacy trigger shims.
function runInboxProcessorV01() { return runInboxProcessorCurrent(); }
function runInboxProcessorV011() { return runInboxProcessorCurrent(); }
function runInboxProcessorV012() { return runInboxProcessorCurrent(); }

function previewDeploymentBridgeCurrent() {
  const triggers = ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    eventType: String(t.getEventType()),
    source: String(t.getTriggerSource())
  }));
  const out = {
    write: 'NONE',
    version: OCOS_DEPLOYMENT_BRIDGE.VERSION,
    temporary: true,
    triggers: triggers,
    nextAction:
      'Install/audit Current Crawler and Processor triggers, then remove this bridge after Current runtime audit confirms no legacy trigger handlers.'
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}
'@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

$checkFile = Join-Path $runtimeDir 'OCOS_Deployment_Bridge.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated deployment bridge failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

$required = @(
  'function runFrequentCrawlerV128()',
  'function runScheduleCrawlerV128()',
  'function runDailyCrawlerV128()',
  'function runInboxProcessorV012()',
  'function previewDeploymentBridgeCurrent()'
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) { throw "Required deployment bridge declaration missing: $needle" }
}

Write-Host "Generated: $outFile"
Write-Host "Mode: TEMPORARY first-clasp deployment bridge"
Write-Host "Syntax check: PASS"
Write-Host "Legacy trigger shim check: PASS"
Write-Host "IMPORTANT: Keep only through first trigger migration."
Write-Host "Do NOT run clasp push until the complete runtime audit step."
