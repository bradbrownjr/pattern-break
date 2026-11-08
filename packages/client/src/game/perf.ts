// Per-frame JavaScript cost (sim catch-up plus drawing plus Pixi's render call), kept in a
// ring buffer so recording allocates nothing. Turned on with `?perf=1`.

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

  summary(): PerfSummary {
    const n = this.#count;
    const sorted = this.#samples.slice(0, n).sort();
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
