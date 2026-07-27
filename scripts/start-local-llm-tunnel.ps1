# Expone el proxy autenticado de IA local mediante un túnel temporal y sincroniza
# la URL con Vercel. Requiere: cloudflared, Vercel CLI autenticada y .vercel/project.json.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$TunnelLog = Join-Path $env:TEMP "pcmidi-local-llm-tunnel.log"
$RelayPort = if ($env:LLM_RELAY_PORT) { $env:LLM_RELAY_PORT } else { "3100" }

foreach ($command in @("node", "cloudflared", "vercel")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Falta el comando requerido: $command"
  }
}
if (-not (Test-Path (Join-Path $Root ".vercel\project.json"))) {
  throw "El proyecto no esta vinculado a Vercel (.vercel/project.json)."
}

$envPath = Join-Path $Root ".env"
$envLines = Get-Content $envPath -ErrorAction Stop
$tokenLine = $envLines | Where-Object { $_ -match '^AGENT_RELAY_TOKEN=' } | Select-Object -First 1
if (-not $tokenLine) { throw "Falta AGENT_RELAY_TOKEN en .env" }
$relayToken = ($tokenLine -split "=", 2)[1].Trim().Trim('"').Trim("'")
if ($relayToken.Length -lt 24) { throw "AGENT_RELAY_TOKEN debe tener al menos 24 caracteres." }

# El relay sólo escucha en 127.0.0.1; cloudflared es el único proceso expuesto.
$existingRelay = Get-NetTCPConnection -LocalPort $RelayPort -State Listen -ErrorAction SilentlyContinue
if (-not $existingRelay) {
  $previousPort = $env:AGENT_RELAY_PORT
  $env:AGENT_RELAY_PORT = $RelayPort
  $relay = Start-Process -FilePath node -ArgumentList (Join-Path $Root "scripts\agent-relay.mjs") -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  $env:AGENT_RELAY_PORT = $previousPort
  Start-Sleep -Seconds 2
}

try {
  Invoke-WebRequest -Uri "http://127.0.0.1:$RelayPort/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
  throw "El relay local no pudo iniciar en el puerto 3099."
}

Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath cloudflared -ArgumentList "tunnel", "--url", "http://127.0.0.1:$RelayPort" -RedirectStandardError $TunnelLog -WindowStyle Hidden -PassThru
$tunnelUrl = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $TunnelLog) {
    $content = Get-Content $TunnelLog -Raw
    if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") { $tunnelUrl = $matches[0]; break }
  }
}
if (-not $tunnelUrl) { throw "No se pudo obtener la URL del túnel temporal." }

$baseUrl = "$tunnelUrl/v1"
Push-Location $Root
try {
  function Set-VercelProductionEnv([string]$name, [string]$value) {
    # --force sirve tanto para el alta inicial como para reemplazar una URL anterior.
    $value | & vercel env add $name production --force --yes 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar $name en Vercel." }
  }

  # El secreto del relay se instala como clave de la IA local, nunca se imprime.
  Set-VercelProductionEnv "LLM_LOCAL_BASE_URL" $baseUrl
  Set-VercelProductionEnv "LLM_LOCAL_API_KEY" $relayToken
  Set-VercelProductionEnv "LLM_PROVIDER" "schedule"
  $deployment = vercel --prod --yes
} finally {
  Pop-Location
}

Write-Host "IA local expuesta de forma temporal y protegida." -ForegroundColor Green
Write-Host "URL sincronizada en Vercel: $baseUrl" -ForegroundColor Cyan
Write-Host "Tunnel PID: $($tunnel.Id). Mantene esta PC encendida." -ForegroundColor Yellow
