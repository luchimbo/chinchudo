# Ejecutar como Administrador (una sola vez).
# Registra la tarea "10Apostoles-Remote" que arranca el acceso remoto al iniciar sesion.
$xml = Get-Content "D:\10Apostoles\scripts\remote-task.xml" -Raw -Encoding UTF8
$xml = $xml -replace 'encoding="UTF-8"', 'encoding="UTF-16"'
$xml | Out-File "D:\10Apostoles\scripts\remote-task-utf16.xml" -Encoding Unicode

schtasks /Delete /TN "10Apostoles-Remote" /F 2>$null
schtasks /Create /XML "D:\10Apostoles\scripts\remote-task-utf16.xml" /TN "10Apostoles-Remote" /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea 10Apostoles-Remote registrada (arranca al iniciar sesion)."
    Write-Host "Ejecutando ahora para probar..."
    schtasks /Run /TN "10Apostoles-Remote"
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
