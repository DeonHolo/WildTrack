[CmdletBinding()]
param(
    [switch]$Probe,
    [ValidateSet('gemini-2.5-flash-lite', 'gemini-3.1-flash-lite')]
    [string]$Model = 'gemini-3.1-flash-lite'
)

$ErrorActionPreference = 'Stop'
$geminiCheckKey = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'Process')
if ([string]::IsNullOrWhiteSpace($geminiCheckKey)) {
    $geminiCheckKey = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
}
if ([string]::IsNullOrWhiteSpace($geminiCheckKey)) {
    Write-Host 'Paste the SAME Gemini key used in Heroku. Input is hidden and will not be saved.'
    $geminiCheckSecure = Read-Host 'Gemini API key' -AsSecureString
    $geminiCheckPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiCheckSecure)
    try {
        $geminiCheckKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($geminiCheckPointer).Trim()
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($geminiCheckPointer)
        $geminiCheckSecure.Dispose()
    }
}
if ([string]::IsNullOrWhiteSpace($geminiCheckKey)) { throw 'No key entered.' }

Write-Host 'Checking model metadata only. No documents or generation requests will be sent.'
$geminiCheckHeaders = @{ 'x-goog-api-key' = $geminiCheckKey }
try {
    $geminiCheckModels = @()
    $geminiCheckPage = ''
    do {
        $geminiCheckUrl = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'
        if ($geminiCheckPage) { $geminiCheckUrl += '&pageToken=' + [Uri]::EscapeDataString($geminiCheckPage) }
        $geminiCheckResult = Invoke-RestMethod -Uri $geminiCheckUrl -Headers $geminiCheckHeaders -TimeoutSec 30
        $geminiCheckModels += @($geminiCheckResult.models | Where-Object { $_.supportedGenerationMethods -contains 'generateContent' })
        $geminiCheckPage = $geminiCheckResult.nextPageToken
    } while ($geminiCheckPage)

    Write-Host ''
    if ($geminiCheckModels.name -contains ('models/' + $Model)) {
        Write-Host ('RESULT: ' + $Model + ' is listed for generateContent.') -ForegroundColor Green
        Write-Host 'The app request needs further diagnosis; this does not prove a generation will succeed.'
    } else {
        Write-Host ('RESULT: ' + $Model + ' is NOT listed for generateContent with this key.') -ForegroundColor Yellow
    }
    Write-Host 'Listed Flash models:'
    $geminiCheckModels | Where-Object { $_.name -match 'flash' } | ForEach-Object { Write-Output $_.name }
    if ($Probe) {
        Write-Host ''
        Write-Host 'Testing generateContent with a short synthetic prompt. This uses a small number of AI tokens, no student documents.'
        $geminiProbeThinking = @{ thinkingBudget = 0 }
        if ($Model -eq 'gemini-3.1-flash-lite') { $geminiProbeThinking = @{ thinkingLevel = 'MINIMAL' } }
        $geminiProbeBody = @{
            contents = @(@{ role = 'user'; parts = @(@{ text = 'Reply with the word OK.' }) })
            generationConfig = @{ maxOutputTokens = 64; thinkingConfig = $geminiProbeThinking }
        } | ConvertTo-Json -Depth 8 -Compress
        try {
            $geminiProbeResult = Invoke-RestMethod -Method Post -Uri ('https://generativelanguage.googleapis.com/v1beta/models/' + $Model + ':generateContent') -Headers $geminiCheckHeaders -ContentType 'application/json' -Body $geminiProbeBody -TimeoutSec 60
            Write-Host 'PROBE: generateContent succeeded.' -ForegroundColor Green
            $geminiProbeCandidate = $geminiProbeResult.candidates | Select-Object -First 1
            Write-Host ('Finish reason: ' + $geminiProbeCandidate.finishReason)
            $geminiProbeText = (@($geminiProbeCandidate.content.parts | Where-Object { -not $_.thought } | ForEach-Object { $_.text }) -join '').Trim()
            if ($geminiProbeText -match '^OK[.!]?$') { Write-Host 'Reply: OK' }
            else { Write-Host 'Reply was empty or different from OK; share the finish reason above.' }
            Write-Host 'This confirms basic generation works with this key locally; the hosted PDF request still needs diagnosis.'
        } catch {
            $geminiProbeStatus = 0
            if ($_.Exception.Response) { $geminiProbeStatus = [int]$_.Exception.Response.StatusCode }
            Write-Host ('PROBE: generateContent failed, HTTP ' + $geminiProbeStatus) -ForegroundColor Yellow
            # This request contains only a synthetic prompt. Print the provider explanation,
            # never headers, credentials, the whole exception, or any student document data.
            $geminiProbeRaw = $_.ErrorDetails.Message
            if (-not $geminiProbeRaw -and $_.Exception.Response) {
                try {
                    $geminiProbeReader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    try { $geminiProbeRaw = $geminiProbeReader.ReadToEnd() } finally { $geminiProbeReader.Dispose() }
                } catch { $geminiProbeRaw = $null }
            }
            if ($geminiProbeRaw) {
                try {
                    $geminiProbeMessage = [string](($geminiProbeRaw | ConvertFrom-Json).error.message)
                    $geminiProbeMessage = $geminiProbeMessage.Replace($geminiCheckKey, '[REDACTED]')
                    $geminiProbeMessage = $geminiProbeMessage -replace 'https?://\S+', '[provider link]'
                    if ($geminiProbeMessage.Length -gt 1500) { $geminiProbeMessage = $geminiProbeMessage.Substring(0, 1500) }
                    Write-Output $geminiProbeMessage
                } catch { Write-Host 'Provider did not return a readable JSON error.' }
            }
        }
    }
    Write-Host 'You can share the RESULT, model names, and PROBE output above. They contain no API key.'
} catch {
    $geminiCheckStatus = 0
    if ($_.Exception.Response) { $geminiCheckStatus = [int]$_.Exception.Response.StatusCode }
    Write-Host ('Model-list request failed. HTTP status: ' + $geminiCheckStatus) -ForegroundColor Yellow
    Write-Host 'No document was sent. Do not share the key. Share only this status number.'
} finally {
    $geminiCheckHeaders.Clear()
    $geminiCheckKey = $null
}
