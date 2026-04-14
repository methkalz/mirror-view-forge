/**
 * Trauma-based screen shake system (GDC "Math for Game Programmers" - Squirrel Eiserloh).
 *
 * Design:
 *  - Store a single scalar `trauma` in [0..1]
 *  - Actual shake amount = maxOffset * trauma^2 (non-linear, feels natural)
 *  - Decay trauma linearly over time so shakes fade without abrupt stops
 *  - Use a pseudo-random noise function for organic oscillation
 *
 * Usage (engine):
 *    addTrauma(g, COMBAT.TRAUMA_LIGHT)   // on small hits
 *    addTrauma(g, COMBAT.TRAUMA_HEAVY)   // on explosions
 *    updateCameraShake(g, dt)            // each frame
 *    // g.screenShake.x / y will contain the offset to apply
 */

import type { GameData } from './types';

// Tuning
const TRAUMA_DECAY_PER_SEC = 1.5; // 1 second of full trauma decays to zero
const MAX_SHAKE_X = 14; // px
const MAX_SHAKE_Y = 10; // px
const MAX_ROTATION = 0.03; // radians — small so feel but not disorienting

// Internal trauma state, kept outside GameData to avoid tight coupling
// (the engine reads/writes via functions).
let trauma = 0;
let noiseSeed = 0;

/** Add trauma from an impact. Values saturate at 1. */
export function addTrauma(amount: number) {
  trauma = Math.min(1, trauma + amount);
}

/** Reset any accumulated trauma — call this on game reset. */
export function resetTrauma() {
  trauma = 0;
  noiseSeed = 0;
}

/** Read current trauma level (for visual intensity effects). */
export function getTrauma(): number {
  return trauma;
}

/** Deterministic noise in [-1, 1] based on time. */
function noise(t: number): number {
  // Simple hash of integer seed + float offset
  const s = Math.sin(t * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Update trauma decay and compute shake offsets.
 * Writes into g.screenShake.x / y. Does not touch other state.
 */
export function updateCameraShake(g: GameData, dt: number) {
  if (trauma <= 0) {
    g.screenShake.x = 0;
    g.screenShake.y = 0;
    return;
  }

  // Non-linear response: trauma² feels more punchy than linear
  const amount = trauma * trauma;

  // Advance internal time for noise lookups
  noiseSeed += dt * 35; // frequency of oscillation

  g.screenShake.x = MAX_SHAKE_X * amount * noise(noiseSeed + 1);
  g.screenShake.y = MAX_SHAKE_Y * amount * noise(noiseSeed + 7);

  // Decay
  trauma = Math.max(0, trauma - TRAUMA_DECAY_PER_SEC * dt);
}

/** Current rotation offset (optional — can be used by renderer). */
export function getShakeRotation(): number {
  if (trauma <= 0) return 0;
  const amount = trauma * trauma;
  return MAX_ROTATION * amount * noise(noiseSeed + 13);
}
