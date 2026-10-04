param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Crawler_Current.gs'

$sources = @(
  @{ Name = 'Base v1.2.6'; Path = (Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.6') },
  @{ Name = 'Stable Source v1.2.7'; Path = (Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.7_production_runner.gs') },
  @{ Name = 'Revision Chain v1.2.8'; Path = (Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.8_revision_chain_production_runner.gs') }
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
 * OC-OS Crawler Current - consolidated Production Runtime
 * Generated from the last verified production chain:
 *   v1.2.6 base collectors / ledger / Notion / HHA member terms
 *   v1.2.7 stable-source identity and revision detection
 *   v1.2.8 structured revision-chain marking
 *
 * Phase 1 consolidation rule:
 * - Preserve verified behavior exactly.
 * - Remove cross-file deployment dependency by shipping one runtime file.
 * - Historical internal symbol names are intentionally retained until
 *   WRITE=NONE equivalence is confirmed in the real Apps Script project.
 * - Production entry points are the *Current functions appended at the end.
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
// CURRENT PRODUCTION FACADE
// ============================================================

const OCOS_CRAWLER_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  ENGINE: 'v1.2.8-equivalent'
});

function runFrequentCrawlerCurrent() {
  return runFrequentCrawlerV128();
}

function runScheduleCrawlerCurrent() {
  return runScheduleCrawlerV128();
}

function runDailyCrawlerCurrent() {
  return runDailyCrawlerV128();
}

function runFullCrawlerChunkCurrent() {
  return runFullCrawlerChunkV128();
}

function previewCrawlerCurrentDecisionGate() {
  return previewV128ProductionDecisionGate();
}

function installCrawlerTriggersCurrent() {
  const removeHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128',
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (removeHandlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  ScriptApp.newTrigger('runFrequentCrawlerCurrent')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('runScheduleCrawlerCurrent')
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger('runDailyCrawlerCurrent')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  console.log(`Current crawler triggers installed. removed=${removed}, installed=3`);
  auditCrawlerTriggersCurrent();
}

function removeCrawlerTriggersCurrent() {
  const handlers = [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  console.log(`Current crawler triggers removed: ${removed}`);
}

function auditCrawlerTriggersCurrent() {
  const legacyHandlers = [
    'runFrequentCrawler',
    'runScheduleCrawler',
    'runDailyCrawler',
    'runFrequentCrawlerV127',
    'runScheduleCrawlerV127',
    'runDailyCrawlerV127',
    'runFrequentCrawlerV128',
    'runScheduleCrawlerV128',
    'runDailyCrawlerV128'
  ];

  const currentHandlers = [
    'runFrequentCrawlerCurrent',
    'runScheduleCrawlerCurrent',
    'runDailyCrawlerCurrent'
  ];

  const counts = {};
  [...legacyHandlers, ...currentHandlers].forEach(h => counts[h] = 0);

  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(counts, h)) counts[h]++;
  });

  console.log('========================================');
  console.log(`OC-OS CRAWLER CURRENT TRIGGER AUDIT | ${OCOS_CRAWLER_CURRENT.VERSION}`);
  [...legacyHandlers, ...currentHandlers].forEach(h => console.log(`${h} = ${counts[h]}`));
  console.log('EXPECTED CURRENT: frequent=1 / schedule=1 / daily=1; all legacy handlers=0');
  console.log('========================================');
}
'@

$parts.Add($facade)
$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
