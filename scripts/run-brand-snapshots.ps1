# Ejecuta la captura idempotente de fotos de marca. Programar a las 12:00 ART.
$ROOT = Split-Path -Parent $PSScriptRoot
$LOG_DIR = Join-Path $ROOT "logs"
$STAMP = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }
Set-Location $ROOT
cmd /c "cd /d `"$ROOT`" && npm run brand:snapshots -- --bootstrap >> `"$LOG_DIR\brand-snapshots-$STAMP.log`" 2>&1"
exit $LASTEXITCODE
