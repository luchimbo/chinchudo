$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskArguments = '"' + (Join-Path $taskRoot 'node_modules\tsx\dist\cli.mjs') + '" "' + (Join-Path $taskRoot 'scripts\cm-manual-worker.mts') + '"'
Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -RedirectStandardOutput (Join-Path $taskRoot 'reports\cm-manual-worker.log') -RedirectStandardError (Join-Path $taskRoot 'reports\cm-manual-worker.err.log')
