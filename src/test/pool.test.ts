import { describe, it, expect } from 'vitest';
import { getFromPool, releaseAll, countActive } from '@/game/pool';

interface Thing { active: boolean; id: number }

const make = (): Thing => ({ active: false, id: 0 });

describe('pool.getFromPool', () => {
  it('reuses the first inactive slot', () => {
    const pool: Thing[] = [];
    const a = getFromPool(pool, make, 4);
    a.id = 1;
    a.active = false; // release

    const b = getFromPool(pool, make, 4);
    expect(b).toBe(a);
    expect(b.id).toBe(1); // original data preserved
    expect(pool.length).toBe(1);
  });

  it('grows the pool up to maxSize', () => {
    const pool: Thing[] = [];
    for (let i = 0; i < 4; i++) getFromPool(pool, make, 4);
    expect(pool.length).toBe(4);
    // All active — next call must recycle rather than grow past cap
    const recycled = getFromPool(pool, make, 4);
    expect(pool.length).toBe(4);
    expect(recycled.active).toBe(true);
  });

  it('rotates saturated recycling across the pool', () => {
    const pool: Thing[] = [];
    const a = getFromPool(pool, make, 3);
    const b = getFromPool(pool, make, 3);
    const c = getFromPool(pool, make, 3);
    a.id = 1; b.id = 2; c.id = 3;

    // Pool is saturated — next allocation should recycle `a` and push it to the end
    const r1 = getFromPool(pool, make, 3);
    expect(r1).toBe(a);
    expect(pool[pool.length - 1]).toBe(a);

    // Next recycle should not keep returning `a`
    const r2 = getFromPool(pool, make, 3);
    expect(r2).toBe(b);
  });
});

describe('pool.releaseAll', () => {
  it('marks every item inactive', () => {
    const pool: Thing[] = [];
    for (let i = 0; i < 5; i++) getFromPool(pool, make, 8);
    expect(countActive(pool)).toBe(5);
    releaseAll(pool);
    expect(countActive(pool)).toBe(0);
  });
});
