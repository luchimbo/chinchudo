$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskArguments = '"' + (Join-Path $taskRoot 'node_modules\tsx\dist\cli.mjs') + '" "' + (Join-Path $taskRoot 'scripts\cm-maintenance.mts') + '"'
$taskAction = New-ScheduledTaskAction -Execute $taskNode -Argument $taskArguments -WorkingDirectory $taskRoot
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Los5Apostoles-AsistenteCM' -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Genera respuestas faltantes y actualiza propuestas del Asistente CM cada 15 minutos, con revisión humana.' -Force | Out-Null
Write-Host 'Asistente CM programado cada 15 minutos mientras esta cuenta de Windows este conectada.'
