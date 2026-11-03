/**
 * Wave system tests.
 *
 * Part 1 checks the pure resolver (waveDefinitions.resolveWave): every
 * source combination must keep events, flags and triggers intact.
 *
 * Part 2 runs the real engine headlessly, wave by wave, and checks what a
 * player would actually experience: events fire, the mini-boss appears,
 * and each protection card shows up before its matching drone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveWave, WAVE_WARNINGS } from '@/game/waveDefinitions';
import { DEFAULT_DIFFICULTY, type RemoteWaveConfig } from '@/game/config';
import { createGame, resetGame, update, _debug } from '@/game/engine';
import { attachDebugAPI } from '@/game/debugCommands';
import { setTextOverrides, t } from '@/game/texts';
import type { GameData, InputState } from '@/game/types';

const override = (waveNumber: number, extra: Partial<RemoteWaveConfig> = {}): RemoteWaveConfig => ({
  waveNumber, duration: 60, threats: ['shrapnel', 'missile'], maxConcurrent: 5, spawnRate: 2,
  surgeMultiplier: 1, droneTypes: ['scout'], clusterSplits: 0, bulletLevel: 2, phaseInDelay: 0,
  droneInterval: 20, hasBoss: false, hasChemical: false, hasIncendiary: false,
  warningText: null, warningColor: '#ef4444', warningType: 'warning', warningSoundKey: null,
  events: [], ...extra,
});

describe('resolveWave — one source of truth', () => {
  it('never returns disabled or flag-only entries, for any wave and source', () => {
    for (let n = 1; n <= 30; n++) {
      for (const r of [resolveWave(n), resolveWave(n, DEFAULT_DIFFICULTY)]) {
        expect(r.threats).not.toContain('mine');
        expect(r.events.map(e => e.type)).not.toContain('minefield');
        for (const tier of ['incendiary', 'chemical', 'cargo']) expect(r.droneTiers).not.toContain(tier);
        expect(r.duration).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('keeps the same events whether the wave comes from code, profile or an override without events', () => {
    for (const n of [3, 5, 7, 8, 9, 10, 11, 14, 16, 17, 18, 19]) {
      const base = resolveWave(n).events;
      expect(resolveWave(n, DEFAULT_DIFFICULTY).events).toEqual(base);
      expect(resolveWave(n, DEFAULT_DIFFICULTY, [override(n)]).events).toEqual(base);
    }
  });

  it('uses override events when the admin set some', () => {
    const custom = [{ type: 'swarm', triggerAt: 5, duration: 8 }];
    expect(resolveWave(10, null, [override(10, { events: custom })]).events).toEqual(custom);
  });

  it('turns flag drones picked in the override into protection flags', () => {
    const r = resolveWave(4, null, [override(4, { droneTypes: ['scout', 'incendiary', 'chemical'] })]);
    expect(r.droneTiers).toEqual(['scout']);
    expect(r.hasIncendiary).toBe(true);
    expect(r.hasChemical).toBe(true);
  });

  it('never lets an override drop a threat flag the wave is built around', () => {
    const r = resolveWave(7, null, [override(7)]);
    expect(r.hasChemical).toBe(true);
    expect(r.hasIncendiary).toBe(true);
  });

  it('keeps themed waves intact under the difficulty profile', () => {
    const w15 = resolveWave(15, DEFAULT_DIFFICULTY);
    expect(w15.threats).toEqual(['meteor']);
    expect(w15.droneTiers).toEqual(['laser']);
    expect(resolveWave(9, DEFAULT_DIFFICULTY).hasChemical).toBe(false);
    expect(resolveWave(8, DEFAULT_DIFFICULTY).duration).toBe(45);
  });

  it('shows the admin banner AND keeps the base warnings that trigger gameplay', () => {
    const r = resolveWave(6, null, [override(6, { warningText: 'رسالة مخصصة' })]);
    expect(r.customWarning?.text).toBe('رسالة مخصصة');
    expect(r.warnings.map(w => w.id)).toContain('w6_minibos');
  });
});

describe('texts', () => {
  beforeEach(() => setTextOverrides({}));

  it('falls back to defaults, applies overrides and fills placeholders', () => {
    expect(t('event.swarm')).toBe('⚠ سرب طائرات!');
    setTextOverrides({ 'event.swarm': 'سرب!' });
    expect(t('event.swarm')).toBe('سرب!');
    expect(t('wave.start', { n: 7 })).toBe('بداية الموجة 7');
    expect(t('missing.key', undefined, 'احتياطي')).toBe('احتياطي');
  });

  it('has an editable text for every wave warning', () => {
    for (const list of Object.values(WAVE_WARNINGS)) {
      for (const w of list) expect(t(`warn.${w.id}`)).toBe(w.text);
    }
  });
});

// ─── Headless engine runs ────────────────────────────────────────

const input = (): InputState => ({
  moveDir: { x: 0, y: 0 }, dash: false, shoot: false, keys: new Set(),
  touchJoystick: { active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } },
  touchDash: false, pointer: {},
});

interface RunLog {
  warnings: string[];
  firstGasCard: number;
  firstFireCard: number;
  firstChemical: number;
  firstIncendiary: number;
  miniBoss: boolean;
  firedEvents: string[];
}

/** Plays one wave for `seconds` of game time with the player invincible. */
function playWave(wave: number, seconds: number, overrides: RemoteWaveConfig[] = []): RunLog {
  const g: GameData = createGame(800, 600);
  g.difficultyProfile = DEFAULT_DIFFICULTY;
  g.remoteWaveOverrides = overrides;
  resetGame(g);
  g.state = 'playing';
  g.introPhase = 'done';
  g.introBike = null;
  const api = attachDebugAPI(g, _debug);
  api.toggleGodMode(true);
  api.jumpToWave(wave);

  const log: RunLog = { warnings: [], firstGasCard: -1, firstFireCard: -1, firstChemical: -1, firstIncendiary: -1, miniBoss: false, firedEvents: [] };
  const inp = input();
  const dt = 1 / 30;
  for (let f = 0; f * dt < seconds && g.waveNumber === wave; f++) {
    update(g, inp, dt);
    const time = g.waveElapsed;
    const text = g.cinematicWarning?.text;
    if (text && log.warnings[log.warnings.length - 1] !== text) log.warnings.push(text);
    if (log.firstGasCard < 0 && g.gasMaskOffer) log.firstGasCard = time;
    if (log.firstFireCard < 0 && g.fireSuitOffer) log.firstFireCard = time;
    if (log.firstChemical < 0 && g.drones.some(d => d.active && d.tier === 'chemical')) log.firstChemical = time;
    if (log.firstIncendiary < 0 && g.drones.some(d => d.active && d.tier === 'incendiary')) log.firstIncendiary = time;
    if (g.boss?.isMini) log.miniBoss = true;
    g.waveEvents.forEach((e, i) => { if (g.waveEventsFired[i] && !log.firedEvents.includes(e.type)) log.firedEvents.push(e.type); });
  }
  api.toggleGodMode(false);
  return log;
}

