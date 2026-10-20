$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
# El relay principal ya coordina los trabajos. Este servicio sólo renderiza previews.
& node --env-file=.env scripts/blog-runtime-service.mjs --preview-only 1>> "$root/reports/blog-preview-runtime.log" 2>> "$root/reports/blog-preview-runtime-errors.log"
exit $LASTEXITCODE
