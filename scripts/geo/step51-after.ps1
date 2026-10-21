# Step 5.1: the measurement round after road_patches.py --apply (PowerShell, from the repository root).
#   fixtures (backend contract), diagnostics, ridden rail profile + evidence, per-candidate measurement,
#   creases on patches (also measured on the Step 5 baseline copy work/step51/before-app), report.
# Usage: pwsh -File scripts/geo/step51-after.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$py = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$cfg = 'scripts/geo/vitest.infra.config.ts'
Set-Location $root
New-Item -ItemType Directory -Force work/step51 | Out-Null
function Probe($test, $vars) {
  foreach ($k in $vars.Keys) { Set-Item "env:$k" $vars[$k] }
  npx vitest run -c $cfg $test 2>&1 | Out-Null
  foreach ($k in $vars.Keys) { Set-Item "env:$k" $null }
}
npx vitest run -c $cfg scripts/geo/infra-profile-control.test.ts scripts/geo/infra-mesh-control.test.ts 2>&1 | Select-Object -Last 2
Probe scripts/geo/infra-diagnose.test.ts @{ INFRA_OUT = 'work/step51/diagnose-after.json' }
Probe scripts/geo/infra-step51-railprofile.test.ts @{ OUT = 'work/step51/rail-profile-after.json' }
Probe scripts/geo/infra-step51-measure.test.ts @{ OUT = 'work/step51/measure-after.json' }
Probe scripts/geo/infra-step51-patchsites.test.ts @{ OUT = 'work/step51/patch-sites.json' }
& $py scripts/geo/rail_grade_evidence.py work/step51/rail-profile-after.json work/step51/rail-grade-evidence-after.json | Select-Object -First 1
$before = "$root\work\step51\before-app"
if (Test-Path $before) {
  Copy-Item work/step51/patch-sites.json "$before\work\step51\" -Force
  Push-Location $before
  Probe scripts/geo/infra-step51-measure.test.ts @{ SITES = 'work/step51/patch-sites.json'; OUT = 'work/step51/patch-sites-before.json' }
  Pop-Location
  Copy-Item "$before\work\step51\patch-sites-before.json" work/step51/ -Force
}
node scripts/geo/diagnose-compare.mjs work/step51/diagnose-before.json work/step51/diagnose-after.json | Select-Object -First 23
& $py scripts/geo/refinement_report.py | Out-Null
node -e "const s=JSON.parse(require('fs').readFileSync('work/step51/patch-sites.json','utf8')).candidates, b=JSON.parse(require('fs').readFileSync('work/step51/patch-sites-before.json','utf8')).values; let n=0; s.forEach((c,i)=>{const v=b[i].value; if (Math.abs(v)<=0.3||Math.abs(c.drawn)>Math.abs(v)+0.1){n++; console.log('  new/worse on patch', c.E, c.N, c.way, 'after', c.drawn, 'before', v);}}); console.log('creases on patches', s.length, 'new/worse', n);"
