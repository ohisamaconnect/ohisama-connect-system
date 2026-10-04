param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Crawler_Current.gs'

$basePath = Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.6'
$stablePath = Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.7_production_runner.gs'
$revisionPath = Join-Path $gasDir 'ohisama_inbox_crawler_v1.2.8_revision_chain_production_runner.gs'

@($basePath, $stablePath, $revisionPath) | ForEach-Object {
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
$stable = Read-Source $stablePath
$revision = Read-Source $revisionPath

# Base: retain current configuration + collectors/storage/API/helpers only.
# Legacy public runners, old trigger installers, old orchestrator and historical
# preview-only entry points are intentionally not shipped to Production Runtime.
$baseConfig = Slice-Between $base 'const OCOS = Object.freeze({' '// 初期セットアップ'
$baseCollectorsList = Slice-Between $base 'function fullCollectors_() {' '// Orchestrator'
$baseCore = Slice-Between $base '// Collector A:' '// v1.2.2 Member Google News 実収集 Preview'

# Stable-source generation: only the classifier/state/key implementation is needed.
$stableCore = Slice-From $stable '// Decision logic'
$stableCore = $stableCore.Replace('V127_PRODUCTION', 'OCOS_CRAWLER_CURRENT')
$stableCore = $stableCore.Replace('V127P_', 'Current_')
$stableCore = $stableCore.Replace('v1.2.7', 'Current stable-source')

# Revision-chain generation: only the current orchestrator + chain implementation.
$revisionCore = Slice-From $revision '// Orchestrator v1.2.8'
$revisionCore = $revisionCore.Replace('V128_PRODUCTION', 'OCOS_CRAWLER_CURRENT')
$revisionCore = $revisionCore.Replace('V127P_', 'Current_')
$revisionCore = $revisionCore.Replace('V128_', 'Current_')
$revisionCore = $revisionCore.Replace('v1.2.8', 'Current')

# Keep behavior-compatible UA while identifying the consolidated runtime.
$baseConfig = $baseConfig.Replace(
  "HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnectCrawler/1.2.6)'",
  "HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; OhisamaConnectCrawler/current-2026-10-04)'"
)

$header = @'
/**
 * OC-OS Crawler Current - Production Runtime
 * Generated from the verified crawler implementation lineage.
 *
 * Runtime policy:
 * - This file is self-contained for the Crawler responsibility.
 * - No older crawler file is required in the Apps Script project.
 * - Only Current public entry points and Current trigger handlers are shipped.
 * - Historical source versions remain in GitHub, not in Production Runtime.
 * - Human editorial judgement is unchanged; this component only discovers and
 *   records candidate information through the established INBOX workflow.
 */
'@

$currentConfig = @'

const OCOS_CRAWLER_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  ENGINE: 'stable-source + structured-revision-chain',
  TARGET_COLLECTORS: [
    'official-news',
    'official-blog',
    'official-youtube'
  ],
  REVISION_SNIPPET_PREFIX: '[SOURCE_REVISION_CANDIDATE] ',
  OBSERVATION_NORMAL: 'NORMAL',
  OBSERVATION_REVISION: 'SOURCE_REVISION',
  WRITE_INTERVAL_MS: 380,
  MAX_CHAIN_AUDIT_ROWS: 1000
});
'@

$currentFacade = @'

// ============================================================
// CURRENT PUBLIC ENTRY POINTS
// ============================================================

function runFrequentCrawlerCurrent() {
  return runCrawlerGroupCurrent_('frequent-current', [
    collectOfficialNews_,
    collectOfficialBlogs_,
    collectOfficialYouTube_,
    collectGoogleNewsGroup_
  ], OCOS.MAX_CREATE_FREQUENT);
}

function runScheduleCrawlerCurrent() {
  return runCrawlerGroupCurrent_('schedule-current', [
    collectOfficialSchedule_
  ], OCOS.MAX_CREATE_SCHEDULE);
}

function runDailyCrawlerCurrent() {
  return runCrawlerGroupCurrent_('daily-current', [
    collectGoogleNewsCurrentMembers_,
    collectGoogleNewsGraduatedMembers_
  ], OCOS.MAX_CREATE_DAILY);
}

function runFullCrawlerChunkCurrent() {
  return runCrawlerGroupCurrent_('full-chunk-current', fullCollectors_(), OCOS.MAX_CREATE_FULL);
}

function isNearSoftLimit_(startedAt) {
  return Date.now() - startedAt >= OCOS.RUN_SOFT_LIMIT_MS;
}

/**
 * WRITE = NONE.
 * Uses the exact classifier and revision-chain planner shipped in this Current file.
 */
