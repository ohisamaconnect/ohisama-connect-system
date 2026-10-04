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

$requiredFunctions = @(
  'runFrequentCrawlerCurrent','runScheduleCrawlerCurrent','runDailyCrawlerCurrent',
  'previewCrawlerCurrentDecisionGate','installCrawlerTriggersCurrent','auditCrawlerTriggersCurrent',
  'previewInboxProcessorCurrent','runInboxProcessorCurrent',
  'installInboxProcessorHourlyTriggerCurrent','auditInboxProcessorTriggersCurrent',
  'previewSuggestionCurrentProductionGate','previewAndStageSuggestionCurrent','commitSuggestionCurrentStage',
  'previewWeeklyEpisodeBootstrapV01','createNextWeeklyEpisodeV01','previewTargetEpisodeLocksV01',
  'previewStudioCandidateSeederV01','generateStudioPackV01','previewWeeklyReviewQueueResolverV01',
  'previewPostRecordingIntegrationV01','syncPostRecordingIntegrationV01','materializeFormalTranscriptDocV01',
  'onMessageFormSubmitV01','installMessagesFormSubmitTriggerV01','syncLabeledGmailMessagesV01',
  'previewCalendarCurrent','syncCalendarCurrent',
  'previewStatementArchiveCurrent','previewPublicationContextCurrent','previewPublicationDraftsCurrent',
  'auditEpisodeLifecycleV01','previewEpisodeCompletionGateV01','reportWeeklyReadinessV01',
  'reportGasRuntimeInventoryCurrent','previewDeploymentBridgeCurrent'
)

$bridgeTargets = [ordered]@{
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

function Pass([string]$m) { Write-Host ('PASS  ' + $m) }
function Fail([string]$m) { $script:failures.Add($m); Write-Host ('FAIL  ' + $m) }
function Warn([string]$m) { $script:warnings.Add($m); Write-Host ('WARN  ' + $m) }

Write-Host '============================================================'
Write-Host 'OC-OS APPS SCRIPT RUNTIME PRE-PUSH STATIC AUDIT'
Write-Host 'WRITE = NONE'
Write-Host '============================================================'

if (-not (Test-Path $runtimeDir)) { throw "Runtime directory not found: $runtimeDir" }

# 1. Runtime file set
$actualGs = @(Get-ChildItem $runtimeDir -File -Filter '*.gs' | ForEach-Object { $_.Name } | Sort-Object)
$expectedGs = @($expectedRuntimeFiles | Sort-Object)
$missing = @($expectedGs | Where-Object { $_ -notin $actualGs })
$extra = @($actualGs | Where-Object { $_ -notin $expectedGs })
if ($missing.Count -eq 0) { Pass 'All expected Runtime .gs files exist.' } else { Fail ('Missing Runtime file(s): ' + ($missing -join ', ')) }
if ($extra.Count -eq 0) { Pass 'No unexpected Runtime .gs files.' } else { Fail ('Unexpected Runtime .gs file(s): ' + ($extra -join ', ')) }

# 2. Manifest
if (-not (Test-Path $manifestPath)) {
  Fail 'appsscript.json missing.'
} else {
  try {
    $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
    if ($manifest.timeZone -eq 'Asia/Tokyo') { Pass 'Manifest timezone preserved.' } else { Fail ('Manifest timezone unexpected: ' + [string]$manifest.timeZone) }
    if ($manifest.runtimeVersion -eq 'V8') { Pass 'Manifest V8 runtime preserved.' } else { Fail ('Manifest runtimeVersion unexpected: ' + [string]$manifest.runtimeVersion) }
    if ($manifest.exceptionLogging -eq 'STACKDRIVER') { Pass 'Manifest STACKDRIVER logging preserved.' } else { Fail ('Manifest exceptionLogging unexpected: ' + [string]$manifest.exceptionLogging) }
    $libs = @($manifest.dependencies.libraries)
    $cheerio = @($libs | Where-Object {
      $_.userSymbol -eq 'Cheerio' -and [string]$_.version -eq '16' -and
      $_.libraryId -eq '1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0'
    })
    if ($cheerio.Count -eq 1) { Pass 'Manifest Cheerio v16 preserved.' } else { Fail 'Manifest Cheerio v16 missing or changed.' }
  } catch { Fail ('Manifest parse failed: ' + $_.Exception.Message) }
}

# 3. Load source and run syntax checks
$runtimeFiles = @(Get-ChildItem $runtimeDir -File -Filter '*.gs' | Sort-Object Name)
$fileTexts = @{}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$temp = New-Object System.Collections.Generic.List[string]
$perFileSyntaxOk = $true
try {
  foreach ($file in $runtimeFiles) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $fileTexts[$file.Name] = $text
    $tmp = Join-Path $runtimeDir ($file.BaseName + '.audit.check.js')
    [System.IO.File]::WriteAllText($tmp, $text, $utf8)
    $temp.Add($tmp)
    & node --check $tmp 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $perFileSyntaxOk = $false; Fail ('Node syntax check failed: ' + $file.Name) }
  }
  if ($perFileSyntaxOk) { Pass 'Per-file node --check passed.' }

  $combined = Join-Path $runtimeDir 'OCOS_Runtime_All.audit.check.js'
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($file in $runtimeFiles) {
    $parts.Add("`r`n// ===== FILE: $($file.Name) =====`r`n")
    $parts.Add($fileTexts[$file.Name])
  }
  [System.IO.File]::WriteAllText($combined, [string]::Join("`r`n", $parts), $utf8)
  $temp.Add($combined)
  & node --check $combined 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass 'Combined Runtime node --check passed.' } else { Fail 'Combined Runtime node --check failed; cross-file lexical collision likely.' }
} finally {
  foreach ($p in $temp) { if (Test-Path $p) { Remove-Item -Force $p } }
}

