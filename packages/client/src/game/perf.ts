// Per-frame JavaScript cost (sim catch-up plus drawing plus Pixi's render call), kept in a
// ring buffer so recording allocates nothing. Turned on by the Perf setting or `?perf=1`:
// the readout (perfText) shows in the top right corner, and game over and the clear screens
// end with the run's report (perfReport).

export interface PerfSummary {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/** Frames kept: ten minutes at 120 Hz, longer than any song, so a report covers the run. */
const DEFAULT_CAPACITY = 120 * 600;

export class PerfMeter {
  readonly #samples: Float32Array;
  #count = 0;
  #next = 0;
  /** Frames recorded since the last reset, kept or not. */
  #total = 0;
  #startedAt = 0;

  constructor(capacity = DEFAULT_CAPACITY, now = 0) {
    this.#samples = new Float32Array(capacity);
    this.#startedAt = now;
  }

  record(ms: number): void {
    this.#samples[this.#next] = ms;
    this.#next = (this.#next + 1) % this.#samples.length;
    if (this.#count < this.#samples.length) this.#count++;
    this.#total++;
  }

  /** Starts again from no frames, at time `now` (ms, performance.now()). */
  reset(now = 0): void {
    this.#count = 0;
    this.#next = 0;
    this.#total = 0;
    this.#startedAt = now;
  }

  /** Frames a second since the last reset, at time `now`. */
  fps(now: number): number {
    const ms = now - this.#startedAt;
    return ms > 0 ? (this.#total * 1000) / ms : 0;
  }

  /** The summary of the last `last` frames, or of every frame kept. */
  summary(last = this.#count): PerfSummary {
    const n = Math.min(last, this.#count);
    const cap = this.#samples.length;
    const sorted = new Float32Array(n);
    for (let i = 0; i < n; i++) sorted[i] = this.#samples[(this.#next - n + i + cap) % cap]!;
    sorted.sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sorted[i]!;
    const at = (q: number) => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(q * n))]!);
    return {
      frames: n,
      meanMs: n === 0 ? 0 : sum / n,
      p50Ms: at(0.5),
      p95Ms: at(0.95),
      p99Ms: at(0.99),
      maxMs: n === 0 ? 0 : sorted[n - 1]!,
    };
  }
}

/** The readout: frames a second, then the mean and 95th percentile of the frames' work. */
export function perfText(fps: number, work: PerfSummary): string {
  return `${Math.round(fps)} fps  ${work.meanMs.toFixed(1)} ms  p95 ${work.p95Ms.toFixed(1)}`;
}

/** What a run's report names besides the frames: where it was played and on what. */
export interface PerfContext {
  /** "Level 3" in the arcade run, "Levels" for one song. */
  where: string;
  song: string;
  difficulty: string;
  /** The window in CSS px and its device pixel ratio. */
  width: number;
  height: number;
  pixelRatio: number;
  crt: boolean;
}

/**
 * A run's report for game over and the clear screens, three lines: where, the song and the
 * difficulty; frames a second, frames, the window and the CRT setting; and the frames' work.
 */
export function perfReport(context: PerfContext, fps: number, work: PerfSummary): string[] {
  const ms = (v: number) => v.toFixed(1);
  const ratio = Number(context.pixelRatio.toFixed(2));
  return [
    `Perf  ${context.where}  ${context.song}  ${context.difficulty}`,
    `${fps.toFixed(1)} fps  ${work.frames} frames  ${context.width}x${context.height} x${ratio}  CRT ${context.crt ? 'on' : 'off'}`,
    `Work ms  mean ${ms(work.meanMs)}  p95 ${ms(work.p95Ms)}  p99 ${ms(work.p99Ms)}  max ${ms(work.maxMs)}`,
  ];
}
