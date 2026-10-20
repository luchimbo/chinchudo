$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$log = Join-Path $root "reports/blog-preview-runtime.log"
$errors = Join-Path $root "reports/blog-preview-runtime-errors.log"

function Rotate-Log($path) {
  if ((Test-Path $path) -and (Get-Item $path).Length -gt 5MB) { Move-Item $path "$path.1" -Force }
}
function Write-Log($message) { Add-Content -Path $log -Value "[$(Get-Date -Format s)] $message" }

# El relay principal coordina el calendario diario. Este servicio atiende previews y la
# publicación manual; si el proceso cae, se vuelve a levantar solo en lugar de esperar a Windows.
while ($true) {
  Rotate-Log $log
  Rotate-Log $errors
  Write-Log "Iniciando el servicio del blog (puerto 3102)."
  & node --env-file=.env scripts/blog-runtime-service.mjs --preview-only 1>> $log 2>> $errors
  Write-Log "El servicio se detuvo (código $LASTEXITCODE). Reinicio en 10 segundos."
  Start-Sleep -Seconds 10
}
