# Phase P1 — CPU profile per frame

Phase P1 CPU profile: CDP Profiler (sampling 100 µs) on the page's main thread for 6 s per view after settling, fullscreen 2560x1440, hook build with source maps (minified), Edge headless uncapped, DPR 1, Europe/Stockholm 2026-10-21, stadium off. ms per frame = sampled time / frames rendered during the profile. The profiler itself slows the page somewhat (sampling overhead), so absolute numbers are a little above the unprofiled ones; the split is what matters.

Host: AMD Ryzen 7 9800X3D 8-Core Processor, 16 threads. Machine load before each run: 18.6 %, 16.6 %, 21.8 %, 16.5 %, 16.7 %, 16.7 %.

## night/overview, traffic on

Frame 17.90 ms (17.33 … 18.46), CPU (hook) 16.95 ms, sampled busy main thread 17.22 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: program och uniforms (setProgram) | 5.20 | 5.19 … 5.51 | 31.0 % |
| three: geometri, buffertar och VAO-bindning | 5.15 | 3.83 … 5.20 | 29.0 % |
| three: ritanrop (renderBufferDirect, draw*) | 2.20 | 2.15 … 2.28 | 12.8 % |
| three: renderlista (projectObject) | 1.30 | 1.10 … 2.25 | 7.5 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.90 | 0.90 … 0.94 | 5.3 % |
| three: sortering av renderlistan | 0.90 | 0.87 … 0.90 | 5.2 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.71 | 0.71 … 0.72 | 4.1 % |
| webbläsaren utanför JS ((program)) | 0.32 | 0.29 … 0.35 | 1.8 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.28 | 0.27 … 0.29 | 1.7 % |
| övrig app-kod | 0.05 | 0.04 … 0.05 | 0.3 % |
| inaktiv ((idle)) | 0.03 | 0.03 … 0.04 |  |
| skräpsamling (GC) | 0.02 | 0.02 … 0.03 | 0.1 % |
| trafik: snapshot från servern (SSE, JSON) | 0.02 | 0.02 … 0.02 | 0.1 % |
| three: övrigt | 0.02 | 0.01 … 0.02 | 0.1 % |
| Threlte (schemaläggare, tasks) | 0.02 | 0.01 … 0.02 | 0.1 % |
| belysning: updateVehicles (fordonsljus) | 0.01 | 0.01 … 0.01 | 0.1 % |
| three: render övrigt | 0.01 | 0.01 … 0.01 | 0.1 % |
| scen-task övrigt (Scene.svelte) | 0.01 | 0.01 … 0.01 | 0.1 % |
| belysning: update (sol, himmel, armatur-LOD, uniforms) | 0.01 | 0.00 … 0.01 | 0.1 % |
| kamera (FreeCamera) | 0.01 | 0.01 … 0.01 | 0.1 % |
| three: frustum-gallring (synlighetstest) | 0.01 | 0.00 … 0.41 | 0.0 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 1.361 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 1.276 |
| WebGLObjects.update — node_modules/three/build/three.module.js | 1.266 |
| bindVertexArray — (native) | 1.258 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 1.054 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 1.022 |
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.901 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.842 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.575 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.543 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.480 |
| flatten — node_modules/three/build/three.module.js | 0.463 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.413 |
| arraysEqual — node_modules/three/build/three.module.js | 0.373 |
| painterSortStable — node_modules/three/build/three.module.js | 0.329 |
| (program) — (native) | 0.323 |
| drawArrays — (native) | 0.258 |
| WebGLMaterials.refreshUniformsCommon — node_modules/three/build/three.module.js | 0.248 |
| WebGLRenderer.markUniformsLightsNeedsUpdate — node_modules/three/build/three.module.js | 0.247 |
| WebGLMaterials.refreshFogUniforms — node_modules/three/build/three.module.js | 0.239 |

## night/kungsgatan, traffic on

