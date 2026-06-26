# Ejecutar como Administrador
$Root = Split-Path $PSScriptRoot -Parent

# Leer el XML de la tarea
$xml = Get-Content "$PSScriptRoot\scheduled-task.xml" -Raw -Encoding UTF8

# Reemplazar la ruta base hardcodeada por la actual
$xml = $xml -replace 'D:\\10Apostoles', $Root
$xml = $xml -replace 'encoding="UTF-8"', 'encoding="UTF-16"'

# Guardar temporal UTF-16 requerido por schtasks
$xml | Out-File "$PSScriptRoot\scheduled-task-utf16.xml" -Encoding Unicode

# Borrar y registrar la tarea en Task Scheduler
schtasks /Delete /TN "10Apostoles-Monitor" /F 2>$null
schtasks /Create /XML "$PSScriptRoot\scheduled-task-utf16.xml" /TN "10Apostoles-Monitor" /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea 10Apostoles-Monitor registrada con triggers dinámicos de 7:30 a 22:30 cada 30 min."
    # Ejecutar ahora mismo para testear
    Write-Host "Ejecutando ahora..."
    schtasks /Run /TN "10Apostoles-Monitor"
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
