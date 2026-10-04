param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$manifestPath = Join-Path $runtimeDir 'appsscript.json'

$expectedRuntimeFiles = @(
  'OCOS_Crawler_Current.gs',
  'OCOS_Processor_Current.gs',
  'OCOS_Suggestion_Current.gs',
  'OCOS_Weekly_Current.gs',
  'OCOS_PostRecording_Current.gs',
  'OCOS_Messages_Current.gs',
  'OCOS_Calendar_Current.gs',
  'OCOS_ArchivePublishing_Current.gs',
  'OCOS_Diagnostics_Current.gs',
  'OCOS_Deployment_Bridge.gs'
)

$requiredCurrentFunctions = @(
  'runFrequentCrawlerCurrent',
  'runScheduleCrawlerCurrent',
  'runDailyCrawlerCurrent',
  'previewCrawlerCurrentDecisionGate',
  'installCrawlerTriggersCurrent',
  'auditCrawlerTriggersCurrent',
  'previewInboxProcessorCurrent',
  'runInboxProcessorCurrent',
  'installInboxProcessorHourlyTriggerCurrent',
  'auditInboxProcessorTriggersCurrent',
  'previewSuggestionCurrentProductionGate',
  'previewAndStageSuggestionCurrent',
  'commitSuggestionCurrentStage',
  'previewWeeklyEpisodeBootstrapV01',
  'createNextWeeklyEpisodeV01',
  'previewTargetEpisodeLocksV01',
  'previewStudioCandidateSeederV01',
  'generateStudioPackV01',
  'previewWeeklyReviewQueueResolverV01',
  'previewPostRecordingIntegrationV01',
  'syncPostRecordingIntegrationV01',
  'materializeFormalTranscriptDocV01',
  'onMessageFormSubmitV01',
  'installMessagesFormSubmitTriggerV01',
  'syncLabeledGmailMessagesV01',
  'previewCalendarCurrent',
  'syncCalendarCurrent',
  'previewStatementArchiveCurrent',
  'previewPublicationContextCurrent',
  'previewPublicationDraftsCurrent',
  'auditEpisodeLifecycleV01',
  'previewEpisodeCompletionGateV01',
  'reportWeeklyReadinessV01',
  'reportGasRuntimeInventoryCurrent',
  'previewDeploymentBridgeCurrent'
)

$bridgeLegacyHandlers = @(
  'runFrequentCrawler',
  'runScheduleCrawler',
  'runDailyCrawler',
  'runFrequentCrawlerV127',
  'runScheduleCrawlerV127',
  'runDailyCrawlerV127',
  'runFrequentCrawlerV128',
  'runScheduleCrawlerV128',
  'runDailyCrawlerV128',
  'runInboxProcessorV01',
  'runInboxProcessorV011',
  'runInboxProcessorV012'
)

$bridgeTargets = @{
  runFrequentCrawler = 'runFrequentCrawlerCurrent'
  runScheduleCrawler = 'runScheduleCrawlerCurrent'
  runDailyCrawler = 'runDailyCrawlerCurrent'
  runFrequentCrawlerV127 = 'runFrequentCrawlerCurrent'
  runScheduleCrawlerV127 = 'runScheduleCrawlerCurrent'
  runDailyCrawlerV127 = 'runDailyCrawlerCurrent'
  runFrequentCrawlerV128 = 'runFrequentCrawlerCurrent'
  runScheduleCrawlerV128 = 'runScheduleCrawlerCurrent'
  runDailyCrawlerV128 = 'runDailyCrawlerCurrent'
  runInboxProcessorV01 = 'runInboxProcessorCurrent'
  runInboxProcessorV011 = 'runInboxProcessorCurrent'
  runInboxProcessorV012 = 'runInboxProcessorCurrent'
}

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Pass([string]$Message) { Write-Host ('PASS  ' + $Message) }
function Fail([string]$Message) {
  $script:failures.Add($Message)
  Write-Host ('FAIL  ' + $Message)
}
function Warn([string]$Message) {
  $script:warnings.Add($Message)
  Write-Host ('WARN  ' + $Message)
}

