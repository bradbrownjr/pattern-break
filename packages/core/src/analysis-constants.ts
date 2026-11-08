// Fixed parameters of the analysis pass (docs/PLAN.md, "Analysis pipeline"). LevelData
// records each of them, so a reader never has to assume these values. Changing any of
// them changes LevelData and needs a GEN_VERSION bump.

import { ANALYSIS_SAMPLE_RATE } from './version.ts';

export const SAMPLE_RATE = ANALYSIS_SAMPLE_RATE;

/** Frames rendered per `readFloatStereo` call: 160 frames is 3.33 ms at 48 kHz. */
export const CHUNK_FRAMES = 160;

/** Samples between analysis frames: 800 is 60 frames per second of song time. */
export const HOP_FRAMES = 800;

/** FFT length. Each analysis frame transforms the most recent FFT_SIZE samples. */
export const FFT_SIZE = 2048;

/** Number of log-spaced spectrum bands. */
export const BAND_COUNT = 16;
/** Lower edge of the lowest band, in Hz. */
export const BAND_LOW_HZ = 40;
/** Upper edge of the highest band, in Hz. */
export const BAND_HIGH_HZ = 16_000;

/** LED levels run 0..LED_LEVELS. Level n means the band met n thresholds. */
export const LED_LEVELS = 12;
/** The lowest threshold, in dB relative to a full-scale sine centred in the band. */
export const LED_BOTTOM_DB = -60;
/** Spacing between thresholds, in dB. The top threshold is -5 dB. */
export const LED_STEP_DB = 5;

/** VU values are stored as floor(min(v, 1) * VU_SCALE). */
export const VU_SCALE = 255;

/** Rendering stops here if the song has not ended: 15 minutes. */
export const MAX_DURATION_SAMPLES = 15 * 60 * SAMPLE_RATE;
