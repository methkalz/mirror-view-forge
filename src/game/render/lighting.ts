/**
 * Dynamic point-light system.
 *
 * Instead of each effect drawing its own glow, emitters push lights into
 * a per-frame list that is blended on top of the scene in a single pass.
 * This gives a unified look, lets us batch draw calls, and keeps the
 * renderer modular.
 *
 * Typical usage:
 *   beginFrameLights()
 *   // ... during entity rendering:
 *   emitLight({ x, y, radius: 120, color: 'rgba(255,180,60,', intensity: 0.6 })
 *   // ... after all entities drawn:
 *   renderLights(ctx, camX)
 */

export interface PointLight {
  x: number;
  y: number;
  radius: number;
  /** color prefix e.g. 'rgba(255,180,60,' — the alpha is appended by the renderer */
  color: string;
  /** 0..1 overall brightness */
  intensity: number;
  /** optional flicker — frame-to-frame variation (0..1) */
  flicker?: number;
}

const lights: PointLight[] = [];
const MAX_LIGHTS = 60;

/** Clear the per-frame lights buffer. Called at the start of each frame. */
export function beginFrameLights() {
  lights.length = 0;
}

/** Register a light for this frame. Silently drops past MAX_LIGHTS. */
export function emitLight(light: PointLight) {
  if (lights.length >= MAX_LIGHTS) return;
  lights.push(light);
}

/**
 * Composite all registered lights using `lighter` blending.
 * Call this once after all scene geometry has been drawn, before HUD.
 */
export function renderLights(ctx: CanvasRenderingContext2D) {
  if (lights.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const l of lights) {
    const flick = l.flicker ? 1 - Math.random() * l.flicker : 1;
    const intensity = Math.max(0, Math.min(1, l.intensity * flick));
    const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
    grad.addColorStop(0, `${l.color}${(0.45 * intensity).toFixed(3)})`);
    grad.addColorStop(0.4, `${l.color}${(0.2 * intensity).toFixed(3)})`);
    grad.addColorStop(1, `${l.color}0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Debug helper to read back the lights count. */
export function getLightCount(): number {
  return lights.length;
}
