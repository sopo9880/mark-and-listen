$ErrorActionPreference = 'Stop'
$nodeVersion = '24.22.3'
$archive = "node-v$nodeVersion-win-x64.zip"
$baseUrl = "https://nodejs.org/dist/v$nodeVersion"
New-Item -ItemType Directory -Force staging/runtime | Out-Null
$archivePath = Join-Path $env:RUNNER_TEMP $archive
$checksumPath = Join-Path $env:RUNNER_TEMP 'node-SHASUMS256.txt'
Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -OutFile $checksumPath
$checksumLine = Get-Content $checksumPath | Where-Object { $_ -match "  $([regex]::Escape($archive))$" }
if (@($checksumLine).Count -ne 1) { throw 'Node checksum not found' }
$expected = ($checksumLine -split '\s+')[0]
Invoke-WebRequest "$baseUrl/$archive" -OutFile $archivePath
if ((Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node SHA256 mismatch' }
Expand-Archive $archivePath -DestinationPath (Join-Path $env:RUNNER_TEMP 'mark-node') -Force
Copy-Item (Join-Path $env:RUNNER_TEMP "mark-node/node-v$nodeVersion-win-x64/node.exe") staging/runtime/node.exe
Copy-Item (Join-Path $env:RUNNER_TEMP "mark-node/node-v$nodeVersion-win-x64/LICENSE") staging/runtime/NODE-LICENSE.txt
node scripts/stage.mjs
if ($LASTEXITCODE -ne 0) { throw 'Stage failed' }
