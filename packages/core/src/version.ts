/**
 * Bump GEN_VERSION whenever levelgen output changes for any input.
 * Bump SIM_VERSION whenever simulation output changes for any input.
 * Leaderboard key is (moduleHash, difficulty, GEN_VERSION); see docs/PLAN.md, "Determinism rules".
 *
 * GEN_VERSION 1 = peak dots off on hard (2026-11-08). 2 = cavern walls: bass floor, highs
 * ceiling, rock base, 40 px minimum gap, bar pitch by difficulty (2026-11-09).
 * SIM_VERSION 2 = collision reads the level's bar pitch (2026-11-09).
 * Pre-release: no scores are kept yet.
 */
export const GEN_VERSION = 2;
export const SIM_VERSION = 2;

/** Fixed simulation tick rate (docs/PLAN.md, "Simulation"). */
export const TICK_HZ = 120;

/** Fixed offline render sample rate for analysis (docs/PLAN.md, "Determinism rules"). */
export const ANALYSIS_SAMPLE_RATE = 48_000;
