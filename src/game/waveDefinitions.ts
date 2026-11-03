/**
 * ═══════════════════════════════════════════════════════════════
 * Wave definitions — the single source of truth for every wave.
 * ═══════════════════════════════════════════════════════════════
 *
 * Each wave is described ONCE here: numbers, threats, drones, mid-wave
 * events, protection flags and the warnings shown at its start.
 *
 * `resolveWave` then layers the two admin-controlled sources on top, in a
 * fixed order, field by field:
 *
 *   1. base definition (this file)
 *   2. difficulty profile (DB)  → numeric tuning + unlock lists
 *   3. per-wave override  (DB)  → admin edits for one specific wave
 *
 * Nothing is ever silently dropped: an override without events keeps the
 * base events, an override's custom warning is shown IN ADDITION to the
 * base warnings (which also act as gameplay triggers, e.g. the W6 one
 * spawns the mini-boss), and the texts of all warnings are editable
 * separately through the game_texts table.
 *
 * This module is pure data + pure functions (no engine, no DOM), so it
 * can be unit-tested and shared with the admin preview.
 */
import type { DroneTier, HazardType, WaveEventSpec, WaveEventType } from './types';
import type { DifficultyProfile, RemoteWaveConfig } from './config';

export interface WaveWarningDef {
  /** Stable id — also a gameplay trigger (see applyWaveEvent in engine). */
  id: string;
  /** Default text; the live text comes from texts.ts key `warn.<id>`. */
  text: string;
  sub: string;
  color: string;
  type: 'warning' | 'upgrade';
}

export interface WaveRecipe {
  threats: HazardType[];
  maxConcurrent: number;
  spawnInterval: number;
  droneInterval: number;
  droneTiers: DroneTier[];
  clusterSplits: number;
  bulletLevel: number;
  phaseInDelay: number;
  hasChemical: boolean;
  hasIncendiary: boolean;
  hasBoss: boolean;
  duration: number;
  surgeMultiplier: number;
  events: WaveEventSpec[];
  /** Base warnings for this wave (text + gameplay trigger). */
  warnings: WaveWarningDef[];
  /** Extra banner an admin set on this wave's override, shown first. */
  customWarning: { text: string; color: string; type: 'warning' | 'upgrade'; soundKey: string | null } | null;
}

interface BaseWave extends Omit<WaveRecipe, 'customWarning'> {
  /** Theme forces the threat/drone lists — the profile can't change them. */
  lockedLists?: boolean;
  /** Theme forces the duration (e.g. the short all-surge W8). */
  lockedDuration?: boolean;
  /** Breather/themed wave — the profile can't add chemical/incendiary. */
  quiet?: boolean;
}

/** Drone tiers that spawn through flags/timers, never from the tier list. */
const FLAG_DRONES: DroneTier[] = ['incendiary', 'chemical', 'cargo'];
/** Hazards that exist in code but are disabled in gameplay. */
const DISABLED_THREATS: HazardType[] = ['mine'];
const DISABLED_EVENTS: WaveEventType[] = ['minefield'];

const ALL_THREATS: HazardType[] = ['shrapnel', 'missile', 'cluster', 'meteor'];
const LATE_TIERS: DroneTier[] = ['scout', 'tracker', 'bomber', 'laser'];
const D = 60;

const w = (id: string, text: string, color: string, type: 'warning' | 'upgrade' = 'warning'): WaveWarningDef =>
  ({ id, text, sub: '', color, type });
const ev = (type: WaveEventType, triggerAt: number, duration: number): WaveEventSpec => ({ type, triggerAt, duration });