function previewCrawlerCurrentDecisionGate() {
  validateBaseConfig_();

  console.log('========================================');
  console.log('OC-OS INBOX CRAWLER CURRENT DECISION GATE');
  console.log(`VERSION = ${OCOS_CRAWLER_CURRENT.VERSION}`);
  console.log('WRITE = NONE');
  console.log('REVISION CHAIN MARKING = PREVIEW ONLY');
  console.log('========================================');

  const raw = []
    .concat(collectOfficialNews_() || [])
    .concat(collectOfficialBlogs_() || [])
    .concat(collectOfficialYouTube_() || []);

  const normalized = normalizeAndDeduplicateCandidates_(raw)
    .filter(isStableTargetCurrent_);

  const state = loadSeenStateCurrent_();
  const counts = {
    createNew: 0,
    createRevision: 0,
    suppressSame: 0,
    suppressFormatting: 0,
    suppressLegacy: 0,
    revisionExistingRows: 0,
    revisionExistingNeedsMark: 0,
    revisionExistingAlreadyMarked: 0,
    revisionUnexpectedObservationType: 0
  };

  const revisionPlans = [];

  normalized.forEach(item => {
    const d = classifyItemCurrent_(item, state);

    if (d.action === 'CREATE_NEW_SOURCE') counts.createNew++;
    else if (d.action === 'CREATE_SOURCE_REVISION') {
      counts.createRevision++;
      const plan = previewRevisionChainPlanCurrent_(item, d.stableKey);
      counts.revisionExistingRows += plan.rows.length;
      counts.revisionExistingNeedsMark += plan.needsMark.length;
      counts.revisionExistingAlreadyMarked += plan.alreadyMarked.length;
      counts.revisionUnexpectedObservationType += plan.unexpected.length;
      revisionPlans.push({ item, decision: d, plan });
    }
    else if (d.action === 'SUPPRESS_SAME_CONTENT') counts.suppressSame++;
    else if (d.action === 'SUPPRESS_FORMATTING_ONLY') counts.suppressFormatting++;
    else if (d.action === 'SUPPRESS_LEGACY_SEEN') counts.suppressLegacy++;
  });

  console.log(`RAW_COLLECTED = ${raw.length}`);
  console.log(`NORMALIZED_TARGET = ${normalized.length}`);
  console.log(`STABLE_STATE_KEYS = ${state.latestStableByKey.size}`);
  console.log('----------------------------------------');
  console.log(`CREATE_NEW_SOURCE = ${counts.createNew}`);
  console.log(`CREATE_SOURCE_REVISION = ${counts.createRevision}`);
  console.log(`SUPPRESS_SAME_CONTENT = ${counts.suppressSame}`);
  console.log(`SUPPRESS_FORMATTING_ONLY = ${counts.suppressFormatting}`);
  console.log(`SUPPRESS_LEGACY_SEEN = ${counts.suppressLegacy}`);
  console.log('----------------------------------------');
  console.log(`REVISION_EXISTING_PHYSICAL_ROWS = ${counts.revisionExistingRows}`);
  console.log(`REVISION_EXISTING_ROWS_NEED_MARK = ${counts.revisionExistingNeedsMark}`);
  console.log(`REVISION_EXISTING_ROWS_ALREADY_MARKED = ${counts.revisionExistingAlreadyMarked}`);
  console.log(`REVISION_UNEXPECTED_OBSERVATION_TYPE = ${counts.revisionUnexpectedObservationType}`);

  revisionPlans.forEach((x, i) => {
    console.log('----------------------------------------');
    console.log(`${i + 1}. CREATE_SOURCE_REVISION | ${x.decision.stableKey}`);
    console.log(`   current=${x.item.title}`);
    console.log(`   previous=${x.decision.latest ? x.decision.latest.title : '-'}`);
    console.log(`   physicalRows=${x.plan.rows.length} / needsMark=${x.plan.needsMark.length} / alreadyMarked=${x.plan.alreadyMarked.length} / unexpected=${x.plan.unexpected.length}`);
  });

  console.log('========================================');
  console.log(
    counts.revisionUnexpectedObservationType > 0
      ? 'RESULT = BLOCKED: unexpected Observation_Type exists in revision chain'
      : 'RESULT = SAFE PREVIEW'
  );
  console.log('PREVIEW COMPLETE / WRITE = NONE');
  console.log('========================================');
}

function installCrawlerTriggersCurrent() {
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

  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    if (legacyHandlers.includes(handler) || currentHandlers.includes(handler)) {
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

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)
$parts.Add($baseConfig)
$parts.Add($currentConfig)
$parts.Add("`r`n// ============================================================`r`n// CURRENT BASE CORE`r`n// ============================================================`r`n")
$parts.Add($baseCollectorsList)
$parts.Add($baseCore)
$parts.Add("`r`n// ============================================================`r`n// CURRENT STABLE-SOURCE CORE`r`n// ============================================================`r`n")
$parts.Add($stableCore)
$parts.Add("`r`n// ============================================================`r`n// CURRENT REVISION-CHAIN CORE`r`n// ============================================================`r`n")
$parts.Add($revisionCore)
$parts.Add($currentFacade)

$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

# Safety: syntax-check generated GAS as JavaScript without changing the source file.
$checkFile = Join-Path $runtimeDir 'OCOS_Crawler_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated crawler failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

# Safety: legacy crawler public function declarations must not ship in Current Runtime.
$forbiddenDeclarations = @(
  'function runFrequentCrawler()',
  'function runScheduleCrawler()',
  'function runDailyCrawler()',
  'function runFrequentCrawlerV127()',
  'function runScheduleCrawlerV127()',
  'function runDailyCrawlerV127()',
  'function runFrequentCrawlerV128()',
  'function runScheduleCrawlerV128()',
  'function runDailyCrawlerV128()',
  'function installCrawlerTriggersV127()',
  'function installCrawlerTriggersV128()'
)

foreach ($needle in $forbiddenDeclarations) {
  if ($text.Contains($needle)) {
    throw "Legacy public declaration leaked into Current Runtime: $needle"
  }
}

Write-Host "Generated: $outFile"
Write-Host "Mode: Current-only public runtime"
Write-Host "Syntax check: PASS"
Write-Host "Legacy public declaration check: PASS"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
