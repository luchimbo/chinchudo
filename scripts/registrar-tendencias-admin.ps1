# Ejecutar como Administrador
$Root = Split-Path $PSScriptRoot -Parent

# Leer el XML de la tarea
$xml = Get-Content "$PSScriptRoot\scheduled-trends-task.xml" -Raw -Encoding UTF8

# Reemplazar la ruta base hardcodeada por la actual
$xml = $xml -replace 'D:\\(?:10Apostoles|pcmidi-suite)', $Root
$xml = $xml -replace 'encoding="UTF-8"', 'encoding="UTF-16"'

# Guardar temporal UTF-16 requerido por schtasks
$taskPath = "$PSScriptRoot\scheduled-trends-task-utf16.xml"
$xml | Out-File $taskPath -Encoding Unicode

# Borrar y registrar la tarea en Task Scheduler
schtasks /Delete /TN "Los5Apostoles-Tendencias" /F 2>$null
schtasks /Create /XML $taskPath /TN "Los5Apostoles-Tendencias" /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea Los5Apostoles-Tendencias registrada para correr cada 6 horas."
    Write-Host "Ejecutando ahora para testear..."
    schtasks /Run /TN "Los5Apostoles-Tendencias"
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
