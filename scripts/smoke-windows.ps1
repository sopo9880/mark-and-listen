param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:RUNNER_TEMP 'mark-listen-beta-install'
$env:MARK_LISTEN_DATA = Join-Path $env:RUNNER_TEMP 'mark-listen-beta-data'
$env:MARK_LISTEN_SMOKE = '1'
$process = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$target") -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "NSIS install failed ($($process.ExitCode))" }
$exe = Join-Path $target 'mark-and-listen.exe'
if (!(Test-Path $exe)) { throw 'Tauri application executable missing' }
$unexpected = Get-ChildItem $target -Recurse -File | Where-Object {
    $_.Name -match '^(electron|codex|chrome|chromium)\.exe$' -or $_.Extension -in '.mp3','.wav','.ogg'
}
if ($unexpected) { throw 'Unexpected bundled runtime or sample audio' }
$app = Start-Process -FilePath $exe -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($app.HasExited) { throw "Tauri exited before readiness ($($app.ExitCode))" }
        try {
            $session = Invoke-RestMethod 'http://127.0.0.1:4175/api/session' -TimeoutSec 2
            $html = Invoke-WebRequest 'http://127.0.0.1:4175/' -TimeoutSec 2
            $app.Refresh()
            if ($session.build -eq '0.1.0.0' -and $html.Content.Contains('Mark &amp; Listen') -and $app.MainWindowHandle -ne 0) {
                $ready = $true
                break
            }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Tauri window and local backend did not become ready' }
    Write-Host 'Installed Tauri window opened and its local API responded. No sample audio or Chromium distribution in the installer.'
} finally {
    if (!$app.HasExited) {
        if ($app.CloseMainWindow()) { $null = $app.WaitForExit(5000) }
        if (!$app.HasExited) { Stop-Process -Id $app.Id -Force }
    }
}
