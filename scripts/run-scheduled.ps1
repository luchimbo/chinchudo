# Corre agents:monitor seguido de agents:draft y guarda log.
# Diseñado para Task Scheduler de Windows. NSTBrowser arranca solo al iniciar Windows.

$ROOT = Split-Path -Parent $PSScriptRoot
$LOG_DIR = Join-Path $ROOT "logs"
$STAMP = (Get-Date -Format "yyyyMMdd-HHmmss")
$LOG_FILE = Join-Path $LOG_DIR "scheduled-$STAMP.log"

if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

Log "=== scheduled-monitor inicio ==="

# Esperar hasta 90s a que NSTBrowser levante en puerto 8848
$nstReady = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", 8848)
        $nstReady = $true
        $tcp.Close()
        break
    } catch {
        $tcp.Close()
        Log "NSTBrowser aun no disponible, esperando..."
        Start-Sleep -Seconds 10
    }
}
if (-not $nstReady) {
    Log "ERROR: NSTBrowser no respondio en puerto 8848 tras 90s."
    Log "=== scheduled-monitor abortado ==="
    exit 1
}
Log "NSTBrowser API OK"

Set-Location $ROOT

Log "Corriendo agents:monitor..."
$monitorOut = Join-Path $LOG_DIR "monitor-$STAMP.log"
cmd /c "cd /d `"$ROOT`" && npm run agents:monitor >> `"$monitorOut`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: agents:monitor fallo (exit $LASTEXITCODE). Ver $monitorOut"
    Log "=== scheduled-monitor abortado ==="
    exit 1
}
Log "agents:monitor OK"

Log "Corriendo agents:draft..."
$draftOut = Join-Path $LOG_DIR "draft-$STAMP.log"
cmd /c "cd /d `"$ROOT`" && npm run agents:draft >> `"$draftOut`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    Log "WARN: agents:draft fallo (exit $LASTEXITCODE). Ver $draftOut"
} else {
    Log "agents:draft OK"
}

Log "=== scheduled-monitor fin ==="
