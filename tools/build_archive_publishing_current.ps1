param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$gasDir = Join-Path $RepoRoot 'gas'
$runtimeDir = Join-Path $RepoRoot 'apps-script\runtime'
$outFile = Join-Path $runtimeDir 'OCOS_ArchivePublishing_Current.gs'

$sources = @(
  @{ Name = 'STATEMENTS Candidate Importer'; Path = (Join-Path $gasDir 'oc_os_statement_candidate_importer_v0.1.0.gs') },
  @{ Name = 'Publication Context Builder'; Path = (Join-Path $gasDir 'oc_os_publication_context_builder_v0.1.0.gs') },
  @{ Name = 'Publication Draft Importer'; Path = (Join-Path $gasDir 'oc_os_publication_draft_importer_v0.1.0.gs') }
)

foreach ($src in $sources) {
  if (-not (Test-Path $src.Path)) { throw "Missing source: $($src.Path)" }
}
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir | Out-Null }

$header = @'
/**
 * OC-OS Archive / Publishing Current - PILOT Runtime
 *
 * Pipeline:
 *   Transcript -> STATEMENT candidates -> human review -> Publication context
 *   -> AI draft artifact -> PUBLICATIONS drafts -> human publication decision.
 *
 * Safety:
 * - STATEMENTS are created only as candidates.
 * - PUBLICATIONS are created only as drafts.
 * - No module confirms a statement or publishes content automatically.
 * - WRITE paths require explicit OC_TARGET_EPISODE_KEY where defined upstream.
 * - No automatic trigger is installed by this family.
 */
'@

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add($header)
foreach ($src in $sources) {
  $body = [System.IO.File]::ReadAllText($src.Path)
  $parts.Add("`r`n// ============================================================`r`n// CURRENT SOURCE: $($src.Name)`r`n// ============================================================`r`n")
  $parts.Add($body)
}

$facade = @'

// ============================================================
// CURRENT PILOT PUBLIC FACADE
// ============================================================

const OCOS_ARCHIVE_PUBLISHING_CURRENT = Object.freeze({
  VERSION: 'current-pilot-2026-10-04',
  STATUS: 'PILOT',
  AUTO_TRIGGER: false
});

function previewStatementArchiveCurrent() {
  return previewStatementCandidateImportV01();
}

function importStatementArchiveCurrent() {
  return importStatementCandidatesV01();
}

function previewPublicationContextCurrent() {
  return previewPublicationContextPackV01();
}

function buildPublicationContextCurrent() {
  return buildPublicationContextPackV01();
}

function previewPublicationDraftsCurrent() {
  return previewPublicationDraftImportV01();
}

function importPublicationDraftsCurrent() {
  return importPublicationDraftsV01();
}
'@
$parts.Add($facade)

$text = [string]::Join("`r`n", $parts)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outFile, $text, $utf8NoBom)

$checkFile = Join-Path $runtimeDir 'OCOS_ArchivePublishing_Current.check.js'
try {
  [System.IO.File]::WriteAllText($checkFile, $text, $utf8NoBom)
  & node --check $checkFile
  if ($LASTEXITCODE -ne 0) { throw 'Generated Archive/Publishing runtime failed node --check.' }
} finally {
  if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
}

$matches = [regex]::Matches($text, '(?m)^function\s+([A-Za-z0-9_$]+)\s*\(')
$names = @{}
foreach ($m in $matches) {
  $name = $m.Groups[1].Value
  if ($names.ContainsKey($name)) { throw "Duplicate function declaration in Archive/Publishing Current: $name" }
  $names[$name] = $true
}

$required = @(
  'function previewStatementCandidateImportV01()',
  'function importStatementCandidatesV01()',
  'function previewPublicationContextPackV01()',
  'function buildPublicationContextPackV01()',
  'function previewPublicationDraftImportV01()',
  'function importPublicationDraftsV01()',
  'function previewStatementArchiveCurrent()',
  'function importPublicationDraftsCurrent()'
)
foreach ($needle in $required) {
  if (-not $text.Contains($needle)) { throw "Required Archive/Publishing declaration missing: $needle" }
}

Write-Host "Generated: $outFile"
Write-Host "Sources: $($sources.Count)"
Write-Host "Mode: Archive / Publishing Current / PILOT"
Write-Host "Syntax check: PASS"
Write-Host "Duplicate function check: PASS"
Write-Host "Current facade check: PASS"
Write-Host "Automatic trigger: NONE"
Write-Host "Do NOT run clasp push yet."
