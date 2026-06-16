# Purga logs/ y reports/ con más de DAYS_TO_KEEP días. Corre semanalmente.

$ROOT = Split-Path -Parent $PSScriptRoot
$DAYS_TO_KEEP = 14
$DIRS = @("logs", "reports")

$cutoff = (Get-Date).AddDays(-$DAYS_TO_KEEP)
$total = 0

foreach ($dir in $DIRS) {
    $path = Join-Path $ROOT $dir
    if (-not (Test-Path $path)) { continue }
    $files = Get-ChildItem -Path $path -File | Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $files) {
        Remove-Item $f.FullName -Force
        $total++
    }
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] cleanup: $total archivo(s) eliminados (>$DAYS_TO_KEEP dias)"
