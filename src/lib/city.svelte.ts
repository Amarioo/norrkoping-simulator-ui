import { terrain } from './terrain';
import { CITY_SESSION, cityUrl } from './citySession';
import { takeCityStream } from './cityStreamStart';
import { watchStream, type StreamWatch } from './sseWatchdog';
import type { Vec3, Activity } from './types';
export interface TrafficSettings {
  compact: number;
  estate: number;
  trucks: number;
  buses: number;
  trams: number;
  trains: number;
  flights: boolean;
  /**
   * Number of aircraft while flights are on (1–6). Left out by a server from before the fleet, and by a
   * city that still flies the single legacy shuttle: read it with planesOf().
   */
  planes?: number;
  timeScale: number;
}
export interface Vehicle {
  id: number;
  kind: 'compact' | 'estate' | 'truck' | 'bus' | 'tram' | 'train';
  pos: Vec3;
  heading: number;
  speed: number;
  road: string;
  stopped: boolean;
  /** Rail vehicles: one pose per section, resting on its two bogies (RailTraffic.kt, trackProfile.ts). */
  sections?: { pos: Vec3; heading: number; pitch?: number }[];
  /** Nose-up pitch in radians (rail vehicles). */
  pitch?: number;
  stop?: string;
  destination?: string;
}
export interface Aircraft {
  id: string;
  pos: Vec3;
  heading: number;
  pitch: number;
  bank: number;
  phase: string;
  origin: string;
  destination: string;
  speed: number;
  gear: boolean;
  /** Air routes: aircraft type (aircraftTypes.ts); missing for the single legacy shuttle. */
  type?: string;
  /** Air routes: name of the route it is cleared for or flying, e.g. "norr om staden". */
  route?: string;
}
export interface CitySnapshot {
  terrainRevision?: string;
  sequence: number;
  simulationTime: number;
  paused: boolean;
  settings: TrafficSettings;
  vehicles: Vehicle[];
  aircraft: Aircraft[];
  completedFlights: number;
  events: Activity[];
}
class CityStore {
  snapshot = $state.raw<CitySnapshot>({
    sequence: 0,
    simulationTime: 0,
    paused: false,
    settings: {
      compact: 100,
      estate: 60,
      trucks: 20,
      buses: 12,
      trams: 8,
      trains: 2,
      flights: true,
      timeScale: 3,
    },
    vehicles: [],
    aircraft: [],
    completedFlights: 0,
    events: [],
  });
  connected = $state(false);
  pending = $state(false);
  error = $state('');
  notice = $state('');
  selectedId = $state<number | null>(null);
  selected = $derived(this.snapshot.vehicles.find((v) => v.id === this.selectedId));
  connect() {
    let watch: StreamWatch<EventSource> | undefined;
    const close = () => {
      watch?.stop();
      watch = undefined;
      this.connected = false;
    };
    const create = () => {
      // The first stream is usually opened by main.ts (cityStreamStart.ts); it is tapped for the
      // SSE debug log there.
      const { source: stream, last } = takeCityStream();
      const onCity = (e: MessageEvent<string>) => {
        try {
          const value = JSON.parse(e.data) as CitySnapshot;
          if (!Array.isArray(value.vehicles) || !Array.isArray(value.aircraft))
            throw new Error('Felaktigt simulatorformat');
          if ((value.terrainRevision ?? 'unavailable') !== terrain.data.revision) {
            this.error = 'Kartans och serverns höjddata skiljer sig. Uppdatera och starta om båda.';
            this.connected = false;
            return;
          }
          this.snapshot = value;
          this.connected = true;
        } catch {
          this.error = 'Kunde inte läsa simulatorns data.';
          this.connected = false;
        }
      };
      stream.addEventListener('city', onCity);
      if (last) onCity(last);
      stream.onerror = () => {
        this.connected = false;
        // An EventSource does not say why it failed. With a city per visitor the usual reason is
        // that every city is taken (503 with a message); ask for it.
        if (CITY_SESSION)
          fetch(cityUrl('world'), { signal: AbortSignal.timeout(5000) })
            .then(async (res) => {
              if (res.status === 503 && !this.connected) this.error = (await res.json()).error;
            })
            .catch(() => {});
      };
      return stream;
    };
    const open = () => {
      close();
      // Reconnects when the stream goes silent or the browser gives up (src/lib/sseWatchdog.ts).
      watch = watchStream({
        open: create,
        events: ['city'],
        onDown: () => {
          this.connected = false;
        },
      });
    };
    if (navigator.onLine) open();
    window.addEventListener('online', open);
    window.addEventListener('offline', close);
    return () => {
      close();
      window.removeEventListener('online', open);
      window.removeEventListener('offline', close);
    };
  }
  /**
   * Air traffic: false once the server has turned out to be one from before the fleet, which flies a
   * single aircraft and rejects a settings command that names a number of them.
   */
  fleet = $state(true);
  /**
   * Sends a command. `fallback` is a body to send instead if the server rejects the first one as
   * malformed (400); `onFallback` runs when that second body was accepted.
   */
  async command(name: string, body: object = {}, fallback?: object, onFallback?: () => void) {
    if (this.pending) return false;
    this.pending = true;
    this.error = '';
    this.notice = '';
    try {
      const send = (content: object) =>
        fetch(cityUrl(name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(content),
          signal: AbortSignal.timeout(12000),
        });
      let res = await send(body);
      if (res.status === 400 && fallback) {
        const again = await send(fallback);
        if (again.ok) {
          res = again;
          onFallback?.();
        }
      }
      if (res.status === 404)
        throw new Error('Servern svarade inte som väntat. Försök igen om en stund.');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Kommandot misslyckades');
      this.notice = data.message;
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Kunde inte nå simulatorn.';
      return false;
    } finally {
      this.pending = false;
    }
  }
  /**
   * Sends the traffic settings. A server from before the fleet does not know `planes`: it then gets the
   * settings without it, flies its single aircraft, and `fleet` turns false.
   */
  configure(settings: TrafficSettings) {
    const { planes: _, ...known } = settings;
    if (!this.fleet) return this.command('settings', known);
    return this.command('settings', settings, known, () => {
      this.fleet = false;
    });
  }
}
export const city = new CityStore();
export { FLIGHT_PHASE, MAX_PLANES, planesOf } from './flights';

export const VEHICLE_NAMES: Record<Vehicle['kind'], string> = {
  compact: 'Personbil',
  estate: 'Kombibil',
  truck: 'Lastbil',
  bus: 'Buss',
  tram: 'Spårvagn',
  train: 'Pendeltåg',
};
