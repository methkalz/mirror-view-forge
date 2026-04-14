/**
 * Generic object pool.
 * - Reuses inactive items first.
 * - Grows up to maxSize if all items are active.
 * - When saturated, recycles the item closest to expiry (index 0 by convention)
 *   but still marks it as a fresh allocation for the caller.
 *
 * Pool layout convention: older/about-to-expire items live near the start.
 * Callers that push new particles should still rely on `active` flags.
 */
export function getFromPool<T extends { active: boolean }>(
  pool: T[],
  create: () => T,
  maxSize = 200
): T {
  // 1) Reuse first inactive slot
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (!item.active) {
      item.active = true;
      return item;
    }
  }

  // 2) Grow pool if under cap
  if (pool.length < maxSize) {
    const item = create();
    item.active = true;
    pool.push(item);
    return item;
  }

  // 3) Saturated: recycle the oldest slot (index 0) and rotate it to the end
  //    so subsequent recycles spread across the pool instead of thrashing [0].
  const recycled = pool.shift()!;
  recycled.active = true;
  pool.push(recycled);
  return recycled;
}

/** Release all items in a pool (useful for game resets). */
export function releaseAll<T extends { active: boolean }>(pool: T[]): void {
  for (let i = 0; i < pool.length; i++) {
    pool[i].active = false;
  }
}

/** Count active items — cheap inline check for debug/HUD purposes. */
export function countActive<T extends { active: boolean }>(pool: T[]): number {
  let n = 0;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].active) n++;
  }
  return n;
}
