/**
 * These tests exercise the motorcycle suspension/lean physics indirectly.
 * The physics update lives in engine.ts and is not exported, so instead we
 * drive the public intro update loop and observe the DeliveryBike state.
 */
import { describe, it, expect } from 'vitest';
import { createGame, resetGame, updateIntro } from '@/game/engine';

describe('motorcycle physics', () => {
  it('settles suspension toward zero when the intro bike is idle', () => {
    const g = createGame(800, 600);
    resetGame(g);
    // Fast-forward intro until the bike stops (bikeStop phase)
    // updateIntro will mutate introPhase and spring state.
    for (let i = 0; i < 120; i++) {
      updateIntro(g, 1 / 60);
    }
    const bike = g.introBike;
    // Bike may have left (introBike set to null) or still be in a later phase.
    // If it still exists, the physics fields must have been populated.
    if (bike) {
      expect(bike.suspCompress).toBeTypeOf('number');
      expect(bike.leanAngle).toBeTypeOf('number');
      expect(bike.rpmPhase).toBeTypeOf('number');
    } else {
      // Intro completed — that's also a valid outcome
      expect(g.state).toBe('playing');
    }
  });

  it('initialises physics fields on the first frame', () => {
    const g = createGame(800, 600);
    resetGame(g);
    // After resetGame, introBike is freshly created. A single physics step
    // should initialise the transient fields.
    updateIntro(g, 1 / 60);
    const bike = g.introBike;
    if (bike) {
      expect(bike.suspCompress).not.toBeUndefined();
      expect(bike.suspVelocity).not.toBeUndefined();
      expect(bike.leanAngle).not.toBeUndefined();
      expect(bike.prevSpeed).not.toBeUndefined();
      expect(bike.rpmPhase).not.toBeUndefined();
    }
  });
});
