param([Parameter(Mandatory=$true)][string]$Installer, [string]$ExpectedVersion)
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:RUNNER_TEMP 'Mark & Listen smoke install'
$env:MARK_LISTEN_DATA = Join-Path $env:RUNNER_TEMP 'mark-listen-beta-data'
$env:MARK_LISTEN_SMOKE = '1'
$process = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$target") -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "NSIS install failed ($($process.ExitCode))" }

foreach ($relative in @('mark-and-listen.exe', 'runtime/node.exe', 'app/src/main.mjs', 'app/src/server.mjs', 'app/public/index.html', 'app/public/app.mjs', 'app/public/ui/home.mjs', 'app/public/lib/exams.mjs')) {
    if (!(Test-Path -LiteralPath (Join-Path $target $relative) -PathType Leaf)) {
        throw "Installed file missing: $relative"
    }
}
$unexpected = Get-ChildItem -LiteralPath $target -Recurse -File | Where-Object {
    $_.Name -match '^(electron|codex|chrome|chromium)\.exe$' -or
    ($_.Extension -in '.mp3','.wav','.ogg' -and $_.FullName -notmatch '[\\/]assets[\\/]directions[\\/][a-z0-9-]+\.wav$')
}
$directions = @(Get-ChildItem -LiteralPath (Join-Path $target 'app/assets/directions') -Filter *.wav -File)
if ($directions.Count -ne 39) { throw "Expected 39 bundled direction clips, found $($directions.Count)" }
if ($unexpected) { throw 'Unexpected bundled runtime or sample audio' }
$runtime = Join-Path $target 'runtime/node.exe'
& $runtime --check (Join-Path $target 'app/src/main.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Installed Node or backend entry point failed validation' }

$stderr = Join-Path $env:RUNNER_TEMP 'mark-listen-stderr.log'
$stdout = Join-Path $env:RUNNER_TEMP 'mark-listen-stdout.log'
$exe = Join-Path $target 'mark-and-listen.exe'
$app = Start-Process -FilePath $exe -WorkingDirectory $env:RUNNER_TEMP -PassThru -RedirectStandardError $stderr -RedirectStandardOutput $stdout
try {
    $ready = $false
    $lastCheck = 'Waiting for backend'
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        $app.Refresh()
        if ($app.HasExited) { throw "Tauri exited before readiness ($($app.ExitCode))" }
        try {
            $session = Invoke-RestMethod 'http://127.0.0.1:4175/api/session' -TimeoutSec 2
            $smoke = Invoke-RestMethod 'http://127.0.0.1:4175/api/smoke' -TimeoutSec 2
            $lastCheck = "version=$($session.build) webview-ready=$($smoke.uiReady) window=$($app.MainWindowHandle)"
            if ($session.build -eq $ExpectedVersion -and $session.smoke -and $smoke.uiReady -and $app.MainWindowHandle -ne 0) {
                $ready = $true
                break
            }
        } catch { $lastCheck = $_.Exception.Message }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw "Installed app did not reach WebView2 home: $lastCheck" }
    Write-Host 'Installed Tauri window rendered the beta home in system WebView2 and its local API responded.'
} finally {
    $app.Refresh()
    if (!$app.HasExited) {
        if ($app.CloseMainWindow()) { $null = $app.WaitForExit(5000) }
        if (!$app.HasExited) { Stop-Process -Id $app.Id -Force }
    }
    foreach ($log in @($stderr, $stdout)) {
        if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 30 | Write-Host }
    }
}