/** Waves 1–16, written out in full. */
const BASE_WAVES: Record<number, BaseWave> = {
  // W1 — First Blood: shrapnel tutorial
  1: { threats: ['shrapnel'], maxConcurrent: 3, spawnInterval: 2.4, droneInterval: 0, droneTiers: [], clusterSplits: 0, bulletLevel: 1, phaseInDelay: 0, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, events: [],
    warnings: [w('w1_shrapnel', 'تحذير: شظايا متساقطة!', '#ef4444')] },
  // W2 — First Hunter: missile + first scout, bullet upgrade
  2: { threats: ['shrapnel', 'missile'], maxConcurrent: 4, spawnInterval: 2.0, droneInterval: 28, droneTiers: ['scout'], clusterSplits: 0, bulletLevel: 2, phaseInDelay: 8, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, events: [],
    warnings: [w('w2_missile', 'تحذير: صواريخ + طائرات استطلاع!', '#dc2626'), w('w2_bullet2', 'تطوير: طلقة مزدوجة', '#22c55e', 'upgrade')] },
  // W3 — Cluster intro with a mid-wave calm
  3: { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 5, spawnInterval: 1.8, droneInterval: 24, droneTiers: ['scout'], clusterSplits: 2, bulletLevel: 2, phaseInDelay: 10, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('calm', 25, 10)],
    warnings: [w('w3_cluster', 'تحذير: صواريخ متشظية!', '#f43f5e')] },
  // W4 — Trackers + bullet upgrade
  4: { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.7, droneInterval: 20, droneTiers: ['scout', 'tracker'], clusterSplits: 2, bulletLevel: 3, phaseInDelay: 10, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, events: [],
    warnings: [w('w4_tracker', 'تحذير: طائرات تتبع!', '#dc2626'), w('w4_bullet3', 'تطوير: طلقة ثلاثية', '#22c55e', 'upgrade')] },
  // W5 — Fire debut with a mid-wave scout swarm
  5: { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.6, droneInterval: 18, droneTiers: ['scout', 'tracker'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 12, hasChemical: false, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('swarm', 30, 8)],
    warnings: [w('w5_extinguisher', 'إمدادات: طفاية حريق!', '#f97316', 'upgrade'), w('w5_incendiary', 'تحذير: طائرات حارقة!', '#ea580c')] },
  // W6 — Mini-boss + meteor debut
  6: { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 7, spawnInterval: 1.5, droneInterval: 18, droneTiers: ['scout', 'tracker'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 0, hasChemical: false, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1, events: [],
    warnings: [w('w6_minibos', '⚠ قائد معركة قادم!', '#f59e0b')] },
  // W7 — Chemical rain with a volley and a late surge
  7: { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 7, spawnInterval: 1.4, droneInterval: 16, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('volley', 30, 3), ev('surge', 45, 15)],
    warnings: [w('w7_gasmask', 'إمدادات: كمامة غاز!', '#16a34a', 'upgrade'), w('w7_chemical', 'تحذير: طائرات كيميائية!', '#15803d'), w('w7_bomber', 'تحذير: قاذفات قنابل!', '#ef4444')] },
  // W8 — Short all-surge wave, laser debut
  8: { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 8, spawnInterval: 1.2, droneInterval: 14, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 4, bulletLevel: 4, phaseInDelay: 6, hasChemical: true, hasIncendiary: true, hasBoss: false, duration: 45, surgeMultiplier: 1.3, lockedDuration: true,
    events: [ev('surge', 0, 45)],
    warnings: [w('w8_surge', '⚠ موجة عاصفة!', '#dc2626'), w('w8_bullet4', 'تطوير: طلقة رباعية', '#22c55e', 'upgrade')] },
  // W9 — Breather: the whole wave is a calm
  9: { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 5, spawnInterval: 1.8, droneInterval: 22, droneTiers: ['scout'], clusterSplits: 3, bulletLevel: 4, phaseInDelay: 0, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, quiet: true,
    events: [ev('calm', 0, 60)],
    warnings: [w('w9_calm', '🌿 موجة استراحة — استعد', '#60a5fa')] },
  // W10 — Everything combined: volley + air raid
  10: { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 9, spawnInterval: 1.1, droneInterval: 13, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 4, bulletLevel: 4, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('volley', 20, 3), ev('airstrike_flyby', 35, 1)],
    warnings: [w('w10_combined', 'تحذير: جميع التهديدات!', '#991b1b')] },
  // W11 — Pre-boss: air raid + late surge
  11: { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 10, spawnInterval: 1.0, droneInterval: 11, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 5, bulletLevel: 4, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('airstrike_flyby', 42, 1), ev('surge', 48, 12)],
    warnings: [w('w11_preboss', '⚠ قاذفات إضافية قادمة!', '#dc2626')] },
  // W12 — BOSS
  12: { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 10, spawnInterval: 1.0, droneInterval: 12, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 5, bulletLevel: 4, phaseInDelay: 12, hasChemical: true, hasIncendiary: true, hasBoss: true, duration: D, surgeMultiplier: 1, events: [],
    warnings: [w('w12_boss', 'تحذير: طائرة حربية!', '#dc2626'), w('w12_cluster5', 'تحذير: تشظي خماسي!', '#991b1b')] },
  // W13 — Recovery after the boss
  13: { threats: ALL_THREATS, maxConcurrent: 8, spawnInterval: 1.2, droneInterval: 11.7, droneTiers: LATE_TIERS, clusterSplits: 5, bulletLevel: 4, phaseInDelay: 0, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, quiet: true,
    events: [ev('calm', 0, 30)],
    warnings: [w('w13_recover', '🌿 استراحة ما بعد القائد', '#60a5fa')] },
  // W14 — Tension rebuilds
  14: { threats: ALL_THREATS, maxConcurrent: 10, spawnInterval: 1.1, droneInterval: 11.4, droneTiers: LATE_TIERS, clusterSplits: 5, bulletLevel: 4, phaseInDelay: 0, hasChemical: true, hasIncendiary: true, hasBoss: false, duration: D, surgeMultiplier: 1,
    events: [ev('swarm', 25, 8), ev('airstrike_flyby', 42, 1)],
    warnings: [w('w14_rebuild', '⚠ التوتر يعود', '#f59e0b')] },
  // W15 — Themed: lasers + meteors only
  15: { threats: ['meteor'], maxConcurrent: 6, spawnInterval: 1.6, droneInterval: 11.1, droneTiers: ['laser'], clusterSplits: 6, bulletLevel: 4, phaseInDelay: 0, hasChemical: false, hasIncendiary: false, hasBoss: false, duration: D, surgeMultiplier: 1, lockedLists: true, quiet: true,
    events: [],
    warnings: [w('w15_laser_theme', '🎯 موجة الليزر والنيازك فقط!', '#a855f7')] },
  // W16 — PEAK: boss + everything
  16: { threats: ALL_THREATS, maxConcurrent: 12, spawnInterval: 0.9, droneInterval: 10.8, droneTiers: LATE_TIERS, clusterSplits: 6, bulletLevel: 4, phaseInDelay: 0, hasChemical: true, hasIncendiary: true, hasBoss: true, duration: D, surgeMultiplier: 1,
    events: [ev('volley', 20, 3), ev('surge', 45, 15)],
    warnings: [w('w16_peak', '☠ الذروة — كل التهديدات + البوس!', '#dc2626')] },
};