Write-Host '============================================================'
Write-Host 'OC-OS APPS SCRIPT RUNTIME PRE-PUSH STATIC AUDIT'
Write-Host 'WRITE = NONE'
Write-Host '============================================================'

if (-not (Test-Path $runtimeDir)) {
  throw "Runtime directory not found: $runtimeDir"
}

# -----------------------------------------------------------------
# 1. Exact runtime file set
# -----------------------------------------------------------------
$actualGs = Get-ChildItem -Path $runtimeDir -File -Filter '*.gs' | Select-Object -ExpandProperty Name | Sort-Object
$expectedGs = $expectedRuntimeFiles | Sort-Object

$missingFiles = @($expectedGs | Where-Object { $_ -notin $actualGs })
$extraFiles = @($actualGs | Where-Object { $_ -notin $expectedGs })

if ($missingFiles.Count -eq 0) { Pass 'All expected Runtime .gs files exist.' }
else { Fail ('Missing Runtime file(s): ' + ($missingFiles -join ', ')) }

if ($extraFiles.Count -eq 0) { Pass 'No unexpected Runtime .gs files.' }
else { Fail ('Unexpected Runtime .gs file(s): ' + ($extraFiles -join ', ')) }

# -----------------------------------------------------------------
# 2. Manifest preservation
# -----------------------------------------------------------------
if (-not (Test-Path $manifestPath)) {
  Fail 'appsscript.json missing.'
} else {
  try {
    $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
    if ($manifest.timeZone -eq 'Asia/Tokyo') { Pass 'Manifest timezone = Asia/Tokyo.' }
    else { Fail ('Manifest timezone unexpected: ' + [string]$manifest.timeZone) }

    if ($manifest.runtimeVersion -eq 'V8') { Pass 'Manifest runtimeVersion = V8.' }
    else { Fail ('Manifest runtimeVersion unexpected: ' + [string]$manifest.runtimeVersion) }

    if ($manifest.exceptionLogging -eq 'STACKDRIVER') { Pass 'Manifest exceptionLogging = STACKDRIVER.' }
    else { Fail ('Manifest exceptionLogging unexpected: ' + [string]$manifest.exceptionLogging) }

    $libs = @($manifest.dependencies.libraries)
    $cheerio = @($libs | Where-Object {
      $_.userSymbol -eq 'Cheerio' -and
      [string]$_.version -eq '16' -and
      $_.libraryId -eq '1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0'
    })
    if ($cheerio.Count -eq 1) { Pass 'Manifest Cheerio v16 library preserved.' }
    else { Fail 'Manifest Cheerio v16 library is missing or changed.' }
  } catch {
    Fail ('Manifest parse failed: ' + $_.Exception.Message)
  }
}

# -----------------------------------------------------------------
# 3. Per-file and combined JavaScript syntax
# -----------------------------------------------------------------
$runtimeFiles = Get-ChildItem -Path $runtimeDir -File -Filter '*.gs' | Sort-Object Name
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tempFiles = New-Object System.Collections.Generic.List[string]

try {
  foreach ($file in $runtimeFiles) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $tmp = Join-Path $runtimeDir ($file.BaseName + '.audit.check.js')
    [System.IO.File]::WriteAllText($tmp, $text, $utf8NoBom)
    $tempFiles.Add($tmp)
    & node --check $tmp 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail ('Node syntax check failed: ' + $file.Name) }
  }

  if ($failures.Count -eq 0) { Pass 'Per-file node --check passed.' }

  $combinedPath = Join-Path $runtimeDir 'OCOS_Runtime_All.audit.check.js'
  $combinedParts = New-Object System.Collections.Generic.List[string]
  foreach ($file in $runtimeFiles) {
    $combinedParts.Add("`r`n// ===== FILE: $($file.Name) =====`r`n")
    $combinedParts.Add([System.IO.File]::ReadAllText($file.FullName))
  }
  [System.IO.File]::WriteAllText($combinedPath, [string]::Join("`r`n", $combinedParts), $utf8NoBom)
  $tempFiles.Add($combinedPath)
  & node --check $combinedPath 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass 'Combined Runtime node --check passed (cross-file lexical scope).' }
  else { Fail 'Combined Runtime node --check failed; likely cross-file lexical collision.' }
} finally {
  foreach ($tmp in $tempFiles) {
    if (Test-Path $tmp) { Remove-Item -Force $tmp }
  }
}

