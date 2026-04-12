# BBSNS Admin Console - Professional Isolation Build Script
# 🛡️ [DISCIPLINED DISTRIBUTION PROTOCOL v1.5]
# Purpose: Resilience - Forcing devDependencies for production building.

$ErrorActionPreference = "Stop" 
$SourceDir = $PSScriptRoot + "\Frontend Desktop Application"
$TargetDir = "D:\BBSNS_DEPLOY"
$AppDir = "$TargetDir\Frontend Desktop Application"

Write-Host "`n====================================================" -ForegroundColor Magenta
Write-Host "🚀 BBSNS DESKTOP CONSOLE - ISOLATION BUILD (v1.5)" -ForegroundColor Magenta
Write-Host "  [*] SOURCE: $SourceDir" -ForegroundColor Gray
Write-Host "  [*] TARGET: $TargetDir" -ForegroundColor Gray
Write-Host "====================================================`n" -ForegroundColor Magenta

# [STEP 1] Initialization
Write-Host "[STEP 1] INITIALIZING CLEAN WORKSPACE..." -ForegroundColor Cyan
Write-Host "  [*] Terminating locking processes (Safety Protocol)..." -ForegroundColor Gray
Stop-Process -Name "BBSNS Desktop Console" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  [-] Purging stale D:\BBSNS_DEPLOY folder..." -ForegroundColor Gray
if (Test-Path $TargetDir) {
    $oldPref = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    Remove-Item -Recurse -Force $TargetDir -ErrorAction SilentlyContinue
    $ErrorActionPreference = $oldPref
}

# 🛡️ [RESILIENCE] Purge any stale Electron artifacts
$ElectronDist = "$SourceDir\dist-electron"
if (Test-Path $ElectronDist) {
    Write-Host "  [-] Purging stale $ElectronDist..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $ElectronDist -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
Write-Host "  [OK] Workspace: $AppDir" -ForegroundColor Green

# [STEP 2] Migrating Source
Write-Host "`n[STEP 2] MIGRATING SOURCE..." -ForegroundColor Cyan
$Whitelist = @("src", "public", "assets", "Remote Auth", "package.json", "main.js", "preload.js", "index.html", "vite.config.ts", "tailwind.config.js", "tsconfig.json", "tsconfig.node.json", "tsconfig.app.json", ".env.production")
foreach ($item in $Whitelist) {
    if (Test-Path "$SourceDir\$item") { Copy-Item -Path "$SourceDir\$item" -Destination $AppDir -Recurse -Force }
}
Write-Host "  [OK] Migrated Source." -ForegroundColor Green

# [STEP 3] Authoritative Restoration (FORCING DEV TOOLS)
Write-Host "`n[STEP 3] PERFORMING AUTHORITATIVE RESTORATION (DEV TOOLS)..." -ForegroundColor Cyan
Set-Location $AppDir

# 🛡️ [RESILIENCE] Override potential NODE_ENV=production to ensure Vite/Electron are fetched
$env:NODE_ENV = 'development'
$oldPref = $ErrorActionPreference; $ErrorActionPreference = "Continue"

Write-Host "  [*] Cleaning npm cache..." -ForegroundColor Gray
& npm cache clean --force 2>$null

Write-Host "  [*] Resolving FULL dependency tree (Force Include Dev)..." -ForegroundColor Gray
& npm install --prefix . --include=dev --no-bin-links --legacy-peer-deps

$ErrorActionPreference = $oldPref

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] npm install failed." -ForegroundColor Red; exit 1
}
Write-Host "  [OK] Toolchain installed." -ForegroundColor Green

# [STEP 4] Dynamic Tool Discovery
Write-Host "`n[STEP 4] DISCOVERING TOOLCHAIN ENTRY POINTS..." -ForegroundColor Cyan
Write-Host "  [*] Searching for vite.js..." -ForegroundColor Gray
$ViteBin = Get-ChildItem -Path "node_modules" -Filter "vite.js" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

Write-Host "  [*] Searching for electron-builder cli..." -ForegroundColor Gray
$BuilderBin = Get-ChildItem -Path "node_modules" -Filter "cli.js" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*electron-builder*" } | Select-Object -First 1 -ExpandProperty FullName

if ($ViteBin) {
    Write-Host "  [OK] Vite found at: $ViteBin" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Vite binary NOT found. Check devDependencies in package.json." -ForegroundColor Red; exit 1
}

if ($BuilderBin) {
    Write-Host "  [OK] Builder found at: $BuilderBin" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Electron-builder NOT found." -ForegroundColor Red; exit 1
}

# [STEP 5] UI Build
Write-Host "`n[STEP 5] BUILDING UI (VITE DISCOVERY)..." -ForegroundColor Cyan

# 🛡️ [RESILIENCE] Authoritative Build-Level Environment Injection
# We inject these here to override stale values in .env files without modifying them.
$env:VITE_API_BASE_URL = "https://api.bbsns.online"
$env:VITE_BOOTSTRAP_API_URL = "https://api.bbsns.online"
$env:VITE_AUTH_URL = "https://auth.bbsns.online"
$env:VITE_ENV_AUTHORITY = "PRODUCTION"

& node $ViteBin build
if ($LASTEXITCODE -ne 0 -or !(Test-Path "build\index.html")) {
    Write-Host "  [FAIL] UI Build failed." -ForegroundColor Red; exit 1
}
Write-Host "  [OK] Assets generated." -ForegroundColor Green

# [STEP 6] Installer Generation
Write-Host "`n[STEP 6] GENERATING INSTALLER (BUILDER DISCOVERY)..." -ForegroundColor Cyan
& node $BuilderBin --win
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Installer build failed." -ForegroundColor Red; exit 1
}

# [STEP 7] Artifact Validation
Write-Host "`n[STEP 7] VALIDATING ARTIFACT..." -ForegroundColor Cyan
$ArtifactPath = "$AppDir\dist-electron\BBSNS-Desktop-Setup.exe"
if (Test-Path $ArtifactPath) {
    $Size = (Get-Item $ArtifactPath).Length / 1MB
    Write-Host "  [SUCCESS] Professional Setup Generated! ($Size MB)" -ForegroundColor Green
    Write-Host "  [MATCH] artifactName: BBSNS-Desktop-Setup.exe" -ForegroundColor Gray
} else {
    Write-Host "  [FAIL] Artifact missing." -ForegroundColor Red; exit 1
}

Write-Host "`n✅ PROTOCOL COMPLETE." -ForegroundColor Magenta
