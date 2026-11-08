// Turns an AnalyserNode's frequency data into LED bar heights for the jukebox. Cosmetic: it
// reads what is playing and feeds nothing back. Bin k of getByteFrequencyData covers
// k * sampleRate / fftSize Hz, as a byte between the node's minDecibels (0) and
// maxDecibels (255).

/**
 * Bin edges for `bars` bars spaced evenly on a log scale from `lowHz` to `highHz`: bar b
 * reads bins edges[b] up to, not including, edges[b + 1]. Every bar gets at least one bin.
 */
export function barBinEdges(bars: number, fftSize: number, sampleRate: number, lowHz: number, highHz: number): Uint16Array {
  const binHz = sampleRate / fftSize;
  const binCount = fftSize / 2;
  const edges = new Uint16Array(bars + 1);
  const ratio = highHz / lowHz;
  for (let b = 0; b <= bars; b++) {
    const hz = lowHz * Math.pow(ratio, b / bars);
    const bin = Math.min(binCount, Math.max(1, Math.round(hz / binHz)));
    edges[b] = b === 0 ? bin : Math.min(binCount, Math.max(bin, edges[b - 1]! + 1));
  }
  return edges;
}

/** Writes each bar's height, 0 to `segments`, from the loudest bin in its range. */
export function barLevels(bins: Uint8Array, edges: Uint16Array, segments: number, out: Uint8Array): void {
  for (let b = 0; b < out.length; b++) {
    let loudest = 0;
    for (let k = edges[b]!; k < edges[b + 1]!; k++) loudest = Math.max(loudest, bins[k] ?? 0);
    out[b] = Math.round((loudest * segments) / 255);
  }
}