Frame 4.34 ms (4.09 … 4.74), CPU (hook) 4.08 ms, sampled busy main thread 4.21 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: program och uniforms (setProgram) | 1.87 | 1.65 … 2.14 | 44.5 % |
| three: renderlista (projectObject) | 0.76 | 0.64 … 0.84 | 19.2 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.43 | 0.43 … 0.44 | 10.5 % |
| three: geometri, buffertar och VAO-bindning | 0.42 | 0.34 … 0.42 | 9.2 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.23 | 0.21 … 0.23 | 5.1 % |
| three: ritanrop (renderBufferDirect, draw*) | 0.18 | 0.16 … 0.18 | 4.2 % |
| webbläsaren utanför JS ((program)) | 0.12 | 0.11 … 0.13 | 2.7 % |
| three: sortering av renderlistan | 0.06 | 0.06 … 0.07 | 1.6 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.06 | 0.06 … 0.07 | 1.5 % |
| inaktiv ((idle)) | 0.01 | 0.01 … 0.01 |  |
| övrig app-kod | 0.01 | 0.01 … 0.01 | 0.3 % |
| belysning: updateVehicles (fordonsljus) | 0.01 | 0.01 … 0.01 | 0.2 % |
| three: övrigt | 0.01 | 0.01 … 0.01 | 0.2 % |
| scen-task övrigt (Scene.svelte) | 0.01 | 0.01 … 0.01 | 0.2 % |
| trafik: snapshot från servern (SSE, JSON) | 0.01 | 0.01 … 0.01 | 0.2 % |
| Threlte (schemaläggare, tasks) | 0.01 | 0.00 … 0.01 | 0.1 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| uniform4fv — (native) | 1.456 |
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.439 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.320 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.217 |
| bufferSubData — (native) | 0.147 |
| (program) — (native) | 0.120 |
| Sphere.union — node_modules/three/build/three.core.js | 0.101 |
| InstancedMesh.computeBoundingSphere — node_modules/three/build/three.core.js | 0.092 |
| WebGLObjects.update — node_modules/three/build/three.module.js | 0.087 |
| createTransportModels.(anonymous) — src/lib/transportModels.ts | 0.087 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 0.085 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 0.078 |
| Sphere.applyMatrix4 — node_modules/three/build/three.core.js | 0.076 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.061 |
| flatten — node_modules/three/build/three.module.js | 0.061 |
| bindVertexArray — (native) | 0.055 |
| Sphere.expandByPoint — node_modules/three/build/three.core.js | 0.050 |
| arraysEqual — node_modules/three/build/three.module.js | 0.039 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.037 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.033 |

## day/overview, traffic on

Frame 17.93 ms (17.25 … 18.37), CPU (hook) 17.04 ms, sampled busy main thread 17.30 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: geometri, buffertar och VAO-bindning | 5.27 | 3.90 … 5.38 | 29.8 % |
| three: program och uniforms (setProgram) | 5.12 | 5.12 … 5.23 | 29.6 % |
| three: ritanrop (renderBufferDirect, draw*) | 2.18 | 2.11 … 2.36 | 12.7 % |
| three: renderlista (projectObject) | 1.33 | 1.08 … 2.27 | 7.7 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.93 | 0.88 … 1.03 | 5.4 % |
| three: sortering av renderlistan | 0.90 | 0.88 … 0.90 | 5.1 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.70 | 0.70 … 0.73 | 4.0 % |
| webbläsaren utanför JS ((program)) | 0.33 | 0.30 … 0.33 | 1.9 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.29 | 0.28 … 0.30 | 1.7 % |
| övrig app-kod | 0.05 | 0.05 … 0.06 | 0.3 % |
| inaktiv ((idle)) | 0.04 | 0.03 … 0.04 |  |
| skräpsamling (GC) | 0.02 | 0.02 … 0.02 | 0.1 % |
| trafik: snapshot från servern (SSE, JSON) | 0.02 | 0.01 … 0.02 | 0.1 % |
| three: övrigt | 0.02 | 0.01 … 0.02 | 0.1 % |
| three: render övrigt | 0.01 | 0.01 … 0.02 | 0.1 % |
| scen-task övrigt (Scene.svelte) | 0.01 | 0.00 … 0.01 | 0.1 % |
| Threlte (schemaläggare, tasks) | 0.01 | 0.01 … 0.02 | 0.0 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 1.330 |
| WebGLObjects.update — node_modules/three/build/three.module.js | 1.322 |
| bindVertexArray — (native) | 1.307 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 1.241 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 1.017 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.990 |
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.902 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.886 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.558 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.554 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.486 |
| flatten — node_modules/three/build/three.module.js | 0.480 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.457 |
| arraysEqual — node_modules/three/build/three.module.js | 0.349 |
| (program) — (native) | 0.327 |
| painterSortStable — node_modules/three/build/three.module.js | 0.326 |
| WebGLMaterials.refreshUniformsCommon — node_modules/three/build/three.module.js | 0.263 |
| drawArrays — (native) | 0.249 |
| WebGLRenderer.markUniformsLightsNeedsUpdate — node_modules/three/build/three.module.js | 0.237 |
| WebGLMaterials.refreshFogUniforms — node_modules/three/build/three.module.js | 0.230 |

