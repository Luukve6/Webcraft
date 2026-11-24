param(
  [Parameter(Mandatory = $true)][string]$WebsiteMap,
  [Parameter(Mandatory = $true)][string]$UitvoerMap
)

$bron = (Resolve-Path -LiteralPath $WebsiteMap).Path
$uit = (Resolve-Path -LiteralPath $UitvoerMap).Path
$datum = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$zip = Join-Path $uit "webcraft-deployment-$datum.zip"

# Een deployment-archief bevat uitsluitend de gepubliceerde vaste bestanden.
# admin/, functions/, .git en lokale instellingen horen nooit in dit archief.
# Gebruik de gekozen uitvoermap voor tijdelijke bestanden. Daardoor blijft de hele
# bewerking binnen één, voor de gebruiker zichtbare en controleerbare locatie.
$tijdelijk = Join-Path $uit ".webcraft-deployment-$datum"
New-Item -ItemType Directory -Path $tijdelijk -Force | Out-Null
try {
  Get-ChildItem -LiteralPath $bron -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\(admin|functions|\.git|\.wrangler)(\\|$)' -and $_.Name -ne 'wrangler.toml'
  } | ForEach-Object {
    $rel = $_.FullName.Substring($bron.Length).TrimStart('\')
    $doel = Join-Path $tijdelijk $rel
    New-Item -ItemType Directory -Path (Split-Path $doel) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $doel
  }
  # -Path (en niet -LiteralPath) laat PowerShell de inhoud van de tijdelijke map opnemen.
  Compress-Archive -Path (Join-Path $tijdelijk '*') -DestinationPath $zip -CompressionLevel Optimal
  Write-Output $zip
} finally { Remove-Item -LiteralPath $tijdelijk -Recurse -Force -ErrorAction SilentlyContinue }
