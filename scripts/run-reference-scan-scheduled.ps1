# Lee las cuentas de referencia del Estudio de Reels (metodo ig-viral).
# Corre todos los dias, pero solo lee las cuentas que lo necesitan: las que
# alguien pidio con "Leer ahora", las nuevas y las que no se leen hace 6 dias.
# Solo lectura sobre redes: no sigue, no comenta ni publica.

$ROOT = Split-Path -Parent $PSScriptRoot
$LOG_DIR = Join-Path $ROOT "logs"
$STAMP = (Get-Date -Format "yyyyMMdd-HHmmss")
$LOG_FILE = Join-Path $LOG_DIR "reference-scan-$STAMP.log"

if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }
Set-Location $ROOT
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

& python agents/orchestrator.py reference-scan *> $LOG_FILE
exit $LASTEXITCODE
