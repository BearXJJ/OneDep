#requires -Version 7.3
# Run from PowerShell: .\dev-windows.ps1
# Configuration: apps/api/.env. Local data and service logs: .local/.
# Ctrl+C stops the apps and both data processes. Data remains for the next run.
param([switch]$Stop)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File exited with code $LASTEXITCODE." }
}

$root = $PSScriptRoot
$settings = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $root 'apps/api/.env')) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim()
    }
}
foreach ($key in 'DATABASE_URL', 'REDIS_HOST', 'REDIS_PORT', 'PORT') {
    if (-not $settings[$key]) { throw "Missing $key in apps/api/.env." }
}
$webSettings = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $root 'apps/web/.env')) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $webSettings[$Matches[1]] = $Matches[2].Trim() }
}
foreach ($key in 'ONEDEP_API_URL', 'WEB_HOST', 'WEB_PORT') {
    if (-not $webSettings[$key]) { throw "Missing $key in apps/web/.env." }
}
if ($webSettings.WEB_HOST -ne '127.0.0.1') { throw 'Windows launcher requires WEB_HOST=127.0.0.1.' }
if (([uri]$webSettings.ONEDEP_API_URL).Port -ne [int]$settings.PORT) { throw 'ONEDEP_API_URL and API PORT disagree.' }
$db = [uri]$settings.DATABASE_URL
$dbName = $db.AbsolutePath.Trim('/')
$credentials = $db.UserInfo.Split(':', 2)
if ($db.Host -ne '127.0.0.1' -or $settings.REDIS_HOST -ne '127.0.0.1') {
    throw 'This launcher only starts databases on 127.0.0.1.'
}
if ($dbName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$' -or $credentials.Count -ne 2 -or $db.Port -lt 1) {
    throw 'DATABASE_URL must include a username, password, explicit port and database name.'
}
$dbUser = [uri]::UnescapeDataString($credentials[0])
$dbPassword = [uri]::UnescapeDataString($credentials[1])
$redisPort = [int]$settings.REDIS_PORT
$commands = @{}
foreach ($name in 'initdb.exe', 'pg_ctl.exe', 'psql.exe', 'createdb.exe', 'redis-server.exe', 'redis-cli.exe', 'pnpm.ps1') {
    $commands[$name] = (Get-Command $name -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/.modules.yaml'))) {
    throw 'Dependencies are missing. Run pnpm install --frozen-lockfile first.'
}

$local = Join-Path $root '.local'
$pgData = Join-Path $local 'postgres'
$redisData = Join-Path $local 'redis'

# The workbench must shut down the data processes before terminating the app tree.
if ($Stop) {
    $redisConfig = @(& $commands['redis-cli.exe'] -h 127.0.0.1 -p $redisPort --raw CONFIG GET dir)
    if ($LASTEXITCODE -ne 0 -or $redisConfig.Count -ne 2) {
        throw 'Cannot verify the Redis data directory; no database was stopped.'
    }
    $redisDirectory = $redisConfig[1] -replace '^/cygdrive/([a-zA-Z])/', '$1:/'
    if ([IO.Path]::GetFullPath($redisDirectory) -ne [IO.Path]::GetFullPath($redisData)) {
        throw 'The Redis process belongs to a different data directory.'
    }
    Invoke-Checked $commands['pg_ctl.exe'] @('-D', $pgData, 'status')
    Invoke-Checked $commands['redis-cli.exe'] @('-h', '127.0.0.1', '-p', "$redisPort", 'shutdown', 'save')
    Invoke-Checked $commands['pg_ctl.exe'] @('-D', $pgData, '-m', 'fast', '-w', '-t', '20', 'stop')
    Write-Host 'OneDep PostgreSQL and Redis stopped; stored data is preserved.'
    return
}

# Refuse to reuse an unrelated application or database on these ports.
foreach ($port in @($db.Port, $redisPort, [int]$settings.PORT, [int]$webSettings.WEB_PORT)) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $listener.Start() }

    finally { $listener.Stop() }
}

New-Item -ItemType Directory -Path $local, $redisData -Force | Out-Null

