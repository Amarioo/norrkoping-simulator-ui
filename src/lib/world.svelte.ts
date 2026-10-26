import type { Drone, Telemetry, Vec3, WorldSnapshot } from './types';
import { tapEventSource } from './debug/sseTap';
class WorldStore {
  snapshot = $state.raw<WorldSnapshot>({
    sequence: 0,
    simulationTime: 0,
    paused: false,
    wind: [0, 0],
    drones: [],
    noFlyZones: [],
    hubs: [],
  });
  telemetry = $state.raw<Telemetry>({
    sequence: 0,
    active: 0,
    delivering: 0,
    returning: 0,
    holding: 0,
    deliveries: 0,
    averageBattery: 0,
    distanceMetres: 0,
    events: [],
  });
  worldConnected = $state(false);
  telemetryConnected = $state(false);
  connected = $derived(this.worldConnected && this.telemetryConnected);
  pending = $state(false);
  error = $state('');
  notice = $state('');
  selectedId = $state<string | null>(null);
  selected = $derived<Drone | undefined>(
    this.snapshot.drones.find((d) => d.id === this.selectedId),
  );
  placingZone = $state(false);
  showRoutes = $state(true);
  connect() {
    let spatial: EventSource;
    let telemetry: EventSource;
    const open = () => {
      // tapEventSource: SSE debug log (no-op unless the debug panel records; src/lib/debug).
      spatial = tapEventSource(new EventSource('/api/sse/world'), ['world']);
      telemetry = tapEventSource(new EventSource('/api/sse/telemetry'), ['telemetry']);
      spatial.addEventListener('world', (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as WorldSnapshot;
          if (!Array.isArray(data.drones) || !Array.isArray(data.noFlyZones))
            throw new Error('Invalid world snapshot');
          this.snapshot = data;
          this.worldConnected = true;
        } catch {
          this.error = 'Could not read the world stream.';
          this.worldConnected = false;
        }
      });
      telemetry.addEventListener('telemetry', (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as Telemetry;
          if (!Array.isArray(data.events)) throw new Error('Invalid telemetry snapshot');
          this.telemetry = data;
          this.telemetryConnected = true;
        } catch {
          this.error = 'Could not read the telemetry stream.';
          this.telemetryConnected = false;
        }
      });
      spatial.onerror = () => {
        this.worldConnected = false;
      };
      telemetry.onerror = () => {
        this.telemetryConnected = false;
      };
    };
    const offline = () => {
      spatial?.close();
      telemetry?.close();
      this.worldConnected = false;
      this.telemetryConnected = false;
    };
    const online = () => {
      offline();
      open();
    };
    if (navigator.onLine) open();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      offline();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }
  async command(name: string, body: object = {}) {
    if (this.pending) return false;
    this.pending = true;
    this.error = '';
    this.notice = '';
    try {
      const response = await fetch(`/api/commands/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Command failed (${response.status})`);
      this.notice = result.message;
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not reach the simulation.';
      return false;
    } finally {
      this.pending = false;
    }
  }
  async placeZone(center: Vec3) {
    if (!this.placingZone || !this.connected || this.pending) return;
    if (await this.command('spawn-no-fly-zone', { center, radius: 12 })) this.placingZone = false;
  }
}
export const world = new WorldStore();
