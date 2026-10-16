import type { Vec3, Activity } from './types';
export interface TrafficSettings {
  compact: number;
  estate: number;
  trucks: number;
  buses: number;
  trams: number;
  trains: number;
  flights: boolean;
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
  sections?: { pos: Vec3; heading: number }[];
  stop?: string;
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
}
export interface CitySnapshot {
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
    let stream: EventSource;
    const close = () => {
      stream?.close();
      this.connected = false;
    };
    const open = () => {
      close();
      stream = new EventSource('/api/simulator/stream');
      stream.addEventListener('city', (e: MessageEvent<string>) => {
        try {
          const value = JSON.parse(e.data) as CitySnapshot;
          if (!Array.isArray(value.vehicles) || !Array.isArray(value.aircraft))
            throw new Error('Felaktigt simulatorformat');
          this.snapshot = value;
          this.connected = true;
        } catch {
          this.error = 'Kunde inte läsa simulatorns data.';
          this.connected = false;
        }
      });
      stream.onerror = () => {
        this.connected = false;
      };
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
  async command(name: string, body: object = {}) {
    if (this.pending) return false;
    this.pending = true;
    this.error = '';
    this.notice = '';
    try {
      const res = await fetch('/api/simulator/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      if (res.status === 404)
        throw new Error('Starta om Ktor för att läsa in Norrköping Simulator.');
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
}
export const city = new CityStore();
export const FLIGHT_PHASE: Record<string, string> = {
  PARKED: 'Vid uppställningsplats',
  TAXI_OUT: 'Taxar till start',
  TAKEOFF: 'Startar',
  CLIMB: 'Stiger',
  CRUISE: 'På väg',
  APPROACH: 'Inflygning',
  LANDING: 'Landar',
  TAXI_IN: 'Taxar till uppställning',
};

export const VEHICLE_NAMES: Record<Vehicle['kind'], string> = {
  compact: 'Personbil',
  estate: 'Kombibil',
  truck: 'Lastbil',
  bus: 'Buss',
  tram: 'Spårvagn',
  train: 'Pendeltåg',
};
