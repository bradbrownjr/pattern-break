/**
 * Bump GEN_VERSION whenever levelgen output changes for any input.
 * Bump SIM_VERSION whenever simulation output changes for any input.
 * Leaderboard key is (moduleHash, difficulty, GEN_VERSION); see docs/PLAN.md, "Determinism rules".
 *
 * GEN_VERSION 1 = peak dots off on hard (2026-11-08). 2 = walls squeeze on note hits and
 * wind with the melody; difficulty sets the song's tempo and the cave's width
 * (2026-11-09). 3 = turrets, tanks and ships from the drums, bass and other instruments
 * (2026-11-09). 4 = each instrument's note ticks in the Level, for the on-beat bonus
 * (2026-11-09). 5 = each ship's formation, for power-up capsules (2026-11-09). 6 = every
 * gap 14 px wider, one segment a side (2026-11-10). 7 = the impossible difficulty
 * (2026-11-10). 8 = Amiga resampler emulation off, which changes MODs' analysis
 * (2026-11-10). 9 = no peak hold: peak dots are gone (Brad, 2026-11-11). 10 = each turret
 * fires at most 1, 3 or 4 shots by difficulty (2026-11-13). 11 = a drum note starts a
 * formation after 3 formation spacings without ships (Brad, 2026-11-14).
 * Pre-release: no scores are kept yet.
 *
 * SIM_VERSION 1 = the ship and terrain (M1). 2 = enemies, shots, enemy bullets and three
 * lives (2026-11-09). 3 = score: kill points, the on-beat bonus, the streak multiplier and
 * the survival bonus (2026-11-09). 4 = turrets score 200, not 100 (2026-11-09). 5 = the
 * concussive bomb and the nuke (2026-11-09). 6 = 3 shots in flight, not 6, and a bomb per
 * press with a 1 s reload (2026-11-09). 7 = 6 shots in flight again (2026-11-09). 8 =
 * capsules, the power-up meter, and boost, double, laser, missile, drone and shield
 * (2026-11-09). 9 = capsules scroll with the cave and fall to its floor (2026-11-09).
 * 10 = resetSimState sets each enemy's next shot from the level, so a retry plays like a
 * fresh start (2026-11-09). 11 = the ship flies in after losing a life; capsules unlock
 * power-ups in order (no buy button), and double and laser stack; the infinite-lives and
 * god cheats (2026-11-10). 12 = a 6-point shield on every life, costs by what hits it, a
 * bounce off the walls, and an extra life every 20 000 points (2026-11-10). 13 = the
 * player's shots and laser stop on the walls, and missiles burst on them (Brad,
 * 2026-11-11). 14 = missiles and bombs break the walls, and the ceiling beyond a cut falls,
 * crushing what it meets (Brad, 2026-11-11). 15 = enemy bullets cost the shield 1 (ship),
 * 2 (tank) and 3 (turret) points, not 2, 3 and 6 (Brad, 2026-11-13).
 */
export const GEN_VERSION = 11;
export const SIM_VERSION = 15;

/** Fixed simulation tick rate (docs/PLAN.md, "Simulation"). */
export const TICK_HZ = 120;

/** Fixed offline render sample rate for analysis (docs/PLAN.md, "Determinism rules"). */
export const ANALYSIS_SAMPLE_RATE = 48_000;