export const LAST_DEFINED_WAVE = 16;

/** Base definition for any wave number (17+ is generated). */
function baseWave(n: number): BaseWave {
  const wave = Math.max(1, Math.floor(n));
  const defined = BASE_WAVES[wave];
  if (defined) return defined;

  // W17+: gentle continuation with a rotating event pattern
  const extra = wave - 12;
  const e2 = wave - 16;
  const mod = e2 % 3;
  const events =
    mod === 0 ? [ev('airstrike_flyby', 15, 1), ev('surge', 40, 15)] :
    mod === 1 ? [ev('volley', 20, 3), ev('swarm', 35, 8)] :
                [ev('surge', 30, 20)];
  return {
    threats: ALL_THREATS,
    maxConcurrent: Math.min(13, 12 + Math.floor(e2 / 3)),
    spawnInterval: Math.max(0.6, 0.9 - e2 * 0.02),
    droneInterval: Math.max(8, 12 - extra * 0.3),
    droneTiers: LATE_TIERS,
    clusterSplits: Math.min(6, 5 + Math.floor(extra / 3)),
    bulletLevel: 4,
    phaseInDelay: 0,
    hasChemical: true,
    hasIncendiary: true,
    hasBoss: extra % 4 === 0,
    duration: D,
    surgeMultiplier: 1,
    events,
    warnings: [],
  };
}