## day/kungsgatan, traffic on

Frame 2.85 ms (2.83 … 2.96), CPU (hook) 2.65 ms, sampled busy main thread 2.77 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: renderlista (projectObject) | 0.78 | 0.64 … 0.83 | 28.1 % |
| three: program och uniforms (setProgram) | 0.45 | 0.45 … 0.46 | 16.4 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.45 | 0.45 … 0.45 | 16.1 % |
| three: geometri, buffertar och VAO-bindning | 0.39 | 0.32 … 0.41 | 14.1 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.24 | 0.23 … 0.25 | 8.8 % |
| three: ritanrop (renderBufferDirect, draw*) | 0.16 | 0.15 … 0.17 | 5.7 % |
| webbläsaren utanför JS ((program)) | 0.11 | 0.11 … 0.11 | 3.9 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.06 | 0.06 … 0.07 | 2.3 % |
| three: sortering av renderlistan | 0.06 | 0.05 … 0.07 | 2.3 % |
| inaktiv ((idle)) | 0.01 | 0.01 … 0.01 |  |
| three: övrigt | 0.01 | 0.01 … 0.01 | 0.2 % |
| övrig app-kod | 0.01 | 0.01 … 0.01 | 0.2 % |
| trafik: snapshot från servern (SSE, JSON) | 0.01 | 0.00 … 0.01 | 0.2 % |
| three: render övrigt | 0.01 | 0.00 … 0.01 | 0.2 % |
| scen-task övrigt (Scene.svelte) | 0.01 | 0.01 … 0.01 | 0.2 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.443 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.325 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.228 |
| bufferSubData — (native) | 0.124 |
| (program) — (native) | 0.112 |
| Sphere.union — node_modules/three/build/three.core.js | 0.109 |
| createTransportModels.(anonymous) — src/lib/transportModels.ts | 0.092 |
| InstancedMesh.computeBoundingSphere — node_modules/three/build/three.core.js | 0.090 |
| WebGLObjects.update — node_modules/three/build/three.module.js | 0.089 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 0.084 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 0.081 |
| Sphere.applyMatrix4 — node_modules/three/build/three.core.js | 0.080 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.064 |
| flatten — node_modules/three/build/three.module.js | 0.059 |
| bindVertexArray — (native) | 0.054 |
| Sphere.expandByPoint — node_modules/three/build/three.core.js | 0.050 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.039 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.034 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.033 |
| arraysEqual — node_modules/three/build/three.module.js | 0.032 |

## night/overview, traffic off

Frame 15.83 ms (15.48 … 16.14), CPU (hook) 15.17 ms, sampled busy main thread 15.25 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: program och uniforms (setProgram) | 5.10 | 5.00 … 5.11 | 32.8 % |
| three: geometri, buffertar och VAO-bindning | 3.80 | 3.44 … 4.62 | 24.4 % |
| three: ritanrop (renderBufferDirect, draw*) | 1.97 | 1.90 … 2.14 | 12.9 % |
| three: renderlista (projectObject) | 1.76 | 0.75 … 1.78 | 11.3 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.91 | 0.80 … 0.92 | 5.8 % |
| three: sortering av renderlistan | 0.85 | 0.80 … 0.89 | 5.7 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.67 | 0.66 … 0.68 | 4.4 % |
| webbläsaren utanför JS ((program)) | 0.18 | 0.18 … 0.19 | 1.2 % |
| Threlte (schemaläggare, tasks) | 0.02 | 0.01 … 0.02 | 0.2 % |
| three: övrigt | 0.02 | 0.02 … 0.03 | 0.1 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.02 | 0.01 … 0.02 | 0.1 % |
| skräpsamling (GC) | 0.02 | 0.01 … 0.02 | 0.1 % |
| three: render övrigt | 0.01 | 0.01 … 0.02 | 0.1 % |
| belysning: update (sol, himmel, armatur-LOD, uniforms) | 0.01 | 0.01 … 0.01 | 0.1 % |
| mätkrokar (P0-räknare, P1-krok) | 0.01 | 0.00 … 0.01 | 0.0 % |
| inaktiv ((idle)) | 0.01 | 0.00 … 0.01 |  |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 1.567 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 1.236 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 1.153 |
| bindVertexArray — (native) | 1.094 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.971 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.942 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.764 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.542 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.469 |
| flatten — node_modules/three/build/three.module.js | 0.458 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.442 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.437 |
| arraysEqual — node_modules/three/build/three.module.js | 0.373 |
| painterSortStable — node_modules/three/build/three.module.js | 0.335 |
| drawArrays — (native) | 0.282 |
| uniform4fv — (native) | 0.267 |
| WebGLMaterials.refreshUniformsCommon — node_modules/three/build/three.module.js | 0.259 |
| WebGLMaterials.refreshFogUniforms — node_modules/three/build/three.module.js | 0.259 |
| WebGLBindingStates.setup — node_modules/three/build/three.module.js | 0.245 |
| WebGLRenderer.markUniformsLightsNeedsUpdate — node_modules/three/build/three.module.js | 0.240 |

