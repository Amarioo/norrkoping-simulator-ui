/**
 * Simulated date/time and floodlight state of the Step 6 lighting (UI ↔ Scene).
 *
 * Defaults: today's date in Europe/Stockholm at 12:30 (daylight, so the map opens readable), stadium
 * floodlights off (no match is assumed). URL parameters make captures reproducible:
 *   ?date=2026-10-21&time=21:30&stadium=off|training|event&sun=legacy&play=60
 * `play` is the time-lapse rate in simulated seconds per real second (0 = paused).
 */
import { addDays, utcToLocal } from './solar';
import type { StadiumMode } from '../stadium/idrottsparken';

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const parseTime = (t: string | null) => {
  const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t) : null;
  return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : null;
};
const today = utcToLocal(Date.now()).date;
const stadiumParam = params.get('stadium');

export const lightingState = $state({
  date: /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today,
  minutes: parseTime(params.get('time')) ?? 12 * 60 + 30,
  stadium: (['off', 'training', 'event'].includes(stadiumParam ?? '')
    ? stadiumParam
    : 'off') as StadiumMode['id'],
  legacySun: params.get('sun') === 'legacy',
  /** Simulated seconds per real second while playing (0 = stopped). */
  rate: Math.max(0, Number(params.get('play') ?? 0)) || 0,
});
/** Advances the clock by real seconds at the time-lapse rate, rolling over midnight into the next date. */
export function advanceClock(seconds: number) {
  if (!lightingState.rate) return;
  let minutes = lightingState.minutes + (seconds * lightingState.rate) / 60;
  let date = lightingState.date;
  while (minutes >= 1440) {
    minutes -= 1440;
    date = addDays(date, 1);
  }
  lightingState.minutes = minutes;
  if (date !== lightingState.date) lightingState.date = date;
}
/** Sets a preset time that may lie after midnight (minutes ≥ 1440 → next calendar day). */
export function setClock(date: string, minutes: number) {
  let d = date,
    m = minutes;
  while (m >= 1440) {
    m -= 1440;
    d = addDays(d, 1);
  }
  lightingState.date = d;
  lightingState.minutes = m;
}
export const formatClock = (minutes: number) => {
  const m = Math.floor(minutes) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