/** Every default warning, keyed by wave — used by texts.ts and the admin. */
export const WAVE_WARNINGS: Record<number, WaveWarningDef[]> = Object.fromEntries(
  Object.entries(BASE_WAVES).map(([k, v]) => [Number(k), v.warnings]),
);

// ── Helpers ───────────────────────────────────────────────────

function cleanThreats(list: string[]): HazardType[] {
  const out = list.filter(t => !DISABLED_THREATS.includes(t as HazardType)) as HazardType[];
  return out.length > 0 ? out : ['shrapnel'];
}

/** Splits a raw tier list into spawnable tiers + the flags it implies. */
function splitTiers(list: string[]) {
  const tiers = list.filter(t => !FLAG_DRONES.includes(t as DroneTier)) as DroneTier[];
  return {
    tiers,
    incendiary: list.includes('incendiary'),
    chemical: list.includes('chemical'),
  };
}

function cleanEvents(list: WaveEventSpec[]): WaveEventSpec[] {
  return list
    .filter(e => !DISABLED_EVENTS.includes(e.type))
    .map(e => ({ type: e.type, triggerAt: e.triggerAt, duration: e.duration }));
}

/** Numbers + unlock lists derived from the difficulty profile. */
function fromProfile(n: number, p: DifficultyProfile) {
  const threats: string[] = [];
  for (const [type, unlockWave] of Object.entries(p.threatsUnlock)) {
    if (n >= unlockWave) threats.push(type);
  }
  const rawTiers: string[] = [];
  for (const [type, unlockWave] of Object.entries(p.dronesUnlock)) {
    if (n >= unlockWave) rawTiers.push(type);
  }

  const maxConcurrent = Math.min(p.maxConcurrentCap, Math.round(p.baseMaxConcurrent + p.concurrentGrowth * (n - 1)));
  const spawnInterval = Math.max(p.minSpawnInterval, p.baseSpawnInterval - p.spawnIntervalDecay * (n - 1));

  const clusterUnlock = p.threatsUnlock['cluster'] || 999;
  const clusterSplits = n >= clusterUnlock
    ? Math.min(p.clusterSplitsCap, Math.round(p.clusterSplitsBase + p.clusterSplitsGrowth * (n - clusterUnlock)))
    : 0;

  let droneInterval = 0;
  const unlockWaves = Object.values(p.dronesUnlock);
  if (rawTiers.length > 0 && unlockWaves.length > 0) {
    const firstDroneWave = Math.min(...unlockWaves);
    droneInterval = Math.max(p.droneIntervalMin, p.droneIntervalBase * Math.pow(p.droneIntervalDecay, n - firstDroneWave));
  }

  let bulletLevel = 1;
  for (const [level, unlockWave] of Object.entries(p.bulletLevelWaves)) {
    if (n >= unlockWave) bulletLevel = Math.max(bulletLevel, parseInt(level));
  }

  const isNewThreatWave = Object.values(p.threatsUnlock).includes(n) || unlockWaves.includes(n);

  return {
    threats,
    rawTiers,
    maxConcurrent,
    spawnInterval,
    clusterSplits,
    droneInterval,
    bulletLevel,
    phaseInDelay: isNewThreatWave ? p.phaseInDelay : 0,
    hasBoss: n >= p.bossStartWave && (n - p.bossStartWave) % p.bossEveryNWaves === 0,
    hasChemical: n >= (p.dronesUnlock['chemical'] || 999),
    hasIncendiary: n >= (p.dronesUnlock['incendiary'] || 999),
    duration: p.waveDuration,
  };
}

