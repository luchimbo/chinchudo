# Limpia artefactos locales de corridas, deploys y diagnosticos.
# Por defecto solo muestra lo que borraria. Para borrar: -Apply
#   powershell -File scripts\run-cleanup.ps1            (simulacion)
#   powershell -File scripts\run-cleanup.ps1 -Apply     (borra)
param(
    [switch]$Apply,
    [int]$DaysToKeep = 7
)

$ROOT = Split-Path -Parent $PSScriptRoot
$cutoff = (Get-Date).AddDays(-$DaysToKeep)

# Carpetas temporales que se pueden vaciar completas.
$wipeDirs = @(".tmp", "tmp", "scratch", "output", "runtime\archive")
# Carpetas donde solo se borra lo viejo (recursivo).
$ageDirs = @("reports", "logs", "runtime")
# Archivos sueltos.
$looseFiles = @("dev-err.log", "dev-out.log", "tsconfig.tsbuildinfo")

$targets = New-Object System.Collections.Generic.List[string]
$bytes = 0L

foreach ($dir in $wipeDirs) {
    $path = Join-Path $ROOT $dir
    if (-not (Test-Path $path)) { continue }
    $item = Get-Item $path -Force
    if ($item.LinkType) { Write-Host "omitido (enlace): $dir"; continue }
    $bytes += (Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    $targets.Add($path)
}

foreach ($dir in $ageDirs) {
    $path = Join-Path $ROOT $dir
    if (-not (Test-Path $path)) { continue }
    Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName -notlike (Join-Path $ROOT "runtime\archive*") } |
        ForEach-Object { $bytes += $_.Length; $targets.Add($_.FullName) }
}

foreach ($file in $looseFiles) {
    $path = Join-Path $ROOT $file
    if (Test-Path $path) { $bytes += (Get-Item $path).Length; $targets.Add($path) }
}

Get-ChildItem (Join-Path $ROOT "backups") -Filter "*.db" -File -ErrorAction SilentlyContinue |
    ForEach-Object { $bytes += $_.Length; $targets.Add($_.FullName) }

$mb = [Math]::Round($bytes / 1MB, 1)
if (-not $Apply) {
    Write-Host "Simulacion: se borrarian $($targets.Count) elementos ($mb MB). Ejecuta con -Apply para borrar."
    $targets | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
    exit 0
}

foreach ($target in $targets) {
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
}
foreach ($dir in $ageDirs) {
    $path = Join-Path $ROOT $dir
    if (Test-Path $path) {
        Get-ChildItem $path -Recurse -Directory -Force | Sort-Object { $_.FullName.Length } -Descending |
            Where-Object { -not (Get-ChildItem $_.FullName -Force) } | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] cleanup: $($targets.Count) elemento(s) eliminados ($mb MB, >$DaysToKeep dias)"
