package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class LocalProcessStateTest {
    @org.junit.jupiter.api.condition.EnabledOnOs(org.junit.jupiter.api.condition.OS.WINDOWS)
    @Test void reusedOrUnidentifiedPidIsNeverTerminated() throws Exception {
        String helper = Path.of("..", "local-process-state.ps1").toAbsolutePath().normalize().toString().replace("'", "''");
        String script = """
            $ErrorActionPreference = 'Stop'
            . '%s'
            $script:kills = 0
            $script:actual = [pscustomobject]@{ Id = 123; Path = 'C:\\fake\\node.exe'; StartTime = [datetime]'2026-11-06T01:00:00Z' }
            function Get-Process { param($Id, $ErrorAction) return $script:actual }
            function taskkill.exe { $script:kills++; $global:LASTEXITCODE = 0 }
            $record = Get-WildTrackProcessRecord $script:actual
            if (-not (Stop-WildTrackRecordedProcess $record)) { throw 'Expected matching identity to stop' }
            $script:actual.StartTime = $script:actual.StartTime.AddSeconds(1)
            if (Stop-WildTrackRecordedProcess $record) { throw 'Reused PID was stopped' }
            $script:actual.StartTime = [datetime]'2026-11-06T01:00:00Z'
            $script:actual.Path = 'C:\\unrelated\\node.exe'
            if (Stop-WildTrackRecordedProcess $record) { throw 'Unrelated executable was stopped' }
            if (Stop-WildTrackRecordedProcess ([pscustomobject]@{ id=123 })) { throw 'Unidentified PID was stopped' }
            if ($script:kills -ne 1) { throw 'Unexpected termination count' }
            foreach ($file in @('run-local.ps1','run-local-patched.ps1','stop-local.ps1','local-process-state.ps1')) {
              $tokens=$null; $errors=$null
              [System.Management.Automation.Language.Parser]::ParseFile((Join-Path '%s' $file),[ref]$tokens,[ref]$errors) | Out-Null
              if ($errors.Count) { throw ($errors | Out-String) }
            }
            function Get-Command { param($Name) return [pscustomobject]@{ Source='C:\\fake\\node.exe' } }
            function Start-Process {
              param($FilePath,$ArgumentList,$WorkingDirectory,$RedirectStandardOutput,$RedirectStandardError,$WindowStyle,[switch]$PassThru)
              $script:starts++
              if ($script:starts -eq 2) { throw 'Synthetic frontend launch failure' }
              return $script:actual
            }
            foreach ($file in @('run-local.ps1','run-local-patched.ps1')) {
              $script:starts=0
              $root=Split-Path '%s'
              $pidFile=Join-Path ([IO.Path]::GetTempPath()) ('wildtrack-launch-test-'+[guid]::NewGuid()+'.json')
              $launcher=Get-Content -Raw -LiteralPath (Join-Path $root $file)
              $start=$launcher.IndexOf('. (Join-Path $root "local-process-state.ps1")')
              $end=$launcher.IndexOf('function Wait-ForUrl', $start)
              $beforeKills=$script:kills
              try {
                try { & ([scriptblock]::Create($launcher.Substring($start,$end-$start))); throw 'Expected launch failure' }
                catch { if ($_.Exception.Message -ne 'Synthetic frontend launch failure') { throw } }
                $partial=Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
                if ($partial.backendProcess.id -ne 123 -or $partial.frontendProcess) { throw 'Partial launch was not recorded' }
                if ($script:kills -ne $beforeKills+1) { throw 'Partial backend was not stopped' }
              } finally { if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile } }
            }
            Write-Output 'Identity checks and script syntax passed'
            """.formatted(helper, Path.of("..").toAbsolutePath().normalize().toString().replace("'", "''"), helper);
        Path input = Files.createTempFile("wildtrack-process-state-test-", ".ps1");
        Path output = Files.createTempFile("wildtrack-process-state-output-", ".log");
        try {
            Files.writeString(input, script);
            var process = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", input.toString())
                .redirectErrorStream(true).redirectOutput(output.toFile()).start();
            if (!process.waitFor(20, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new AssertionError("Process identity test timed out"); }
            assertThat(process.exitValue()).withFailMessage(Files.readString(output)).isZero();
        } finally { Files.deleteIfExists(input); Files.deleteIfExists(output); }
    }
}