describe('engine — waves as the player sees them', () => {
  beforeEach(() => setTextOverrides({}));

  it('W5: fire suit card appears before the first incendiary drone', () => {
    const log = playWave(5, 40);
    expect(log.firstFireCard).toBeGreaterThanOrEqual(0);
    if (log.firstIncendiary >= 0) expect(log.firstFireCard).toBeLessThan(log.firstIncendiary);
    expect(log.firedEvents).toContain('swarm');
  });

  it('W7: gas card before chemical drones, fire card before fire drones, volley fires', () => {
    const log = playWave(7, 40);
    expect(log.firstGasCard).toBeGreaterThanOrEqual(0);
    expect(log.firstFireCard).toBeGreaterThanOrEqual(0);
    if (log.firstChemical >= 0) expect(log.firstGasCard).toBeLessThan(log.firstChemical);
    if (log.firstIncendiary >= 0) expect(log.firstFireCard).toBeLessThan(log.firstIncendiary);
    expect(log.firedEvents).toContain('volley');
  });

  it('W6: the mini-boss still appears when the admin sets a custom message', () => {
    const log = playWave(6, 30, [override(6, { warningText: 'رسالة الآدمن', threats: ['shrapnel'] })]);
    expect(log.warnings[0]).toBe('رسالة الآدمن');
    expect(log.miniBoss).toBe(true);
  });

  it('shows edited texts in the running game', () => {
    setTextOverrides({ 'warn.w6_minibos': 'نص معدّل من الآدمن' });
    const log = playWave(6, 15);
    expect(log.warnings).toContain('نص معدّل من الآدمن');
  });

  it('W10: both scheduled events fire', () => {
    const log = playWave(10, 40);
    expect(log.firedEvents).toEqual(expect.arrayContaining(['volley', 'airstrike_flyby']));
  });
});
