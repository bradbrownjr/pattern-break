/**
 * Bump GEN_VERSION whenever levelgen output changes for any input.
 * Bump SIM_VERSION whenever simulation output changes for any input.
 * Leaderboard key is (moduleHash, difficulty, GEN_VERSION); see docs/PLAN.md, "Determinism rules".
 *
 * GEN_VERSION 1 = peak dots off on hard (2026-11-08). 2 = walls squeeze on note hits and
 * wind with the melody; difficulty sets the song's tempo and the cave's width
 * (2026-11-09). 3 = turrets, tanks and ships from the drums, bass and other instruments
 * (2026-11-09). Pre-release: no scores are kept yet.
 *
 * SIM_VERSION 1 = the ship and terrain (M1). 2 = enemies, shots, enemy bullets and three
 * lives (2026-11-09).
 */
export const GEN_VERSION = 3;
export const SIM_VERSION = 2;

/** Fixed simulation tick rate (docs/PLAN.md, "Simulation"). */
export const TICK_HZ = 120;

/** Fixed offline render sample rate for analysis (docs/PLAN.md, "Determinism rules"). */
export const ANALYSIS_SAMPLE_RATE = 48_000;