## night/kungsgatan, traffic off

Frame 2.19 ms (2.19 … 2.21), CPU (hook) 2.06 ms, sampled busy main thread 2.14 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: renderlista (projectObject) | 0.57 | 0.33 … 0.57 | 26.7 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.46 | 0.46 … 0.47 | 21.6 % |
| three: program och uniforms (setProgram) | 0.45 | 0.44 … 0.45 | 20.8 % |
| three: geometri, buffertar och VAO-bindning | 0.29 | 0.29 … 0.33 | 13.6 % |
| three: ritanrop (renderBufferDirect, draw*) | 0.15 | 0.14 … 0.15 | 7.0 % |
| webbläsaren utanför JS ((program)) | 0.07 | 0.07 … 0.07 | 3.5 % |
| three: sortering av renderlistan | 0.06 | 0.06 … 0.06 | 2.7 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.06 | 0.05 … 0.06 | 2.7 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.01 | 0.01 … 0.01 | 0.3 % |
| three: render övrigt | 0.01 | 0.00 … 0.01 | 0.3 % |
| three: övrigt | 0.01 | 0.00 … 0.01 | 0.2 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.472 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.339 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.150 |
| bufferSubData — (native) | 0.095 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 0.089 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 0.081 |
| Sphere.applyMatrix4 — node_modules/three/build/three.core.js | 0.077 |
| (program) — (native) | 0.074 |
| flatten — node_modules/three/build/three.module.js | 0.063 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.058 |
| bindVertexArray — (native) | 0.048 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.037 |
| arraysEqual — node_modules/three/build/three.module.js | 0.035 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.032 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.031 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.028 |
| uniform4fv — (native) | 0.023 |
| Vector4.toArray — node_modules/three/build/three.core.js | 0.023 |
| WebGLPrograms.getParameters — node_modules/three/build/three.module.js | 0.022 |
| painterSortStable — node_modules/three/build/three.module.js | 0.017 |

## day/overview, traffic off

Frame 15.71 ms (15.63 … 16.00), CPU (hook) 15.16 ms, sampled busy main thread 15.23 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: program och uniforms (setProgram) | 4.99 | 4.83 … 5.45 | 32.8 % |
| three: geometri, buffertar och VAO-bindning | 3.72 | 3.50 … 4.71 | 24.4 % |
| three: ritanrop (renderBufferDirect, draw*) | 2.00 | 1.93 … 2.11 | 13.1 % |
| three: renderlista (projectObject) | 1.75 | 0.77 … 1.85 | 11.5 % |
| three: sortering av renderlistan | 0.88 | 0.81 … 0.89 | 5.7 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.88 | 0.86 … 0.96 | 5.8 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.67 | 0.64 … 0.72 | 4.4 % |
| webbläsaren utanför JS ((program)) | 0.18 | 0.18 … 0.18 | 1.2 % |
| three: övrigt | 0.02 | 0.01 … 0.02 | 0.1 % |
| skräpsamling (GC) | 0.01 | 0.01 … 0.02 | 0.1 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.01 | 0.01 … 0.01 | 0.1 % |
| Threlte (schemaläggare, tasks) | 0.01 | 0.01 … 0.02 | 0.1 % |
| inaktiv ((idle)) | 0.01 | 0.01 … 0.01 |  |
| kamera (FreeCamera) | 0.01 | 0.01 … 0.02 | 0.0 % |
| belysning: update (sol, himmel, armatur-LOD, uniforms) | 0.01 | 0.00 … 0.01 | 0.0 % |
| three: render övrigt | 0.01 | 0.01 … 0.01 | 0.0 % |
| mätkrokar (P0-räknare, P1-krok) | 0.01 | 0.00 … 0.01 | 0.0 % |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 1.588 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 1.237 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 1.173 |
| bindVertexArray — (native) | 1.110 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.994 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.971 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.740 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.534 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.496 |
| flatten — node_modules/three/build/three.module.js | 0.492 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.460 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.420 |
| arraysEqual — node_modules/three/build/three.module.js | 0.376 |
| painterSortStable — node_modules/three/build/three.module.js | 0.319 |
| WebGLMaterials.refreshUniformsCommon — node_modules/three/build/three.module.js | 0.276 |
| drawArrays — (native) | 0.274 |
| WebGLRenderer.markUniformsLightsNeedsUpdate — node_modules/three/build/three.module.js | 0.241 |
| WebGLMaterials.refreshFogUniforms — node_modules/three/build/three.module.js | 0.218 |
| uniform4fv — (native) | 0.213 |
| WebGLBindingStates.setup — node_modules/three/build/three.module.js | 0.210 |

