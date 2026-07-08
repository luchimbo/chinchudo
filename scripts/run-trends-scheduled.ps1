# Corre el radar de tendencias y guarda logs separados por corrida.
# Disenado para Task Scheduler de Windows. Es solo lectura sobre redes:
# detecta tendencias, importa nuevas filas y no publica ni comenta.

$ROOT = Split-Path -Parent $PSScriptRoot
$LOG_DIR = Join-Path $ROOT "logs"
$STAMP = (Get-Date -Format "yyyyMMdd-HHmmss")
$LOG_FILE = Join-Path $LOG_DIR "trends-scheduled-$STAMP.log"
$TREND_OUT = Join-Path $LOG_DIR "trend-listen-$STAMP.log"

if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

Log "=== scheduled-trends inicio ==="
Set-Location $ROOT

$limit = if ($env:TRENDS_RUN_LIMIT) { $env:TRENDS_RUN_LIMIT } else { "10" }
$env:TRENDS_TIME_BUDGET_SECONDS = if ($env:TRENDS_TIME_BUDGET_SECONDS) { $env:TRENDS_TIME_BUDGET_SECONDS } else { "600" }
Log "Corriendo agents:trend-listen con limit=$limit..."

& npm run agents:trend-listen -- --limit $limit *> $TREND_OUT
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Log "ERROR: agents:trend-listen fallo (exit $exitCode). Ver $TREND_OUT"
    Log "=== scheduled-trends abortado ==="
    exit $exitCode
}

Log "agents:trend-listen OK. Ver $TREND_OUT"
Log "=== scheduled-trends fin ==="