# 4. Cross-file declaration uniqueness
$functionOwners = @{}
$constOwners = @{}
foreach ($file in $runtimeFiles) {
  $text = $fileTexts[$file.Name]
  foreach ($m in [regex]::Matches($text, '(?m)^\s*function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')) {
    $n = $m.Groups[1].Value
    if (-not $functionOwners.ContainsKey($n)) { $functionOwners[$n] = New-Object System.Collections.Generic.List[string] }
    $functionOwners[$n].Add($file.Name)
  }
  foreach ($m in [regex]::Matches($text, '(?m)^\s*const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=')) {
    $n = $m.Groups[1].Value
    if (-not $constOwners.ContainsKey($n)) { $constOwners[$n] = New-Object System.Collections.Generic.List[string] }
    $constOwners[$n].Add($file.Name)
  }
}

$dupFn = @($functionOwners.Keys | Where-Object { $functionOwners[$_].Count -gt 1 } | Sort-Object)
$dupConst = @($constOwners.Keys | Where-Object { $constOwners[$_].Count -gt 1 } | Sort-Object)
if ($dupFn.Count -eq 0) { Pass 'No duplicate top-level functions across Runtime files.' } else {
  foreach ($n in $dupFn) { Fail ("Duplicate function $n => " + (($functionOwners[$n] | Sort-Object) -join ', ')) }
}
if ($dupConst.Count -eq 0) { Pass 'No duplicate top-level const declarations across Runtime files.' } else {
  foreach ($n in $dupConst) { Fail ("Duplicate const $n => " + (($constOwners[$n] | Sort-Object) -join ', ')) }
}

# 5. Required surface
$missingFns = @($requiredFunctions | Where-Object { -not $functionOwners.ContainsKey($_) -or $functionOwners[$_].Count -ne 1 })
if ($missingFns.Count -eq 0) { Pass 'Required Current public/runtime surface is present.' } else { Fail ('Required function(s) missing/duplicated: ' + ($missingFns -join ', ')) }