# -----------------------------------------------------------------
# 4. Cross-file function / const declaration uniqueness
# -----------------------------------------------------------------
$functionOwners = @{}
$constOwners = @{}
$fileTexts = @{}

foreach ($file in $runtimeFiles) {
  $text = [System.IO.File]::ReadAllText($file.FullName)
  $fileTexts[$file.Name] = $text

  $fnMatches = [regex]::Matches($text, '(?m)^\s*function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
  foreach ($m in $fnMatches) {
    $name = $m.Groups[1].Value
    if (-not $functionOwners.ContainsKey($name)) { $functionOwners[$name] = New-Object System.Collections.Generic.List[string] }
    $functionOwners[$name].Add($file.Name)
  }

  $constMatches = [regex]::Matches($text, '(?m)^\s*const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=')
  foreach ($m in $constMatches) {
    $name = $m.Groups[1].Value
    if (-not $constOwners.ContainsKey($name)) { $constOwners[$name] = New-Object System.Collections.Generic.List[string] }
    $constOwners[$name].Add($file.Name)
  }
}

$duplicateFunctions = @($functionOwners.Keys | Where-Object { $functionOwners[$_].Count -gt 1 } | Sort-Object)
$duplicateConsts = @($constOwners.Keys | Where-Object { $constOwners[$_].Count -gt 1 } | Sort-Object)

if ($duplicateFunctions.Count -eq 0) { Pass 'No duplicate top-level function declarations across Runtime files.' }
else {
  foreach ($name in $duplicateFunctions) {
    Fail ("Duplicate function $name => " + (($functionOwners[$name] | Sort-Object) -join ', '))
  }
}

if ($duplicateConsts.Count -eq 0) { Pass 'No duplicate top-level const declarations across Runtime files.' }
else {
  foreach ($name in $duplicateConsts) {
    Fail ("Duplicate const $name => " + (($constOwners[$name] | Sort-Object) -join ', '))
  }
}

# -----------------------------------------------------------------
# 5. Required Current surface
# -----------------------------------------------------------------
$allText = [string]::Join("`r`n", @($fileTexts.Values))
foreach ($fn in $requiredCurrentFunctions) {
  if ($functionOwners.ContainsKey($fn) -and $functionOwners[$fn].Count -eq 1) {
    # quiet per function
  } else {
    Fail ('Required Current function missing or duplicated: ' + $fn)
  }
}
if (-not ($requiredCurrentFunctions | Where-Object { -not $functionOwners.ContainsKey($_) })) {
  Pass 'Required Current public/runtime surface is present.'
}

# -----------------------------------------------------------------
# 6. Deployment Bridge isolation and exact delegation
# -----------------------------------------------------------------
$bridgeName = 'OCOS_Deployment_Bridge.gs'
$bridgeText = $fileTexts[$bridgeName]
foreach ($legacy in $bridgeLegacyHandlers) {
  if (-not $functionOwners.ContainsKey($legacy)) {
    Fail ('Deployment Bridge legacy handler missing: ' + $legacy)
    continue
  }

  $owners = @($functionOwners[$legacy])
  if ($owners.Count -ne 1 -or $owners[0] -ne $bridgeName) {
    Fail ('Legacy handler must exist only in Deployment Bridge: ' + $legacy + ' => ' + ($owners -join ', '))
  }

  $target = $bridgeTargets[$legacy]
  if (-not $functionOwners.ContainsKey($target)) {
    Fail ('Deployment Bridge target missing: ' + $legacy + ' -> ' + $target)
  }

  $pattern = 'function\s+' + [regex]::Escape($legacy) + '\s*\(\s*\)\s*\{\s*return\s+' + [regex]::Escape($target) + '\s*\(\s*\)\s*;?\s*\}'
  if (-not [regex]::IsMatch($bridgeText, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    Fail ('Deployment Bridge delegation is not exact: ' + $legacy + ' -> ' + $target)
  }
}
if ($failures.Count -eq 0) { Pass 'Deployment Bridge handlers are isolated and delegate to Current targets.' }

# Explicitly forbidden legacy modules must not be present as Runtime declarations.
$forbiddenLegacySymbols = @(
  'syncEpisodeCalendarBridgeV01',
  'seedPublicationPlanV01'
)
foreach ($symbol in $forbiddenLegacySymbols) {
  if ($functionOwners.ContainsKey($symbol)) {
    Fail ('Forbidden legacy Runtime symbol present: ' + $symbol)
  }
}

# -----------------------------------------------------------------
# 7. Current trigger migration tools
# -----------------------------------------------------------------
$triggerMigrationFunctions = @(
  'installCrawlerTriggersCurrent',
  'auditCrawlerTriggersCurrent',
  'installInboxProcessorHourlyTriggerCurrent',
  'auditInboxProcessorTriggersCurrent',
  'installMessagesFormSubmitTriggerV01',
  'reportGasRuntimeInventoryCurrent'
)
$missingTriggerTools = @($triggerMigrationFunctions | Where-Object { -not $functionOwners.ContainsKey($_) })
if ($missingTriggerTools.Count -eq 0) { Pass 'Trigger migration/audit functions are available.' }
else { Fail ('Trigger migration/audit function(s) missing: ' + ($missingTriggerTools -join ', ')) }

# -----------------------------------------------------------------
# 8. Known cross-family dependencies
# -----------------------------------------------------------------
$dependencyFunctions = @(
  'actualsV01BuildPlan_',
  'postV02BuildPlan_',
  'postV02GetTargetEpisode_',
  'postV02PatchPage_',
  'transcriptV01BuildPlan_'
)
$missingDependencies = @($dependencyFunctions | Where-Object { -not $functionOwners.ContainsKey($_) })
if ($missingDependencies.Count -eq 0) { Pass 'Known PostRecording/Calendar/Diagnostics cross-family dependencies are present.' }
else { Fail ('Known cross-family dependency missing: ' + ($missingDependencies -join ', ')) }

# -----------------------------------------------------------------
# 9. Script Property names (presence is runtime-only; static audit lists references)
# -----------------------------------------------------------------
$propertyNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($file in $runtimeFiles) {
  $text = $fileTexts[$file.Name]
  $matches = [regex]::Matches($text, "getProperty\(\s*['\"]([^'\"]+)['\"]\s*\)")
  foreach ($m in $matches) { [void]$propertyNames.Add($m.Groups[1].Value) }
}
Write-Host ('INFO  Static Script Property references: ' + (($propertyNames | Sort-Object) -join ', '))
Warn 'Static audit cannot verify actual Script Property values; Current Runtime Audit will verify presence after deployment.'

# -----------------------------------------------------------------
# 10. Safety invariants
# -----------------------------------------------------------------
if ($fileTexts['OCOS_Calendar_Current.gs'] -match 'AUTO_TRIGGER:\s*false') { Pass 'Calendar remains manual Pilot; no auto trigger flag.' }
else { Warn 'Calendar AUTO_TRIGGER:false marker not found.' }

if ($fileTexts['OCOS_Suggestion_Current.gs'] -match 'AUTO_TRIGGER:\s*false') { Pass 'Suggestion remains Pilot; no automatic trigger flag.' }
else { Warn 'Suggestion AUTO_TRIGGER:false marker not found.' }

if ($fileTexts['OCOS_Deployment_Bridge.gs'] -match 'TEMPORARY:\s*true') { Pass 'Deployment Bridge marked TEMPORARY.' }
else { Fail 'Deployment Bridge is not marked TEMPORARY:true.' }

Write-Host '============================================================'
Write-Host ('FAILURES = ' + $failures.Count)
Write-Host ('WARNINGS = ' + $warnings.Count)
if ($failures.Count -eq 0) {
  Write-Host 'RESULT = STATIC AUDIT PASS'
  Write-Host 'NOTE = This does NOT authorize clasp push by itself; review current trigger state and migration sequence next.'
  exit 0
} else {
  Write-Host 'RESULT = STATIC AUDIT FAIL'
  Write-Host 'DO NOT RUN clasp push.'
  exit 1
}