$previousPort = $env:PORT
$previousPgPassword = $env:PGPASSWORD
$pgStarted = $false
$redisStarted = $false
Push-Location $root
try {

    $env:PORT = $settings.PORT
    $env:PGPASSWORD = $dbPassword
    if (-not (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
        $passwordFile = [IO.Path]::GetTempFileName()
        try {
            [IO.File]::WriteAllText($passwordFile, $dbPassword, [Text.UTF8Encoding]::new($false))
            Invoke-Checked $commands['initdb.exe'] @('-D', $pgData, '-U', $dbUser, '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', "--pwfile=$passwordFile")
        }
        finally { [IO.File]::WriteAllText($passwordFile, '') }
    }
    # A separate hidden console keeps Ctrl+C from killing PostgreSQL before cleanup.
    $pgStart = Start-Process -FilePath $commands['pg_ctl.exe'] -WindowStyle Hidden -PassThru -ArgumentList @(
        '-D', ('"' + $pgData + '"'), '-l', ('"' + (Join-Path $local 'postgres.log') + '"'),
        '-o', ('"-h 127.0.0.1 -p ' + $db.Port + '"'), '-w', '-t', '20', 'start'
    )
    if (-not $pgStart.WaitForExit(30000)) { throw "pg_ctl startup timed out." }
    if ($pgStart.ExitCode -ne 0) { throw "PostgreSQL failed to start; see $local\postgres.log." }
    $pgStarted = $true
    $dbExists = & $commands['psql.exe'] -h 127.0.0.1 -p $db.Port -U $dbUser -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot query the local PostgreSQL instance.' }
    if ($dbExists -ne '1') {
        Invoke-Checked $commands['createdb.exe'] @('-h', '127.0.0.1', '-p', "$($db.Port)", '-U', $dbUser, $dbName)
    }

    # Relative --dir avoids MSYS2/Cygwin drive-path conversion.
    $redisProcess = Start-Process -FilePath $commands['redis-server.exe'] -WorkingDirectory $redisData -WindowStyle Hidden -PassThru -ArgumentList @(
        '--bind', '127.0.0.1', '--port', "$redisPort", '--dir', '.', '--appendonly', 'yes'
    ) -RedirectStandardOutput (Join-Path $local 'redis.log') -RedirectStandardError (Join-Path $local 'redis.error.log')
    $redisStarted = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($redisProcess.HasExited) { throw "Redis exited; see $local\redis.error.log." }
        $pong = & $commands['redis-cli.exe'] -h 127.0.0.1 -p $redisPort ping 2>$null
        if ($LASTEXITCODE -eq 0 -and $pong -eq 'PONG') { $ready = $true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw "Redis did not become ready; see $local\redis.log." }

    Invoke-Checked $commands['pnpm.ps1'] @('--filter', '@onedep/shared', 'build')
    Invoke-Checked $commands['pnpm.ps1'] @('--filter', 'api', 'exec', 'prisma', 'generate')
    Invoke-Checked $commands['pnpm.ps1'] @('--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy')
    Write-Host "OneDep: http://$($webSettings.WEB_HOST):$($webSettings.WEB_PORT) | Ctrl+C stops apps, PostgreSQL and Redis."
    Invoke-Checked $commands['pnpm.ps1'] @('--filter', 'api', '--filter', 'web', '--parallel', 'run', 'dev')
}
finally {
    try {
        if ($redisStarted -and -not $redisProcess.HasExited) {
            Invoke-Checked $commands['redis-cli.exe'] @('-h', '127.0.0.1', '-p', "$redisPort", 'shutdown', 'save')
            $redisProcess.WaitForExit(5000) | Out-Null
        }
    }
    finally {
        try {
            if ($pgStarted) {
                Invoke-Checked $commands['pg_ctl.exe'] @('-D', $pgData, '-m', 'fast', '-w', '-t', '20', 'stop')
            }
        }
        finally {

            $env:PORT = $previousPort
            $env:PGPASSWORD = $previousPgPassword
            Pop-Location
        }
    }
}

