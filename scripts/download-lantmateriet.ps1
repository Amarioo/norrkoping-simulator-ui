#requires -Version 7.0
[CmdletBinding()]
param([switch]$CatalogOnly, [ValidateSet('Laser','Terrain')][string]$Product = 'Laser')
$ErrorActionPreference = 'Stop'
# Read the current map extent, not a landmark-specific area. OSM bbox = south,west,north,east.
$mapPath = Join-Path $PSScriptRoot '../src/lib/data/norrkoping-map.json'
$map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
$bbox = @($map.meta.bbox)
if ($bbox.Count -ne 4 -or $bbox[0] -ge $bbox[2] -or $bbox[1] -ge $bbox[3]) { throw 'Invalid map bbox.' }
$stacBbox = (@($bbox[1],$bbox[0],$bbox[3],$bbox[2]) | ForEach-Object { $_.ToString('R',[Globalization.CultureInfo]::InvariantCulture) }) -join ','
$collection = if ($Product -eq 'Terrain') { 'dtm-cog' } else { 'dsm-skoglig-copc' }
$catalogUrl = 'https://api.lantmateriet.se/stac-hojd/v1/search?collections=' + $collection + '&bbox=' + $stacBbox + '&limit=100'
$collectionUrl = 'https://api.lantmateriet.se/stac-hojd/v1/collections/' + $collection
$features = [Collections.Generic.List[object]]::new()
$visited = [Collections.Generic.HashSet[string]]::new()
$next = $catalogUrl
while ($next) {
    $uri = [Uri]$next
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'api.lantmateriet.se' -or -not $uri.AbsolutePath.StartsWith('/stac-hojd/v1/') -or $uri.UserInfo) { throw 'Unexpected catalog URL.' }
    if (-not $visited.Add($next)) { throw 'Catalog pagination loop.' }
    $page = Invoke-RestMethod $uri
    foreach ($feature in $page.features) { $features.Add($feature) }
    $link = @($page.links | Where-Object rel -eq 'next')
    if ($link.Count -gt 1) { throw 'Ambiguous catalog pagination.' }
    if ($link.Count -and $link[0].method -and $link[0].method -ne 'GET') { throw 'Unsupported pagination method.' }
    $next = if ($link.Count) { $link[0].href } else { $null }
}
# Avoid downloading both 10 km merged files and their 2.5 km component tiles.
$small = @($features | Where-Object {
    $b = $_.assets.data.'proj:bbox'
    $b.Count -eq 4 -and ($b[2]-$b[0]) -gt 0 -and ($b[3]-$b[1]) -gt 0 -and ($Product -eq 'Terrain' -or (($b[2]-$b[0]) -le 2500 -and ($b[3]-$b[1]) -le 2500))
})
# If repeat surveys cover the same delivery cell, prefer the latest acquisition, not conversion time.
$tiles = @($small | Group-Object { $_.assets.data.'proj:bbox' -join ',' } | ForEach-Object {
    $_.Group | Sort-Object { [datetime]$_.properties.datetime } -Descending | Select-Object -First 1
} | Sort-Object id)
if ($tiles.Count -eq 0) { throw 'No small COPC tiles found. No download attempted.' }
$directory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../work/geodata/lantmateriet'))
if ($Product -eq 'Terrain') { $directory = Join-Path $directory 'dtm' }
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$catalog = @{type='FeatureCollection';bbox=@($bbox[1],$bbox[0],$bbox[3],$bbox[2]);features=$tiles;links=@(@{rel='source';href=$catalogUrl})}
$catalog | ConvertTo-Json -Depth 40 | Set-Content -Encoding utf8 (Join-Path $directory 'catalog.json')
Invoke-RestMethod $collectionUrl | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 (Join-Path $directory 'collection.json')
# Ensure the selected footprints actually cover the map, before claiming complete acquisition.
& node (Join-Path $PSScriptRoot 'check-lidar-coverage.mjs') $Product
if ($LASTEXITCODE -ne 0) { throw 'Selected source footprints do not cover the map. Inspect coverage-report.json.' }
$pending = [Collections.Generic.List[object]]::new()
$rows = foreach ($tile in $tiles) {
    $asset = $tile.assets.data
    $uri = [Uri]$asset.href
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'dl1.lantmateriet.se' -or $uri.UserInfo) { throw 'Unexpected download host; credentials not sent.' }
    $name = [IO.Path]::GetFileName($uri.AbsolutePath)
    if (-not (($Product -eq 'Laser' -and $name.EndsWith('.copc.laz')) -or ($Product -eq 'Terrain' -and $name.EndsWith('.tif')))) { throw 'Unexpected file format.' }
    $checksum = $asset.'file:checksum'
    if ($checksum -notmatch '^1220[0-9a-fA-F]{64}$') { throw 'Expected SHA-256 multihash missing.' }
    $file = Join-Path $directory $name
    $verified = (Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -eq $asset.'file:size' -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $checksum.Substring(4)
    if (-not $verified) { $pending.Add($tile) }
    [PSCustomObject]@{Tile=$tile.id;Acquired=$tile.properties.datetime;MiB=[Math]::Round($asset.'file:size'/1MB,1);State=if($verified){'Verified'}else{'Missing'}}
}
$rows | Format-Table
$bytes = ($pending | ForEach-Object {$_.assets.data.'file:size'} | Measure-Object -Sum).Sum
Write-Host ('Full map: {0} tiles; {1} verified; {2} remaining ({3:N2} GiB).' -f $tiles.Count,($tiles.Count-$pending.Count),$pending.Count,($bytes/1GB))
if ($CatalogOnly -or $pending.Count -eq 0) { return }
$credential = Get-Credential -Message 'Lantmateriet API login. Private: Geotorget account. Organisation: system account. Credentials are not saved.'
try {
    foreach ($tile in $pending) {
        $asset = $tile.assets.data
        $uri = [Uri]$asset.href
        $name = [IO.Path]::GetFileName($uri.AbsolutePath)
        $file = Join-Path $directory $name
        Write-Host "Downloading $name"
        # Refuse redirects so credentials cannot be forwarded to another host.
        Invoke-WebRequest -Uri $uri -Authentication Basic -Credential $credential -MaximumRedirection 0 -OutFile ($file + '.partial')
        if ((Get-Item -LiteralPath ($file + '.partial')).Length -ne $asset.'file:size') { throw "Unexpected file size: $name" }
        if ((Get-FileHash -LiteralPath ($file + '.partial') -Algorithm SHA256).Hash -ne $asset.'file:checksum'.Substring(4)) { throw "Checksum mismatch: $name" }
        # Both paths are direct child files of the explicit geodata directory; no recursive move.
        Move-Item -LiteralPath ($file + '.partial') -Destination $file -Force
        Write-Host "Verified: $file"
    }
} finally { $credential = $null }
& node (Join-Path $PSScriptRoot 'check-lidar-coverage.mjs') $Product
Write-Host 'Full-map download finished. Tell Codex the files are ready; no login details are needed in chat.'
