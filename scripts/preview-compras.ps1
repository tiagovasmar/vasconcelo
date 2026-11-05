$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$previewPath = Join-Path (Get-Location) '.local/compras-preview'
New-Item -ItemType Directory -Force -Path $previewPath | Out-Null
$env:DEV_PG_PORT = '54571'
$env:DEV_PG_DIR = Join-Path (Get-Location) '.local/dev-pg-compras'
$env:DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:54571/vasconcelo_dev'
$env:DIRECT_URL = $env:DATABASE_URL
$env:ENTORNO_LOCAL = '1'
$env:ENTORNO_DESCARTABLE = '1'
$env:BETTER_AUTH_URL = 'http://127.0.0.1:3127'
$env:BETTER_AUTH_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:ADMIN_EMAIL = 'admin.compras@example.test'
$env:STORAGE_DRIVER = 'local'
$env:RECEIPTS_DIR = Join-Path $previewPath 'receipts'
$env:UPLOADS_DIR = Join-Path $previewPath 'uploads'
$env:MAIL_DIR = Join-Path $previewPath 'mail'
$env:MAIL_TRANSPORT = 'local'
$env:FX_AUTO_REFRESH = '0'
$env:GOOGLE_CLIENT_ID = ' '
$env:GOOGLE_CLIENT_SECRET = ' '
$env:WHATSAPP_NUMBER = ' '
$env:NEXT_DIST_DIR = '.next-preview-compras'
$env:IMPORT_PREORDERS_ENABLED = '1'
$env:IMPORT_PREORDER_HOLD_HOURS = '24'
$env:NEXT_TELEMETRY_DISABLED = '1'
$previewNode = (Get-Command node).Source
if (Get-NetTCPConnection -LocalPort 3127 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host 'Puerto 3127 ocupado. Si ya iniciaste Compras, abrí http://127.0.0.1:3127/admin/compras.'
    return
}
if (-not (Get-NetTCPConnection -LocalPort 54571 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $previewNode -ArgumentList 'node_modules/tsx/dist/cli.mjs','scripts/dev-db.ts' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewPath 'db.log') -RedirectStandardError (Join-Path $previewPath 'db.err')
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if (Select-String -Path (Join-Path $previewPath 'db.log') -Pattern 'PostgreSQL de desarrollo listo' -Quiet -ErrorAction SilentlyContinue) { break }
        Start-Sleep -Milliseconds 300
    }
    if ($attempt -eq 100) { throw 'No arrancó el PostgreSQL de la vista previa. Revisá .local/compras-preview/db.err.' }
}
& $previewNode --conditions=react-server node_modules/tsx/dist/cli.mjs scripts/dev-compras.ts
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron crear las cuentas de prueba.' }
Start-Process -FilePath $previewNode -ArgumentList 'node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3127' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewPath 'next.log') -RedirectStandardError (Join-Path $previewPath 'next.err')

Write-Host "Vista previa local en http://127.0.0.1:3127/admin/compras"
