param([string]$Backend = "$PSScriptRoot/../../../norrkoping-simulator-backend")
$ErrorActionPreference = 'Stop'
$uiRoot = (Resolve-Path "$PSScriptRoot/../..").Path
$backendRoot = (Resolve-Path $Backend).Path
$benchDir = Join-Path $backendRoot 'build/step61-benchmark'
New-Item -ItemType Directory -Force "$benchDir/src" | Out-Null
$beforePath = "$uiRoot/work/step61/before-backend/CityTransport.kt"
$before = if (Test-Path -LiteralPath $beforePath) { Get-Content -LiteralPath $beforePath -Raw } else {
    git -C $backendRoot show 'e143535:src/main/kotlin/com/norrkoping/simulator/CityTransport.kt' | Out-String
}
$oldClass = $before.Substring($before.IndexOf('class RoadTraffic(')).Replace('class RoadTraffic(', 'class BaselineRoadTraffic(')
Set-Content -LiteralPath "$benchDir/src/BaselineRoadTraffic.kt" -Value ("package com.norrkoping.simulator`nimport kotlin.math.*`n" + $oldClass)
Copy-Item -LiteralPath "$PSScriptRoot/TrafficBenchmark.kt" -Destination "$benchDir/src"
$portable = "$benchDir/src".Replace('\', '/')
@"
allprojects {
    afterEvaluate {
        extensions.configure<org.gradle.api.tasks.SourceSetContainer> {
            named("test") { java.srcDir("$portable") }
        }
    }
}
"@ | Set-Content -LiteralPath "$benchDir/measure.init.gradle.kts"
$env:TRAFFIC_MEASURE_OUT = "$uiRoot/docs/step61/measurements/traffic-performance.json"
$jdkDir = Get-ChildItem "$env:USERPROFILE/.jdks" -Directory | Where-Object { $_.Name -match 'ms-25|jdk-21' } | Select-Object -First 1
if ($jdkDir) { $env:JAVA_HOME = $jdkDir.FullName }
Push-Location $backendRoot
try {
    & ./gradlew.bat -I "$benchDir/measure.init.gradle.kts" test --tests '*Step61TrafficBenchmark' --rerun-tasks
    if ($LASTEXITCODE) { throw "Benchmark failed: $LASTEXITCODE" }
} finally { Pop-Location }
