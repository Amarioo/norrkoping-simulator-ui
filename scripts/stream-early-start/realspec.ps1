# The unchanged tests/simulation.spec.ts, alternating between two dev servers. Prints one line per run.
param([int]$Rounds = 10, [string[]]$Conds)
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
for ($i = 0; $i -lt $Rounds; $i++) {
  $order = if ($i % 2) { $Conds[($Conds.Count - 1)..0] } else { $Conds }
  foreach ($c in $order) {
    $name, $url = $c -split '=', 2
    $env:E2E_BASE_URL = $url
    $load = node scripts/perf-p1/load.mjs 1500
    $o = npx playwright test tests/simulation.spec.ts --reporter=line 2>&1 | Out-String
    $res = if ($o -match '1 passed') { 'PASS' } elseif ($o -match '>\s+(\d+) \|') { 'FAIL line ' + $Matches[1] } else { 'FAIL ?' }
    "$i $name $res $load"
  }
}
