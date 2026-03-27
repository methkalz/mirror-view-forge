export function getFromPool<T extends { active: boolean }>(
  pool: T[],
  create: () => T,
  maxSize = 200
): T {
  for (const item of pool) {
    if (!item.active) {
      item.active = true;
      return item;
    }
  }
  if (pool.length < maxSize) {
    const item = create();
    item.active = true;
    pool.push(item);
    return item;
  }
  // Recycle oldest
  const item = pool[0];
  item.active = true;
  return item;
}
