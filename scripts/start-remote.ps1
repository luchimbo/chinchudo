# =============================================================================
# start-remote.ps1 - Arranca el acceso remoto
# Uso: powershell -ExecutionPolicy Bypass -File scripts\start-remote.ps1
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
$TunnelLog = "$env:TEMP\10apostoles-tunnel.log"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Activando acceso remoto - 10Apostoles" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# -- Verificar dependencias --
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js no encontrado." -ForegroundColor Red; exit 1
}
if (-not (Get-Command "cloudflared" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: cloudflared no encontrado." -ForegroundColor Red
    Write-Host "Descargalo de: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Yellow
    exit 1
}

# -- Matar procesos anteriores del relay y tunnel --
Write-Host "[1] Limpiando procesos anteriores..." -ForegroundColor Yellow
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
Write-Host "    OK" -ForegroundColor Green

# -- Arrancar relay en ventana nueva --
Write-Host ""
Write-Host "[2] Arrancando relay server..." -ForegroundColor Yellow
$relayProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "title RELAY 10Apostoles && node `"$Root\scripts\agent-relay.mjs`"" `
    -PassThru
Start-Sleep -Seconds 2

# Verificar que arranco
$relayOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3099/health" -UseBasicParsing -TimeoutSec 3
    $relayOk = ($resp.StatusCode -eq 200)
} catch { }

if ($relayOk) {
    Write-Host "    Relay corriendo (PID $($relayProc.Id))" -ForegroundColor Green
} else {
    Write-Host "    ERROR: el relay no arranco. Revisa la ventana 'RELAY 10Apostoles'." -ForegroundColor Red
    exit 1
}

# -- Arrancar Cloudflare Tunnel --
Write-Host ""
Write-Host "[3] Iniciando Cloudflare Tunnel..." -ForegroundColor Yellow
Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue

$tunnelProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:3099" `
    -RedirectStandardError $TunnelLog `
    -PassThru -WindowStyle Hidden

# Esperar URL (max 35 segundos)
$tunnelUrl = $null
Write-Host "    Esperando URL del tunnel" -NoNewline
for ($i = 0; $i -lt 35; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
    if (Test-Path $TunnelLog) {
        $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
            $tunnelUrl = $matches[0]
            break
        }
    }
}
Write-Host ""

if (-not $tunnelUrl) {
    Write-Host "    ERROR: No se pudo obtener la URL del tunnel." -ForegroundColor Red
    Write-Host "    Contenido del log:" -ForegroundColor Gray
    if (Test-Path $TunnelLog) { Get-Content $TunnelLog | Select-Object -Last 5 }
    exit 1
}

Write-Host "    Tunnel URL: $tunnelUrl" -ForegroundColor Green

# -- Actualizar AGENT_RELAY_URL en .env --
Write-Host ""
Write-Host "[4] Actualizando AGENT_RELAY_URL en .env..." -ForegroundColor Yellow
$envContent = Get-Content "$Root\.env" -Raw -Encoding UTF8
if ($envContent -match "AGENT_RELAY_URL=.+") {
    $envContent = $envContent -replace "AGENT_RELAY_URL=.+", "AGENT_RELAY_URL=$tunnelUrl"
} else {
    $envContent = $envContent.TrimEnd() + "`nAGENT_RELAY_URL=$tunnelUrl`n"
}
[System.IO.File]::WriteAllText("$Root\.env", $envContent, [System.Text.Encoding]::UTF8)
Write-Host "    OK" -ForegroundColor Green

# -- Actualizar AGENT_RELAY_URL en Vercel si el proyecto ya esta vinculado --
Write-Host ""
Write-Host "[5] Actualizando Vercel..." -ForegroundColor Yellow
$vercelOk = (Get-Command "vercel" -ErrorAction SilentlyContinue) -and (Test-Path "$Root\.vercel\project.json")
if ($vercelOk) {
    # Borrar la variable vieja (--yes para no pedir confirmacion)
    cmd /c "vercel env rm AGENT_RELAY_URL production --yes" 2>$null | Out-Null
    # Agregar la nueva (se lee de stdin via echo)
    cmd /c "echo $tunnelUrl | vercel env add AGENT_RELAY_URL production" 2>$null | Out-Null
    # Redeploy rapido
    Write-Host "    Redesplegando..." -NoNewline
    cmd /c "vercel --prod --yes" 2>$null | Out-Null
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host "    Proyecto Vercel aun no vinculado. Corre vercel-deploy.ps1 primero." -ForegroundColor Gray
}

# -- Resumen --
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ACCESO REMOTO ACTIVO" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Tunnel: $tunnelUrl" -ForegroundColor Cyan
Write-Host "  Relay PID: $($relayProc.Id)" -ForegroundColor Gray
Write-Host "  Tunnel PID: $($tunnelProc.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "  No cierres la ventana 'RELAY 10Apostoles'" -ForegroundColor Yellow
Write-Host "  mientras uses el dashboard remotamente." -ForegroundColor Yellow
Write-Host ""
Write-Host "Presiona Enter para cerrar esta ventana..."
Read-Host
