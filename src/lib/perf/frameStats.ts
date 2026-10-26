/**
 * Phase P0 (fullscreen + fps counter): frame-time statistics over a sliding time window.
 *
 * Pure and DOM-free so it can be unit tested. Times are milliseconds from `performance.now()` (or any
 * monotonic clock). A frame interval is the time between two consecutive frame starts, i.e. what the
 * user perceives (CPU + GPU + waiting for the display), not isolated GPU time.
 *
 * Pauses: a gap longer than `gapMs` (tab in the background, debugger, laptop sleep) is not a frame
 * and is dropped; `pause()` (called on `visibilitychange` → hidden) makes the next frame start a new
 * interval. Old samples fall out of the window by time, so after a pause the statistics only describe
 * frames drawn since the return.
 */

export interface WindowStats {
  /** Samples inside the window. */
  count: number;
  mean: number;
  /** 95th percentile (nearest rank): 95 % of the samples are at or below this value. */
  p95: number;
  max: number;
}

/** Ring buffer of (time, value) samples; statistics over the samples with time ≥ now − windowMs. */
export class RollingWindow {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private head = 0;
  private size = 0;
  private scratch: Float64Array;

  constructor(
    readonly windowMs = 2000,
    readonly capacity = 4096,
  ) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  add(time: number, value: number) {
    this.times[this.head] = time;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  clear() {
    this.head = 0;
    this.size = 0;
  }

  /** Statistics of the samples in [now − windowMs, now]; null when there are none. */
  stats(now: number): WindowStats | null {
    const from = now - this.windowMs;
    let n = 0,
      sum = 0,
      max = 0;
    for (let i = 0; i < this.size; i++) {
      const k = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.times[k] < from) break; // newest first: everything older is outside the window
      if (this.times[k] > now) continue;
      const v = this.values[k];
      this.scratch[n++] = v;
      sum += v;
      if (v > max) max = v;
    }
    if (!n) return null;
    const sorted = this.scratch.subarray(0, n).sort();
    return { count: n, mean: sum / n, p95: sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)], max };
  }
}

export interface FrameStatsSnapshot {
  /** Frames per second over the window (1000 / mean interval). */
  fps: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  /** Frames in the window. */
  frames: number;
  windowMs: number;
}

/** Frame intervals from consecutive frame-start times, with pause/tab-switch handling. */
export class FrameStats {
  private last: number | null = null;
  private readonly intervals: RollingWindow;
  /** Intervals longer than this are pauses, not frames. */
  readonly gapMs: number;
  /** Intervals dropped as pauses (diagnostics). */
  gaps = 0;

  constructor(options: { windowMs?: number; capacity?: number; gapMs?: number } = {}) {
    this.intervals = new RollingWindow(options.windowMs ?? 2000, options.capacity ?? 4096);
    this.gapMs = options.gapMs ?? 1000;
  }

  /** Records a frame that started at `now`. */
  frame(now: number) {
    if (this.last !== null) {
      const dt = now - this.last;
      if (dt > this.gapMs) this.gaps++;
      else if (dt > 0) this.intervals.add(now, dt);
    }
    this.last = now;
  }

  /** The next frame starts a new interval (e.g. the tab was hidden). */
  pause() {
    this.last = null;
  }

  reset() {
    this.last = null;
    this.gaps = 0;
    this.intervals.clear();
  }

  snapshot(now: number): FrameStatsSnapshot | null {
    const s = this.intervals.stats(now);
    if (!s) return null;
    return {
      fps: 1000 / s.mean,
      meanMs: s.mean,
      p95Ms: s.p95,
      maxMs: s.max,
      frames: s.count,
      windowMs: this.intervals.windowMs,
    };
  }
}
