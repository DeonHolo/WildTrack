[CmdletBinding()]
param(
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 5174,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pidFile = Join-Path $root ".capvault-local.pids.json"
$logsDirectory = Join-Path $root "logs"

# Some terminals expose both Path and PATH. Start-Process treats those as duplicate keys.
$processEnvironment = [Environment]::GetEnvironmentVariables("Process")
$normalizedPath = $processEnvironment["Path"]
if ([string]::IsNullOrWhiteSpace($normalizedPath)) {
    $normalizedPath = $processEnvironment["PATH"]
}
[Environment]::SetEnvironmentVariable("PATH", $null, "Process")
[Environment]::SetEnvironmentVariable("Path", $null, "Process")
[Environment]::SetEnvironmentVariable("Path", $normalizedPath, "Process")

function Get-ConfiguredValue([string]$name) {
    $processValue = [Environment]::GetEnvironmentVariable($name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }
    return [Environment]::GetEnvironmentVariable($name, "User")
}

function Assert-Command([string]$name, [string]$installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name was not found. $installHint"
    }
}

function Assert-PortAvailable([int]$port, [string]$service) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        throw "Port $port is already in use. Stop the existing $service or choose another port."
    }
}

$driveKey = Get-ConfiguredValue "CAPVAULT_GOOGLE_DRIVE_API_KEY"
if ([string]::IsNullOrWhiteSpace($driveKey)) {
    throw "Google Drive API key is not configured. Run .\setup-local.ps1 first."
}

Assert-Command "java" "Install Java 21 or newer."
Assert-Command "mvn.cmd" "Install Maven and add it to PATH."
Assert-Command "node" "Install Node.js 20 or newer."
Assert-PortAvailable $BackendPort "backend"
Assert-PortAvailable $FrontendPort "frontend"

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null

$frontendDirectory = Join-Path $root "frontend"
$viteEntry = Join-Path $frontendDirectory "node_modules\vite\bin\vite.js"
$backendDirectory = Join-Path $root "backend"
$backendJar = Join-Path $backendDirectory "target\backend-0.1.0-SNAPSHOT.jar"
if (-not $SkipInstall -and -not (Test-Path $viteEntry)) {
    Assert-Command "npm.cmd" "Install or repair Node.js with npm, then restart PowerShell."
    & npm.cmd --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "npm is installed but cannot run. Repair or reinstall Node.js before the first frontend install."
    }
    Push-Location $frontendDirectory
    try {
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed."
        }
    } finally {
        Pop-Location
    }
}
if (-not (Test-Path $viteEntry)) {
    throw "Frontend dependencies are missing. Run this script without -SkipInstall after repairing npm."
}

Push-Location $backendDirectory
try {
    & mvn.cmd package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        throw "Backend build failed."
    }
} finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $backendJar)) {
    throw "Backend build completed without producing $backendJar."
}

$env:CAPVAULT_GOOGLE_DRIVE_API_KEY = $driveKey
$env:CAPVAULT_GOOGLE_DRIVE_ENABLED = "true"
$env:CAPVAULT_CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$FrontendPort,http://localhost:$FrontendPort"
$env:VITE_API_BASE_URL = "http://127.0.0.1:$BackendPort/api"

$backendOut = Join-Path $logsDirectory "backend.out.log"
$backendErr = Join-Path $logsDirectory "backend.err.log"
$frontendOut = Join-Path $logsDirectory "frontend.out.log"
$frontendErr = Join-Path $logsDirectory "frontend.err.log"

$backend = Start-Process `
    -FilePath (Get-Command java).Source `
    -ArgumentList @("-jar", "`"$backendJar`"", "--server.port=$BackendPort") `
    -WorkingDirectory $backendDirectory `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr `
    -WindowStyle Hidden `
    -PassThru

$frontend = Start-Process `
    -FilePath (Get-Command node).Source `
    -ArgumentList @(".\node_modules\vite\bin\vite.js", "--host", "127.0.0.1", "--port", "$FrontendPort") `
    -WorkingDirectory $frontendDirectory `
    -RedirectStandardOutput $frontendOut `
    -RedirectStandardError $frontendErr `
    -WindowStyle Hidden `
    -PassThru

@{
    backendPid = $backend.Id
    frontendPid = $frontend.Id
    startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

function Wait-ForUrl([string]$url, [string]$service) {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    & (Join-Path $root "stop-local.ps1")
    throw "$service did not become ready. Check the files under $logsDirectory."
}

Wait-ForUrl "http://127.0.0.1:$BackendPort/api/health" "Backend"
Wait-ForUrl "http://127.0.0.1:$FrontendPort/" "Frontend"

Write-Host ""
Write-Host "CapVault is ready." -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:$FrontendPort/"
Write-Host "Backend:  http://127.0.0.1:$BackendPort/api/health"
Write-Host "Logs:     $logsDirectory"
Write-Host ""
Write-Host "Run .\stop-local.ps1 when finished."
