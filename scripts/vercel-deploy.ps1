# =============================================================================
# vercel-deploy.ps1 - Deploy inicial a Vercel (correr UNA SOLA VEZ)
# Prerequisito: correr start-remote.ps1 primero para tener el tunnel activo
# Uso: powershell -ExecutionPolicy Bypass -File scripts\vercel-deploy.ps1
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent

function Read-EnvFile($path) {
    $vars = @{}
    foreach ($line in (Get-Content $path -Encoding UTF8)) {
        $line = $line.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { continue }
        $eq = $line.IndexOf("=")
        if ($eq -lt 0) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        $vars[$key] = $val
    }
    return $vars
}

function Set-VercelEnv($name, $value) {
    Write-Host "  configurando $name..." -NoNewline -ForegroundColor Gray
    # Borrar si existe
    cmd /c "vercel env rm $name production --yes" 2>$null | Out-Null
    # Agregar (cmd /c evita el NativeCommandError de PowerShell 5.1)
    cmd /c "echo $value | vercel env add $name production" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " ERROR (verificar en vercel.com)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Deploy 10Apostoles a Vercel" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $Root

# -- Verificar relay corriendo --
Write-Host "[0] Verificando relay local..." -ForegroundColor Yellow
$relayOk = $false
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/health" -UseBasicParsing -TimeoutSec 3
    $relayOk = ($r.StatusCode -eq 200)
} catch { }

if ($relayOk) {
    Write-Host "    Relay OK" -ForegroundColor Green
} else {
    Write-Host "    AVISO: relay no esta corriendo." -ForegroundColor Yellow
    Write-Host "    Corre start-remote.ps1 en otra terminal para tener la URL del tunnel." -ForegroundColor Yellow
    Write-Host "    Continuando con AGENT_RELAY_URL del .env actual..." -ForegroundColor Gray
    Write-Host ""
}

# -- Leer .env --
Write-Host "[1] Leyendo configuracion..." -ForegroundColor Yellow
$envVars = Read-EnvFile "$Root\.env"

# Agregar ACCOUNTS_JSON como una sola linea
$accountsRaw = Get-Content "$Root\agents\accounts.json" -Raw -Encoding UTF8
$accountsOneLine = ($accountsRaw -replace "`r`n|`n|`r", " " -replace "\s+", " ").Trim()
$envVars["ACCOUNTS_JSON"] = $accountsOneLine

Write-Host "    $($envVars.Count) variables encontradas" -ForegroundColor Green

# -- Login a Vercel --
Write-Host ""
Write-Host "[2] Verificando login en Vercel..." -ForegroundColor Yellow
$whoami = cmd /c "vercel whoami" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $whoami) {
    Write-Host "    No estas logueado. Se abrira el browser..." -ForegroundColor Yellow
    cmd /c "vercel login"
} else {
    Write-Host "    Logueado como: $whoami" -ForegroundColor Green
}

# -- Generar cliente Prisma para Linux --
Write-Host ""
Write-Host "[3] Generando cliente Prisma para Vercel (Linux)..." -ForegroundColor Yellow
cmd /c "npx prisma generate" 2>$null | Out-Null
Write-Host "    OK" -ForegroundColor Green

# -- Primer deploy para vincular el proyecto --
Write-Host ""
Write-Host "[4] Vinculando proyecto con Vercel..." -ForegroundColor Yellow
if (-not (Test-Path "$Root\.vercel\project.json")) {
    Write-Host "    (Primera vez: responde a las preguntas que aparecen)" -ForegroundColor Gray
    Write-Host "      -> Set up and deploy? Y" -ForegroundColor DarkGray
    Write-Host "      -> Link to existing project? N" -ForegroundColor DarkGray
    Write-Host "      -> Project name: 10apostoles" -ForegroundColor DarkGray
    Write-Host "      -> Directory: ./ (Enter)" -ForegroundColor DarkGray
    Write-Host ""
    vercel
} else {
    Write-Host "    Proyecto ya vinculado" -ForegroundColor Green
}

# -- Configurar variables de entorno --
Write-Host ""
Write-Host "[5] Configurando variables de entorno en Vercel..." -ForegroundColor Yellow

$varsToSet = @(
    "DATABASE_URL", "DIRECT_URL",
    "AUTH_PASSWORD", "AUTH_SECRET",
    "OPENROUTER_API_KEY", "OPENROUTER_MODEL",
    "AGENT_RELAY_URL", "AGENT_RELAY_TOKEN",
    "ACCOUNTS_JSON"
)

foreach ($varName in $varsToSet) {
    if ($envVars.ContainsKey($varName)) {
        Set-VercelEnv $varName $envVars[$varName]
    } else {
        Write-Host "  $varName... FALTA en .env" -ForegroundColor Red
    }
}

# -- Deploy final a produccion --
Write-Host ""
Write-Host "[6] Deploy final a produccion..." -ForegroundColor Yellow
cmd /c "vercel --prod --yes"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deploy completado!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "La URL del dashboard esta arriba (vercel.app)." -ForegroundColor White
Write-Host "Cada vez que quieras acceso remoto: corre start-remote.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Enter para cerrar..."
Read-Host
