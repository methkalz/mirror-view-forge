/**
 * Central constants for SKYFALL game tuning.
 * All "magic numbers" that control feel, physics and visuals should live here
 * so designers can tune the game without touching engine/renderer logic.
 */

export const PLAYER = {
  RADIUS: 22,
  BASE_SPEED: 260,
  ACCEL: 1200,
  FRICTION: 8,
  DASH_SPEED: 500,
  DASH_DURATION: 0.25,
  DASH_COOLDOWN: 0.8,
  MAX_HEALTH: 100,
  BASE_MAX_AMMO: 30,
  SHOOT_COOLDOWN: 0.3,
  BULLET_SPEED: 600,
} as const;

export const SCREEN = {
  /** Ground plane Y as fraction of canvas height. */
  GROUND_RATIO: 0.78,
  /** Drone altitude constraints (fraction of canvas height). */
  DRONE_MIN_Y: 0.08,
  DRONE_MAX_Y: 0.42,
  /** Default parallax multipliers for city layers. */
  PARALLAX_BG: 0.3,
  PARALLAX_FAR: 0.05,
  PARALLAX_MID: 0.10,
  PARALLAX_NEAR: 0.20,
} as const;

export const COMBAT = {
  /** Distance (px) at which dodging a hazard grants a close-call combo. */
  CLOSE_CALL_DIST: 45,
  /** Screen-shake trauma values (0..1). */
  TRAUMA_LIGHT: 0.3,
  TRAUMA_HEAVY: 0.6,
  TRAUMA_CRITICAL: 0.9,
  /** Hit-stop durations for impact feel. */
  HIT_STOP_LIGHT: 0.06,
  HIT_STOP_HEAVY: 0.15,
  /** Slow-motion multipliers. */
  SLOWMO_LIGHT: 0.3,
  SLOWMO_HEAVY: 0.15,
  SLOWMO_CINEMATIC: 0.1,
  /** Combo timeout in seconds. */
  COMBO_TIMEOUT: 3,
  COMBO_MAX_MULTIPLIER: 3,
} as const;

export const WAVE = {
  DEFAULT_DURATION: 60,
  FINALE_WARNING_TIME: 5,
  END_SLOWMO_DURATION: 2.0,
  ANNOUNCE_DURATION: 3.0,
  /** Upgrade card auto-select fallback. */
  CARD_AUTO_SELECT: 10,
  /** Waves per level (upgrade cards shown). */
  WAVES_PER_LEVEL: 3,
  /** Max cluster sub-bombs. */
  MAX_CLUSTER_SPLITS: 6,
} as const;

export const HAZARD = {
  MAX_MISSILE_SPEED: 450,
  SHRAPNEL_DAMAGE: 10,
  MISSILE_DAMAGE: 22,
  CLUSTER_DAMAGE: 16,
  SHRAPNEL_SIZE: 8,
  MISSILE_SIZE: 12,
  CLUSTER_SIZE: 14,
  SHRAPNEL_WARNING: 0.7,
  MISSILE_WARNING: 1.2,
} as const;

export const COLORS = {
  // Health gradient stops
  HEALTH_GOOD: '#22c55e',
  HEALTH_WARN: '#eab308',
  HEALTH_CRIT: '#ef4444',

  // UI accents
  GOLD: '#fbbf24',
  GOLD_DIM: '#d4a017',
  DANGER: '#dc2626',
  SHIELD: '#60a5fa',
  UPGRADE: '#22c55e',
  COMBO_START: '#fbbf24',
  COMBO_MID: '#f59e0b',
  COMBO_END: '#d97706',

  // Entity colors
  FIRE: '#f97316',
  GAS: '#16a34a',
  CHEMICAL: '#15803d',
  INCENDIARY: '#ea580c',

  // Ground/sky
  GROUND_TOP: '#2a2520',
  GROUND_MID: '#221e18',
  GROUND_BOTTOM: '#1a1512',
  SKY_FALLBACK: '#0c1445',
} as const;

export const PARTICLES = {
  MAX_POOL: 600,
  MAX_SMOKE_TRAILS: 80,
  MAX_EXPLOSIONS: 20,
  MAX_FLOATING_TEXTS: 15,
  AMBIENT_TARGET: 15,
} as const;

export const UI = {
  HUD_PAD: 14,
  HEALTH_BAR_WIDTH: 140,
  HEALTH_BAR_HEIGHT: 14,
  CARD_WIDTH: 130,
  CARD_HEIGHT: 185,
  CARD_GAP: 12,
  GAS_MASK_CARD_WIDTH: 200,
  GAS_MASK_CARD_HEIGHT: 270,
} as const;
