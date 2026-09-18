$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $packageRoot '../..')).Path
$packageFiles = @('START_HERE.md', 'DECISIONS.md', 'PROGRESS.md', 'EVIDENCE.md', 'EDITOR_SPEC.md', 'SESSION_SPEC.md', 'REFERENCES.md', 'CODE_MAP.md', 'PROMPTS.md')
foreach ($name in $packageFiles) {
    $file = Join-Path $packageRoot $name
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing package file: $file" }
    if ((Get-Item -LiteralPath $file).Length -eq 0) { throw "Empty package file: $file" }
}
$ticketRoot = Join-Path $repoRoot '.scratch/capstone-2-session/issues'
$tickets = @(Get-ChildItem -LiteralPath $ticketRoot -Filter '*.md')
if ($tickets.Count -ne 12) { throw 'Expected 12 tickets' }
foreach ($ticket in $tickets) {
    $body = Get-Content -LiteralPath $ticket.FullName -Raw
    foreach ($marker in @('**What to build:**', '**Blocked by:**', '**Status:**', '## Acceptance criteria', '## Verification', '## Resume record')) {
        if (-not $body.Contains($marker)) { throw ($ticket.Name + ' missing ' + $marker) }
    }
}
$dependencies = @{
    '01' = @(); '02' = @(); '03' = @('02'); '04' = @(); '05' = @('04'); '06' = @()
    '07' = @(); '08' = @('07'); '09' = @(); '10' = @('01'); '11' = @('01')
    '12' = @('02', '03', '04', '05', '06', '07', '08', '09', '10', '11')
}
$ids = @($tickets | ForEach-Object { $_.Name.Substring(0, 2) })
foreach ($id in $dependencies.Keys) {
    foreach ($dependency in $dependencies[$id]) {
        if ($ids -notcontains $dependency -or [int]$dependency -ge [int]$id) {
            throw "Invalid blocking edge: $id -> $dependency"
        }
    }
}
$image = Join-Path $packageRoot 'references/google-forms-editor-2026-09-19.png'
if (-not (Test-Path -LiteralPath $image)) { throw 'Missing screenshot' }
$pngBytes = [System.IO.File]::ReadAllBytes($image)
if ($pngBytes.Length -lt 8 -or [BitConverter]::ToString($pngBytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A') { throw 'Invalid PNG reference' }
$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $imageHash = [BitConverter]::ToString($hasher.ComputeHash($pngBytes)).Replace('-', '')
} finally {
    $hasher.Dispose()
}
Write-Output 'PASS: 9 nonempty package documents; 12 structured tickets; forward-only dependency graph; valid saved PNG.'
Write-Output ('Screenshot SHA256: ' + $imageHash)