# 6. Deployment Bridge isolation and delegation
$bridgeFile = 'OCOS_Deployment_Bridge.gs'
$bridgeText = $fileTexts[$bridgeFile]
$bridgeOk = $true
foreach ($legacy in $bridgeTargets.Keys) {
  if (-not $functionOwners.ContainsKey($legacy)) { Fail ('Bridge legacy handler missing: ' + $legacy); $bridgeOk = $false; continue }
  $owners = @($functionOwners[$legacy])
  if ($owners.Count -ne 1 -or $owners[0] -ne $bridgeFile) { Fail ('Legacy handler must exist only in Bridge: ' + $legacy + ' => ' + ($owners -join ', ')); $bridgeOk = $false }
  $target = $bridgeTargets[$legacy]
  if (-not $functionOwners.ContainsKey($target)) { Fail ('Bridge target missing: ' + $legacy + ' -> ' + $target); $bridgeOk = $false }
  $pattern = 'function\s+' + [regex]::Escape($legacy) + '\s*\(\s*\)\s*\{\s*return\s+' + [regex]::Escape($target) + '\s*\(\s*\)\s*;?\s*\}'
  if (-not [regex]::IsMatch($bridgeText, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) { Fail ('Bridge delegation not exact: ' + $legacy + ' -> ' + $target); $bridgeOk = $false }
}
if ($bridgeOk) { Pass 'Deployment Bridge is isolated and delegates exactly to Current handlers.' }

foreach ($forbidden in @('syncEpisodeCalendarBridgeV01','seedPublicationPlanV01')) {
  if ($functionOwners.ContainsKey($forbidden)) { Fail ('Forbidden legacy Runtime symbol present: ' + $forbidden) }
}

# 7. Cross-family dependencies and migration tools
$requiredDeps = @(
  'actualsV01BuildPlan_','postV02BuildPlan_','postV02GetTargetEpisode_',
  'postV02PatchPage_','transcriptV01BuildPlan_'
)
$missingDeps = @($requiredDeps | Where-Object { -not $functionOwners.ContainsKey($_) })
if ($missingDeps.Count -eq 0) { Pass 'Known cross-family dependencies are present.' } else { Fail ('Cross-family dependency missing: ' + ($missingDeps -join ', ')) }

$triggerTools = @(
  'installCrawlerTriggersCurrent','auditCrawlerTriggersCurrent',
  'installInboxProcessorHourlyTriggerCurrent','auditInboxProcessorTriggersCurrent',
  'installMessagesFormSubmitTriggerV01','reportGasRuntimeInventoryCurrent'
)
$missingTriggerTools = @($triggerTools | Where-Object { -not $functionOwners.ContainsKey($_) })
if ($missingTriggerTools.Count -eq 0) { Pass 'Trigger migration/audit tools are present.' } else { Fail ('Trigger migration/audit tool missing: ' + ($missingTriggerTools -join ', ')) }

# 8. Static Script Property reference inventory
$propertyPattern = 'getProperty\(\s*[''"]([^''"]+)[''"]\s*\)'
$propertyNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($file in $runtimeFiles) {
  foreach ($m in [regex]::Matches($fileTexts[$file.Name], $propertyPattern)) { [void]$propertyNames.Add($m.Groups[1].Value) }
}
Write-Host ('INFO  Script Property references: ' + (($propertyNames | Sort-Object) -join ', '))
Warn 'Static audit cannot verify actual Script Property values; post-deploy Current Runtime Audit must verify presence.'

# 9. Safety markers
if ($fileTexts['OCOS_Suggestion_Current.gs'] -match 'AUTO_TRIGGER:\s*false') { Pass 'Suggestion remains no-auto-trigger Pilot.' } else { Warn 'Suggestion AUTO_TRIGGER:false marker not found.' }
if ($fileTexts['OCOS_Calendar_Current.gs'] -match 'AUTO_TRIGGER:\s*false') { Pass 'Calendar remains no-auto-trigger Pilot.' } else { Warn 'Calendar AUTO_TRIGGER:false marker not found.' }
if ($fileTexts['OCOS_ArchivePublishing_Current.gs'] -match 'AUTO_TRIGGER:\s*false') { Pass 'Archive/Publishing remains no-auto-trigger Pilot.' } else { Warn 'Archive/Publishing AUTO_TRIGGER:false marker not found.' }
if ($fileTexts['OCOS_Deployment_Bridge.gs'] -match 'TEMPORARY:\s*true') { Pass 'Deployment Bridge is marked temporary.' } else { Fail 'Deployment Bridge TEMPORARY:true marker missing.' }

Write-Host '============================================================'
Write-Host ('FAILURES = ' + $failures.Count)
Write-Host ('WARNINGS = ' + $warnings.Count)
if ($failures.Count -eq 0) {
  Write-Host 'RESULT = STATIC AUDIT PASS'
  Write-Host 'NOTE = Do not clasp push yet; review trigger state and migration sequence next.'
  exit 0
}
Write-Host 'RESULT = STATIC AUDIT FAIL'
Write-Host 'DO NOT RUN clasp push.'
exit 1
