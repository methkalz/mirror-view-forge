/**
 * Post-processing effects applied after the main scene is drawn.
 *
 * Includes:
 *  - Bloom: extract bright pixels → blur → screen composite
 *  - Chromatic aberration (existing, extracted)
 *  - Vignette with dynamic danger tint
 *  - Death desaturation
 *
 * Design notes:
 *  - Bloom uses a cached half-resolution offscreen canvas so we don't allocate
 *    a new buffer every frame.
 *  - The blur pipeline relies on ctx.filter which is supported in all modern
 *    browsers but may be slow on low-end devices; we allow a quality toggle.
 */

import type { GameData } from '../types';
import { isReducedMotion } from '../settings';

// ─── Offscreen buffers (cached across frames) ────────────────────────
let bloomBuffer: HTMLCanvasElement | null = null;
let bloomCtx: CanvasRenderingContext2D | null = null;
let bloomW = 0;
let bloomH = 0;

// Quality settings controlled by the game (could be exposed to user later)
let bloomEnabled = true;
let bloomIntensity = 0.45;
let bloomThreshold = 0.65;

export function setBloomQuality(opts: {
  enabled?: boolean;
  intensity?: number;
  threshold?: number;
}) {
  if (opts.enabled !== undefined) bloomEnabled = opts.enabled;
  if (opts.intensity !== undefined) bloomIntensity = opts.intensity;
  if (opts.threshold !== undefined) bloomThreshold = opts.threshold;
}

function getBloomBuffer(w: number, h: number) {
  const targetW = Math.max(1, Math.floor(w / 2));
  const targetH = Math.max(1, Math.floor(h / 2));
  if (!bloomBuffer || bloomW !== targetW || bloomH !== targetH) {
    bloomBuffer = document.createElement('canvas');
    bloomBuffer.width = targetW;
    bloomBuffer.height = targetH;
    bloomCtx = bloomBuffer.getContext('2d');
    bloomW = targetW;
    bloomH = targetH;
  }
  return { canvas: bloomBuffer!, ctx: bloomCtx! };
}

/**
 * Apply a bloom effect using the current contents of `ctx` as the source.
 * Should be called after all scene geometry but before HUD/UI.
 */
export function applyBloom(ctx: CanvasRenderingContext2D, g: GameData) {
  if (!bloomEnabled) return;

  // Guard against buggy environments where ctx.filter is unsupported
  if (typeof (ctx as unknown as { filter?: string }).filter === 'undefined') return;

  const { width: w, height: h } = g;
  const { canvas: buf, ctx: bctx } = getBloomBuffer(w, h);

  // 1) Downscale the source canvas into the bloom buffer
  bctx.save();
  bctx.clearRect(0, 0, bloomW, bloomH);
  // Increase brightness so only the brightest pixels contribute
  // (cheap approximation of luma threshold — not pixel perfect but fast).
  const brightness = 1 + (1 - bloomThreshold);
  bctx.filter = `brightness(${brightness.toFixed(2)}) blur(8px)`;
  bctx.drawImage(ctx.canvas, 0, 0, bloomW, bloomH);
  bctx.filter = 'none';
  bctx.restore();

  // 2) Composite back onto the main canvas using 'screen' blend
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = bloomIntensity;
  ctx.drawImage(buf, 0, 0, w, h);
  ctx.restore();
}

/**
 * Dynamic radial vignette whose intensity grows as the player's health drops.
 * Kept in post-fx so both the main renderer and game-over overlays can reuse it.
 */
export function renderVignette(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: vw, height: vh } = g;
  const cx = vw / 2;
  const cy = vh / 2;
  const r = Math.max(vw, vh) * 0.7;
  const hpRatio = g.player.health / g.player.maxHealth;
  const dangerIntensity = Math.max(0, 1 - hpRatio * 2);
  const baseAlpha = 0.45 + dangerIntensity * 0.25;
  const redTint = dangerIntensity * 0.3;

  const vigGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(0.6, `rgba(${Math.round(redTint * 200)},0,0,0.08)`);
  vigGrad.addColorStop(1, `rgba(${Math.round(redTint * 200)},0,0,${baseAlpha})`);
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, vw, vh);
}

/**
 * Damage flash with chromatic aberration.
 * Extracted from the renderer — kept visually identical.
 */
export function renderDamageFlash(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.damageFlash <= 0) return;

  // Reduce Motion: soften the full-screen red flash and skip the chromatic
  // aberration entirely (photosensitivity — WCAG 2.3.1).
  const reduced = isReducedMotion();
  const flashScale = reduced ? 0.5 : 1;

  ctx.fillStyle = `rgba(200, 30, 30, ${g.damageFlash * 0.4 * flashScale})`;
  ctx.fillRect(0, 0, g.width, g.height);

  if (reduced) return;

  const abStr = Math.min(3, g.damageFlash * 6);
  if (abStr > 0.5) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = abStr * 0.06;
    ctx.fillStyle = 'rgba(255,0,0,1)';
    ctx.fillRect(abStr, 0, g.width, g.height);
    ctx.fillStyle = 'rgba(0,0,255,1)';
    ctx.fillRect(-abStr, 0, g.width, g.height);
    ctx.restore();
  }
}
