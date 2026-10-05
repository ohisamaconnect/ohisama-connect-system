param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$sourcePath = Join-Path $RepoRoot 'gas\hha_member_maintenance_v0.1.2.gs'
$supersededPath = Join-Path $RepoRoot 'gas\hha_member_maintenance_v0.1.1.gs'
$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Pass([string]$m) { Write-Host ('PASS  ' + $m) }
function Fail([string]$m) { $script:failures.Add($m); Write-Host ('FAIL  ' + $m) }
function Warn([string]$m) { $script:warnings.Add($m); Write-Host ('WARN  ' + $m) }

Write-Host '============================================================'
Write-Host 'HHA MEMBER MAINTENANCE v0.1.2 STATIC AUDIT'
Write-Host 'WRITE = NONE'
Write-Host '============================================================'

if (-not (Test-Path $sourcePath)) { Fail ('Pilot source missing: ' + $sourcePath) }
else { Pass 'Pilot v0.1.2 source exists.' }

if (Test-Path $supersededPath) { Fail 'Superseded v0.1.1 remains on main working tree.' }
else { Pass 'Superseded v0.1.1 is absent from working tree.' }

if ($failures.Count -eq 0) {
  $text = [System.IO.File]::ReadAllText($sourcePath)

  # 1. JavaScript syntax check. GAS source is copied to .js so node --check
  # does not depend on the .gs extension.
  $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) 'hha_member_maintenance_v0.1.2.audit.js'
  try {
    [System.IO.File]::WriteAllText($tempPath, $text, (New-Object System.Text.UTF8Encoding($false)))
    & node --check $tempPath 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Pass 'node --check passed.' }
    else { Fail 'node --check failed.' }
  } finally {
    if (Test-Path $tempPath) { Remove-Item -Force $tempPath }
  }

  # 2. Safety contract markers.
  $safetyMarkers = @(
    'AUTO_TRIGGER:\s*false',
    'NOTION_WRITE:\s*false',
    'CANONICAL_AUTO_UPDATE:\s*false'
  )
  foreach ($pattern in $safetyMarkers) {
    if ($text -match $pattern) { Pass ('Safety marker present: ' + $pattern) }
    else { Fail ('Safety marker missing: ' + $pattern) }
  }

  # 3. Required preview entry points.
  $requiredFunctions = @(
    'previewHhaMemberMaintenanceV012',
    'previewHhaMemberCanonicalIntegrityV012',
    'previewHhaMemberRosterMaintenanceV012',
    'previewHhaMemberProfileMaintenanceV012'
  )
  foreach ($fn in $requiredFunctions) {
    if ($text -match ('(?m)^\s*function\s+' + [regex]::Escape($fn) + '\s*\(')) { Pass ('Required preview function present: ' + $fn) }
    else { Fail ('Required preview function missing: ' + $fn) }
  }

  # 4. Candidate vocabulary required by the Contract.
  $requiredCandidates = @(
    'NEW_OFFICIAL_MEMBER',
    'ACTIVE_MISSING_FROM_OFFICIAL_ROSTER',
    'OFFICIAL_MEMBER_ID_MISMATCH',
    'OFFICIAL_NAME_MISMATCH',
    'OFFICIAL_PROFILE_URL_MISMATCH',
    'PROFILE_NAME_DIFF',
    'PROFILE_KANA_DIFF',
    'PROFILE_ROMANIZED_NAME_DIFF',
    'PROFILE_BIRTHDAY_DIFF',
    'PROFILE_HEIGHT_DIFF',
    'PROFILE_HOMETOWN_DIFF',
    'PROFILE_BLOOD_TYPE_DIFF',
    'ROSTER_FETCH_ERROR',
    'ROSTER_PARSE_ERROR',
    'PROFILE_FETCH_ERROR',
    'PROFILE_PARSE_ERROR'
  )
  foreach ($candidate in $requiredCandidates) {
    if ($text.Contains($candidate)) { Pass ('Candidate marker present: ' + $candidate) }
    else { Fail ('Candidate marker missing: ' + $candidate) }
  }

  if ($text.Contains('NONCURRENT_CANONICAL_STILL_VISIBLE_ON_OFFICIAL_ROSTER')) {
    Pass 'Known non-current roster residue is classified as informational observation.'
  } else {
    Fail 'Non-current roster residue guard is missing.'
  }

  # 5. Old orphaned watcher handlers must not be revived.
  $forbiddenLegacyFunctions = @(
    'runHhaMemberRosterWatch',
    'runHhaMemberCanonicalAudit',
    'runHhaMemberProfileWatch'
  )
  foreach ($fn in $forbiddenLegacyFunctions) {
    if ($text -match ('(?m)^\s*function\s+' + [regex]::Escape($fn) + '\s*\(')) { Fail ('Legacy orphan handler revived: ' + $fn) }
    else { Pass ('Legacy orphan handler absent: ' + $fn) }
  }

  # 6. Pilot must not install Apps Script triggers or write Notion pages.
  $forbiddenWritePatterns = @(
    'ScriptApp\.newTrigger',
    '/v1/pages',
    '/v1/databases',
    'method\s*:\s*["'']patch["'']',
    'method\s*:\s*["'']delete["'']'
  )
  foreach ($pattern in $forbiddenWritePatterns) {
    if ($text -match $pattern) { Fail ('Forbidden write/trigger pattern found: ' + $pattern) }
    else { Pass ('Forbidden write/trigger pattern absent: ' + $pattern) }
  }

  # 7. Source identity and parser safety expectations.
  if ($text -match 'HHA_MEMBERS_DATA_SOURCE_ID:\s*["'']df86e0ba-5478-4fc6-b30a-49cb1bd6c83d["'']') {
    Pass 'Canonical HHA MEMBERS data source ID matches Contract.'
  } else {
    Fail 'Canonical HHA MEMBERS data source ID differs from Contract.'
  }

  if ($text.Contains('display\s*:\s*none')) { Pass 'Roster parser contains hidden-member CSS exclusion logic.' }
  else { Fail 'Hidden-member CSS exclusion logic marker is missing.' }

  if ($text.Contains('byId[item.officialMemberId]')) { Pass 'Roster parser contains Official_Member_ID de-duplication logic.' }
  else { Fail 'Official_Member_ID de-duplication logic marker is missing.' }

  if ($text -match 'PROFILE_MAX_PER_RUN:\s*60') { Pass 'Profile run safety cap is present.' }
  else { Warn 'Expected profile run safety cap was not recognized.' }

  if ($text -match '(?m)^\s*function\s+hhaMmNormalizeKanaV012_\s*\(') {
    Pass 'Kana-aware normalizer is present.'
  } else {
    Fail 'Kana-aware normalizer is missing.'
  }

  if ($text.Contains('canonical.nameKana, observed.nameKana, hhaMmNormalizeKanaV012_);')) {
    Pass 'Name_Kana comparison uses Kana-aware normalizer.'
  } else {
    Fail 'Name_Kana comparison does not use Kana-aware normalizer.'
  }
}

Write-Host '============================================================'
Write-Host ('FAILURES = ' + $failures.Count)
Write-Host ('WARNINGS = ' + $warnings.Count)
if ($failures.Count -eq 0) {
  Write-Host 'RESULT = HHA MEMBER MAINTENANCE STATIC AUDIT PASS'
  exit 0
}
Write-Host 'RESULT = HHA MEMBER MAINTENANCE STATIC AUDIT FAIL'
Write-Host 'DO NOT PROMOTE TO apps-script/runtime.'
exit 1
