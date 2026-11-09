/**
 * Bump GEN_VERSION whenever levelgen output changes for any input.
 * Bump SIM_VERSION whenever simulation output changes for any input.
 * Leaderboard key is (moduleHash, difficulty, GEN_VERSION); see docs/PLAN.md, "Determinism rules".
 *
 * GEN_VERSION 1 = peak dots off on hard (2026-11-08). 2 = walls squeeze on note hits and
 * wind with the melody; difficulty sets the song's tempo and the cave's width
 * (2026-11-09). 3 = turrets, tanks and ships from the drums, bass and other instruments
 * (2026-11-09). 4 = each instrument's note ticks in the Level, for the on-beat bonus
 * (2026-11-09). 5 = each ship's formation, for power-up capsules (2026-11-09). Pre-release:
 * no scores are kept yet.
 *
 * SIM_VERSION 1 = the ship and terrain (M1). 2 = enemies, shots, enemy bullets and three
 * lives (2026-11-09). 3 = score: kill points, the on-beat bonus, the streak multiplier and
 * the survival bonus (2026-11-09). 4 = turrets score 200, not 100 (2026-11-09). 5 = the
 * concussive bomb and the nuke (2026-11-09). 6 = 3 shots in flight, not 6, and a bomb per
 * press with a 1 s reload (2026-11-09). 7 = 6 shots in flight again (2026-11-09). 8 =
 * capsules, the power-up meter, and boost, double, laser, missile, option and shield
 * (2026-11-09).
 */
export const GEN_VERSION = 5;
export const SIM_VERSION = 8;

/** Fixed simulation tick rate (docs/PLAN.md, "Simulation"). */
export const TICK_HZ = 120;

/** Fixed offline render sample rate for analysis (docs/PLAN.md, "Determinism rules"). */
export const ANALYSIS_SAMPLE_RATE = 48_000;
