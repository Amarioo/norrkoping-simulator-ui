/**
 * Phase P1 (measurement only): switches that let the measurement scripts skip one per-frame CPU job
 * at a time. Read by Scene.svelte only behind `hookEnabled` (development and VITE_LIGHTING_HOOK=1
 * builds), so normal production builds never read them and the bundler drops this module there.
 * All true = normal behaviour.
 */
export const perfFlags = {
  /** transport.update, transit.update and signals.update (vehicle, bus, tram, train, aircraft poses). */
  trafficUpdate: true,
  /** lighting.update (sun, sky, fixture LOD gather, uniforms). */
  lightingUpdate: true,
  /** lighting.updateVehicles (nearest vehicle beams, Vehicle Lights F1). */
  vehicleLights: true,
};
export type PerfFlag = keyof typeof perfFlags;
