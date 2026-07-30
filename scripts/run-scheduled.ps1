# Corre agents:monitor seguido de agents:draft y guarda log.
# Diseñado para Task Scheduler de Windows. NSTBrowser arranca solo al iniciar Windows.

$ROOT = Split-Path -Parent $PSScriptRoot
$LOG_DIR = Join-Path $ROOT "logs"
$STAMP = (Get-Date -Format "yyyyMMdd-HHmmss")
$LOG_FILE = Join-Path $LOG_DIR "scheduled-$STAMP.log"
$DAILY_QUOTA_MARKER = Join-Path $ROOT "data\daily-opportunity-quota-last-run.txt"

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

# La cuota de oportunidades hace una pasada completa por cada cliente activo.
# Se ejecuta una sola vez por día local: así PC MIDI Center y Prestige Running
# reciben exactamente el mismo ciclo diario sin duplicar una búsqueda pesada en
# cada disparo de 30 minutos del monitor.
$today = Get-Date -Format "yyyy-MM-dd"
$lastDailyQuotaRun = if (Test-Path $DAILY_QUOTA_MARKER) { (Get-Content -Path $DAILY_QUOTA_MARKER -Raw).Trim() } else { "" }
if ($lastDailyQuotaRun -ne $today) {
    Log "Corriendo cuota diaria de oportunidades para todos los clientes activos..."
    $opportunityQuotaOut = Join-Path $LOG_DIR "opportunity-quota-$STAMP.log"
    cmd /c "cd /d `"$ROOT`" && npm run agents:daily-quota >> `"$opportunityQuotaOut`" 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Log "WARN: cuota diaria de oportunidades fallo (exit $LASTEXITCODE). Se reintentara en la proxima ejecucion. Ver $opportunityQuotaOut"
    } else {
        Set-Content -Path $DAILY_QUOTA_MARKER -Value $today -Encoding UTF8
        Log "cuota diaria de oportunidades OK (incluye Prestige Running)"
    }
} else {
    Log "Cuota diaria de oportunidades ya completada hoy ($today)."
}

Log "Corriendo agents:monitor..."
$monitorOut = Join-Path $LOG_DIR "monitor-$STAMP.log"
cmd /c "cd /d `"$ROOT`" && npm run agents:monitor >> `"$monitorOut`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: agents:monitor fallo (exit $LASTEXITCODE). Ver $monitorOut"
    Log "=== scheduled-monitor abortado ==="
    exit 1
}
Log "agents:monitor OK"

Log "Corriendo cuota diaria de borradores (5 oportunidades por cliente)..."
$draftOut = Join-Path $LOG_DIR "draft-$STAMP.log"
cmd /c "cd /d `"$ROOT`" && npm run agents:draft-daily-quota >> `"$draftOut`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    Log "WARN: cuota diaria de borradores fallo (exit $LASTEXITCODE). Ver $draftOut"
} else {
    Log "cuota diaria de borradores OK"
}

Log "=== scheduled-monitor fin ==="
