[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Write-Host 'WildTrack Gemini setup (Gemini 3.1 Flash-Lite)' -ForegroundColor Cyan
Write-Host 'The key is stored in your Windows user environment, never in the repository.'
$geminiSecureKey = Read-Host 'Paste your Gemini API key from Google AI Studio' -AsSecureString
$geminiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiSecureKey)
try {
    $geminiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($geminiPointer).Trim()
    if ([string]::IsNullOrWhiteSpace($geminiKey)) { throw 'No API key was entered.' }
    [Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $geminiKey, 'User')
    [Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $geminiKey, 'Process')
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($geminiPointer)
    $geminiSecureKey.Dispose()
    $geminiKey = $null
}
Write-Host 'Saved. Restart WildTrack with stop-local.ps1, then run-local.ps1.' -ForegroundColor Green
Write-Host 'For the hosted backend, set GEMINI_API_KEY privately in its hosting settings instead.'