/**
 * Resolves the final recipe for a wave: base → profile → override.
 * Pure function: same inputs always give the same recipe.
 */
export function resolveWave(
  n: number,
  profile?: DifficultyProfile | null,
  overrides?: RemoteWaveConfig[] | null,
): WaveRecipe {
  const base = baseWave(n);
  const r: WaveRecipe = {
    threats: [...base.threats],
    maxConcurrent: base.maxConcurrent,
    spawnInterval: base.spawnInterval,
    droneInterval: base.droneInterval,
    droneTiers: [...base.droneTiers],
    clusterSplits: base.clusterSplits,
    bulletLevel: base.bulletLevel,
    phaseInDelay: base.phaseInDelay,
    hasChemical: base.hasChemical,
    hasIncendiary: base.hasIncendiary,
    hasBoss: base.hasBoss,
    duration: base.duration,
    surgeMultiplier: base.surgeMultiplier,
    events: cleanEvents(base.events),
    warnings: base.warnings,
    customWarning: null,
  };

  // 2. Difficulty profile — numeric tuning + unlock lists
  if (profile) {
    const p = fromProfile(n, profile);
    r.maxConcurrent = p.maxConcurrent;
    r.spawnInterval = p.spawnInterval;
    r.droneInterval = p.droneInterval;
    r.clusterSplits = p.clusterSplits;
    r.bulletLevel = p.bulletLevel;
    r.phaseInDelay = p.phaseInDelay;
    if (!base.lockedDuration) r.duration = p.duration;
    if (!base.lockedLists) {
      r.threats = cleanThreats(p.threats);
      r.droneTiers = splitTiers(p.rawTiers).tiers;
    }
    r.hasBoss = base.hasBoss || p.hasBoss;
    if (!base.quiet) {
      r.hasChemical = base.hasChemical || p.hasChemical;
      r.hasIncendiary = base.hasIncendiary || p.hasIncendiary;
    }
  }

  // 3. Per-wave admin override
  const o = overrides?.find(x => x.waveNumber === n);
  if (o) {
    const tiers = splitTiers(o.droneTypes ?? []);
    r.threats = cleanThreats(o.threats ?? []);
    r.maxConcurrent = o.maxConcurrent;
    r.spawnInterval = o.spawnRate;
    r.droneInterval = o.droneInterval;
    r.droneTiers = tiers.tiers;
    r.clusterSplits = o.clusterSplits;
    r.bulletLevel = o.bulletLevel;
    r.phaseInDelay = o.phaseInDelay;
    r.duration = o.duration;
    r.surgeMultiplier = o.surgeMultiplier;
    // Flags can be added by the override, never silently removed —
    // a threat the wave is built around always keeps its protection card.
    r.hasBoss = r.hasBoss || o.hasBoss;
    r.hasChemical = r.hasChemical || o.hasChemical || tiers.chemical;
    r.hasIncendiary = r.hasIncendiary || o.hasIncendiary || tiers.incendiary;
    const overrideEvents = (o.events ?? []).map(e => ({ type: e.type as WaveEventType, triggerAt: e.triggerAt, duration: e.duration }));
    if (overrideEvents.length > 0) r.events = cleanEvents(overrideEvents);
    if (o.warningText && o.warningText.trim()) {
      r.customWarning = {
        text: o.warningText.trim(),
        color: o.warningColor || '#ef4444',
        type: o.warningType === 'upgrade' ? 'upgrade' : 'warning',
        soundKey: o.warningSoundKey,
      };
    }
  }

  // Safety: guarantee sane numbers whatever the DB contains
  r.maxConcurrent = Math.max(1, r.maxConcurrent || 1);
  r.spawnInterval = Math.max(0.2, r.spawnInterval || 1);
  r.duration = Math.max(10, r.duration || D);
  r.surgeMultiplier = r.surgeMultiplier || 1;
  return r;
}
