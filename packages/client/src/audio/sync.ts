// Sync: measuring the player's audio offset (docs/PLAN.md, "Audio and timing"). A click
// plays every SYNC_INTERVAL_S on the game's audio output and the player presses on each
// click. Each press is read on the song clock's terms, the context time less the output
// latency, as the game reads a press in play; its gap to the nearest click is how late
// the player hears the audio, plus how they press on a beat. The median gap, negated, is
// the offset that puts their presses on the beat (SongClock.userOffsetMs).
//
// The arithmetic (pressGaps, syncResult) is apart from the audio so the tests run in Node.

/** Seconds between clicks: 120 a minute. */
export const SYNC_INTERVAL_S = 0.5;
/** Presses that count, after the warm-up. */
export const SYNC_PRESSES = 16;
/** First presses dropped while the player finds the beat. */
export const SYNC_WARMUP = 4;
/** A press this far from the median gap is a slip, not a measurement. */
export const SYNC_OUTLIER_MS = 100;
/** The offset's range and step, as the Settings row offers it. */
export const SYNC_MIN_MS = -300;
export const SYNC_MAX_MS = 100;
export const SYNC_STEP_MS = 5;
/** Fewer presses than this left after the outliers go, and there's no result. */
const MIN_USED = SYNC_PRESSES / 2;
/** The first click comes this long after the start, so the player is ready. */
const LEAD_IN_S = 1;

/** Each press's gap to the nearest click, in ms: positive when the press came after it. */
export function pressGaps(clicks: readonly number[], presses: readonly number[]): number[] {
  return presses.map((p) => {
    let best = Infinity;
    for (const c of clicks) if (Math.abs(p - c) < Math.abs(best)) best = p - c;
    return best * 1000;
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** An offset in ms rounded to the step and kept in range. */
export function clampOffset(ms: number): number {
  const stepped = Math.round(ms / SYNC_STEP_MS) * SYNC_STEP_MS;
  return Math.min(SYNC_MAX_MS, Math.max(SYNC_MIN_MS, stepped)) || 0;
}

export interface SyncResult {
  /** The offset to use, in ms (SongClock.userOffsetMs). */
  offsetMs: number;
  /** The presses that counted. */
  used: number;
  /** Half the range between the middle half of the counted gaps, in ms: how steady the presses were. */
  spreadMs: number;
}

/**
 * The offset from every press's gap (warm-up included), or null when too few steady
 * presses are left. The warm-up presses are dropped, then the presses more than
 * SYNC_OUTLIER_MS from the median, and the median of the rest is negated.
 */
export function syncResult(gaps: readonly number[]): SyncResult | null {
  const counted = gaps.slice(SYNC_WARMUP);
  if (counted.length < MIN_USED) return null;
  const middle = median(counted);
  const kept = counted.filter((g) => Math.abs(g - middle) <= SYNC_OUTLIER_MS);
  if (kept.length < MIN_USED) return null;
  const sorted = [...kept].sort((a, b) => a - b);
  const q1 = sorted[Math.floor((sorted.length - 1) / 4)]!;
  const q3 = sorted[Math.ceil(((sorted.length - 1) * 3) / 4)]!;
  return { offsetMs: clampOffset(-median(kept)), used: kept.length, spreadMs: Math.round((q3 - q1) / 2) };
}

/** The click: a short 1.5 kHz blip, 2 kHz on the first of each four, made once. */
function clickBuffer(context: BaseAudioContext, hz: number): AudioBuffer {
  const length = Math.round(context.sampleRate * 0.03);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / context.sampleRate;
    data[i] = Math.sin(2 * Math.PI * hz * t) * Math.exp(-t * 150) * 0.5;
  }
  return buffer;
}

/**
 * One calibration: the clicks scheduled on `context`, straight to its output (the volume
 * settings could have muted the music and effects), and the presses taken against them.
 * `latency` is the output latency the song clock subtracts (player.ts reads it the same
 * way: outputLatency, else baseLatency, else 0).
 */
export class SyncSession {
  readonly #context: BaseAudioContext;
  readonly #latency: () => number;
  readonly #clicks: number[] = [];
  readonly #presses: number[] = [];
  readonly #sources: AudioBufferSourceNode[] = [];

  constructor(context: BaseAudioContext, latency: () => number) {
    this.#context = context;
    this.#latency = latency;
  }

  /** Schedules the clicks, enough for every press with a few to spare. */
  start(): void {
    const ctx = this.#context;
    const plain = clickBuffer(ctx, 1500);
    const accent = clickBuffer(ctx, 2000);
    const first = ctx.currentTime + LEAD_IN_S;
    const count = SYNC_WARMUP + SYNC_PRESSES + 4;
    for (let k = 0; k < count; k++) {
      const at = first + k * SYNC_INTERVAL_S;
      const source = ctx.createBufferSource();
      source.buffer = k % 4 === 0 ? accent : plain;
      source.connect(ctx.destination);
      source.start(at);
      this.#sources.push(source);
      this.#clicks.push(at);
    }
  }

  /** The clicks' context times, as the song clock would read them: when each is heard. */
  get clicks(): readonly number[] {
    return this.#clicks;
  }

  /** Takes a press now; `at` (context seconds) is for tests. Returns the presses so far. */
  press(at: number = this.#context.currentTime): number {
    if (this.done) return this.#presses.length;
    // As the song clock reads it: the context time less the latency, so the press compares
    // with the click's own context time, when the clock says it was heard.
    this.#presses.push(at - this.#latency());
    return this.#presses.length;
  }

  get presses(): number {
    return this.#presses.length;
  }

  get done(): boolean {
    return this.#presses.length >= SYNC_WARMUP + SYNC_PRESSES;
  }

  /** The clicks ran out before the presses did. */
  get expired(): boolean {
    const last = this.#clicks[this.#clicks.length - 1];
    return last !== undefined && this.#context.currentTime > last + 1;
  }

  result(): SyncResult | null {
    return syncResult(pressGaps(this.#clicks, this.#presses));
  }

  stop(): void {
    for (const s of this.#sources) {
      try {
        s.stop();
      } catch {
        // Not started yet in some engines; it is dropped with the session.
      }
      s.disconnect();
    }
    this.#sources.length = 0;
  }
}
