# Kleine webserver voor de CMS-demo. Alleen bereikbaar op deze computer
# (localhost). Er wordt niets geinstalleerd en niets naar internet gestuurd.
# Stoppen: sluit dit venster.

param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'website'))
if (-not (Test-Path $root)) {
  Write-Host 'De map "website" ontbreekt. Pak eerst de hele zip uit.'
  Read-Host 'Druk op Enter om te sluiten'
  exit 1
}

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'
  '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.xml' = 'application/xml'
  '.txt' = 'text/plain; charset=utf-8'
}

$listener = $null
foreach ($p in 8080..8099) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $port = $p; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host 'Geen vrije poort gevonden (8080-8099).'
  Read-Host 'Druk op Enter om te sluiten'
  exit 1
}

$base = "http://localhost:$port"
Write-Host ''
Write-Host '  CMS-demo draait.'
Write-Host "  Beheer:   $base/admin/"
Write-Host "  Website:  $base/"
Write-Host ''
Write-Host '  Laat dit venster open zolang je de demo gebruikt.'
Write-Host '  Sluit dit venster om te stoppen.'
if (-not $NoBrowser) { Start-Process "$base/admin/" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    $file = [IO.Path]::GetFullPath((Join-Path $root ($rel.TrimStart('/') -replace '/', '\')))
    # Nette adressen zonder .html (zoals Cloudflare Pages): /menu -> menu.html
    if (-not (Test-Path -LiteralPath $file) -and (Test-Path -LiteralPath "$file.html" -PathType Leaf)) { $file = "$file.html" }
    if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
    } elseif ((Test-Path -LiteralPath $file -PathType Container) -and -not $rel.EndsWith('/')) {
      $res.StatusCode = 301
      $res.RedirectLocation = $req.Url.AbsolutePath + '/'
    } else {
      if (Test-Path -LiteralPath $file -PathType Container) { $file = Join-Path $file 'index.html' }
      $status = 200
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { $status = 404; $file = Join-Path $root '404.html' }
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $type = $types[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $res.StatusCode = $status
      $res.ContentType = $type
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    try { $res.StatusCode = 500 } catch { }
  } finally {
    $res.Close()
  }
}
