param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_Messages_Current.gs'

$sources = @(
  @{ Name = 'MESSAGES Form Sync v0.1.1 / PRODUCTION'; Path = (Join-Path $gasDir 'oc_os_messages_form_sync_v0.1.1.gs') },
  @{ Name = 'MESSAGES Gmail Preview v0.1.2 / PILOT'; Path = (Join-Path $gasDir 'oc_os_messages_gmail_preview_v0.1.2.gs') },
  @{ Name = 'MESSAGES Gmail Manual Sync v0.1.0 / PILOT'; Path = (Join-Path $gasDir 'oc_os_messages_gmail_sync_v0.1.0.gs') }
)

foreach ($src in $sources) {
  if (-not (Test-Path $src.Path)) { throw "Missing source: $($src.Path)" }
}

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$header = @'
/**
 * OC-OS Messages Current - mixed Production/Pilot Runtime family
 *
 * Runtime policy:
 * - Google Form -> MESSAGES v0.1.1 is the confirmed Production route.
 * - Gmail label route remains Pilot/manual; no time trigger is installed here.
 * - Gmail eligibility is controlled only by label OC-OS/MESSAGES.
 * - No AI classification is used for Gmail intake.
 * - Own-domain replies are excluded from Gmail listener-message intake.
 * - Existing public handler names are preserved for trigger compatibility.
 */
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)

foreach ($src in $sources) {
  $body = [System.IO.File]::ReadAllText($src.Path)
  $parts.Add("`r`n// ============================================================`r`n// CURRENT FAMILY SOURCE: $($src.Name)`r`n// ============================================================`r`n")
  $parts.Add($body)
}

$facade = @'

// ============================================================
// CURRENT FAMILY METADATA / SAFE FACADE
// ============================================================

const OCOS_MESSAGES_CURRENT = Object.freeze({
  VERSION: 'current-2026-10-04',
  FORM_ROUTE: 'PRODUCTION',
  GMAIL_ROUTE: 'PILOT_MANUAL',
  GMAIL_AUTO_TRIGGER: false
});

function previewMessagesCurrentFormLatest() {
  return previewLatestMessageFormRowV01();
}

function repairMessagesCurrentFormRecent() {
  return repairRecentMessagesFormV01();
}

function previewMessagesCurrentGmail() {
  return previewLabeledGmailMessagesSyncV01();
}

function syncMessagesCurrentGmailManual() {
  return syncLabeledGmailMessagesV01();
}
'@

$parts.Add($facade)
$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

$checkFile = Join-Path $runtimeDir 'OCOS_Messages_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Messages runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

# Reject duplicate function declarations across the consolidated family.
$matches = [regex]::Matches($text, '(?m)^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
$dupes = $matches | ForEach-Object { $_.Groups[1].Value } | Group-Object | Where-Object { $_.Count -gt 1 }
if ($dupes) {
  throw ('Duplicate function declarations: ' + (($dupes | ForEach-Object { $_.Name + ' x' + $_.Count }) -join ', '))
}

$required = @(
  'function onMessageFormSubmitV01(',
  'function installMessagesFormSubmitTriggerV01(',
  'function previewLabeledGmailMessagesV01(',
  'function previewLabeledGmailMessagesSyncV01(',
  'function syncLabeledGmailMessagesV01(',
  'function previewMessagesCurrentFormLatest(',
  'function previewMessagesCurrentGmail('
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) { throw "Required Messages declaration missing: $needle" }
}

# Gmail route must not gain a time-trigger installer in this family.
if ($text -match 'function\s+install.*Gmail.*Trigger') {
  throw 'Unexpected Gmail trigger installer detected in Messages Current runtime.'
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Mode: Messages Current / Form Production + Gmail Pilot Manual"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Form handler compatibility check: PASS"
Write-Host "Gmail automatic trigger: NONE"
Write-Host "Next: clasp.cmd status"
Write-Host "Do NOT run clasp push yet."
