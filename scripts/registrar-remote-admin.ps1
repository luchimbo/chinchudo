# Ejecutar como Administrador (una sola vez).
# Registra la tarea "10Apostoles-Remote" que arranca el acceso remoto al iniciar sesion.
$Root = Split-Path $PSScriptRoot -Parent

# Leer el XML de la tarea
$xml = Get-Content "$PSScriptRoot\remote-task.xml" -Raw -Encoding UTF8

# Reemplazar la ruta base hardcodeada por la actual
$xml = $xml -replace 'D:\\10Apostoles', $Root
$xml = $xml -replace 'encoding="UTF-8"', 'encoding="UTF-16"'

# Guardar temporal UTF-16 requerido por schtasks
$xml | Out-File "$PSScriptRoot\remote-task-utf16.xml" -Encoding Unicode

# Borrar y registrar la tarea en Task Scheduler
schtasks /Delete /TN "10Apostoles-Remote" /F 2>$null
schtasks /Create /XML "$PSScriptRoot\remote-task-utf16.xml" /TN "10Apostoles-Remote" /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea 10Apostoles-Remote registrada (arranca al iniciar sesion)."
    Write-Host "Ejecutando ahora para probar..."
    schtasks /Run /TN "10Apostoles-Remote"
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
