# Ejecutar como Administrador
$xml = Get-Content "D:\10Apostoles\scripts\scheduled-task.xml" -Raw -Encoding UTF8
$xml = $xml -replace 'encoding="UTF-8"', 'encoding="UTF-16"'
$xml | Out-File "D:\10Apostoles\scripts\scheduled-task-utf16.xml" -Encoding Unicode

schtasks /Delete /TN "10Apostoles-Monitor" /F
schtasks /Create /XML "D:\10Apostoles\scripts\scheduled-task-utf16.xml" /TN "10Apostoles-Monitor" /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "LISTO. Tarea 10Apostoles-Monitor registrada con 13 triggers (9:00-21:00 cada 60 min)."
    # Ejecutar ahora mismo para testear
    Write-Host "Ejecutando ahora..."
    schtasks /Run /TN "10Apostoles-Monitor"
} else {
    Write-Host "Error al registrar la tarea."
}
Read-Host "Presiona Enter para cerrar"
