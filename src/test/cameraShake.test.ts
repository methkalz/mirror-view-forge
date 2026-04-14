import { describe, it, expect, beforeEach } from 'vitest';
import { addTrauma, updateCameraShake, resetTrauma, getTrauma } from '@/game/cameraShake';
import type { GameData } from '@/game/types';

const makeGame = (): Pick<GameData, 'screenShake'> => ({
  screenShake: { x: 0, y: 0 },
});

describe('cameraShake trauma system', () => {
  beforeEach(() => resetTrauma());

  it('starts with zero trauma', () => {
    expect(getTrauma()).toBe(0);
  });

  it('accumulates trauma but clamps at 1', () => {
    addTrauma(0.3);
    addTrauma(0.4);
    expect(getTrauma()).toBeCloseTo(0.7, 5);
    addTrauma(0.9);
    expect(getTrauma()).toBe(1);
  });

  it('produces non-zero offsets when trauma > 0', () => {
    addTrauma(0.8);
    const g = makeGame() as GameData;
    updateCameraShake(g, 0.016);
    expect(Math.abs(g.screenShake.x) + Math.abs(g.screenShake.y)).toBeGreaterThan(0);
  });

  it('decays trauma over time and zeros shake when fully decayed', () => {
    addTrauma(0.5);
    const g = makeGame() as GameData;
    // Simulate 1 second of frames
    for (let i = 0; i < 60; i++) updateCameraShake(g, 1 / 60);
    expect(getTrauma()).toBe(0);
    expect(g.screenShake.x).toBe(0);
    expect(g.screenShake.y).toBe(0);
  });

  it('resetTrauma immediately zeros state', () => {
    addTrauma(0.9);
    resetTrauma();
    const g = makeGame() as GameData;
    updateCameraShake(g, 0.016);
    expect(g.screenShake.x).toBe(0);
    expect(g.screenShake.y).toBe(0);
  });
});
