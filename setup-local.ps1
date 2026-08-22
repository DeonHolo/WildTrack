[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "WildTrack local Google Drive setup" -ForegroundColor Cyan
Write-Host "The API key is stored in your Windows user environment, not in this repository."
Write-Host ""

$secureKey = Read-Host "Paste the restricted Google Drive API key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "No API key was entered."
}

if (-not $apiKey.StartsWith("AIza")) {
    $continue = Read-Host "This does not look like a Google API key. Store it anyway? Type YES"
    if ($continue -cne "YES") {
        throw "Setup cancelled."
    }
}

[Environment]::SetEnvironmentVariable("CAPVAULT_GOOGLE_DRIVE_API_KEY", $apiKey, "User")
[Environment]::SetEnvironmentVariable("CAPVAULT_GOOGLE_DRIVE_ENABLED", "true", "User")

Write-Host ""
Write-Host "Google Drive API configuration saved for this Windows user." -ForegroundColor Green
Write-Host "Run .\run-local.ps1 to start WildTrack."
