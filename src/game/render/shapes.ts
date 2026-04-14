/**
 * Shared 2D canvas primitives used across the renderer.
 * Extracted from renderer.ts to remove duplication and keep
 * the main renderer focused on scene composition.
 */

/** Rounded rectangle path (does not fill/stroke — caller decides). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draws a small pixel-art style heart icon. */
export function drawHeartIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.35);
  ctx.bezierCurveTo(-size * 0.8, -size * 1.1, -size * 1.6, 0, 0, size * 0.9);
  ctx.bezierCurveTo(size * 1.6, 0, size * 0.8, -size * 1.1, 0, -size * 0.35);
  ctx.fill();
  ctx.restore();
}

/** A star path (useful for UI + highlights). */
export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5
) {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Color interpolation helpers. */
export function lerpColor(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function rgbStr(c: number[]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function parseRGB(str: string): number[] {
  return str.split(',').map((s) => parseInt(s.trim(), 10) || 0);
}

/** Common easing functions. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
export function easeIn(t: number): number {
  return t * t;
}
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
export function applyEasing(t: number, type: string): number {
  const c = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'smoothstep':
      return smoothstep(c);
    case 'ease-in':
      return easeIn(c);
    case 'ease-out':
      return easeOut(c);
    default:
      return c;
  }
}
