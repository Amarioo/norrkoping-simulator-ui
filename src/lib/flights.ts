/**
 * Air traffic: what the interface needs to know about the server's flights (AirTraffic in the backend),
 * apart from the snapshot itself (city.svelte.ts).
 */

/** Most aircraft the server flies (AirTraffic.MaxAircraft) and the scene draws (AIRCRAFT_MAX). */
export const MAX_PLANES = 6;

/**
 * The number of aircraft a settings object stands for: none with flights off, and one where the server
 * names no number (a server from before the fleet, or a city that still flies the single legacy shuttle).
 */
export function planesOf(settings: { flights: boolean; planes?: number }) {
  return settings.flights ? (settings.planes ?? 1) : 0;
}

/**
 * Swedish names of the flight phases. QUEUE and HOLDING exist only with the fleet: ready and waiting
 * behind the hold line, and circling at the approach fix until the runway is free.
 */
export const FLIGHT_PHASE: Record<string, string> = {
  PARKED: 'Står på taxislingan',
  QUEUE: 'Köar till startbanan',
  TAXI_OUT: 'Taxar till start',
  TAKEOFF: 'Startar',
  CLIMB: 'Stiger',
  CRUISE: 'På väg',
  HOLDING: 'Väntar i luften',
  APPROACH: 'Inflygning',
  LANDING: 'Landar',
  TAXI_IN: 'Taxar in från banan',
};
