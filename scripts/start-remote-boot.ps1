# =============================================================================
# start-remote-boot.ps1 - Arranque DESATENDIDO del acceso remoto (Task Scheduler)
#
# Versión no interactiva de start-remote.ps1. Pensada para correr sola al iniciar
# sesión de Windows. NO usa Read-Host y NO toca Vercel: la URL del túnel se propaga
# por la base de datos (AppSetting) que el dashboard lee en cada request.
#
# Pasos: espera NSTBrowser -> abre los 5 perfiles -> relay -> túnel -> .env + DB.
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root "logs"
$Stamp = (Get-Date -Format "yyyyMMdd-HHmmss")
$TunnelLog = "$env:TEMP\10apostoles-tunnel.log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "remote-$Stamp.log"

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Log "=== start-remote-boot inicio ==="
Set-Location $Root

# -- [0] Verificar dependencias --
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Log "ERROR: Node.js no encontrado."; exit 1
}
if (-not (Get-Command "cloudflared" -ErrorAction SilentlyContinue)) {
    Log "ERROR: cloudflared no encontrado. Descargar de https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
}

# -- [1] Esperar a NSTBrowser en puerto 8848 (hasta 90s) --
Log "[1] Esperando NSTBrowser en puerto 8848..."
$nstReady = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", 8848)
        $nstReady = $true
        $tcp.Close()
        break
    } catch {
        $tcp.Close()
        Start-Sleep -Seconds 10
    }
}
if (-not $nstReady) {
    Log "ERROR: NSTBrowser no respondio en puerto 8848 tras 90s. Abortando."
    exit 1
}
Log "    NSTBrowser API OK"

# -- [2] Abrir los 5 perfiles --
Log "[2] Abriendo todos los perfiles (browser-cdp start-all)..."
$startAllOut = Join-Path $LogDir "start-all-$Stamp.log"
cmd /c "cd /d `"$Root`" && python agents/browser-cdp.py start-all >> `"$startAllOut`" 2>&1"
Log "    start-all terminado (exit $LASTEXITCODE). Detalle en $startAllOut"

# -- [3] Limpiar y arrancar relay --
Log "[3] Limpiando procesos anteriores (cloudflared y relay en puerto 3099)..."
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
# Matar cualquier relay viejo que tenga tomado el puerto 3099 (idempotencia en re-ejecuciones)
Get-NetTCPConnection -LocalPort 3099 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

Log "    Arrancando relay server..."
$relayProc = Start-Process -FilePath "node" `
    -ArgumentList "`"$Root\scripts\agent-relay.mjs`"" `
    -WorkingDirectory $Root `
    -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

$relayOk = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3099/health" -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) { $relayOk = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if ($relayOk) {
    Log "    Relay corriendo (PID $($relayProc.Id))"
} else {
    Log "ERROR: el relay no arranco. Abortando."
    exit 1
}

# -- [4] Arrancar Cloudflare Tunnel y capturar URL --
Log "[4] Iniciando Cloudflare Tunnel..."
Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue
$tunnelProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:3099" `
    -RedirectStandardError $TunnelLog `
    -PassThru -WindowStyle Hidden

$tunnelUrl = $null
for ($i = 0; $i -lt 35; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $TunnelLog) {
        $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
            $tunnelUrl = $matches[0]
            break
        }
    }
}
if (-not $tunnelUrl) {
    Log "ERROR: No se pudo obtener la URL del tunnel. Ultimas lineas del log:"
    if (Test-Path $TunnelLog) { Get-Content $TunnelLog | Select-Object -Last 5 | ForEach-Object { Log "    $_" } }
    exit 1
}
Log "    Tunnel URL: $tunnelUrl (PID $($tunnelProc.Id))"

# -- [5a] Actualizar AGENT_RELAY_URL en .env (lo usan los agentes locales) --
Log "[5a] Actualizando AGENT_RELAY_URL en .env..."
$envPath = Join-Path $Root ".env"
$envContent = Get-Content $envPath -Raw -Encoding UTF8
if ($envContent -match "AGENT_RELAY_URL=.+") {
    $envContent = $envContent -replace "AGENT_RELAY_URL=.+", "AGENT_RELAY_URL=$tunnelUrl"
} else {
    $envContent = $envContent.TrimEnd() + "`nAGENT_RELAY_URL=$tunnelUrl`n"
}
[System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.Encoding]::UTF8)
Log "    .env actualizado"

# -- [5b] Escribir la URL en la DB (la lee el dashboard de Vercel, SIN redeploy) --
Log "[5b] Escribiendo AGENT_RELAY_URL en la base de datos..."
$setOut = cmd /c "cd /d `"$Root`" && node scripts/set-relay-url.mjs `"$tunnelUrl`" 2>&1"
Log "    set-relay-url: $setOut"
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: no se pudo escribir la URL en la DB. El dashboard remoto no vera el nuevo tunnel."
    exit 1
}

Log "=== ACCESO REMOTO ACTIVO ==="
Log "    Tunnel: $tunnelUrl"
Log "    Relay PID: $($relayProc.Id) | Tunnel PID: $($tunnelProc.Id)"
Log "=== start-remote-boot fin ==="
