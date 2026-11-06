function Get-WildTrackProcessRecord($Process) {
    if (-not $Process) { return $null }
    [ordered]@{
        id = $Process.Id
        executable = $Process.Path
        startedAt = $Process.StartTime.ToUniversalTime().ToString("o")
    }
}

function Save-WildTrackProcessState([string]$Path, $Backend, $Frontend) {
    @{
        backendPid = if ($Backend) { $Backend.Id } else { $null }
        frontendPid = if ($Frontend) { $Frontend.Id } else { $null }
        backendProcess = Get-WildTrackProcessRecord $Backend
        frontendProcess = Get-WildTrackProcessRecord $Frontend
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Stop-WildTrackRecordedProcess($Record) {
    if (-not $Record -or -not $Record.id -or -not $Record.executable -or -not $Record.startedAt) { return $false }
    $process = Get-Process -Id $Record.id -ErrorAction SilentlyContinue
    if (-not $process) { return $false }
    try {
        $samePath = [string]::Equals($process.Path, $Record.executable, [StringComparison]::OrdinalIgnoreCase)
        $sameStart = $process.StartTime.ToUniversalTime().ToString("o") -eq $Record.startedAt
        if (-not $samePath -or -not $sameStart) { return $false }
    } catch { return $false }
    & taskkill.exe /PID $Record.id /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not stop WildTrack process $($Record.id)." }
    return $true
}
