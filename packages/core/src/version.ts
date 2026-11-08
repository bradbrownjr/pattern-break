/**
 * Bump GEN_VERSION whenever levelgen output changes for any input.
 * Bump SIM_VERSION whenever simulation output changes for any input.
 * Leaderboard key is (moduleHash, difficulty, GEN_VERSION); see docs/PLAN.md, "Determinism rules".
 *
 * 0 = pre-release; nothing is stable yet.
 */
export const GEN_VERSION = 0;
export const SIM_VERSION = 0;

/** Fixed simulation tick rate (docs/PLAN.md, "Simulation"). */
export const TICK_HZ = 120;

/** Fixed offline render sample rate for analysis (docs/PLAN.md, "Determinism rules"). */
export const ANALYSIS_SAMPLE_RATE = 48_000;