## day/kungsgatan, traffic off

Frame 2.15 ms (2.15 … 2.17), CPU (hook) 2.03 ms, sampled busy main thread 2.10 ms per frame, 3 runs.

| Category | ms per frame (median) | range | share of busy time |
|---|---:|---:|---:|
| three: renderlista (projectObject) | 0.57 | 0.34 … 0.58 | 27.2 % |
| three: matrisuppdatering (updateMatrixWorld) | 0.44 | 0.44 … 0.45 | 21.1 % |
| three: program och uniforms (setProgram) | 0.43 | 0.42 … 0.44 | 20.4 % |
| three: geometri, buffertar och VAO-bindning | 0.29 | 0.28 … 0.34 | 13.8 % |
| three: ritanrop (renderBufferDirect, draw*) | 0.14 | 0.13 … 0.14 | 6.5 % |
| webbläsaren utanför JS ((program)) | 0.08 | 0.07 … 0.08 | 3.6 % |
| three: per objekt (renderObject, modelView/normalMatrix) | 0.06 | 0.05 … 0.06 | 2.7 % |
| three: sortering av renderlistan | 0.06 | 0.05 … 0.06 | 2.7 % |
| trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg) | 0.01 | 0.01 … 0.01 | 0.3 % |
| three: övrigt | 0.01 | 0.01 … 0.01 | 0.3 % |
| inaktiv ((idle)) | 0.01 | 0.00 … 0.01 |  |

Top functions by self time (median ms per frame over runs):

| Function — source | ms per frame |
|---|---:|
| WebGLRenderer.projectObject — node_modules/three/build/three.module.js | 0.472 |
| Object3D.updateMatrixWorld — node_modules/three/build/three.core.js | 0.322 |
| Matrix4.multiplyMatrices — node_modules/three/build/three.core.js | 0.140 |
| bufferSubData — (native) | 0.107 |
| WebGLRenderer.renderBufferDirect — node_modules/three/build/three.module.js | 0.083 |
| WebGLUniforms.upload — node_modules/three/build/three.module.js | 0.080 |
| Sphere.applyMatrix4 — node_modules/three/build/three.core.js | 0.075 |
| (program) — (native) | 0.075 |
| flatten — node_modules/three/build/three.module.js | 0.061 |
| WebGLRenderer.setProgram — node_modules/three/build/three.module.js | 0.060 |
| bindVertexArray — (native) | 0.045 |
| WebGLBindingStates.needsUpdate — node_modules/three/build/three.module.js | 0.032 |
| arraysEqual — node_modules/three/build/three.module.js | 0.031 |
| WebGLRenderList.sort — node_modules/three/build/three.module.js | 0.030 |
| WebGLRenderer.renderObjects — node_modules/three/build/three.module.js | 0.030 |
| WebGLBindingStates.getBindingState — node_modules/three/build/three.module.js | 0.025 |
| WebGLPrograms.getParameters — node_modules/three/build/three.module.js | 0.022 |
| Vector4.toArray — node_modules/three/build/three.core.js | 0.022 |
| uniform4fv — (native) | 0.021 |
| painterSortStable — node_modules/three/build/three.module.js | 0.019 |
