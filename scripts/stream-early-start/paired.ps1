# Paired, alternating runs of the diagnostic spec. Args: rounds, out file, then name=url pairs.
param([int]$Rounds = 6, [string]$Out, [string[]]$Conds, [switch]$Blank)
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
$env:DIAG_OUT = $Out; $env:STOP_AFTER = '1'; Remove-Item Env:PROFILE -ErrorAction SilentlyContinue
if ($Blank) { $env:BLANK_FIRST = '1' } else { Remove-Item Env:BLANK_FIRST -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt $Rounds; $i++) {
  $order = if ($i % 2) { $Conds[($Conds.Count - 1)..0] } else { $Conds }
  foreach ($c in $order) {
    $name, $url = $c -split '=', 2
    if ($name -like "*-blank") { $env:BLANK_FIRST = "1" } elseif (-not $Blank) { Remove-Item Env:BLANK_FIRST -ErrorAction SilentlyContinue }
    $env:VARIANT = $name; $env:E2E_BASE_URL = $url
    $load = node scripts/perf-p1/load.mjs 1500
    $o = npx playwright test -c scripts/stream-early-start/diag/playwright.config.ts --reporter=line 2>&1 | Select-String '^DIAG|passed|failed'
    "$i $name $load " + (($o | ForEach-Object { $_.Line }) -join ' ' -replace '.*"afterLoadMs":(\d+).*?"gl":"([^"]{0,40}).*', 'afterLoad=$1 gl=$2')
  }
}
