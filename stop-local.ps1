[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$pidFile = Join-Path $PSScriptRoot ".capvault-local.pids.json"

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host "No CapVault local process file was found."
    exit 0
}

$processes = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
foreach ($processId in @($processes.backendPid, $processes.frontendPid, $processes.backend, $processes.frontend)) {
    if (-not $processId) {
        continue
    }
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        & taskkill.exe /PID $processId /T /F | Out-Null
        Write-Host "Stopped process tree $processId."
    }
}

Remove-Item -LiteralPath $pidFile
Write-Host "CapVault local services stopped." -ForegroundColor Green
