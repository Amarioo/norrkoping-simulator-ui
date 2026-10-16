export type Vec3 = [number, number, number];
export type DroneState = 'DELIVERING' | 'RETURNING' | 'IDLE' | 'HOLDING' | 'EMERGENCY';
export interface Drone {
  id: string;
  pos: Vec3;
  target: Vec3;
  battery: number;
  state: DroneState;
  weightKg: number;
  route: Vec3[];
}
export interface Zone {
  id: string;
  center: Vec3;
  radius: number;
}
export interface Hub {
  id: string;
  label: string;
  pos: Vec3;
}
export interface WorldSnapshot {
  sequence: number;
  simulationTime: number;
  paused: boolean;
  wind: [number, number];
  drones: Drone[];
  noFlyZones: Zone[];
  hubs: Hub[];
}
export interface Activity {
  id: number;
  time: number;
  kind: string;
  message: string;
}
export interface Telemetry {
  sequence: number;
  active: number;
  delivering: number;
  returning: number;
  holding: number;
  deliveries: number;
  averageBattery: number;
  distanceMetres: number;
  events: Activity[];
}
