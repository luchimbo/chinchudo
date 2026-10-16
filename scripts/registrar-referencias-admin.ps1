# Registra la lectura diaria de cuentas de referencia del Estudio de Reels.
# Ejecutar una vez en PowerShell como Administrador.
$Script = Join-Path $PSScriptRoot "run-reference-scan-scheduled.ps1"
$Action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Script`""

schtasks /Delete /TN "Los5Apostoles-Referencias" /F 2>$null
schtasks /Create /TN "Los5Apostoles-Referencias" /TR $Action /SC DAILY /ST 09:30 /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea Los5Apostoles-Referencias registrada todos los dias a las 09:30."
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
