[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-process-state.ps1")
$pidFile = Join-Path $PSScriptRoot ".wildtrack-local.pids.json"

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host "No WildTrack local process file was found."
    exit 0
}

$savedState = Get-Content -Raw -LiteralPath $pidFile
$processes = $savedState | ConvertFrom-Json
foreach ($record in @($processes.backendProcess, $processes.frontendProcess)) {
    if (Stop-WildTrackRecordedProcess $record) { Write-Host "Stopped process tree $($record.id)." }
}

$legacyPids = @()
if ($processes.backendPid -and -not $processes.backendProcess) { $legacyPids += $processes.backendPid }
if ($processes.frontendPid -and -not $processes.frontendProcess) { $legacyPids += $processes.frontendPid }
if ($legacyPids.Count) {
    Write-Warning "This older process file has no executable/start-time identity for PID(s) $($legacyPids -join ', '). Verify those processes manually before stopping them. The file was kept."
    exit 1
}

if ((Get-Content -Raw -LiteralPath $pidFile) -eq $savedState) { Remove-Item -LiteralPath $pidFile }
Write-Host "Matching WildTrack services stopped; stale process records cleared." -ForegroundColor Green
