// Per-frame JavaScript cost (sim catch-up plus drawing plus Pixi's render call), kept in a
// ring buffer so recording allocates nothing. Turned on with `?perf=1`, which also shows
// the readout (perfText) in the top right corner.

export interface PerfSummary {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export class PerfMeter {
  readonly #samples: Float64Array;
  #count = 0;
  #next = 0;

  constructor(capacity = 3600) {
    this.#samples = new Float64Array(capacity);
  }

  record(ms: number): void {
    this.#samples[this.#next] = ms;
    this.#next = (this.#next + 1) % this.#samples.length;
    if (this.#count < this.#samples.length) this.#count++;
  }

  reset(): void {
    this.#count = 0;
    this.#next = 0;
  }

  /** The summary of the last `last` frames, or of every frame kept. */
  summary(last = this.#count): PerfSummary {
    const n = Math.min(last, this.#count);
    const cap = this.#samples.length;
    const sorted = new Float64Array(n);
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
