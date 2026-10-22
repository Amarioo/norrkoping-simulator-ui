package com.norrkoping.simulator

import java.io.File
import kotlin.system.measureNanoTime
import kotlin.test.Test
import kotlinx.serialization.json.*

/** Optional measurement harness; scripts/step61/benchmark-traffic.ps1 supplies the baseline class. */
class Step61TrafficBenchmark {
    @Test fun measure() {
        val network = TransportNetwork.bundled
        val terrain = TerrainService.bundled
        val settings = TrafficSettings(100, 60, 30, false, 1.0, buses = 12)
        val rows = mutableListOf<JsonObject>()
        for (round in 0..3) for (after in listOf(false, true)) {
            var configureMs = 0.0
            val tickMs: Double
            val initMs: Double
            if (after) {
                lateinit var traffic: RoadTraffic
                initMs = measureNanoTime { traffic = RoadTraffic(network, terrain) } / 1e6
                configureMs = measureNanoTime { traffic.configure(settings) } / 1e6
                repeat(300) { traffic.tick(.05, it * .05) }
                tickMs = measureNanoTime { repeat(2400) { traffic.tick(.05, 15 + it * .05) } } / 1e6 / 2400
            } else {
                lateinit var traffic: BaselineRoadTraffic
                initMs = measureNanoTime { traffic = BaselineRoadTraffic(network, terrain) } / 1e6
                configureMs = measureNanoTime { traffic.configure(settings) } / 1e6
                repeat(300) { traffic.tick(.05, it * .05) }
                tickMs = measureNanoTime { repeat(2400) { traffic.tick(.05, 15 + it * .05) } } / 1e6 / 2400
            }
            rows += buildJsonObject {
                put("round", round); put("warmup", round == 0); put("after", after)
                put("initialiseMs", initMs); put("configureMs", configureMs); put("tickMs", tickMs)
            }
        }
        val baseline = BaselineRoadTraffic(network, terrain)
        @Suppress("UNCHECKED_CAST")
        val baselineAllowed = baseline.javaClass.getDeclaredField("allowed").apply { isAccessible = true }
            .get(baseline) as Map<String, Set<Int>>
        val policy = buildJsonObject {
            for (kind in listOf("compact", "truck", "bus")) {
                val candidates = network.edges.indices.filter { kind != "truck" || network.edges[it].truck }
                    .filter { kind != "bus" || network.edges[it].bus }
                val through = throughRoadEdges(network, candidates)
                put(kind, buildJsonObject {
                    put("candidates", candidates.size); put("through", through.size)
                    put("step6Allowed", baselineAllowed.getValue(kind).size)
                    put("removedSinceStep6", JsonArray((baselineAllowed.getValue(kind) - through).map(::JsonPrimitive)))
                    put("pruned", JsonArray((candidates.toSet() - through).map(::JsonPrimitive)))
                })
            }
        }
        val report = buildJsonObject { put("runs", JsonArray(rows)); put("policies", policy); put("vehicles", 202) }
        File(System.getenv("TRAFFIC_MEASURE_OUT")).writeText(Json { prettyPrint = true }.encodeToString(report))
    }
}
