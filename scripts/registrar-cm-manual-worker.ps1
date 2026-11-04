$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskArguments = '"' + (Join-Path $taskRoot 'node_modules\tsx\dist\cli.mjs') + '" "' + (Join-Path $taskRoot 'scripts\cm-manual-worker.mts') + '"'
$taskAction = New-ScheduledTaskAction -Execute $taskNode -Argument $taskArguments -WorkingDirectory $taskRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName 'Los5Apostoles-CMManualWorker' -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Procesa propuestas manuales y cobertura CM; nunca publica comentarios.' -Force | Out-Null
  Start-ScheduledTask -TaskName 'Los5Apostoles-CMManualWorker'
  Write-Host 'Worker registrado en Task Scheduler.'
} catch {
  if ($_.Exception.HResult -ne -2147024891 -and $_.ToString() -notmatch '0x80070005|Access is denied|Acceso denegado') { throw }
  # Per-user startup is supported when Windows denies creating scheduled tasks.
  $startupPath = [Environment]::GetFolderPath('Startup')
  $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startupPath 'Los5Apostoles-CMManualWorker.lnk'))
  $shortcut.TargetPath = (Get-Command powershell).Source
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $taskRoot 'scripts\start-cm-manual-worker.ps1') + '"'
  $shortcut.WorkingDirectory = $taskRoot
  $shortcut.Save()
  Start-Process -FilePath powershell -ArgumentList $shortcut.Arguments -WorkingDirectory $taskRoot -WindowStyle Hidden
  Write-Host 'Task Scheduler denego el acceso; worker instalado en Inicio del usuario y arrancado sin ventana.'
}
