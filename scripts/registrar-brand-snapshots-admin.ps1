# Ejecutar como Administrador para registrar el corte diario a las 12:00 ART.
$Root = Split-Path $PSScriptRoot -Parent
$xml = Get-Content "$PSScriptRoot\brand-snapshots-task.xml" -Raw -Encoding UTF8
$xml = $xml -replace 'D:\\pcmidi-suite', $Root
$taskPath = "$PSScriptRoot\brand-snapshots-task-utf16.xml"
$xml | Out-File $taskPath -Encoding Unicode
schtasks /Delete /TN "Los5Apostoles-BrandSnapshots" /F 2>$null
schtasks /Create /XML $taskPath /TN "Los5Apostoles-BrandSnapshots" /F
if ($LASTEXITCODE -eq 0) { Write-Host "Tarea registrada: fotos de marca todos los dias a las 12:00." } else { Write-Host "No se pudo registrar la tarea."; exit 1 }
