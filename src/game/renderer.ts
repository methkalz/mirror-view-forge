import { GameData, Player, FirePool, GasCloud } from './types';
import bgFallbackUrl from '../assets/bg-skyfall.jpeg';
import type { BackgroundPhase, DisplayMode } from './backgroundConfig';
import { applyBloom, renderVignette, renderDamageFlash } from './render/postFx';
import { beginFrameLights, emitLight, renderLights } from './render/lighting';

function isAnyWaveEventActive(g: GameData, type: string): boolean {
  if (!g.waveEvents || g.waveEvents.length === 0) return false;
  for (let i = 0; i < g.waveEvents.length; i++) {
    if (!g.waveEventsFired[i]) continue;
    const e = g.waveEvents[i];
    if (e.type !== type) continue;
    if (g.waveElapsed < e.triggerAt + e.duration) return true;
  }
  return false;
}

function getSceneBlackoutAlpha(g: GameData): number {
  const st = g.sceneTransition;
  if (!st || !st.active) return 0;
  switch (st.phase) {
    case 'zoomIn': return Math.min(1, st.timer / 1.0);
    case 'blackout': return 1;
    case 'swap': return 1;
    case 'zoomOut': return 1 - Math.min(1, st.timer / 1.2);
    default: return 0;
  }
}

// ─── Multi-Image Background System ───────────────────
interface BgLayer {
  image: HTMLImageElement;
  loaded: boolean;
  phase: string;
}

// Fallback image (always available)
const fallbackImg = new Image();
let fallbackLoaded = false;
fallbackImg.onload = () => { fallbackLoaded = true; };
fallbackImg.src = bgFallbackUrl;

// Game logo
const gameLogoImg = new Image();
let gameLogoLoaded = false;
gameLogoImg.onload = () => { gameLogoLoaded = true; };
gameLogoImg.src = '/logo-game.png';

// Dynamic layers loaded from DB config
let bgLayers: BgLayer[] = [];
let bgPhases: BackgroundPhase[] = [];
let bgConfigLoaded = false;
let bgCameraMargin = 400;
let bgLoopEnabled = false;
let bgLoopFadeDuration = 60;

/** Set camera margin from game config (legacy — per-phase margin takes priority) */
export function setCameraMargin(margin: number) {
  bgCameraMargin = margin;
}

/** Called once from GameLoader to inject background config */
export function setBackgroundConfig(phases: BackgroundPhase[], loop?: boolean, loopFadeDuration?: number) {
  bgPhases = phases;
  bgConfigLoaded = true;
  bgLoopEnabled = loop ?? false;
  bgLoopFadeDuration = loopFadeDuration ?? 60;
  // Load images from URLs
  bgLayers = phases.map(p => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const layer: BgLayer = { image: img, loaded: false, phase: p.phase };
    if (p.imageUrl) {
      img.onload = () => { layer.loaded = true; };
      img.src = p.imageUrl;
    }
    return layer;
  });
}

export function setBackgroundConfigForScene(
  allPhases: BackgroundPhase[],
  sceneId: string,
  loop?: boolean,
  loopFadeDuration?: number,
) {
  const scenePhases = allPhases.filter(p => p.sceneId === sceneId);
  if (scenePhases.length > 0) {
    setBackgroundConfig(scenePhases, loop, loopFadeDuration);
  }
}

// ─── Color Interpolation Helpers ──────────────────────
function lerpColor(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}
function rgbStr(c: number[]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function parseRGB(str: string): number[] {
  return str.split(',').map(s => parseInt(s.trim(), 10) || 0);
}

// ─── Easing Functions ─────────────────────────────────
function smoothstep(t: number): number { return t * t * (3 - 2 * t); }
function easeIn(t: number): number { return t * t; }
function easeOut(t: number): number { return 1 - (1 - t) * (1 - t); }
function applyEasing(t: number, type: string): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'smoothstep': return smoothstep(clamped);
    case 'ease-in': return easeIn(clamped);
    case 'ease-out': return easeOut(clamped);
    default: return clamped; // linear
  }
}

/** Get current phase blend based on elapsed time */
function getPhaseBlend(elapsed: number): {
  imgA: HTMLImageElement | null; imgB: HTMLImageElement | null;
  fade: number;
  overlayTop: number[]; overlayMid: number[]; overlayBottom: number[];
  overlayOpacity: number;
  displayModeA: DisplayMode; displayModeB: DisplayMode;
  bgMarginA: number; bgMarginB: number;
} {
  const defaultResult = {
    imgA: fallbackLoaded ? fallbackImg : null, imgB: null, fade: 0,
    overlayTop: [12,20,69], overlayMid: [26,16,46], overlayBottom: [26,10,46], overlayOpacity: 0.4,
    displayModeA: 'single' as DisplayMode, displayModeB: 'single' as DisplayMode,
    bgMarginA: bgCameraMargin, bgMarginB: bgCameraMargin,
  };

  if (!bgConfigLoaded || bgPhases.length === 0) return defaultResult;

  // ─── Loop support: wrap elapsed time with smooth fade back to first phase ───
  let effectiveElapsed = elapsed;
  let loopFadeBlend = -1; // -1 means not in loop-fade zone
  if (bgLoopEnabled && bgPhases.length >= 2) {
    const lastPhase = bgPhases[bgPhases.length - 1];
    const lastPhaseEnd = lastPhase.transitionStart + Math.max(0.001, lastPhase.fadeDuration || 60);
    const fadeDur = Math.max(0.001, bgLoopFadeDuration);
    const cycleLength = lastPhaseEnd + fadeDur;
    if (elapsed >= cycleLength) {
      // Past first full cycle — wrap
      effectiveElapsed = ((elapsed - cycleLength) % cycleLength);
    } else if (elapsed >= lastPhaseEnd) {
      // In the loop-fade zone: blend last phase → first phase
      const t = (elapsed - lastPhaseEnd) / fadeDur;
      loopFadeBlend = applyEasing(Math.min(1, t), bgPhases[bgPhases.length - 1].easingType || 'smoothstep');
    }
  }

  let resolvedIdx = 0;

  for (let i = 0; i < bgPhases.length - 1; i++) {
    const current = bgPhases[i];
    const next = bgPhases[i + 1];
    const currentLayer = bgLayers[i];
    const nextLayer = bgLayers[i + 1];
    const imgA = currentLayer?.loaded ? currentLayer.image : (fallbackLoaded ? fallbackImg : null);

    const fadeStart = next.transitionStart;
    const fadeDuration = Math.max(0.001, next.fadeDuration || 60);
    const fadeEnd = fadeStart + fadeDuration;
    const easingType = next.easingType || 'smoothstep';

    if (effectiveElapsed < fadeStart) {
      return {
        imgA,
        imgB: null,
        fade: 0,
        overlayTop: parseRGB(current.overlayTop),
        overlayMid: parseRGB(current.overlayMid),
        overlayBottom: parseRGB(current.overlayBottom),
        overlayOpacity: current.overlayOpacity,
        displayModeA: current.displayMode || 'single',
        displayModeB: next.displayMode || 'single',
        bgMarginA: current.bgMargin ?? bgCameraMargin,
        bgMarginB: next.bgMargin ?? bgCameraMargin,
      };
    }

    if (effectiveElapsed < fadeEnd) {
      const linearFade = (effectiveElapsed - fadeStart) / (fadeEnd - fadeStart);
      const fade = applyEasing(linearFade, easingType);
      const imgB = nextLayer?.loaded ? nextLayer.image : null;
      const topA = parseRGB(current.overlayTop);
      const topB = parseRGB(next.overlayTop);
      const midA = parseRGB(current.overlayMid);
      const midB = parseRGB(next.overlayMid);
      const botA = parseRGB(current.overlayBottom);
      const botB = parseRGB(next.overlayBottom);
      const opA = current.overlayOpacity;
      const opB = next.overlayOpacity;

      return {
        imgA,
        imgB,
        fade,
        overlayTop: lerpColor(topA, topB, fade),
        overlayMid: lerpColor(midA, midB, fade),
        overlayBottom: lerpColor(botA, botB, fade),
        overlayOpacity: opA + (opB - opA) * fade,
        displayModeA: current.displayMode || 'single',
        displayModeB: next.displayMode || 'single',
        bgMarginA: current.bgMargin ?? bgCameraMargin,
        bgMarginB: next.bgMargin ?? bgCameraMargin,
      };
    }

    resolvedIdx = i + 1;
  }

  const resolved = bgPhases[resolvedIdx];
  const resolvedLayer = bgLayers[resolvedIdx];
  const resolvedImg = resolvedLayer?.loaded ? resolvedLayer.image : (fallbackLoaded ? fallbackImg : null);

  // ─── Loop fade: blend last phase → first phase ───
  if (loopFadeBlend >= 0) {
    const first = bgPhases[0];
    const firstLayer = bgLayers[0];
    const firstImg = firstLayer?.loaded ? firstLayer.image : null;
    return {
      imgA: resolvedImg,
      imgB: firstImg,
      fade: loopFadeBlend,
      overlayTop: lerpColor(parseRGB(resolved.overlayTop), parseRGB(first.overlayTop), loopFadeBlend),
      overlayMid: lerpColor(parseRGB(resolved.overlayMid), parseRGB(first.overlayMid), loopFadeBlend),
      overlayBottom: lerpColor(parseRGB(resolved.overlayBottom), parseRGB(first.overlayBottom), loopFadeBlend),
      overlayOpacity: resolved.overlayOpacity + (first.overlayOpacity - resolved.overlayOpacity) * loopFadeBlend,
      displayModeA: resolved.displayMode || 'single',
      displayModeB: first.displayMode || 'single',
      bgMarginA: resolved.bgMargin ?? bgCameraMargin,
      bgMarginB: first.bgMargin ?? bgCameraMargin,
    };
  }

  return {
    imgA: resolvedImg,
    imgB: null,
    fade: 0,
    overlayTop: parseRGB(resolved.overlayTop),
    overlayMid: parseRGB(resolved.overlayMid),
    overlayBottom: parseRGB(resolved.overlayBottom),
    overlayOpacity: resolved.overlayOpacity,
    displayModeA: resolved.displayMode || 'single',
    displayModeB: 'single' as DisplayMode,
    bgMarginA: resolved.bgMargin ?? bgCameraMargin,
    bgMarginB: bgCameraMargin,
  };
}

/** Draw a single centered image that covers the viewport with margin for camera movement */
function drawSingleImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, h: number, viewportW: number, camX: number, parallax: number, margin: number) {
  const imgAspect = img.width / img.height;
  const drawH = h;
  let drawW = drawH * imgAspect;
  const minWidth = viewportW + margin * 2;
  if (drawW < minWidth) drawW = minWidth;
  const drawX = (viewportW - drawW) / 2 - camX * parallax;
  ctx.drawImage(img, drawX, 0, drawW, drawH);
}

/** Draw mirrored tiled image — seamless, no sub-pixel gaps */
function drawTiledImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, h: number, viewportW: number, camX: number, parallax: number, margin: number) {
  const imgAspect = img.width / img.height;
  const drawH = h;
  const rawW = drawH * imgAspect;
  const drawW = Math.ceil(rawW);
  const offsetX = camX * parallax;

  // Calculate which tiles are visible (include margin area)
  const totalW = viewportW + margin * 2;
  const startTile = Math.floor((offsetX - totalW) / drawW) - 1;
  const endTile = Math.ceil((offsetX + totalW * 2) / drawW) + 1;

  for (let i = startTile; i <= endTile; i++) {
    const tileX = Math.round(i * drawW - offsetX);
    // Skip if off-screen
    if (tileX + drawW + 1 < 0 || tileX > viewportW) continue;

    const isMirrored = (((i % 2) + 2) % 2) === 1; // true for odd tiles

    ctx.save();
    if (isMirrored) {
      ctx.translate(tileX + drawW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, drawW + 1, drawH);
    } else {
      ctx.drawImage(img, tileX, 0, drawW + 1, drawH);
    }
    ctx.restore();
  }
}

/** Draw image centered at natural aspect with blurred stretched copy behind for edges */
function drawBlurEdgeImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, h: number, viewportW: number, camX: number, parallax: number, margin: number) {
  const imgAspect = img.width / img.height;
  const drawH = h;
  const naturalW = drawH * imgAspect;
  const minWidth = viewportW + margin * 2;

  // Layer 1: Blurred stretched background covering entire area
  const bgW = Math.max(naturalW, minWidth);
  const bgX = (viewportW - bgW) / 2 - camX * parallax;
  ctx.save();
  ctx.filter = 'blur(30px)';
  ctx.drawImage(img, bgX - 20, -20, bgW + 40, drawH + 40); // slight overflow to avoid blur edge artifacts
  ctx.restore();

  // Layer 2: Clear centered image at natural aspect
  const clearW = naturalW;
  const clearX = (viewportW - clearW) / 2 - camX * parallax;
  ctx.drawImage(img, clearX, 0, clearW, drawH);
}

/** Dispatch to the correct drawing function based on display mode */
function drawBgImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, h: number, viewportW: number, camX: number, parallax: number, mode: DisplayMode, margin: number) {
  switch (mode) {
    case 'tiled':
      drawTiledImage(ctx, img, h, viewportW, camX, parallax, margin);
      break;
    case 'blur-edge':
      drawBlurEdgeImage(ctx, img, h, viewportW, camX, parallax, margin);
      break;
    case 'single':
    default:
      drawSingleImage(ctx, img, h, viewportW, camX, parallax, margin);
      break;
  }
}

// ─── Background with Cross-fade ───────────────────────
function renderBackground(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const camX = g.camera.x;
  const parallax = 0.3;

  const blend = getPhaseBlend(g.elapsed);

  if (blend.imgA) {
    drawBgImage(ctx, blend.imgA, h, w, camX, parallax, blend.displayModeA, blend.bgMarginA);

    if (blend.imgB && blend.fade > 0) {
      ctx.save();
      ctx.globalAlpha = blend.fade;
      drawBgImage(ctx, blend.imgB, h, w, camX, parallax, blend.displayModeB, blend.bgMarginB);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#0c1445';
    ctx.fillRect(0, 0, w, h);
  }

  // Dynamic color overlay from config
  const overlayGrad = ctx.createLinearGradient(0, 0, 0, h);
  const op = blend.overlayOpacity;
  overlayGrad.addColorStop(0, `rgba(${blend.overlayTop[0]},${blend.overlayTop[1]},${blend.overlayTop[2]},${op})`);
  overlayGrad.addColorStop(0.5, `rgba(${blend.overlayMid[0]},${blend.overlayMid[1]},${blend.overlayMid[2]},${op * 0.85})`);
  overlayGrad.addColorStop(1, `rgba(${blend.overlayBottom[0]},${blend.overlayBottom[1]},${blend.overlayBottom[2]},${op * 0.95})`);
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, 0, w, h);

  // Stars — visibility driven by overlay opacity (darker overlay = more stars)
  const groundY = h * 0.78;
  const nightFactor = Math.min(1, Math.max(0, (blend.overlayOpacity - 0.3) / 0.5));
  const starAlphaBase = nightFactor * 0.6;
  if (starAlphaBase > 0.02) {
    ctx.save();
    for (let i = 0; i < 15; i++) {
      const sx = ((i * 237.5 + 50) % 2000) - 200;
      const sy = ((i * 73.1 + 20) % (groundY * 0.45));
      const size = 1 + (i % 3);
      const flicker = 0.4 + Math.sin(g.elapsed * 0.8 + i * 2.7) * 0.35;
      const alpha = flicker * starAlphaBase;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(200,220,255,0.8)';
      ctx.shadowBlur = size * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - size * 1.8);
      ctx.lineTo(sx + size * 0.35, sy - size * 0.35);
      ctx.lineTo(sx + size * 1.8, sy);
      ctx.lineTo(sx + size * 0.35, sy + size * 0.35);
      ctx.lineTo(sx, sy + size * 1.8);
      ctx.lineTo(sx - size * 0.35, sy + size * 0.35);
      ctx.lineTo(sx - size * 1.8, sy);
      ctx.lineTo(sx - size * 0.35, sy - size * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ─── City Building Data (seeded, repeatable tiles) ────
const BUILDING_TILE_WIDTH = 800;

function generateBuildingTile(seed: number, count: number, minH: number, maxH: number): { x: number; bw: number; bh: number; roof: number }[] {
  const buildings: { x: number; bw: number; bh: number; roof: number }[] = [];
  let cx = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.sin(seed + i * 7.31) * 10000;
    const bw = 30 + (Math.abs(s) % 40);
    const bh = minH + (Math.abs(Math.sin(s * 1.3)) * (maxH - minH));
    const gap = 5 + (Math.abs(Math.sin(s * 2.7)) * 15);
    const roof = Math.floor(Math.abs(Math.sin(s * 3.1)) * 3); // 0=flat, 1=triangle, 2=antenna
    buildings.push({ x: cx, bw, bh, roof });
    cx += bw + gap;
  }
  // Scale to fit tile width
  const scale = BUILDING_TILE_WIDTH / cx;
  return buildings.map(b => ({ ...b, x: b.x * scale, bw: b.bw * scale }));
}

const FAR_BUILDINGS = generateBuildingTile(42, 14, 60, 150);
const MID_BUILDINGS = generateBuildingTile(77, 10, 40, 100);
const NEAR_BUILDINGS = generateBuildingTile(13, 7, 25, 55);

function renderCitySilhouette(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w } = g;
  const groundY = g.height * 0.78;
  const camX = g.camera.x;
  const elapsed = g.elapsed;

  const layers: { buildings: typeof FAR_BUILDINGS; parallax: number; color: string; windowColor: string; opacity: number }[] = [
    { buildings: FAR_BUILDINGS, parallax: 0.05, color: 'rgb(13,10,21)', windowColor: 'rgba(251,191,36,0.25)', opacity: 1 },
    { buildings: MID_BUILDINGS, parallax: 0.1,  color: 'rgb(18,14,28)', windowColor: 'rgba(251,191,36,0.2)', opacity: 1 },
    { buildings: NEAR_BUILDINGS, parallax: 0.2, color: 'rgb(21,16,30)', windowColor: 'rgba(251,191,36,0.15)', opacity: 1 },
  ];

  for (const layer of layers) {
    const offsetX = camX * layer.parallax;
    // How many tiles to draw
    const startTile = Math.floor((camX - 200 - offsetX) / BUILDING_TILE_WIDTH) - 1;
    const endTile = Math.ceil((camX + w + 200 - offsetX) / BUILDING_TILE_WIDTH) + 1;

    for (let tile = startTile; tile <= endTile; tile++) {
      const tileOffset = tile * BUILDING_TILE_WIDTH + offsetX;

      for (const b of layer.buildings) {
        const bx = b.x + tileOffset;
        // Skip if fully off screen
        if (bx + b.bw < camX - 100 || bx > camX + w + 100) continue;

        ctx.fillStyle = layer.color;
        ctx.fillRect(bx, groundY - b.bh, b.bw, b.bh);

        // Roof details
        if (b.roof === 1) {
          // Triangle roof
          ctx.beginPath();
          ctx.moveTo(bx, groundY - b.bh);
          ctx.lineTo(bx + b.bw / 2, groundY - b.bh - 12);
          ctx.lineTo(bx + b.bw, groundY - b.bh);
          ctx.closePath();
          ctx.fill();
        } else if (b.roof === 2) {
          // Antenna
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bx + b.bw / 2, groundY - b.bh);
          ctx.lineTo(bx + b.bw / 2, groundY - b.bh - 18);
          ctx.stroke();
          // Blinking light
          if (Math.sin(elapsed * 2 + bx * 0.1) > 0.3) {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(bx + b.bw / 2, groundY - b.bh - 18, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Windows
        ctx.fillStyle = layer.windowColor;
        for (let wy = groundY - b.bh + 8; wy < groundY - 10; wy += 11) {
          for (let wx = bx + 4; wx < bx + b.bw - 4; wx += 9) {
            if (Math.sin(wx * 3.7 + wy * 2.1 + elapsed * 0.05) > 0.25) {
              ctx.fillRect(wx, wy, 4, 5);
            }
          }
        }
      }
    }
  }
}

function renderGround(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const groundY = h * 0.78;
  const camX = g.camera.x;
  const margin = 200;
  const left = camX - margin;
  const right = camX + w + margin;
  const totalW = right - left;

  // Ground gradient
  const grdGrad = ctx.createLinearGradient(0, groundY, 0, h);
  grdGrad.addColorStop(0, '#2a2520');
  grdGrad.addColorStop(0.3, '#221e18');
  grdGrad.addColorStop(1, '#1a1512');
  ctx.fillStyle = grdGrad;
  ctx.fillRect(left, groundY, totalW, h - groundY);

  // Asphalt texture lines
  ctx.strokeStyle = 'rgba(60, 55, 45, 0.3)';
  ctx.lineWidth = 0.5;
  for (let y = groundY + 5; y < h; y += 8) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    for (let x = left; x < right; x += 6) {
      ctx.lineTo(x, y + Math.sin(x * 0.15 + y * 0.3) * 1.5);
    }
    ctx.stroke();
  }

  // Cracks (world-space)
  ctx.strokeStyle = 'rgba(80, 70, 55, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const cx = ((i * 137 + 30) % 1200) + Math.floor(camX / 1200) * 1200;
    if (cx < left || cx > right) continue;
    const cy = groundY + 10 + (i * 31) % 40;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 15 + i * 3, cy + 5);
    ctx.lineTo(cx + 25, cy - 3);
    ctx.stroke();
  }

  // Ground line highlight — glowing edge separating ground and sky
  const glGrad = ctx.createLinearGradient(0, groundY - 3, 0, groundY + 3);
  glGrad.addColorStop(0, 'rgba(0,0,0,0)');
  glGrad.addColorStop(0.4, 'rgba(140, 120, 80, 0.25)');
  glGrad.addColorStop(0.5, 'rgba(180, 150, 90, 0.5)');
  glGrad.addColorStop(0.6, 'rgba(140, 120, 80, 0.25)');
  glGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glGrad;
  ctx.fillRect(left, groundY - 3, totalW, 6);
  
  ctx.strokeStyle = 'rgba(160, 140, 100, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, groundY);
  ctx.lineTo(right, groundY);
  ctx.stroke();
}

// ─── Craters ──────────────────────────────────────────
function renderCraters(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const c of g.craters) {
    const alpha = (c.life / c.maxLife) * 0.7;
    // Scorched area
    ctx.fillStyle = `rgba(15, 10, 5, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, c.size, c.size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Raised rim — lighter edge
    ctx.strokeStyle = `rgba(120, 100, 60, ${alpha * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, c.size * 1.15, c.size * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Outer ring
    ctx.strokeStyle = `rgba(80, 60, 30, ${alpha * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, c.size * 1.3, c.size * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Cracks extending from crater
    ctx.strokeStyle = `rgba(60, 45, 25, ${alpha * 0.25})`;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const crackAngle = (i / 4) * Math.PI * 2 + c.pos.x * 0.05;
      const crackLen = c.size * (0.8 + Math.sin(c.pos.y + i * 3) * 0.3);
      ctx.beginPath();
      ctx.moveTo(
        c.pos.x + Math.cos(crackAngle) * c.size * 0.9,
        c.pos.y + Math.sin(crackAngle) * c.size * 0.35
      );
      ctx.lineTo(
        c.pos.x + Math.cos(crackAngle) * (c.size + crackLen),
        c.pos.y + Math.sin(crackAngle) * (c.size * 0.4 + crackLen * 0.3)
      );
      ctx.stroke();
    }
  }
}

// ─── Warnings ─────────────────────────────────────────
function renderWarnings(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const hz of g.hazards) {
    if (!hz.active || hz.falling) continue;
    const progress = 1 - hz.warningTimer / hz.warningDuration;
    const alpha = 0.2 + progress * 0.5;

    // ═══ Meteor warning: large pulsing blast circle on ground ═══
    if (hz.type === 'meteor') {
      ctx.save();
      ctx.translate(hz.targetPos.x, hz.targetPos.y);
      const blastR = 120; // must match meteor blast radius
      const pulse = 0.5 + Math.sin(progress * 20) * 0.5;
      // Outer danger zone
      ctx.strokeStyle = `rgba(220,40,40,${0.5 * alpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, blastR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Fill — shows intensifying red as meteor nears
      ctx.fillStyle = `rgba(220,60,40,${0.06 + progress * 0.15})`;
      ctx.beginPath();
      ctx.arc(0, 0, blastR, 0, Math.PI * 2);
      ctx.fill();
      // Inner pulsing core
      ctx.strokeStyle = `rgba(255,80,40,${0.6 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      // Exclamation
      ctx.fillStyle = `rgba(255,80,40,${0.9 * alpha})`;
      ctx.font = 'bold 28px Tajawal, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠', 0, -blastR - 12);
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.translate(hz.targetPos.x, hz.targetPos.y);

    // Crosshair reticle
    const reticleSize = 15 + progress * 15;
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
    ctx.lineWidth = 1.5;

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, reticleSize, 0, Math.PI * 2);
    ctx.stroke();

    // Cross lines
    const gap = 4;
    ctx.beginPath();
    ctx.moveTo(0, -reticleSize - 4); ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap); ctx.lineTo(0, reticleSize + 4);
    ctx.moveTo(-reticleSize - 4, 0); ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0); ctx.lineTo(reticleSize + 4, 0);
    ctx.stroke();

    // Inner dot
    ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing outer
    const pulseR = reticleSize + 8 + Math.sin(progress * 12) * 4;
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// ─── Smoke Trails ─────────────────────────────────────
function renderSmokeTrails(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const s of g.smokeTrails) {
    ctx.fillStyle = `rgba(100, 90, 80, ${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.pos.x, s.pos.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Hazards ──────────────────────────────────────────
function renderHazards(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const hz of g.hazards) {
    if (!hz.active || !hz.falling) continue;
    ctx.save();
    ctx.translate(hz.pos.x, hz.pos.y);

    if (hz.type === 'missile') {
      const angle = Math.atan2(hz.targetPos.y - hz.pos.y, hz.targetPos.x - hz.pos.x);
      ctx.rotate(angle);

      // ═══ Cylindrical Warhead Missile (redesigned) ═══
      const bodyLen = hz.size * 2.4;   // length forward of tail
      const bodyR = hz.size * 0.42;    // radius
      const noseLen = hz.size * 0.9;
      const tailX = -hz.size * 0.9;
      const t = performance.now() * 0.001 + hz.pos.x * 0.01; // stable per-missile phase

      // ── Exhaust (drawn first so body overlaps it) ──
      // Outer diffuse heat
      const heatGrad = ctx.createRadialGradient(tailX - 3, 0, 0, tailX - 24, 0, 26);
      heatGrad.addColorStop(0, 'rgba(255,120,40,0.35)');
      heatGrad.addColorStop(0.4, 'rgba(255,80,20,0.18)');
      heatGrad.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = heatGrad;
      ctx.beginPath();
      ctx.ellipse(tailX - 12, 0, 22, 5 + bodyR * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main plume (multi-layered flame)
      // Flicker based on deterministic noise
      const flicker = Math.sin(t * 60) * 0.5 + Math.sin(t * 97) * 0.3;
      const plumeLen = 22 + flicker * 3;

      // Outer orange cone
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(tailX, -bodyR * 0.75);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.4, -bodyR * 0.95, tailX - plumeLen, 0);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.4, bodyR * 0.95, tailX, bodyR * 0.75);
      ctx.closePath();
      ctx.fill();

      // Inner yellow cone
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(tailX, -bodyR * 0.5);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.35, -bodyR * 0.6, tailX - plumeLen * 0.75, 0);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.35, bodyR * 0.6, tailX, bodyR * 0.5);
      ctx.closePath();
      ctx.fill();

      // Hot white core
      ctx.fillStyle = 'rgba(255,255,240,0.92)';
      ctx.beginPath();
      ctx.moveTo(tailX, -bodyR * 0.3);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.25, -bodyR * 0.35, tailX - plumeLen * 0.5, 0);
      ctx.quadraticCurveTo(tailX - plumeLen * 0.25, bodyR * 0.35, tailX, bodyR * 0.3);
      ctx.closePath();
      ctx.fill();

      // Shock diamonds (three ovals along the plume — the classic "mach disk" look)
      for (let d = 0; d < 3; d++) {
        const dx = tailX - 5 - d * 6;
        const alpha = 0.35 - d * 0.08 + Math.sin(t * 40 + d) * 0.08;
        ctx.fillStyle = `rgba(255,255,220,${Math.max(0, alpha)})`;
        ctx.beginPath();
        ctx.ellipse(dx, 0, 1.2, bodyR * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Cylindrical body with proper cross-section shading ──
      const bodyGrad = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
      bodyGrad.addColorStop(0, '#e8e8ec');      // top highlight
      bodyGrad.addColorStop(0.15, '#b8bcc4');
      bodyGrad.addColorStop(0.4, '#888c94');    // base mid
      bodyGrad.addColorStop(0.65, '#5a5f68');
      bodyGrad.addColorStop(0.85, '#3a3f48');
      bodyGrad.addColorStop(1, '#24272e');      // bottom shadow
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(tailX, -bodyR);
      ctx.lineTo(bodyLen * 0.75, -bodyR);
      // Rounded nose shoulder
      ctx.quadraticCurveTo(bodyLen * 0.85, -bodyR, bodyLen * 0.85, -bodyR * 0.75);
      ctx.lineTo(bodyLen * 0.85, bodyR * 0.75);
      ctx.quadraticCurveTo(bodyLen * 0.85, bodyR, bodyLen * 0.75, bodyR);
      ctx.lineTo(tailX, bodyR);
      ctx.closePath();
      ctx.fill();

      // Upper specular stripe (fake chrome)
      const specGrad = ctx.createLinearGradient(0, -bodyR * 0.95, 0, -bodyR * 0.35);
      specGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specGrad.addColorStop(0.6, 'rgba(255,255,255,0.3)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(tailX, -bodyR * 0.95, bodyLen * 0.85 - tailX, bodyR * 0.6);

      // Panel lines across the body
      ctx.strokeStyle = 'rgba(20,25,30,0.45)';
      ctx.lineWidth = 0.4;
      for (let p = 0; p < 4; p++) {
        const px = tailX + (p + 1) * (bodyLen * 0.17);
        ctx.beginPath();
        ctx.moveTo(px, -bodyR * 0.85);
        ctx.lineTo(px, bodyR * 0.85);
        ctx.stroke();
      }

      // Rivet row along the spine
      ctx.fillStyle = 'rgba(40,45,50,0.55)';
      for (let r = 0; r < 5; r++) {
        const rx = tailX + (r + 0.5) * (bodyLen * 0.17);
        ctx.beginPath();
        ctx.arc(rx, -bodyR * 0.55, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, bodyR * 0.55, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Warning stripes (red bands)
      ctx.fillStyle = 'rgba(220,38,38,0.9)';
      ctx.fillRect(bodyLen * 0.2, -bodyR * 0.85, 2.2, bodyR * 1.7);
      ctx.fillRect(bodyLen * 0.5, -bodyR * 0.85, 2.2, bodyR * 1.7);
      // Yellow caution hazard bar
      ctx.fillStyle = 'rgba(251,191,36,0.85)';
      ctx.fillRect(bodyLen * 0.1, -bodyR * 0.9, 1.2, bodyR * 1.8);

      // ── Nose cone (ogive, chromed tip, red warhead band) ──
      const noseStartX = bodyLen * 0.85;
      const noseTipX = noseStartX + noseLen;
      const noseGrad = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
      noseGrad.addColorStop(0, '#fecaca');
      noseGrad.addColorStop(0.2, '#ef4444');
      noseGrad.addColorStop(0.5, '#b91c1c');
      noseGrad.addColorStop(0.8, '#7f1d1d');
      noseGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = noseGrad;
      ctx.beginPath();
      ctx.moveTo(noseStartX, -bodyR * 0.75);
      ctx.bezierCurveTo(
        noseStartX + noseLen * 0.45, -bodyR * 0.8,
        noseStartX + noseLen * 0.8, -bodyR * 0.35,
        noseTipX, 0
      );
      ctx.bezierCurveTo(
        noseStartX + noseLen * 0.8, bodyR * 0.35,
        noseStartX + noseLen * 0.45, bodyR * 0.8,
        noseStartX, bodyR * 0.75
      );
      ctx.closePath();
      ctx.fill();
      // Nose spec highlight
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.ellipse(noseStartX + noseLen * 0.45, -bodyR * 0.35, noseLen * 0.35, bodyR * 0.18, -0.1, 0, Math.PI * 2);
      ctx.fill();
      // Nose seeker dot
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      ctx.beginPath();
      ctx.arc(noseTipX - 0.5, 0, 0.55, 0, Math.PI * 2);
      ctx.fill();

      // Body outline
      ctx.strokeStyle = 'rgba(220,230,240,0.3)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(tailX, -bodyR);
      ctx.lineTo(bodyLen * 0.75, -bodyR);
      ctx.quadraticCurveTo(bodyLen * 0.85, -bodyR, bodyLen * 0.85, -bodyR * 0.75);
      ctx.bezierCurveTo(
        noseStartX + noseLen * 0.45, -bodyR * 0.8,
        noseStartX + noseLen * 0.8, -bodyR * 0.35,
        noseTipX, 0
      );
      ctx.stroke();

      // ── Rear fin assembly (4 fins: 2 visible, 2 implied) ──
      ctx.fillStyle = '#374151';
      // Upper fin
      ctx.beginPath();
      ctx.moveTo(tailX + 1, -bodyR);
      ctx.lineTo(tailX - bodyR * 0.9, -bodyR * 2.2);
      ctx.lineTo(tailX - bodyR * 0.2, -bodyR * 1.05);
      ctx.lineTo(tailX + bodyR * 0.6, -bodyR);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // Lower fin
      ctx.fillStyle = '#374151';
      ctx.beginPath();
      ctx.moveTo(tailX + 1, bodyR);
      ctx.lineTo(tailX - bodyR * 0.9, bodyR * 2.2);
      ctx.lineTo(tailX - bodyR * 0.2, bodyR * 1.05);
      ctx.lineTo(tailX + bodyR * 0.6, bodyR);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Small central stabilizer
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.moveTo(tailX + 1, 0);
      ctx.lineTo(tailX - bodyR * 1.1, -bodyR * 0.25);
      ctx.lineTo(tailX - bodyR * 1.3, 0);
      ctx.lineTo(tailX - bodyR * 1.1, bodyR * 0.25);
      ctx.closePath();
      ctx.fill();

      // Exhaust nozzle ring
      ctx.fillStyle = '#1a1c22';
      ctx.beginPath();
      ctx.ellipse(tailX + 0.5, 0, 0.8, bodyR * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Hot nozzle interior
      ctx.fillStyle = 'rgba(255,140,40,0.85)';
      ctx.beginPath();
      ctx.ellipse(tailX + 0.2, 0, 0.55, bodyR * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (hz.type === 'cluster') {
      // ═══ CRUISE MISSILE — HIGH FIDELITY ═══
      const phase = hz.clusterPhase || 'flying';
      const flyingRight = (hz.clusterVelX || 0) > 0;
      const dir = flyingRight ? 1 : -1;

      if (phase === 'done') {
        // Post-detonation dissipating smoke + heat haze cloud
        const alpha = Math.min(1, (hz.clusterTimer || 0) / 0.4);
        const expand = 1 - alpha * 0.25;
        // Outer smoke shell
        const smokeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, hz.size * 3.2 * expand);
        smokeGrad.addColorStop(0, `rgba(160,140,115,${alpha * 0.4})`);
        smokeGrad.addColorStop(0.55, `rgba(100,85,70,${alpha * 0.28})`);
        smokeGrad.addColorStop(1, 'rgba(40,30,25,0)');
        ctx.fillStyle = smokeGrad;
        ctx.beginPath();
        ctx.arc(0, 0, hz.size * 3.2 * expand, 0, Math.PI * 2);
        ctx.fill();
        // Warm afterglow core (residual heat)
        ctx.fillStyle = `rgba(255,160,60,${alpha * 0.25})`;
        ctx.beginPath();
        ctx.arc(0, 0, hz.size * 1.4 * expand, 0, Math.PI * 2);
        ctx.fill();
        // A few rising embers
        for (let e = 0; e < 4; e++) {
          const ex = Math.sin(e * 1.9) * hz.size * 1.5;
          const ey = -(1 - alpha) * hz.size * 3 - e * 1.5;
          ctx.fillStyle = `rgba(255,${150 + e * 20},40,${alpha * 0.6})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 1 + Math.sin(e * 2) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.save();
        ctx.scale(dir, 1);
        const velY = hz.clusterVelY || 0;
        const arcAngle = Math.atan2(velY, Math.abs(hz.clusterVelX || 300));
        // Unguided rockets wobble slightly around their thrust axis.
        // Use a stable per-missile phase so the wobble is deterministic
        // per instance but varies between instances.
        const wobblePhase = hz.pos.x * 0.013 + hz.pos.y * 0.009;
        const flightWobble = phase === 'flying'
          ? Math.sin(performance.now() * 0.01 + wobblePhase) * 0.018
            + Math.sin(performance.now() * 0.023 + wobblePhase) * 0.009
          : 0;
        ctx.rotate(arcAngle + flightWobble);

        const bodyLen = hz.size * 3.8;
        const bodyH = hz.size * 0.55;
        const t = performance.now() * 0.001;

        // ── Long turbulent smoke trail (multi-layer, varies in size and tint) ──
        if (phase === 'flying') {
          for (let si = 0; si < 14; si++) {
            const offset = si * 6;
            const sx = -bodyLen * 0.68 - offset;
            const turb = Math.sin(t * 4 + si * 1.9) * 2 + Math.cos(t * 2.3 + si) * 1.2;
            const sy = turb;
            const ageT = si / 13; // 0..1
            const sa = (0.22 - ageT * 0.2) * (0.85 + Math.sin(t * 3 + si) * 0.15);
            const sr = 2.5 + ageT * 8;
            // Colour drifts from light to smoky grey
            const gt = 160 + Math.round(ageT * 30);
            const bt = 145 + Math.round(ageT * 25);
            ctx.fillStyle = `rgba(${gt + 20},${gt},${bt},${Math.max(0.01, sa)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
          // Hot core of exhaust (just behind the nozzle)
          const coreAlpha = 0.6 + Math.sin(t * 60) * 0.2;
          ctx.fillStyle = `rgba(255,180,90,${coreAlpha * 0.7})`;
          ctx.beginPath();
          ctx.ellipse(-bodyLen * 0.7, 0, 4, bodyH * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,240,200,${coreAlpha})`;
          ctx.beginPath();
          ctx.ellipse(-bodyLen * 0.68, 0, 2, bodyH * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Main body — cylindrical shading (3D effect) ──
        const bodyGrad = ctx.createLinearGradient(0, -bodyH * 1.1, 0, bodyH * 1.1);
        bodyGrad.addColorStop(0, '#8a9a7a');
        bodyGrad.addColorStop(0.15, '#a3b393');
        bodyGrad.addColorStop(0.35, '#7a8a6a');
        bodyGrad.addColorStop(0.5, '#6b7a5d');
        bodyGrad.addColorStop(0.7, '#4a5640');
        bodyGrad.addColorStop(0.85, '#3d4a35');
        bodyGrad.addColorStop(1, '#2d3628');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(bodyLen * 0.38, 0);
        ctx.bezierCurveTo(bodyLen * 0.38, -bodyH, bodyLen * 0.3, -bodyH, bodyLen * 0.18, -bodyH);
        ctx.lineTo(-bodyLen * 0.5, -bodyH * 0.88);
        ctx.bezierCurveTo(-bodyLen * 0.6, -bodyH * 0.7, -bodyLen * 0.65, -bodyH * 0.3, -bodyLen * 0.65, 0);
        ctx.bezierCurveTo(-bodyLen * 0.65, bodyH * 0.3, -bodyLen * 0.6, bodyH * 0.7, -bodyLen * 0.5, bodyH * 0.88);
        ctx.lineTo(bodyLen * 0.18, bodyH);
        ctx.bezierCurveTo(bodyLen * 0.3, bodyH, bodyLen * 0.38, bodyH, bodyLen * 0.38, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,40,27,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // ── Panel lines ──
        ctx.strokeStyle = 'rgba(20,30,15,0.25)';
        ctx.lineWidth = 0.5;
        for (let pl = 0; pl < 5; pl++) {
          const px = bodyLen * (-0.4 + pl * 0.15);
          const topY = -bodyH * (0.82 - Math.abs(pl - 2) * 0.04);
          const botY = bodyH * (0.82 - Math.abs(pl - 2) * 0.04);
          ctx.beginPath();
          ctx.moveTo(px, topY);
          ctx.lineTo(px, botY);
          ctx.stroke();
        }

        // ── Rivets along panel lines ──
        ctx.fillStyle = 'rgba(80,90,70,0.5)';
        for (let pl = 0; pl < 5; pl++) {
          const px = bodyLen * (-0.4 + pl * 0.15);
          for (const ry of [-bodyH * 0.5, 0, bodyH * 0.5]) {
            ctx.beginPath();
            ctx.arc(px, ry, 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ── Top specular highlight ──
        const specGrad = ctx.createLinearGradient(0, -bodyH * 1.1, 0, -bodyH * 0.2);
        specGrad.addColorStop(0, 'rgba(255,255,255,0)');
        specGrad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrad;
        ctx.fillRect(-bodyLen * 0.5, -bodyH, bodyLen * 0.85, bodyH * 0.5);

        // ── Nose cone — sharp ogive warhead ──
        const noseLen = bodyLen * 0.48;
        const noseStartX = bodyLen * 0.38;
        const noseGrad = ctx.createLinearGradient(0, -bodyH * 0.8, 0, bodyH * 0.8);
        noseGrad.addColorStop(0, '#c42020');
        noseGrad.addColorStop(0.2, '#dc2626');
        noseGrad.addColorStop(0.4, '#b91c1c');
        noseGrad.addColorStop(0.7, '#991b1b');
        noseGrad.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = noseGrad;
        ctx.beginPath();
        ctx.moveTo(noseStartX + noseLen, 0);
        ctx.bezierCurveTo(
          noseStartX + noseLen * 0.7, -bodyH * 0.08,
          noseStartX + noseLen * 0.3, -bodyH * 0.35,
          noseStartX, -bodyH * 0.7
        );
        ctx.lineTo(noseStartX, bodyH * 0.7);
        ctx.bezierCurveTo(
          noseStartX + noseLen * 0.3, bodyH * 0.35,
          noseStartX + noseLen * 0.7, bodyH * 0.08,
          noseStartX + noseLen, 0
        );
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Nose tip — dark point
        ctx.fillStyle = '#1a0505';
        ctx.beginPath();
        ctx.arc(noseStartX + noseLen - 1, 0, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // ── Metallic ring at nose-body junction ──
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(noseStartX, -bodyH * 0.75);
        ctx.lineTo(noseStartX, bodyH * 0.75);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(noseStartX + 1, -bodyH * 0.7);
        ctx.lineTo(noseStartX + 1, bodyH * 0.7);
        ctx.stroke();

        // ── Chevron warning stripes ──
        const chevX = bodyLen * 0.15;
        for (let ci = 0; ci < 4; ci++) {
          const cx = chevX - ci * 4;
          ctx.fillStyle = ci % 2 === 0 ? 'rgba(234,179,8,0.35)' : 'rgba(0,0,0,0.25)';
          ctx.fillRect(cx, -bodyH * 0.85, 2.5, bodyH * 1.7);
        }

        // ── 4 Delta fins with thickness & edge highlight ──
        const finGrad = ctx.createLinearGradient(0, -bodyH * 2.5, 0, bodyH * 2.5);
        finGrad.addColorStop(0, '#5a6a4e');
        finGrad.addColorStop(0.5, '#374131');
        finGrad.addColorStop(1, '#2a3325');
        ctx.fillStyle = finGrad;
        ctx.strokeStyle = 'rgba(200,210,190,0.4)';
        ctx.lineWidth = 0.6;

        // Top fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.42, -bodyH * 0.88);
        ctx.lineTo(-bodyLen * 0.58, -bodyH * 2.8);
        ctx.lineTo(-bodyLen * 0.52, -bodyH * 2.6);
        ctx.lineTo(-bodyLen * 0.28, -bodyH * 0.88);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Bottom fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.42, bodyH * 0.88);
        ctx.lineTo(-bodyLen * 0.58, bodyH * 2.8);
        ctx.lineTo(-bodyLen * 0.52, bodyH * 2.6);
        ctx.lineTo(-bodyLen * 0.28, bodyH * 0.88);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Upper-side fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.48, -bodyH * 0.55);
        ctx.lineTo(-bodyLen * 0.6, -bodyH * 1.8);
        ctx.lineTo(-bodyLen * 0.55, -bodyH * 1.65);
        ctx.lineTo(-bodyLen * 0.36, -bodyH * 0.55);
        ctx.closePath();
        ctx.fill();
        // Lower-side fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.48, bodyH * 0.55);
        ctx.lineTo(-bodyLen * 0.6, bodyH * 1.8);
        ctx.lineTo(-bodyLen * 0.55, bodyH * 1.65);
        ctx.lineTo(-bodyLen * 0.36, bodyH * 0.55);
        ctx.closePath();
        ctx.fill();

        // ── Exhaust nozzle — triple layer ──
        // Outer ring
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.arc(-bodyLen * 0.65, 0, bodyH * 0.65, 0, Math.PI * 2);
        ctx.fill();
        // Inner ring
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(-bodyLen * 0.65, 0, bodyH * 0.45, 0, Math.PI * 2);
        ctx.fill();
        // Core hole
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-bodyLen * 0.65, 0, bodyH * 0.28, 0, Math.PI * 2);
        ctx.fill();
        // Nozzle rim highlight
        ctx.strokeStyle = 'rgba(180,180,180,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(-bodyLen * 0.65, 0, bodyH * 0.64, -0.5, 0.5);
        ctx.stroke();

        // ── Exhaust flame — 5 layers (flying phase) ──
        if (phase === 'flying') {
          const flameBase = -bodyLen * 0.65;
          const maxLen = bodyLen * 0.7;
          const flicker = Math.random();
          const flameLayers = [
            { color: 'rgba(180,60,20,0.6)', wFrac: 0.45, lFrac: 1.0 + flicker * 0.15 },
            { color: 'rgba(220,100,20,0.7)', wFrac: 0.35, lFrac: 0.8 + flicker * 0.1 },
            { color: 'rgba(251,191,36,0.8)', wFrac: 0.25, lFrac: 0.6 + flicker * 0.08 },
            { color: 'rgba(253,224,71,0.85)', wFrac: 0.15, lFrac: 0.4 },
            { color: 'rgba(255,250,230,0.9)', wFrac: 0.08, lFrac: 0.2 },
          ];
          for (const fl of flameLayers) {
            const fw = bodyH * fl.wFrac;
            const fLen = maxLen * fl.lFrac + Math.random() * 6;
            ctx.fillStyle = fl.color;
            ctx.beginPath();
            ctx.moveTo(flameBase, -fw);
            ctx.quadraticCurveTo(flameBase - fLen * 0.6, -fw * 0.3 + Math.random() * 2, flameBase - fLen, 0);
            ctx.quadraticCurveTo(flameBase - fLen * 0.6, fw * 0.3 - Math.random() * 2, flameBase, fw);
            ctx.closePath();
            ctx.fill();
          }
        }

        // ── Opening phase — dramatic cinematic split ──
        if (phase === 'opening' || phase === 'releasing') {
          const isReleasing = phase === 'releasing';
          // Normalised 0..1 progress: builds up during opening, pins at 1 while releasing
          const openT = isReleasing
            ? 1
            : 1 - Math.max(0, (hz.clusterTimer || 0) / 1.0);

          // ── 1) Growing shockwave ring (explosion at release point) ──
          const shockR = openT * bodyLen * 1.8;
          const shockAlpha = (1 - openT) * 0.55 + (isReleasing ? 0.25 : 0);
          if (shockR > 1) {
            ctx.strokeStyle = `rgba(255,240,180,${shockAlpha})`;
            ctx.lineWidth = 2.5 + openT * 3;
            ctx.beginPath();
            ctx.arc(0, 0, shockR, 0, Math.PI * 2);
            ctx.stroke();
            // Secondary ring slightly behind
            ctx.strokeStyle = `rgba(255,180,80,${shockAlpha * 0.5})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(0, 0, shockR * 0.85, 0, Math.PI * 2);
            ctx.stroke();
          }

          // ── 2) Massive white flash core (scales fast then fades) ──
          const flashFade = isReleasing
            ? 0.3
            : Math.max(0, 1 - Math.abs(openT - 0.4) * 2.5); // peaks at openT ~ 0.4
          if (flashFade > 0.05) {
            const flashR = bodyLen * (0.3 + openT * 0.6);
            const flashGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, flashR);
            flashGrad.addColorStop(0, `rgba(255,255,240,${0.95 * flashFade})`);
            flashGrad.addColorStop(0.4, `rgba(255,220,140,${0.7 * flashFade})`);
            flashGrad.addColorStop(0.8, `rgba(255,120,40,${0.35 * flashFade})`);
            flashGrad.addColorStop(1, 'rgba(200,40,0,0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(0, 0, flashR, 0, Math.PI * 2);
            ctx.fill();
          }

          // ── 3) Radiating god-rays from the centre ──
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let r = 0; r < 8; r++) {
            const rayAngle = (r / 8) * Math.PI * 2 + openT * 0.3;
            const rayLen = bodyLen * (0.6 + openT * 0.6);
            const rayAlpha = (0.22 - openT * 0.08) * (isReleasing ? 0.6 : 1);
            const rayGrad = ctx.createLinearGradient(
              0, 0,
              Math.cos(rayAngle) * rayLen, Math.sin(rayAngle) * rayLen
            );
            rayGrad.addColorStop(0, `rgba(255,240,180,${Math.max(0, rayAlpha)})`);
            rayGrad.addColorStop(1, 'rgba(255,240,180,0)');
            ctx.strokeStyle = rayGrad as unknown as string;
            ctx.lineWidth = 1 + openT * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(rayAngle) * rayLen, Math.sin(rayAngle) * rayLen);
            ctx.stroke();
          }
          ctx.restore();

          // ── 4) Visible split: top and bottom halves hinge outward ──
          const gap = openT * bodyH * 2.8;
          const hingeAngle = openT * 0.45; // radians — peels outward

          // Dark "interior" revealed between the two halves
          if (gap > 0.5) {
            const interiorGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bodyLen * 0.4);
            interiorGrad.addColorStop(0, `rgba(255,180,50,${0.65 * openT})`);
            interiorGrad.addColorStop(0.5, `rgba(180,30,10,${0.4 * openT})`);
            interiorGrad.addColorStop(1, 'rgba(40,10,0,0)');
            ctx.fillStyle = interiorGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, bodyLen * 0.4, Math.max(0.1, gap * 0.9), 0, 0, Math.PI * 2);
            ctx.fill();

            // Stringy debris threads spanning the gap (ripped internal cables)
            ctx.strokeStyle = `rgba(80,60,40,${0.55 * (1 - openT * 0.5)})`;
            ctx.lineWidth = 0.4;
            for (let c = 0; c < 5; c++) {
              const cx = -bodyLen * 0.3 + c * (bodyLen * 0.15);
              const cyTop = -gap * (0.5 + Math.sin(c * 2.1) * 0.3);
              const cyBot = gap * (0.5 + Math.sin(c * 1.7) * 0.3);
              ctx.beginPath();
              ctx.moveTo(cx, cyTop);
              ctx.quadraticCurveTo(cx + 2, 0, cx, cyBot);
              ctx.stroke();
            }
          }

          // Jagged crack lines along the split seams
          ctx.strokeStyle = `rgba(251,191,36,${0.6 + openT * 0.4})`;
          ctx.lineWidth = 1.5 + openT * 3;
          ctx.beginPath();
          ctx.moveTo(-bodyLen * 0.4, -gap);
          ctx.lineTo(-bodyLen * 0.15, -gap * 0.9 - 2);
          ctx.lineTo(bodyLen * 0.1, -gap * 0.85);
          ctx.lineTo(bodyLen * 0.35, -gap * 0.75);
          ctx.moveTo(-bodyLen * 0.4, gap);
          ctx.lineTo(-bodyLen * 0.15, gap * 0.9 + 2);
          ctx.lineTo(bodyLen * 0.1, gap * 0.85);
          ctx.lineTo(bodyLen * 0.35, gap * 0.75);
          ctx.stroke();

          // ── 5) Metal shell fragments blown outward ──
          for (let fi = 0; fi < 7; fi++) {
            const fragSeed = fi * 1.37;
            const fx = (fragSeed % 1 - 0.5) * bodyLen * 0.8;
            const sign = fi % 2 ? 1 : -1;
            const fy = sign * (gap * 0.6 + ((fragSeed * 13) % 1) * gap * 0.9);
            const fs = 1.5 + ((fragSeed * 7) % 1) * 2.5;
            ctx.fillStyle = `rgba(110,100,88,${0.55 + openT * 0.35})`;
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(fragSeed * 3);
            ctx.fillRect(-fs, -fs * 0.35, fs * 2, fs * 0.7);
            // Dark edge
            ctx.strokeStyle = 'rgba(20,15,10,0.7)';
            ctx.lineWidth = 0.4;
            ctx.strokeRect(-fs, -fs * 0.35, fs * 2, fs * 0.7);
            ctx.restore();
          }

          // ── 6) Sparks — dense + bright, decorate the interior glow ──
          for (let i = 0; i < 10; i++) {
            const sparkSeed = (i * 2.731 + openT * 13) % 1;
            const sparkX = (sparkSeed - 0.5) * bodyLen * 0.9;
            const sparkY = Math.sin(i * 1.7) * gap * 1.3;
            const sparkSize = 0.6 + (sparkSeed * 1.4);
            ctx.fillStyle = i % 2 === 0 ? '#fff7cc' : '#fbbf24';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      }
    } else if (hz.isClusterBomb) {
      // ═══ CLUSTER BOMBLET — Small munition with tail fin ═══
      ctx.rotate(hz.rotation);
      const s = hz.size;

      // Light smoke trail
      const smokeTime = performance.now() * 0.001 + hz.pos.x * 0.01;
      for (let si = 0; si < 3; si++) {
        const smokeY = -(s * 1.5 + si * s * 0.8);
        const smokeX = Math.sin(smokeTime + si * 1.3) * s * 0.4;
        const smokeAlpha = 0.12 - si * 0.035;
        const smokeSize = s * (0.5 + si * 0.3);
        ctx.fillStyle = `rgba(180,180,180,${Math.max(0.02, smokeAlpha)})`;
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle halo
      const haloGrad = ctx.createRadialGradient(0, 0, s * 0.8, 0, 0, s * 1.3);
      haloGrad.addColorStop(0, 'rgba(253,224,71,0.12)');
      haloGrad.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Main body — elongated munition shape
      const bLen = s * 1.6;
      const bW = s * 0.7;
      const munGrad = ctx.createLinearGradient(0, -bW, 0, bW);
      munGrad.addColorStop(0, '#b8a84e');
      munGrad.addColorStop(0.3, '#d4c456');
      munGrad.addColorStop(0.5, '#eab308');
      munGrad.addColorStop(0.7, '#c49a08');
      munGrad.addColorStop(1, '#8a6d06');
      ctx.fillStyle = munGrad;
      ctx.beginPath();
      ctx.moveTo(0, -bLen * 0.5);
      ctx.bezierCurveTo(bW * 0.6, -bLen * 0.45, bW, -bLen * 0.2, bW, 0);
      ctx.bezierCurveTo(bW, bLen * 0.2, bW * 0.3, bLen * 0.45, 0, bLen * 0.55);
      ctx.bezierCurveTo(-bW * 0.3, bLen * 0.45, -bW, bLen * 0.2, -bW, 0);
      ctx.bezierCurveTo(-bW, -bLen * 0.2, -bW * 0.6, -bLen * 0.45, 0, -bLen * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6b5506';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Tail fin — small stabilizer
      ctx.fillStyle = '#8a7d3a';
      ctx.beginPath();
      ctx.moveTo(-bW * 0.3, bLen * 0.4);
      ctx.lineTo(-bW * 1.1, bLen * 0.85);
      ctx.lineTo(-bW * 0.2, bLen * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bW * 0.3, bLen * 0.4);
      ctx.lineTo(bW * 1.1, bLen * 0.85);
      ctx.lineTo(bW * 0.2, bLen * 0.55);
      ctx.closePath();
      ctx.fill();

      // Top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, -bLen * 0.15, bW * 0.35, bLen * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (hz.isFireBomb) {
      // ═══ Falling Fireball — napalm bomblet with a flame tail ═══
      const pulse = 0.85 + Math.sin(performance.now() * 0.02 + hz.pos.x) * 0.15;
      const r = hz.size * 1.1;

      // Smoke trail trailing upward
      for (let s = 0; s < 5; s++) {
        const sy = -s * 4 - 2;
        const sa = (0.35 - s * 0.06) * pulse;
        const sr = 3 + s * 1.2;
        ctx.fillStyle = `rgba(80,60,50,${Math.max(0.02, sa)})`;
        ctx.beginPath();
        ctx.arc(Math.sin(s * 0.7) * 1.2, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer orange halo (bloom)
      const haloGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
      haloGrad.addColorStop(0, `rgba(255,180,60,${0.45 * pulse})`);
      haloGrad.addColorStop(0.5, `rgba(255,100,30,${0.25 * pulse})`);
      haloGrad.addColorStop(1, 'rgba(180,40,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // Fireball core with 3-stop radial gradient
      const coreGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      coreGrad.addColorStop(0, 'rgba(255,255,220,0.98)');
      coreGrad.addColorStop(0.35, `rgba(255,210,80,${pulse})`);
      coreGrad.addColorStop(0.75, `rgba(255,110,20,${pulse})`);
      coreGrad.addColorStop(1, 'rgba(150,30,0,0.8)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Dark scorch ring around the core (metallic casing hint)
      ctx.strokeStyle = 'rgba(40,15,5,0.8)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
      ctx.stroke();

      // Flickering flame tongues licking out
      for (let f = 0; f < 4; f++) {
        const ang = (f / 4) * Math.PI * 2 + performance.now() * 0.003;
        const flame = r * (0.6 + Math.sin(performance.now() * 0.02 + f * 3) * 0.4);
        const fx = Math.cos(ang) * r * 0.6;
        const fy = Math.sin(ang) * r * 0.6;
        ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 70)},20,${0.7 * pulse})`;
        ctx.beginPath();
        ctx.arc(fx, fy, flame * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright specular dot
      ctx.fillStyle = 'rgba(255,255,240,0.9)';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.35, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (hz.isGasBomb) {
      // ═══ Falling Gas Canister — green glowing cylinder ═══
      const r = hz.size * 1.1;
      const pulse = 0.8 + Math.sin(performance.now() * 0.008) * 0.2;

      // Outer green halo
      const haloGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.3);
      haloGrad.addColorStop(0, `rgba(74,222,128,${0.35 * pulse})`);
      haloGrad.addColorStop(0.55, `rgba(34,197,94,${0.18 * pulse})`);
      haloGrad.addColorStop(1, 'rgba(5,46,22,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Vapor trail above (mist rising from the falling canister)
      for (let s = 0; s < 4; s++) {
        const sy = -s * 5 - 3;
        const sa = (0.3 - s * 0.06) * pulse;
        ctx.fillStyle = `rgba(134,239,172,${Math.max(0.02, sa)})`;
        ctx.beginPath();
        ctx.arc(Math.sin(s * 0.8) * 1.5, sy, 3 + s * 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Canister body (metallic cylinder + glass window)
      ctx.save();
      ctx.rotate(hz.rotation * 0.15);
      // Metal shell
      const shellGrad = ctx.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
      shellGrad.addColorStop(0, '#4b5563');
      shellGrad.addColorStop(0.5, '#64748b');
      shellGrad.addColorStop(1, '#334155');
      ctx.fillStyle = shellGrad;
      ctx.beginPath();
      ctx.roundRect(-r * 0.6, -r * 1.05, r * 1.2, r * 2.1, r * 0.2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,45,0.9)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Green glass window showing the contents
      const glassGrad = ctx.createLinearGradient(0, -r * 0.8, 0, r * 0.8);
      glassGrad.addColorStop(0, `rgba(190,245,190,${pulse})`);
      glassGrad.addColorStop(0.5, `rgba(34,197,94,${pulse})`);
      glassGrad.addColorStop(1, `rgba(5,46,22,${pulse})`);
      ctx.fillStyle = glassGrad;
      ctx.fillRect(-r * 0.4, -r * 0.8, r * 0.8, r * 1.6);
      // Inner highlight strip
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-r * 0.3, -r * 0.75, r * 0.12, r * 1.5);
      // Outline
      ctx.strokeStyle = 'rgba(5,46,22,0.8)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-r * 0.4, -r * 0.8, r * 0.8, r * 1.6);

      // Biohazard mark on top
      ctx.fillStyle = 'rgba(250,204,21,0.9)';
      ctx.font = `bold ${r * 0.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☣', 0, 0);
      ctx.restore();
    } else if (hz.type === 'mine') {
      // ═══ Ground Mine — half-dome with antenna and state-based pulse ═══
      const r = hz.size;
      const state = hz.mineState ?? 'armed';
      const tm = performance.now() * 0.001;
      let glow: string;
      let pulseRate: number;
      if (state === 'arming') {
        glow = '#fbbf24';  // yellow
        pulseRate = 4;
      } else if (state === 'triggered') {
        glow = '#ef4444';  // urgent red
        // Accelerate flash as detonation approaches
        const remaining = hz.mineTimer ?? 0;
        pulseRate = 12 + (0.5 - Math.max(0, remaining)) * 40;
      } else {
        glow = '#f97316';  // muted orange when armed
        pulseRate = 1.5;
      }
      const flash = 0.5 + Math.sin(tm * pulseRate) * 0.5;
      // Base dome (half circle sitting on ground)
      const baseGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      baseGrad.addColorStop(0, '#5a5a60');
      baseGrad.addColorStop(0.6, '#2c2c32');
      baseGrad.addColorStop(1, '#18181c');
      ctx.fillStyle = baseGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      // Antenna
      ctx.strokeStyle = '#3a3a40';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.lineTo(0, -r * 1.3);
      ctx.stroke();
      // Indicator light on top of antenna
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.7 + flash * 0.3;
      ctx.beginPath();
      ctx.arc(0, -r * 1.3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Glow halo when armed/triggered
      if (state !== 'arming' || flash > 0.5) {
        const halo = ctx.createRadialGradient(0, -r * 0.3, 0, 0, -r * 0.3, r * 2.2);
        halo.addColorStop(0, `${glow === '#ef4444' ? 'rgba(239,68,68,' : glow === '#fbbf24' ? 'rgba(251,191,36,' : 'rgba(249,115,22,'}${flash * 0.4})`);
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, -r * 0.3, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Defuse progress bar above the mine
      if ((hz.mineDefuseProgress ?? 0) > 0) {
        const progress = Math.min(1, (hz.mineDefuseProgress ?? 0) / 3);
        const barW = 32;
        const barH = 4;
        const barY = -r * 2 - 6;
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-barW / 2, barY, barW, barH);
        // Fill
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-barW / 2, barY, barW * progress, barH);
        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-barW / 2, barY, barW, barH);
        // Text
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 9px Tajawal, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('جارٍ التفكيك', 0, barY - 4);
      }
    } else if (hz.type === 'meteor') {
      // ═══ DRAMATIC METEOR — Irregular rocky shape + multi-layer flames ═══
      const r = hz.size;
      const mt = performance.now() * 0.001 + hz.pos.x * 0.01;
      const flicker = 0.6 + Math.sin(mt * 18) * 0.3 + Math.cos(mt * 24) * 0.2;
      // Multi-layer flame trail
      ctx.fillStyle = `rgba(220,80,20,${0.35 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.3);
      ctx.quadraticCurveTo(-r * 1.2, -r * 0.5, -r * 3.5, -r * 5);
      ctx.quadraticCurveTo(-r * 1.8, -r * 2, r * 0.3, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(240,120,30,${0.42 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.2);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.8, -r * 2.5, -r * 3.5);
      ctx.quadraticCurveTo(-r * 1.2, -r * 1.5, r * 0.2, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,200,80,${0.55 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.15);
      ctx.quadraticCurveTo(-r * 0.5, -r * 0.6, -r * 1.3, -r * 2.2);
      ctx.quadraticCurveTo(-r * 0.6, -r * 1, r * 0.15, -r * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,240,200,${0.65 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.4, -r * 0.7, -r * 1.4);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.5, r * 0.1, -r * 0.05);
      ctx.closePath();
      ctx.fill();
      // Heat distortion halo
      const haloGrad = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.5);
      haloGrad.addColorStop(0, 'rgba(255,200,80,0.5)');
      haloGrad.addColorStop(0.4, 'rgba(255,120,40,0.3)');
      haloGrad.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Jagged rock body
      const pts = [
        [-r * 0.9, -r * 0.4], [-r * 0.6, -r * 1.1], [-r * 0.1, -r * 1.0],
        [r * 0.5, -r * 0.8], [r * 0.9, -r * 0.3], [r * 1.0, r * 0.4],
        [r * 0.7, r * 0.95], [r * 0.1, r * 1.1], [-r * 0.4, r * 1.0], [-r * 0.85, r * 0.5],
      ];
      const rockGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.15, r * 0.2, 0, 0, r * 1.1);
      rockGrad.addColorStop(0, '#8b5a2b');
      rockGrad.addColorStop(0.3, '#654321');
      rockGrad.addColorStop(0.6, '#3d2a1f');
      rockGrad.addColorStop(1, '#1a1410');
      ctx.fillStyle = rockGrad;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      // Craters
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(-r * 0.5, -r * 0.6, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(r * 0.6, r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.arc(-r * 0.15, r * 0.7, r * 0.18, 0, Math.PI * 2); ctx.fill();
      // Hot veins
      ctx.strokeStyle = `rgba(255,140,40,${0.5 + Math.sin(mt * 8) * 0.3})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.5);
      ctx.bezierCurveTo(-r * 0.4, -r * 0.2, r * 0.2, r * 0.3, r * 0.8, r * 0.6);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,160,60,${0.4 + Math.sin(mt * 12) * 0.25})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.8);
      ctx.bezierCurveTo(r * 0.1, r * 0.2, r * 0.5, -r * 0.1, r * 0.9, -r * 0.5);
      ctx.stroke();
      // Embers
      for (let e = 0; e < 5; e++) {
        const ep = mt * 20 + e * 1.2;
        const ex = Math.sin(ep) * r * 1.5;
        const ey = -r * 1.2 + Math.cos(ep) * r * 1.8;
        const ea = Math.sin(ep * 2) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,100,20,${ea * 0.7})`;
        ctx.beginPath(); ctx.arc(ex, ey, 0.8 + Math.sin(ep * 3) * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,200,80,${ea * 0.9})`;
        ctx.beginPath(); ctx.arc(ex, ey, 0.5, 0, Math.PI * 2); ctx.fill();
      }
      // Center glow
      ctx.fillStyle = `rgba(255,180,100,${0.3 + Math.sin(mt * 5) * 0.15})`;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else {
      // ═══ Shrapnel — one of 4 variants, weight-based motion ═══
      ctx.rotate(hz.rotation);
      const variant = hz.shrapnelVariant ?? 1;
      const sz = hz.size;

      // Drop shadow helper for volume
      const drawShadow = (poly: { x: number; y: number }[]) => {
        ctx.save();
        ctx.translate(1.3, 1.6);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      // Shared motion trail (ghost copies trailing behind the tumble path)
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#9a9590';
      for (let g2 = 1; g2 <= 2; g2++) {
        const off = -g2 * sz * 0.3;
        ctx.beginPath();
        ctx.ellipse(off, off * 0.4, sz * 0.85, sz * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (variant === 0) {
        // ── Rebar — long metal rod with threaded ends (heaviest) ──
        const rodLen = sz * 2.8;
        const rodW = sz * 0.38;
        const pts = [
          { x: -rodLen * 0.5, y: -rodW * 0.5 },
          { x:  rodLen * 0.5, y: -rodW * 0.5 },
          { x:  rodLen * 0.5, y:  rodW * 0.5 },
          { x: -rodLen * 0.5, y:  rodW * 0.5 },
        ];
        drawShadow(pts);

        // Cylindrical shading
        const rodGrad = ctx.createLinearGradient(0, -rodW * 0.5, 0, rodW * 0.5);
        rodGrad.addColorStop(0, '#d6d1c8');
        rodGrad.addColorStop(0.35, '#8f8a82');
        rodGrad.addColorStop(0.65, '#4f4a44');
        rodGrad.addColorStop(1, '#2a2320');
        ctx.fillStyle = rodGrad;
        ctx.beginPath();
        ctx.roundRect(-rodLen * 0.5, -rodW * 0.5, rodLen, rodW, rodW * 0.35);
        ctx.fill();

        // Rib texture every ~sz*0.6
        ctx.strokeStyle = 'rgba(25,20,15,0.55)';
        ctx.lineWidth = 0.5;
        const ribCount = Math.floor(rodLen / (sz * 0.55));
        for (let r = 0; r < ribCount; r++) {
          const rx = -rodLen * 0.5 + (r + 0.5) * (rodLen / ribCount);
          ctx.beginPath();
          ctx.moveTo(rx - 0.4, -rodW * 0.55);
          ctx.lineTo(rx + 0.4, rodW * 0.55);
          ctx.stroke();
        }

        // Ends — darker caps (sheared)
        ctx.fillStyle = 'rgba(20,14,8,0.85)';
        ctx.beginPath();
        ctx.ellipse(-rodLen * 0.5 + 0.5, 0, rodW * 0.32, rodW * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(rodLen * 0.5 - 0.5, 0, rodW * 0.32, rodW * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();

        // Top specular stripe
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(-rodLen * 0.45, -rodW * 0.4, rodLen * 0.9, rodW * 0.2);

        // Red-hot tip ember
        ctx.fillStyle = 'rgba(255,110,30,0.75)';
        ctx.beginPath();
        ctx.arc(rodLen * 0.5 - 0.3, 0, rodW * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (variant === 1) {
        // ── Jagged chunk (current design, slightly refined) ──
        const pts = [
          { x: -sz * 1.05, y: -sz * 0.35 },
          { x: -sz * 0.35, y: -sz * 1.05 },
          { x:  sz * 0.55, y: -sz * 0.7  },
          { x:  sz * 1.1,  y:  sz * 0.15 },
          { x:  sz * 0.25, y:  sz * 0.95 },
          { x: -sz * 0.7,  y:  sz * 0.45 },
        ];
        drawShadow(pts);

        const shrapGrad = ctx.createLinearGradient(-sz, -sz, sz * 0.8, sz * 0.8);
        shrapGrad.addColorStop(0, '#d6d1c8');
        shrapGrad.addColorStop(0.35, '#8f8a82');
        shrapGrad.addColorStop(0.6, '#57534e');
        shrapGrad.addColorStop(0.85, '#3d362f');
        shrapGrad.addColorStop(1, '#2a2320');
        ctx.fillStyle = shrapGrad;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();

        // Bevel edges
        ctx.strokeStyle = 'rgba(230,225,215,0.9)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(25,20,15,0.85)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pts[3].x, pts[3].y);
        ctx.lineTo(pts[4].x, pts[4].y);
        ctx.lineTo(pts[5].x, pts[5].y);
        ctx.stroke();

        // Scorch patch
        const scorchGrad = ctx.createRadialGradient(sz * 0.2, sz * 0.35, 0, sz * 0.2, sz * 0.35, sz * 0.75);
        scorchGrad.addColorStop(0, 'rgba(80,35,15,0.55)');
        scorchGrad.addColorStop(0.6, 'rgba(40,20,10,0.25)');
        scorchGrad.addColorStop(1, 'rgba(20,10,5,0)');
        ctx.fillStyle = scorchGrad;
        ctx.beginPath();
        ctx.ellipse(sz * 0.2, sz * 0.35, sz * 0.75, sz * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        // Red-hot ember corner
        ctx.fillStyle = 'rgba(255,80,20,0.7)';
        ctx.beginPath();
        ctx.arc(pts[1].x, pts[1].y, 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,180,60,0.9)';
        ctx.beginPath();
        ctx.arc(pts[1].x, pts[1].y, 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (variant === 2) {
        // ── Bent sheet metal — thin strip with a kink ──
        // Drawn as a 4-vertex quad that bends at the midpoint
        const w = sz * 2.6;
        const h = sz * 0.45;
        const bend = sz * 0.55;
        const pts = [
          { x: -w * 0.5,      y: -h * 0.5 },
          { x:  0,            y: -h * 0.5 - bend * 0.4 },
          { x:  w * 0.5,      y: -h * 0.5 + bend * 0.2 },
          { x:  w * 0.5,      y:  h * 0.5 + bend * 0.2 },
          { x:  0,            y:  h * 0.5 - bend * 0.4 },
          { x: -w * 0.5,      y:  h * 0.5 },
        ];
        drawShadow(pts);

        const sheetGrad = ctx.createLinearGradient(0, -h, 0, h);
        sheetGrad.addColorStop(0, '#c8c3ba');
        sheetGrad.addColorStop(0.4, '#8a857d');
        sheetGrad.addColorStop(0.75, '#4a4540');
        sheetGrad.addColorStop(1, '#262220');
        ctx.fillStyle = sheetGrad;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();

        // Torn ragged edge on one side (jagged notches)
        ctx.strokeStyle = 'rgba(20,15,10,0.85)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let n = 0; n < 4; n++) {
          const nx = -w * 0.5 + (n + 1) * (w * 0.5 / 4);
          const ny = -h * 0.5 - bend * 0.4 * (n / 4) + (n % 2 ? -1 : 1) * 0.7;
          ctx.lineTo(nx, ny);
        }
        ctx.stroke();

        // Rivets / bolt holes
        ctx.fillStyle = 'rgba(30,22,15,0.8)';
        for (let b = 0; b < 3; b++) {
          const bx = -w * 0.35 + b * (w * 0.35);
          ctx.beginPath();
          ctx.arc(bx, 0, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bright fold highlight along the bend line
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.5 - bend * 0.35);
        ctx.lineTo(0, h * 0.5 - bend * 0.35);
        ctx.stroke();
      } else {
        // ── Twisted wire/cable (lightest, most tumble) ──
        // Drawn as a spiral using polyline with sinusoidal offset.
        const wireLen = sz * 2.6;
        const amp = sz * 0.5;

        // Shadow first (single wobble offset)
        ctx.save();
        ctx.translate(1, 1.3);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const px = -wireLen * 0.5 + t * wireLen;
          const py = Math.sin(t * Math.PI * 3 + 1.5) * amp;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();

        // Wire core (twisted cable) — outer dark
        ctx.strokeStyle = '#2a2220';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const px = -wireLen * 0.5 + t * wireLen;
          const py = Math.sin(t * Math.PI * 3 + 1.5) * amp;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Bright strand highlight
        ctx.strokeStyle = 'rgba(220,215,200,0.75)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const px = -wireLen * 0.5 + t * wireLen;
          const py = Math.sin(t * Math.PI * 3 + 1.5) * amp - 0.6;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Twisted strand markers
        ctx.strokeStyle = 'rgba(25,18,12,0.7)';
        ctx.lineWidth = 0.5;
        for (let m = 0; m < 8; m++) {
          const t = (m + 0.5) / 8;
          const px = -wireLen * 0.5 + t * wireLen;
          const py = Math.sin(t * Math.PI * 3 + 1.5) * amp;
          ctx.beginPath();
          ctx.moveTo(px - 0.8, py - 1.1);
          ctx.lineTo(px + 0.8, py + 1.1);
          ctx.stroke();
        }

        // Bright ember at one end
        ctx.fillStyle = 'rgba(255,120,40,0.8)';
        ctx.beginPath();
        ctx.arc(wireLen * 0.5, Math.sin(Math.PI * 3 + 1.5) * amp, 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineCap = 'butt';
      }
    }
    ctx.restore();
  }
}

// ─── Explosions ───────────────────────────────────────
function renderExplosions(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const e of g.explosions) {
    const progress = 1 - e.life / e.maxLife;
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);

    // Shockwave ring — expands fast, fades out
    if (progress > 0.05 && progress < 0.6) {
      const swT = (progress - 0.05) / 0.55;
      const swRadius = e.size * (1 + swT * 5);
      const swAlpha = (1 - swT) * 0.5;
      ctx.strokeStyle = `rgba(255, 255, 255, ${swAlpha})`;
      ctx.lineWidth = 2 - swT * 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, swRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (e.stage === 'flash') {
      // Bright white/yellow flash
      const flashSize = e.size * (0.5 + progress * 3);
      const flashGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, flashSize);
      flashGrad.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
      flashGrad.addColorStop(0.5, 'rgba(255, 200, 50, 0.5)');
      flashGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(0, 0, flashSize, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.stage === 'fireball') {
      const fbSize = e.size * (1 + progress * 0.5);
      const fbGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, fbSize);
      fbGrad.addColorStop(0, `rgba(255, 150, 20, ${0.8 - progress * 0.5})`);
      fbGrad.addColorStop(0.6, `rgba(200, 50, 0, ${0.5 - progress * 0.3})`);
      fbGrad.addColorStop(1, 'rgba(100, 20, 0, 0)');
      ctx.fillStyle = fbGrad;
      ctx.beginPath();
      ctx.arc(0, 0, fbSize, 0, Math.PI * 2);
      ctx.fill();

      // Shrapnel lines radiating outward
      const lineCount = 6;
      for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2 + e.pos.x * 0.1;
        const lineLen = e.size * (0.5 + progress * 1.5);
        const lineStart = e.size * 0.3 * progress;
        const lineAlpha = (1 - progress) * 0.4;
        ctx.strokeStyle = `rgba(255, 200, 100, ${lineAlpha})`;
        ctx.lineWidth = 1.5 - progress;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * lineStart, Math.sin(angle) * lineStart);
        ctx.lineTo(Math.cos(angle) * lineLen, Math.sin(angle) * lineLen);
        ctx.stroke();
      }
    } else {
      // Smoke ring
      const smokeSize = e.size * (1.5 + progress);
      const smokeAlpha = 0.3 * (1 - progress);
      ctx.strokeStyle = `rgba(80, 70, 60, ${smokeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, smokeSize, 0, Math.PI * 2);
      ctx.stroke();

      // Rising smoke puffs (delayed)
      if (progress > 0.5) {
        const smokeT = (progress - 0.5) / 0.5;
        for (let i = 0; i < 3; i++) {
          const sx = (i - 1) * e.size * 0.4 + Math.sin(e.pos.y + i * 2) * 3;
          const sy = -e.size * smokeT * 1.5 - i * 5;
          const sAlpha = (1 - smokeT) * 0.15;
          const sSize = e.size * 0.3 + smokeT * e.size * 0.3;
          ctx.fillStyle = `rgba(100, 90, 80, ${sAlpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Ground glow (dynamic lighting)
    if (e.stage !== 'smoke') {
      const glowAlpha = (1 - progress) * 0.15;
      const glowSize = e.size * 4;
      const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
      glowGrad.addColorStop(0, `rgba(255, 150, 30, ${glowAlpha})`);
      glowGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground heat spot
    const groundY = g.height * 0.78;
    const groundDist = groundY - e.pos.y;
    if (groundDist > 0 && groundDist < e.size * 5 && progress < 0.8) {
      const heatAlpha = (1 - progress) * 0.1;
      const heatSize = e.size * 2;
      ctx.fillStyle = `rgba(255, 120, 30, ${heatAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, groundDist, heatSize, heatSize * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ─── Power-up Icon Drawers ────────────────────────────
function drawMedkitIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white cross
  const b = s * 0.65;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-b * 0.2, -b * 0.7, b * 0.4, b * 1.4);
  ctx.fillRect(-b * 0.7, -b * 0.2, b * 1.4, b * 0.4);
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, s: number) {
  const h = s * 0.85, w = s * 0.7;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.quadraticCurveTo(w, -h * 0.6, w, -h * 0.1);
  ctx.quadraticCurveTo(w * 0.8, h * 0.6, 0, h);
  ctx.quadraticCurveTo(-w * 0.8, h * 0.6, -w, -h * 0.1);
  ctx.quadraticCurveTo(-w, -h * 0.6, 0, -h);
  ctx.closePath();
  ctx.fill();
}

function drawAmmoIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white crossed bullets
  const bh = s * 0.55, bw = s * 0.18;
  ctx.fillStyle = '#fff';
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.rotate(side * 0.4);
    ctx.beginPath();
    ctx.roundRect(-bw, -bh * 0.15, bw * 2, bh * 0.85, 1.5);
    ctx.fill();
    // Tip
    ctx.beginPath();
    ctx.moveTo(-bw * 0.7, -bh * 0.15);
    ctx.quadraticCurveTo(0, -bh, bw * 0.7, -bh * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawSlowMoIcon(ctx: CanvasRenderingContext2D, s: number, elapsed: number) {
  // Flat white clock
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  // Hour ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const inner = s * 0.55, outer = s * 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  // Hands
  const handAngle = elapsed * 0.3;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(handAngle) * s * 0.45, Math.sin(handAngle) * s * 0.45);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(handAngle * 3) * s * 0.55, Math.sin(handAngle * 3) * s * 0.55);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawMagnetIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white horseshoe magnet
  const w = s * 0.8, h = s * 0.9, t = s * 0.32;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = t;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, h * 0.35, w - t / 2, 0, Math.PI);
  ctx.stroke();
  // Poles
  ctx.fillStyle = '#fff';
  ctx.fillRect(-w, -h * 0.45, t, h * 0.8);
  ctx.fillRect(w - t, -h * 0.45, t, h * 0.8);
}

function drawAirstrikeIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white jet silhouette
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(s * 0.9, 0);
  ctx.lineTo(-s * 0.6, -s * 0.12);
  ctx.lineTo(-s * 0.9, -s * 0.1);
  ctx.lineTo(-s * 0.9, s * 0.1);
  ctx.lineTo(-s * 0.6, s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.1, -s * 0.12);
  ctx.lineTo(-s * 0.2, -s * 0.65);
  ctx.lineTo(-s * 0.5, -s * 0.65);
  ctx.lineTo(-s * 0.3, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.12);
  ctx.lineTo(-s * 0.2, s * 0.65);
  ctx.lineTo(-s * 0.5, s * 0.65);
  ctx.lineTo(-s * 0.3, s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.1);
  ctx.lineTo(-s * 0.85, -s * 0.4);
  ctx.lineTo(-s * 0.9, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, s * 0.1);
  ctx.lineTo(-s * 0.85, s * 0.4);
  ctx.lineTo(-s * 0.9, s * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawInterceptorIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white rocket
  const bw = s * 0.25, bh = s * 0.8;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.3, bw * 2, bh * 0.7, 2);
  ctx.fill();
  // Nose
  ctx.beginPath();
  ctx.moveTo(-bw, -bh * 0.3);
  ctx.quadraticCurveTo(0, -bh, bw, -bh * 0.3);
  ctx.closePath();
  ctx.fill();
  // Fins
  ctx.beginPath();
  ctx.moveTo(-bw, bh * 0.35);
  ctx.lineTo(-bw * 2.2, bh * 0.55);
  ctx.lineTo(-bw, bh * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bw, bh * 0.35);
  ctx.lineTo(bw * 2.2, bh * 0.55);
  ctx.lineTo(bw, bh * 0.15);
  ctx.closePath();
  ctx.fill();
}

function drawExtinguisherIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white extinguisher
  const bw = s * 0.3, bh = s * 0.75;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.4, bw * 2, bh, 3);
  ctx.fill();
  // Nozzle
  ctx.fillRect(-bw * 0.3, -bh * 0.55, bw * 0.6, bh * 0.2);
  // Handle
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bw * 0.3, -bh * 0.4);
  ctx.quadraticCurveTo(bw * 1.2, -bh * 0.6, bw * 0.8, -bh * 0.2);
  ctx.stroke();
}

function drawGasMaskIcon(ctx: CanvasRenderingContext2D, s: number) {
  ctx.save();
  // Face backing
  ctx.fillStyle = '#d4a574';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.4, s * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye lenses (glass with reflection)
  const eR = s * 0.17;
  const eX = s * 0.25;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#2d3436';
    ctx.beginPath(); ctx.arc(side * eX, -s * 0.08, eR + 1, 0, Math.PI * 2); ctx.fill();
    const lg = ctx.createRadialGradient(side * eX - 1, -s * 0.12, 1, side * eX, -s * 0.08, eR);
    lg.addColorStop(0, 'rgba(200,220,240,0.8)');
    lg.addColorStop(0.5, 'rgba(100,140,180,0.6)');
    lg.addColorStop(1, 'rgba(20,60,100,0.7)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(side * eX, -s * 0.08, eR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(side * eX - 3 * side, -s * 0.14, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // Nose bridge
  ctx.fillStyle = '#1a7d2e';
  ctx.fillRect(-s * 0.08, s * 0.04, s * 0.16, s * 0.1);
  // Head straps
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(-eX, -s * 0.08, s * 0.42, -0.3, 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(eX, -s * 0.08, s * 0.42, Math.PI - 0.3, Math.PI + 0.3);
  ctx.stroke();
  // Filter canister (right)
  const cX = s * 0.4, cY = s * 0.06;
  const cGrad = ctx.createLinearGradient(cX - 6, cY - 8, cX + 6, cY + 8);
  cGrad.addColorStop(0, '#4a6a4a');
  cGrad.addColorStop(1, '#2d4a2d');
  ctx.fillStyle = cGrad;
  ctx.beginPath();
  ctx.ellipse(cX, cY, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(cX, cY - 8.5, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Connection tube
  ctx.strokeStyle = '#3d5a3d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(eX + 5, s * 0.06);
  ctx.quadraticCurveTo(s * 0.3, s * 0.12, cX - 6, cY);
  ctx.stroke();
  ctx.restore();
}

function drawFireSuitIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Firefighter helmet + silhouette suit
  const hw = s * 0.55, hh = s * 0.35;
  // Helmet dome
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.25, hw, hh, 0, Math.PI, 0);
  ctx.fill();
  // Helmet brim
  ctx.fillRect(-hw * 1.1, -s * 0.2, hw * 2.2, hh * 0.35);
  // Face shield (dark visor)
  ctx.fillStyle = 'rgba(30,30,40,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.15, hw * 0.75, hh * 0.45, 0, Math.PI, 0);
  ctx.fill();
  // Body silhouette
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(-hw * 0.7, s * 0.05, hw * 1.4, s * 0.55, 2);
  ctx.fill();
  // Yellow reflective stripe across chest
  ctx.fillStyle = 'rgba(251,191,36,0.9)';
  ctx.fillRect(-hw * 0.65, s * 0.2, hw * 1.3, s * 0.08);
  // Small flame icon on chest
  ctx.fillStyle = 'rgba(220,38,38,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.12, s * 0.42, -s * 0.06, s * 0.55, 0, s * 0.52);
  ctx.bezierCurveTo(s * 0.06, s * 0.55, s * 0.12, s * 0.42, 0, s * 0.35);
  ctx.closePath();
  ctx.fill();
}

// ─── Fire Pools ────────────────────────────────────────
function renderFirePools(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const fp of g.firePools) {
    const alpha = Math.min(1, fp.life / (fp.maxLife * 0.3));
    ctx.save();
    ctx.translate(fp.pos.x, fp.pos.y);

    // Ground scorch
    ctx.fillStyle = `rgba(80, 30, 0, ${alpha * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, fp.size, fp.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base glow
    const glowGrad = ctx.createRadialGradient(0, -5, 0, 0, -5, fp.size);
    glowGrad.addColorStop(0, `rgba(255, 120, 0, ${alpha * 0.3})`);
    glowGrad.addColorStop(0.5, `rgba(255, 60, 0, ${alpha * 0.15})`);
    glowGrad.addColorStop(1, 'rgba(255, 30, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, -5, fp.size, 0, Math.PI * 2);
    ctx.fill();

    // Animated flame tongues
    const t = g.elapsed;
    const flameCount = 6;
    for (let i = 0; i < flameCount; i++) {
      const fx = (i / flameCount - 0.5) * fp.size * 1.5;
      const flameH = (15 + Math.sin(t * 8 + i * 2.3) * 8 + Math.cos(t * 12 + i * 3.7) * 4) * alpha;
      const flameW = 4 + Math.sin(t * 6 + i * 1.7) * 2;
      // Outer flame — orange
      ctx.fillStyle = `rgba(249, 115, 22, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(fx - flameW, 0);
      ctx.quadraticCurveTo(fx - flameW * 0.5, -flameH * 0.6, fx, -flameH);
      ctx.quadraticCurveTo(fx + flameW * 0.5, -flameH * 0.6, fx + flameW, 0);
      ctx.fill();
      // Inner flame — yellow
      ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(fx - flameW * 0.5, 0);
      ctx.quadraticCurveTo(fx, -flameH * 0.7, fx + flameW * 0.5, 0);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ─── Gas Clouds ────────────────────────────────────────
function renderGasClouds(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const gc of g.gasClouds) {
    const alpha = Math.min(1, gc.life / (gc.maxLife * 0.3));
    ctx.save();
    ctx.translate(gc.pos.x, gc.pos.y);

    // Main cloud — pulsating green
    const pulse = 1 + Math.sin(g.elapsed * 3) * 0.1;
    const cloudGrad = ctx.createRadialGradient(0, -gc.size * 0.2, 0, 0, -gc.size * 0.2, gc.size * pulse);
    cloudGrad.addColorStop(0, `rgba(22, 163, 74, ${alpha * 0.25})`);
    cloudGrad.addColorStop(0.4, `rgba(21, 128, 61, ${alpha * 0.15})`);
    cloudGrad.addColorStop(0.7, `rgba(20, 83, 45, ${alpha * 0.08})`);
    cloudGrad.addColorStop(1, 'rgba(20, 83, 45, 0)');
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(0, -gc.size * 0.2, gc.size * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Secondary cloud blobs
    for (let i = 0; i < 4; i++) {
      const bx = Math.sin(g.elapsed * 1.5 + i * 1.8) * gc.size * 0.4;
      const by = -gc.size * 0.1 + Math.cos(g.elapsed * 1.2 + i * 2.1) * gc.size * 0.2;
      const br = gc.size * (0.3 + Math.sin(g.elapsed * 2 + i) * 0.1);
      ctx.fillStyle = `rgba(22, 163, 74, ${alpha * 0.12})`;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rising toxic particles
    for (let i = 0; i < 5; i++) {
      const phase = (g.elapsed * 0.8 + i * 0.7) % 2;
      const py = -phase * gc.size * 0.8;
      const px = Math.sin(g.elapsed * 2 + i * 1.5) * gc.size * 0.3;
      const pAlpha = alpha * (1 - phase / 2) * 0.4;
      const pSize = 2 + phase * 2;
      ctx.fillStyle = `rgba(74, 222, 128, ${pAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // ☣ symbol in center (faint)
    ctx.fillStyle = `rgba(74, 222, 128, ${alpha * 0.2})`;
    ctx.font = `${gc.size * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☣', 0, -gc.size * 0.15);

    ctx.restore();
  }
}

// ─── Power-ups ────────────────────────────────────────
function renderPowerUps(ctx: CanvasRenderingContext2D, g: GameData) {
  const puColors: Record<string, { base: string; light: string; dark: string }> = {
    medkit:       { base: '#22c55e', light: '#4ade80', dark: '#15803d' },
    shield:       { base: '#60a5fa', light: '#93c5fd', dark: '#2563eb' },
    ammo:         { base: '#4a5c2a', light: '#6b7d3a', dark: '#2d3a1a' },
    slowmo:       { base: '#06b6d4', light: '#22d3ee', dark: '#0e7490' },
    magnet:       { base: '#b91c1c', light: '#ef4444', dark: '#7f1d1d' },
    airstrike:    { base: '#fbbf24', light: '#fcd34d', dark: '#b45309' },
    interceptor:  { base: '#f97316', light: '#fb923c', dark: '#c2410c' },
    extinguisher: { base: '#dc2626', light: '#ef4444', dark: '#991b1b' },
    gasmask:      { base: '#16a34a', light: '#4ade80', dark: '#14532d' },
    firesuit:     { base: '#f97316', light: '#fb923c', dark: '#9a3412' },
    water:        { base: '#0ea5e9', light: '#38bdf8', dark: '#0284c7' },
  };

  for (const pu of g.powerUps) {
    if (!pu.active) continue;

    let fadeAlpha = 1;
    if (!pu.parachuting) {
      const maxGroundTime = Math.max(1.5, 3 - (g.difficulty - 1) * 0.3);
      const remaining = maxGroundTime - pu.groundTimer;
      if (remaining < 1.5) {
        fadeAlpha = remaining < 0.8 ? (Math.sin(g.elapsed * 16) * 0.5 + 0.5) : 0.6 + remaining * 0.27;
      }
    }

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // Power-up ground shadow
    const groundY = g.height * 0.78;
    const shadowY = groundY - pu.pos.y;
    if (shadowY > 0 && pu.parachuting) {
      const sShrink = Math.max(0.3, 1 - shadowY * 0.003);
      ctx.fillStyle = `rgba(0,0,0,${0.1 * sShrink})`;
      ctx.beginPath();
      ctx.ellipse(pu.pos.x, groundY, 10 * sShrink, 3 * sShrink, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(pu.pos.x, pu.pos.y);
    const bob = Math.sin(pu.bobTimer * 3) * 3;
    ctx.translate(0, bob);

    const cols = puColors[pu.type] || puColors.medkit;

    // ── Cinematic 3D Parachute (redesigned) ──
    if (pu.parachuting) {
      const cW = 38, cH = 26;
      const cY = -38;
      const panels = 12; // more panels = smoother dome
      // Multi-harmonic sway driven by wind — feels alive rather than sinusoidal
      const t = pu.bobTimer;
      const wind = Math.sin(g.elapsed * 0.7 + pu.pos.x * 0.002) * 0.04;
      const sway = Math.sin(t * 1.8) * 0.07 + Math.cos(t * 1.1) * 0.03 + wind;
      const tilt = Math.sin(t * 0.9) * 0.05; // secondary X-tilt
      const breathe = Math.sin(t * 2.2) * 1.4;
      const baseBillow = Math.sin(t * 3.5) * 1.6 + breathe;

      // Drop shadow on ground aligned with parachute (world space)
      // (Already handled by the shadow block above; nothing to do here.)

      ctx.save();
      ctx.rotate(sway);

      // ── Back-lit halo — one wide soft pool behind the canopy ──
      const haloGrad = ctx.createRadialGradient(0, cY + 2, 0, 0, cY + 2, cW * 1.25);
      haloGrad.addColorStop(0, 'rgba(255,245,220,0.14)');
      haloGrad.addColorStop(0.55, 'rgba(255,220,180,0.05)');
      haloGrad.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.ellipse(0, cY + 2, cW * 1.2, cH * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pick dominant RGB once
      let baseR: number, baseG: number, baseB: number;
      if (pu.type === 'ammo') {
        baseR = 74; baseG = 92; baseB = 42; // olive drab
      } else {
        baseR = parseInt(cols.base.slice(1, 3), 16);
        baseG = parseInt(cols.base.slice(3, 5), 16);
        baseB = parseInt(cols.base.slice(5, 7), 16);
      }
      // Camo palette built once for ammo parachutes
      const camoPalette = [
        [74, 92, 42], [107, 125, 58], [139, 125, 90],
        [92, 74, 42], [61, 74, 42], [122, 107, 58],
        [90, 107, 58], [107, 90, 42], [77, 90, 48], [94, 107, 56],
      ];

      // ── Panels with proper 3D shading using view-space light direction ──
      for (let i = 0; i < panels; i++) {
        const startA = Math.PI + (i / panels) * Math.PI;
        const endA = Math.PI + ((i + 1) / panels) * Math.PI;
        const midA = (startA + endA) / 2;

        // Lambert-ish lighting: light comes from upper-left, dot with panel normal
        const nx = Math.cos(midA);
        const ny = Math.sin(midA);
        const lightX = -0.45, lightY = -0.9;
        const lambert = Math.max(0, nx * lightX + ny * lightY); // 0..1
        // Add a subtle fake ambient occlusion near the seam centres
        const ao = Math.pow(Math.abs(Math.sin(midA)), 1.4) * 0.2;
        const lightFactor = Math.max(0, lambert - ao);

        // Per-panel billow makes the canopy feel inflated
        const panelBillow = baseBillow + Math.sin(t * 4.2 + i * 0.7) * 0.85;
        const effH = cH + panelBillow;

        const x1 = Math.cos(startA) * cW;
        const y1 = Math.sin(startA) * effH + cY + panelBillow * 0.3;
        const x2 = Math.cos(endA) * cW;
        const y2 = Math.sin(endA) * effH + cY + panelBillow * 0.3;
        const bulgeX = Math.cos(midA) * (cW + 4 + panelBillow * 0.6);
        const bulgeY = Math.sin(midA) * (effH + 5 + panelBillow * 0.5) + cY + panelBillow * 0.3;

        // Panel base colour
        let pR = baseR, pG = baseG, pB = baseB;
        if (pu.type === 'ammo') {
          const cc = camoPalette[i % camoPalette.length];
          pR = cc[0]; pG = cc[1]; pB = cc[2];
        }

        // 3-stop gradient from highlight through base to shadow
        const hiR = Math.min(255, pR + lightFactor * 95);
        const hiG = Math.min(255, pG + lightFactor * 95);
        const hiB = Math.min(255, pB + lightFactor * 95);
        const midR = Math.min(255, pR + lightFactor * 45);
        const midG = Math.min(255, pG + lightFactor * 45);
        const midB = Math.min(255, pB + lightFactor * 45);
        const shR = Math.max(0, pR - 55);
        const shG = Math.max(0, pG - 55);
        const shB = Math.max(0, pB - 55);

        const panelGrad = ctx.createLinearGradient(bulgeX, bulgeY - 8, bulgeX, Math.max(y1, y2));
        panelGrad.addColorStop(0, `rgb(${Math.round(hiR)},${Math.round(hiG)},${Math.round(hiB)})`);
        panelGrad.addColorStop(0.5, `rgb(${Math.round(midR)},${Math.round(midG)},${Math.round(midB)})`);
        panelGrad.addColorStop(1, `rgb(${shR},${shG},${shB})`);

        // Fresnel — edges fade slightly so the dome looks rounded
        const edgeDist = Math.abs(i - panels / 2) / (panels / 2);
        const fresnelAlpha = 0.92 - edgeDist * 0.18;
        ctx.globalAlpha = fadeAlpha * fresnelAlpha;
        ctx.fillStyle = panelGrad;

        ctx.beginPath();
        ctx.moveTo(0, cY); // apex
        ctx.lineTo(x1, y1);
        ctx.quadraticCurveTo(bulgeX, bulgeY, x2, y2);
        ctx.closePath();
        ctx.fill();

        // Stitched seam along panel edges (darker)
        ctx.globalAlpha = fadeAlpha * 0.18;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.moveTo(0, cY);
        ctx.quadraticCurveTo(bulgeX * 0.5, (cY + bulgeY) * 0.5, x2, y2);
        ctx.stroke();
      }

      ctx.globalAlpha = fadeAlpha;

      // ── Apex reinforcement patch + vent ──
      const apexGrad = ctx.createRadialGradient(0, cY, 0, 0, cY, 6);
      apexGrad.addColorStop(0, 'rgba(20,20,20,0.55)');
      apexGrad.addColorStop(0.7, 'rgba(20,20,20,0.2)');
      apexGrad.addColorStop(1, 'rgba(20,20,20,0)');
      ctx.fillStyle = apexGrad;
      ctx.beginPath();
      ctx.arc(0, cY, 6, 0, Math.PI * 2);
      ctx.fill();
      // Vent hole
      ctx.fillStyle = 'rgba(5,8,15,0.75)';
      ctx.beginPath();
      ctx.arc(0, cY - 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // Rim of vent
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // ── Wavy bottom hem with per-panel billow ──
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= panels * 5; i++) {
        const tt = i / (panels * 5);
        const a = Math.PI + tt * Math.PI;
        const pIdx = Math.floor(tt * panels);
        const pBillow = baseBillow + Math.sin(t * 4.2 + pIdx * 0.7) * 0.85;
        const effH = cH + pBillow;
        const ex = Math.cos(a) * cW;
        const ey = Math.sin(a) * effH + cY + pBillow * 0.3;
        const wave = Math.sin(i * 2 + t * 5) * 0.7;
        if (i === 0) ctx.moveTo(ex, ey + wave);
        else ctx.lineTo(ex, ey + wave);
      }
      ctx.stroke();

      // Inner dark line just above the hem for depth
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i <= panels * 5; i++) {
        const tt = i / (panels * 5);
        const a = Math.PI + tt * Math.PI;
        const pIdx = Math.floor(tt * panels);
        const pBillow = baseBillow + Math.sin(t * 4.2 + pIdx * 0.7) * 0.85;
        const effH = cH * 0.95 + pBillow;
        const ex = Math.cos(a) * cW * 0.97;
        const ey = Math.sin(a) * effH + cY + pBillow * 0.3;
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.stroke();

      // ── Moving specular highlight (two swept beams) ──
      const specOffX = -cW * 0.25 + sway * cW * 3;
      const specGrad = ctx.createRadialGradient(
        specOffX, cY - cH * 0.35, 0,
        specOffX, cY - cH * 0.35, cW * 0.55
      );
      specGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      specGrad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.ellipse(specOffX, cY - cH * 0.12, cW * 0.45, cH * 0.4, -0.18 + sway, 0, Math.PI * 2);
      ctx.fill();

      const spec2X = cW * 0.28 + sway * cW;
      const spec2Grad = ctx.createRadialGradient(spec2X, cY - cH * 0.18, 0, spec2X, cY - cH * 0.18, cW * 0.22);
      spec2Grad.addColorStop(0, 'rgba(255,255,255,0.26)');
      spec2Grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec2Grad;
      ctx.beginPath();
      ctx.ellipse(spec2X, cY - cH * 0.08, cW * 0.2, cH * 0.18, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // ── Inner shadow under canopy (deeper) ──
      const shadowGrad = ctx.createLinearGradient(0, cY, 0, cY + cH * 0.9);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
      shadowGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, cY + 5, cW * 0.85, cH * 0.4, 0, 0, Math.PI);
      ctx.fill();

      // ── 10 Suspension lines with realistic catenary curve + wind sway ──
      const numLines = 10;
      for (let li = 0; li < numLines; li++) {
        const frac = -0.95 + (li / (numLines - 1)) * 1.9; // -0.95 .. 0.95
        const a = Math.PI + (frac + 1) * 0.5 * Math.PI;
        const pIdx = Math.floor((frac + 1) * 0.5 * panels);
        const pBillow = baseBillow + Math.sin(t * 4.2 + pIdx * 0.7) * 0.85;
        const effH = cH + pBillow;
        const sx = Math.cos(a) * cW;
        const sy = Math.sin(a) * effH + cY + pBillow * 0.3;
        // Independent wind per line
        const lineWind = Math.sin(t * 3.5 + li * 1.2) * 0.9 + tilt * 4;
        // Attach slightly inside on top of the crate
        const atX = frac * 3 + lineWind * 0.3;
        const atY = -4;

        // Bezier with belly sag for a natural catenary look
        const bellyY = (sy + atY) * 0.5 + 6 + Math.abs(frac) * 2;

        // Dark core
        ctx.strokeStyle = 'rgba(40,38,32,0.55)';
        ctx.lineWidth = 1.0 - Math.abs(frac) * 0.15;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(
          sx * 0.75 + lineWind, bellyY - 2,
          atX * 1.6 + lineWind * 0.5, bellyY + 2,
          atX, atY
        );
        ctx.stroke();

        // Highlight strand
        ctx.strokeStyle = 'rgba(220,215,200,0.55)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(sx - 0.2, sy - 0.1);
        ctx.bezierCurveTo(
          sx * 0.75 + lineWind - 0.2, bellyY - 2,
          atX * 1.6 + lineWind * 0.5 - 0.2, bellyY + 2,
          atX - 0.2, atY - 0.1
        );
        ctx.stroke();

        // Attachment point (dark dot)
        ctx.fillStyle = 'rgba(80,75,65,0.9)';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Risers merging above the crate (two thick lines) ──
      ctx.strokeStyle = 'rgba(40,38,32,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.lineTo(-1.2, -1);
      ctx.moveTo(3, -4);
      ctx.lineTo(1.2, -1);
      ctx.stroke();

      // ── Shadow cast on the crate by the canopy ──
      const crateShadowGrad = ctx.createRadialGradient(sway * 10, -6, 1, sway * 10, -6, 16);
      crateShadowGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
      crateShadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = crateShadowGrad;
      ctx.beginPath();
      ctx.ellipse(sway * 10, -5, 14, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── Pulse ring ──
    const pulsePhase = (g.elapsed * 2 + pu.bobTimer) % 1;
    const pulseR = pu.size * 1.5 + pulsePhase * pu.size * 1.5;
    ctx.strokeStyle = `${cols.base}`;
    ctx.globalAlpha = fadeAlpha * (1 - pulsePhase) * 0.35;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fadeAlpha;

    // ── Outer glow ──
    const glowGrad = ctx.createRadialGradient(0, 0, pu.size * 0.3, 0, 0, pu.size * 2.8);
    glowGrad.addColorStop(0, `${cols.base}40`);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, pu.size * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // ── Item background ──
    if (pu.type === 'ammo') {
      // Military ammo crate
      const crW = pu.size * 1.3, crH = pu.size * 1.0;
      // Main crate body
      const crateGrad = ctx.createLinearGradient(0, -crH, 0, crH);
      crateGrad.addColorStop(0, '#5a6b30');
      crateGrad.addColorStop(0.5, '#3d4a1e');
      crateGrad.addColorStop(1, '#2d3a14');
      ctx.fillStyle = crateGrad;
      ctx.beginPath();
      ctx.roundRect(-crW, -crH, crW * 2, crH * 2, 3);
      ctx.fill();
      // Metal edges
      ctx.strokeStyle = '#8a8a6a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-crW, -crH, crW * 2, crH * 2);
      // Corner reinforcements
      const cornerSize = 4;
      ctx.fillStyle = '#6a6a5a';
      [[-crW, -crH], [crW - cornerSize, -crH], [-crW, crH - cornerSize], [crW - cornerSize, crH - cornerSize]].forEach(([cx, cy]) => {
        ctx.fillRect(cx, cy, cornerSize, cornerSize);
      });
      // Handle on top
      ctx.strokeStyle = '#9a9a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-crW * 0.35, -crH);
      ctx.quadraticCurveTo(0, -crH - 5, crW * 0.35, -crH);
      ctx.stroke();
      // Front latch
      ctx.fillStyle = '#aaa080';
      ctx.fillRect(-2, crH * 0.3, 4, 5);
      ctx.fillStyle = '#c0b890';
      ctx.fillRect(-1.5, crH * 0.35, 3, 2);
      // Horizontal strap
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-crW, 0);
      ctx.lineTo(crW, 0);
      ctx.stroke();
      // Star marking
      ctx.fillStyle = 'rgba(200,200,180,0.3)';
      ctx.beginPath();
      const sR = crH * 0.35;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * sR, Math.sin(a) * sR - 1);
        ctx.lineTo(Math.cos(a2) * sR * 0.4, Math.sin(a2) * sR * 0.4 - 1);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Default circle for other power-ups
      const bgGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, pu.size);
      bgGrad.addColorStop(0, cols.light);
      bgGrad.addColorStop(0.7, cols.base);
      bgGrad.addColorStop(1, cols.dark);
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(0, 0, pu.size, 0, Math.PI * 2);
      ctx.fill();

      // Glossy highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.ellipse(-pu.size * 0.2, -pu.size * 0.3, pu.size * 0.5, pu.size * 0.3, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border ring — enhanced for magnet visibility
    if (pu.type === 'magnet') {
      // Extra contrast border for magnet
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, pu.size + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, pu.size, 0, Math.PI * 2);
      ctx.stroke();
      // Magnetic field glow — alternating red/blue
      const magnetPulse = 0.35 + Math.sin(g.elapsed * 5) * 0.25;
      const magnetHue = Math.sin(g.elapsed * 3) > 0 ? '220,60,60' : '60,60,220';
      ctx.strokeStyle = `rgba(${magnetHue},${magnetPulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, pu.size * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, pu.size, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Draw icon (hand-drawn, no Unicode) ──
    ctx.save();
    const iconScale = pu.size * 0.85;
    if (pu.type === 'medkit') drawMedkitIcon(ctx, iconScale);
    else if (pu.type === 'shield') drawShieldIcon(ctx, iconScale);
    else if (pu.type === 'ammo') drawAmmoIcon(ctx, iconScale);
    else if (pu.type === 'slowmo') drawSlowMoIcon(ctx, iconScale, g.elapsed);
    else if (pu.type === 'magnet') drawMagnetIcon(ctx, iconScale);
    else if (pu.type === 'airstrike') drawAirstrikeIcon(ctx, iconScale);
    else if (pu.type === 'interceptor') drawInterceptorIcon(ctx, iconScale);
    else if (pu.type === 'extinguisher') drawExtinguisherIcon(ctx, iconScale);
    else if (pu.type === 'gasmask') drawGasMaskIcon(ctx, iconScale);
    else if (pu.type === 'firesuit') drawFireSuitIcon(ctx, iconScale);
    else if (pu.type === 'water') drawWaterIcon(ctx, iconScale);
    ctx.restore();

    // ── Sparkles ──
    for (let i = 0; i < 3; i++) {
      const sparkA = g.elapsed * 1.5 + i * (Math.PI * 2 / 3);
      const sparkR = pu.size * 1.3 + Math.sin(g.elapsed * 3 + i) * 3;
      const sx = Math.cos(sparkA) * sparkR;
      const sy = Math.sin(sparkA) * sparkR;
      const sparkAlpha = 0.4 + Math.sin(g.elapsed * 5 + i * 2) * 0.3;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = fadeAlpha * sparkAlpha;
      // 4-point star sparkle
      ctx.beginPath();
      const ss = 1.5;
      ctx.moveTo(sx, sy - ss * 2);
      ctx.lineTo(sx + ss * 0.5, sy - ss * 0.5);
      ctx.lineTo(sx + ss * 2, sy);
      ctx.lineTo(sx + ss * 0.5, sy + ss * 0.5);
      ctx.lineTo(sx, sy + ss * 2);
      ctx.lineTo(sx - ss * 0.5, sy + ss * 0.5);
      ctx.lineTo(sx - ss * 2, sy);
      ctx.lineTo(sx - ss * 0.5, sy - ss * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}

// ─── Drones ───────────────────────────────────────────
function renderDrones(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const d of g.drones) {
    if (!d.active) continue;
    ctx.save();
    ctx.translate(d.pos.x, d.pos.y);

    const groundY = g.height * 0.78;
    // Smoothed facing value in [-1..1]. Fall back to instantaneous velocity
    // sign for drones that haven't been through the engine update yet.
    const facing = d.facingLerp ?? (d.vel.x >= 0 ? 1 : -1);
    const facingRight = facing >= 0;
    // Banking squash during the turn — width shrinks toward 0 as we cross
    const bankScale = Math.max(0.2, Math.abs(facing));
    const tilt = Math.sin(d.wobble * 2) * 0.05;
    const damaged = d.health < d.maxHealth;
    // Add a subtle bank-roll when turning hard (1 - |facing|) maps to 0 at rest
    const bankRoll = (1 - Math.abs(facing)) * 0.25 * (facingRight ? 1 : -1);
    // Extra wobble when damaged
    const damageTilt = damaged ? Math.sin(d.wobble * 8) * 0.08 : 0;
    ctx.rotate(tilt + damageTilt + bankRoll);
    // Apply horizontal squash for the banking turn (looks like the drone is
    // rotating away from the camera). Only affects X — Y stays identical.
    ctx.scale(bankScale, 1);

    // ═══ CARGO DRONE — C-130 MILITARY TRANSPORT ═══
    if (d.tier === 'cargo') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      const tt = g.elapsed;

      // ── 4 Ropes hanging to crate ──
      ctx.strokeStyle = '#7a6545';
      ctx.lineWidth = 1.2;
      const crateY = sz * 2.0;
      const crateW = sz * 0.8;
      const crateH = sz * 0.55;
      for (const rx of [-0.25, -0.08, 0.08, 0.25]) {
        const sway = Math.sin(tt * 2 + rx * 10) * 1.5;
        ctx.beginPath();
        ctx.moveTo(rx * sz * 1.5, sz * 0.35);
        ctx.quadraticCurveTo(rx * sz * 1.2 + sway, crateY * 0.55, rx * sz * 2.2, crateY - crateH / 2);
        ctx.stroke();
      }

      // ── 3D Crate — two visible faces ──
      const cxOff = sz * 0.08;
      const cyOff = -sz * 0.06;
      // Side face
      const sideGrad = ctx.createLinearGradient(-crateW / 2 + cxOff, crateY, crateW / 2 + cxOff, crateY);
      sideGrad.addColorStop(0, '#b8860b');
      sideGrad.addColorStop(1, '#8b6914');
      ctx.fillStyle = sideGrad;
      ctx.beginPath();
      ctx.moveTo(-crateW / 2, crateY - crateH / 2);
      ctx.lineTo(-crateW / 2 + cxOff, crateY - crateH / 2 + cyOff);
      ctx.lineTo(crateW / 2 + cxOff, crateY - crateH / 2 + cyOff);
      ctx.lineTo(crateW / 2 + cxOff, crateY + crateH / 2 + cyOff);
      ctx.lineTo(crateW / 2, crateY + crateH / 2);
      ctx.lineTo(crateW / 2, crateY - crateH / 2);
      ctx.closePath();
      ctx.fill();
      // Front face
      const frontGrad = ctx.createLinearGradient(0, crateY - crateH / 2, 0, crateY + crateH / 2);
      frontGrad.addColorStop(0, '#daa520');
      frontGrad.addColorStop(0.5, '#c49315');
      frontGrad.addColorStop(1, '#a07b10');
      ctx.fillStyle = frontGrad;
      ctx.fillRect(-crateW / 2, crateY - crateH / 2, crateW, crateH);
      ctx.strokeStyle = '#6b4c0a';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-crateW / 2, crateY - crateH / 2, crateW, crateH);
      // Horizontal straps
      ctx.strokeStyle = '#5a4008';
      ctx.lineWidth = 1.8;
      for (const sy of [-0.15, 0.15]) {
        ctx.beginPath();
        ctx.moveTo(-crateW / 2, crateY + crateH * sy);
        ctx.lineTo(crateW / 2, crateY + crateH * sy);
        ctx.stroke();
      }
      // Strap buckle
      ctx.fillStyle = '#888';
      ctx.fillRect(-2, crateY - 2, 4, 4);

      // ── Fuselage — C-130 rounded cylinder ──
      ctx.save();
      ctx.scale(dir, 1);

      const fuseLen = sz * 2.4;
      const fuseH = sz * 0.42;

      // Body shadow underneath
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, fuseH * 0.9, fuseLen * 0.7, fuseH * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main fuselage — cylindrical gradient
      const fuseGrad = ctx.createLinearGradient(0, -fuseH * 1.2, 0, fuseH * 1.2);
      fuseGrad.addColorStop(0, '#7a8a6a');
      fuseGrad.addColorStop(0.15, '#8fa07a');
      fuseGrad.addColorStop(0.3, '#6b7a5d');
      fuseGrad.addColorStop(0.6, '#556a48');
      fuseGrad.addColorStop(0.85, '#3d4a35');
      fuseGrad.addColorStop(1, '#2d3628');
      ctx.fillStyle = fuseGrad;
      ctx.beginPath();
      // Nose — rounded
      ctx.moveTo(fuseLen * 0.5, 0);
      ctx.bezierCurveTo(fuseLen * 0.5, -fuseH * 0.7, fuseLen * 0.42, -fuseH, fuseLen * 0.3, -fuseH);
      // Top
      ctx.lineTo(-fuseLen * 0.35, -fuseH);
      // Tail — upswept
      ctx.bezierCurveTo(-fuseLen * 0.5, -fuseH, -fuseLen * 0.55, -fuseH * 1.3, -fuseLen * 0.55, -fuseH * 1.5);
      // Back
      ctx.lineTo(-fuseLen * 0.55, fuseH * 0.5);
      // Bottom
      ctx.lineTo(-fuseLen * 0.35, fuseH);
      ctx.lineTo(fuseLen * 0.3, fuseH);
      // Nose bottom
      ctx.bezierCurveTo(fuseLen * 0.42, fuseH, fuseLen * 0.5, fuseH * 0.7, fuseLen * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,40,27,0.5)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Panel lines on fuselage
      ctx.strokeStyle = 'rgba(20,30,15,0.2)';
      ctx.lineWidth = 0.4;
      for (const plx of [-0.2, 0, 0.15]) {
        ctx.beginPath();
        ctx.moveTo(fuseLen * plx, -fuseH * 0.95);
        ctx.lineTo(fuseLen * plx, fuseH * 0.95);
        ctx.stroke();
      }

      // Top specular
      const fuseSpec = ctx.createLinearGradient(0, -fuseH * 1.1, 0, -fuseH * 0.3);
      fuseSpec.addColorStop(0, 'rgba(255,255,255,0)');
      fuseSpec.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      fuseSpec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fuseSpec;
      ctx.fillRect(-fuseLen * 0.4, -fuseH, fuseLen * 0.85, fuseH * 0.4);

      // ── Cockpit windows ──
      ctx.fillStyle = 'rgba(100,180,255,0.7)';
      ctx.shadowColor = 'rgba(100,180,255,0.4)';
      ctx.shadowBlur = 4;
      for (let wi = 0; wi < 3; wi++) {
        const wx = fuseLen * 0.35 - wi * sz * 0.12;
        const wy = -fuseH * 0.65;
        ctx.fillRect(wx, wy, sz * 0.08, sz * 0.06);
      }
      ctx.shadowBlur = 0;

      // ── Wings — wide straight (transport style) ──
      const wingSpan = sz * 1.5;
      const wingW = sz * 0.4;
      const wingGrad = ctx.createLinearGradient(0, -wingSpan, 0, wingSpan);
      wingGrad.addColorStop(0, '#4a5a3e');
      wingGrad.addColorStop(0.5, '#5a6a4e');
      wingGrad.addColorStop(1, '#3d4a35');
      ctx.fillStyle = wingGrad;
      // Top wing
      ctx.beginPath();
      ctx.moveTo(fuseLen * 0.05, -fuseH);
      ctx.lineTo(-fuseLen * 0.15, -fuseH);
      ctx.lineTo(-fuseLen * 0.25, -wingSpan);
      ctx.lineTo(fuseLen * 0.05 - wingW * 0.3, -wingSpan);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,40,27,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Bottom wing
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.moveTo(fuseLen * 0.05, fuseH);
      ctx.lineTo(-fuseLen * 0.15, fuseH);
      ctx.lineTo(-fuseLen * 0.25, wingSpan);
      ctx.lineTo(fuseLen * 0.05 - wingW * 0.3, wingSpan);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // ── 4 Engines on pylons ──
      const enginePositions = [
        { ey: -wingSpan * 0.35, px: -fuseLen * 0.08 },
        { ey: -wingSpan * 0.7, px: -fuseLen * 0.15 },
        { ey: wingSpan * 0.35, px: -fuseLen * 0.08 },
        { ey: wingSpan * 0.7, px: -fuseLen * 0.15 },
      ];
      for (const eng of enginePositions) {
        // Pylon
        ctx.strokeStyle = '#4a5a3e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(eng.px + fuseLen * 0.05, eng.ey > 0 ? fuseH : -fuseH);
        ctx.lineTo(eng.px, eng.ey);
        ctx.stroke();

        // Nacelle
        const nGrad = ctx.createLinearGradient(eng.px - 5, eng.ey - 4, eng.px + 5, eng.ey + 4);
        nGrad.addColorStop(0, '#6a6a6a');
        nGrad.addColorStop(0.5, '#555');
        nGrad.addColorStop(1, '#3a3a3a');
        ctx.fillStyle = nGrad;
        ctx.beginPath();
        ctx.ellipse(eng.px, eng.ey, sz * 0.12, sz * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Propeller disc (spinning)
        ctx.strokeStyle = 'rgba(200,200,200,0.25)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(eng.px + sz * 0.1, eng.ey, sz * 0.06, 0, Math.PI * 2);
        ctx.stroke();
        // Prop blur
        ctx.fillStyle = 'rgba(200,200,200,0.08)';
        ctx.beginPath();
        ctx.arc(eng.px + sz * 0.1, eng.ey, sz * 0.06, 0, Math.PI * 2);
        ctx.fill();

        // Exhaust
        const exLen = 4 + Math.random() * 3;
        ctx.fillStyle = `rgba(100,180,255,${0.15 + Math.random() * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(eng.px - sz * 0.12, eng.ey - 1.5);
        ctx.lineTo(eng.px - sz * 0.12 - exLen, eng.ey);
        ctx.lineTo(eng.px - sz * 0.12, eng.ey + 1.5);
        ctx.fill();
      }

      // ── T-tail — vertical fin + horizontal stabilizers ──
      // Vertical fin
      const tailGrad = ctx.createLinearGradient(-fuseLen * 0.55, -fuseH * 1.5, -fuseLen * 0.55, -fuseH * 3);
      tailGrad.addColorStop(0, '#5a6a4e');
      tailGrad.addColorStop(1, '#3d4a35');
      ctx.fillStyle = tailGrad;
      ctx.beginPath();
      ctx.moveTo(-fuseLen * 0.5, -fuseH * 1.2);
      ctx.lineTo(-fuseLen * 0.55, -fuseH * 2.8);
      ctx.lineTo(-fuseLen * 0.62, -fuseH * 2.8);
      ctx.lineTo(-fuseLen * 0.58, -fuseH * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,40,27,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Horizontal stabilizers (at top of vertical fin)
      ctx.fillStyle = '#4a5a3e';
      ctx.beginPath();
      ctx.moveTo(-fuseLen * 0.53, -fuseH * 2.7);
      ctx.lineTo(-fuseLen * 0.65, -fuseH * 2.7);
      ctx.lineTo(-fuseLen * 0.63, -fuseH * 3.3);
      ctx.lineTo(-fuseLen * 0.55, -fuseH * 3.3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-fuseLen * 0.53, -fuseH * 2.7);
      ctx.lineTo(-fuseLen * 0.65, -fuseH * 2.7);
      ctx.lineTo(-fuseLen * 0.63, -fuseH * 2.1);
      ctx.lineTo(-fuseLen * 0.55, -fuseH * 2.1);
      ctx.closePath();
      ctx.fill();

      // ── Cargo door (back) — slightly open ──
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-fuseLen * 0.55, fuseH * 0.3);
      ctx.lineTo(-fuseLen * 0.55, fuseH * 0.9);
      ctx.stroke();

      // ── Navigation lights ──
      // Red left (top wingtip)
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(-fuseLen * 0.22, -wingSpan + 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Green right (bottom wingtip)
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.beginPath();
      ctx.arc(-fuseLen * 0.22, wingSpan - 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // ── Strobe light (belly) — flashing ──
      if (Math.sin(tt * 5) > 0.6) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(fuseLen * 0.1, fuseH * 0.5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Small emblem on vertical tail ──
      ctx.fillStyle = 'rgba(200,180,120,0.4)';
      ctx.beginPath();
      ctx.arc(-fuseLen * 0.565, -fuseH * 2.2, sz * 0.06, 0, Math.PI * 2);
      ctx.fill();

      // ── Painted "OTLOP" livery on the fuselage side ──
      // Large text + bright orange highlight bar underneath, mimicking a
      // painted cargo-plane livery (think Aviation insignia).
      ctx.save();
      ctx.scale(dir, 1); // un-mirror for text
      const otlopFontSize = Math.max(14, sz * 0.38);
      ctx.font = `900 ${otlopFontSize}px 'Tajawal', Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1) Outer glow / stroke (dark navy) for readability against the olive body
      ctx.lineWidth = Math.max(2, otlopFontSize * 0.22);
      ctx.strokeStyle = 'rgba(12,20,10,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText('OTLOP', 0, -otlopFontSize * 0.05);

      // 2) Main white paint — slight vertical gradient for 3D paint feel
      const textGrad = ctx.createLinearGradient(0, -otlopFontSize * 0.5, 0, otlopFontSize * 0.5);
      textGrad.addColorStop(0, '#ffffff');
      textGrad.addColorStop(0.55, '#f5f5f5');
      textGrad.addColorStop(1, '#d6d6d0');
      ctx.fillStyle = textGrad;
      ctx.fillText('OTLOP', 0, -otlopFontSize * 0.05);

      // 3) Weathered specular streak for airbrushed metallic feel
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('OTLOP', 0, -otlopFontSize * 0.05);
      ctx.globalCompositeOperation = 'source-over';

      // 4) Orange highlight bar underneath — like a painted wing stripe
      const barHeight = Math.max(3, otlopFontSize * 0.22);
      const barWidth = otlopFontSize * 3.4;
      const barY = otlopFontSize * 0.55;
      // Outer glow behind the bar
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = otlopFontSize * 0.5;
      // Bar gradient (warm amber → bright orange → amber)
      const barGrad = ctx.createLinearGradient(-barWidth / 2, 0, barWidth / 2, 0);
      barGrad.addColorStop(0, 'rgba(234,88,12,0)');
      barGrad.addColorStop(0.15, '#ea580c');
      barGrad.addColorStop(0.5, '#fb923c');
      barGrad.addColorStop(0.85, '#ea580c');
      barGrad.addColorStop(1, 'rgba(234,88,12,0)');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(-barWidth / 2, barY, barWidth, barHeight, barHeight / 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Thin darker underline for contrast
      ctx.strokeStyle = 'rgba(124,45,18,0.75)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.roundRect(-barWidth / 2, barY, barWidth, barHeight, barHeight / 2);
      ctx.stroke();

      // Bright top highlight on the bar
      const barHiGrad = ctx.createLinearGradient(0, barY, 0, barY + barHeight * 0.4);
      barHiGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      barHiGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = barHiGrad;
      ctx.beginPath();
      ctx.roundRect(-barWidth / 2 + 2, barY, barWidth - 4, barHeight * 0.4, barHeight * 0.2);
      ctx.fill();

      ctx.lineJoin = 'miter';
      ctx.restore();

      ctx.restore(); // un-scale dir

      // ── Nose blinking light ──
      if (Math.sin(tt * 3) > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(dir * sz * 1.2, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Health bar
      if (damaged) {
        const barW = sz * 2;
        const barH = 3;
        const barY = -sz * 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
        const hpRatio = d.health / d.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
      }

      ctx.restore();
      continue;
    }

    // ═══ INCENDIARY DRONE — Napalm Attack VTOL ═══
    if (d.tier === 'incendiary') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      const tt = g.elapsed;

      // ── Under-shadow ──
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.55, sz * 0.85, sz * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Main armoured fuselage: wide + low, like a gunship ──
      const fuseLen = sz * 1.7;
      const fuseH = sz * 0.42;

      const bodyGrad = ctx.createLinearGradient(0, -fuseH, 0, fuseH);
      bodyGrad.addColorStop(0, '#fecaca');   // highlight
      bodyGrad.addColorStop(0.15, '#ef4444');
      bodyGrad.addColorStop(0.4, '#b91c1c');
      bodyGrad.addColorStop(0.75, '#7f1d1d');
      bodyGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen, 0);                            // sharp nose
      ctx.bezierCurveTo(
        dir * fuseLen * 0.85, -fuseH * 0.9,
        dir * fuseLen * 0.4, -fuseH * 1.1,
        0, -fuseH * 1.05
      );
      ctx.lineTo(-dir * fuseLen * 0.7, -fuseH * 0.9);
      ctx.lineTo(-dir * fuseLen * 0.95, -fuseH * 0.3);         // tail
      ctx.lineTo(-dir * fuseLen * 0.95, fuseH * 0.3);
      ctx.lineTo(-dir * fuseLen * 0.7, fuseH * 0.95);
      ctx.lineTo(0, fuseH * 1.05);
      ctx.bezierCurveTo(
        dir * fuseLen * 0.4, fuseH * 1.1,
        dir * fuseLen * 0.85, fuseH * 0.9,
        dir * fuseLen, 0
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,5,5,0.8)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Top specular stripe
      const specGrad = ctx.createLinearGradient(0, -fuseH * 1.05, 0, -fuseH * 0.2);
      specGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specGrad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(-fuseLen * 0.75, -fuseH * 1.05, fuseLen * 1.5, fuseH * 0.55);

      // Painted flame decals along the side
      ctx.fillStyle = 'rgba(251,191,36,0.85)';
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen * 0.6, -fuseH * 0.15);
      ctx.quadraticCurveTo(dir * fuseLen * 0.3, -fuseH * 0.55, 0, -fuseH * 0.2);
      ctx.quadraticCurveTo(-dir * fuseLen * 0.3, -fuseH * 0.55, -dir * fuseLen * 0.6, -fuseH * 0.15);
      ctx.quadraticCurveTo(-dir * fuseLen * 0.25, -fuseH * 0.1, 0, -fuseH * 0.25);
      ctx.quadraticCurveTo(dir * fuseLen * 0.25, -fuseH * 0.1, dir * fuseLen * 0.6, -fuseH * 0.15);
      ctx.closePath();
      ctx.fill();
      // Dark flame outline
      ctx.strokeStyle = 'rgba(127,29,29,0.7)';
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // Nose rocket launcher ring
      ctx.fillStyle = '#1f0808';
      ctx.beginPath();
      ctx.ellipse(dir * fuseLen * 0.85, 0, 1.2, fuseH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a1010';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      // Glowing muzzle interior
      ctx.fillStyle = `rgba(255,140,40,${0.7 + Math.sin(tt * 4) * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(dir * fuseLen * 0.85, 0, 0.7, fuseH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Twin napalm drop canisters slung under the belly ──
      const canisterY = fuseH * 0.7;
      for (const cdx of [-1, 1]) {
        const cx = dir * cdx * fuseLen * 0.25;
        ctx.save();
        ctx.translate(cx, canisterY);
        // Canister body
        const canGrad = ctx.createLinearGradient(0, -fuseH * 0.25, 0, fuseH * 0.25);
        canGrad.addColorStop(0, '#fed7aa');
        canGrad.addColorStop(0.5, '#f97316');
        canGrad.addColorStop(1, '#9a3412');
        ctx.fillStyle = canGrad;
        ctx.beginPath();
        ctx.roundRect(-fuseLen * 0.18, -fuseH * 0.25, fuseLen * 0.36, fuseH * 0.55, 3);
        ctx.fill();
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Warning hatch
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-fuseLen * 0.05, -fuseH * 0.1, fuseLen * 0.1, fuseH * 0.2);
        // Fuel level window — glowing hot
        const fuelPulse = 0.55 + Math.sin(tt * 5 + cdx) * 0.25;
        ctx.fillStyle = `rgba(255,180,60,${fuelPulse})`;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 5;
        ctx.fillRect(-fuseLen * 0.14, -fuseH * 0.05, fuseLen * 0.06, fuseH * 0.1);
        ctx.shadowBlur = 0;
        ctx.restore();
        // Drip/flame particles
        for (let fi = 0; fi < 2; fi++) {
          const fx = cx + (Math.random() - 0.5) * fuseLen * 0.15;
          const fy = canisterY + fuseH * 0.3 + Math.random() * fuseH * 0.4;
          ctx.fillStyle = `rgba(255,${90 + Math.floor(Math.random() * 100)},20,${0.4 + Math.random() * 0.4})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.2 + Math.random(), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Short stub wings with missile rails ──
      ctx.fillStyle = '#7f1d1d';
      // Top wing
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen * 0.15, -fuseH * 0.9);
      ctx.lineTo(-dir * fuseLen * 0.1, -fuseH * 1.6);
      ctx.lineTo(-dir * fuseLen * 0.4, -fuseH * 1.45);
      ctx.lineTo(-dir * fuseLen * 0.3, -fuseH * 0.85);
      ctx.closePath();
      ctx.fill();
      // Bottom wing
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen * 0.15, fuseH * 0.95);
      ctx.lineTo(-dir * fuseLen * 0.1, fuseH * 1.6);
      ctx.lineTo(-dir * fuseLen * 0.4, fuseH * 1.45);
      ctx.lineTo(-dir * fuseLen * 0.3, fuseH * 0.85);
      ctx.closePath();
      ctx.fill();

      // Tiny rockets under each wing
      for (const wdy of [-1, 1]) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(-dir * fuseLen * 0.22, wdy * fuseH * 1.4, 4, 1.5);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(-dir * fuseLen * 0.22, wdy * fuseH * 1.4 + 0.75);
        ctx.lineTo(-dir * fuseLen * 0.22 + dir * 2, wdy * fuseH * 1.4 - 0.2);
        ctx.lineTo(-dir * fuseLen * 0.22 + dir * 2, wdy * fuseH * 1.4 + 1.7);
        ctx.closePath();
        ctx.fill();
      }

      // ── Rear thruster (glowing plume) ──
      const thrusterGlow = 0.7 + Math.sin(tt * 15) * 0.25;
      const plumeGrad = ctx.createRadialGradient(-dir * fuseLen * 0.95, 0, 0, -dir * fuseLen * 1.15, 0, 12);
      plumeGrad.addColorStop(0, `rgba(255,200,80,${thrusterGlow})`);
      plumeGrad.addColorStop(0.4, `rgba(255,120,40,${thrusterGlow * 0.6})`);
      plumeGrad.addColorStop(1, 'rgba(200,50,10,0)');
      ctx.fillStyle = plumeGrad;
      ctx.beginPath();
      ctx.ellipse(-dir * fuseLen * 1.05, 0, 13, fuseH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Hot core
      ctx.fillStyle = 'rgba(255,255,230,0.85)';
      ctx.beginPath();
      ctx.ellipse(-dir * fuseLen * 0.96, 0, 2.2, fuseH * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Cockpit with red tinted canopy ──
      const cockpitGrad = ctx.createRadialGradient(dir * fuseLen * 0.55, -fuseH * 0.35, 0, dir * fuseLen * 0.55, -fuseH * 0.35, fuseH * 0.5);
      cockpitGrad.addColorStop(0, 'rgba(255,100,100,0.85)');
      cockpitGrad.addColorStop(0.55, 'rgba(180,30,30,0.55)');
      cockpitGrad.addColorStop(1, 'rgba(80,10,10,0)');
      ctx.fillStyle = cockpitGrad;
      ctx.beginPath();
      ctx.ellipse(dir * fuseLen * 0.55, -fuseH * 0.35, fuseH * 0.5, fuseH * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Wingtip navigation strobe (red, flashing) ──
      const strobeOn = Math.sin(tt * 6) > 0.2;
      if (strobeOn) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ff3030';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-dir * fuseLen * 0.25, -fuseH * 1.55, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-dir * fuseLen * 0.25, fuseH * 1.55, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Heat shimmer distortion hint above body ──
      for (let s = 0; s < 3; s++) {
        const sx = (Math.random() - 0.5) * fuseLen * 1.2;
        const sy = -fuseH * 1.2 - Math.random() * 4;
        ctx.fillStyle = `rgba(255,180,80,${0.08 + Math.random() * 0.08})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
      }

      // Health bar
      if (damaged) {
        const barW = sz * 2; const barH = 3; const barY = -sz * 1.9;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
        const hpRatio = d.health / d.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
      }
      ctx.restore();
      continue;
    }

    // ═══ CHEMICAL DRONE — Biohazard Dispersal VTOL ═══
    if (d.tier === 'chemical') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      const tt = g.elapsed;

      // Under-shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.55, sz * 0.85, sz * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Main fuselage (dark olive armour) ──
      const fuseLen = sz * 1.7;
      const fuseH = sz * 0.42;

      const bodyGrad = ctx.createLinearGradient(0, -fuseH, 0, fuseH);
      bodyGrad.addColorStop(0, '#4ade80');
      bodyGrad.addColorStop(0.15, '#22c55e');
      bodyGrad.addColorStop(0.4, '#166534');
      bodyGrad.addColorStop(0.75, '#14532d');
      bodyGrad.addColorStop(1, '#052e16');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen, 0);
      ctx.bezierCurveTo(
        dir * fuseLen * 0.85, -fuseH * 0.9,
        dir * fuseLen * 0.4, -fuseH * 1.1,
        0, -fuseH * 1.05
      );
      ctx.lineTo(-dir * fuseLen * 0.7, -fuseH * 0.9);
      ctx.lineTo(-dir * fuseLen * 0.95, -fuseH * 0.3);
      ctx.lineTo(-dir * fuseLen * 0.95, fuseH * 0.3);
      ctx.lineTo(-dir * fuseLen * 0.7, fuseH * 0.95);
      ctx.lineTo(0, fuseH * 1.05);
      ctx.bezierCurveTo(
        dir * fuseLen * 0.4, fuseH * 1.1,
        dir * fuseLen * 0.85, fuseH * 0.9,
        dir * fuseLen, 0
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,46,22,0.9)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Panel lines
      ctx.strokeStyle = 'rgba(5,30,15,0.5)';
      ctx.lineWidth = 0.35;
      for (const plx of [-0.35, 0, 0.3]) {
        ctx.beginPath();
        ctx.moveTo(dir * fuseLen * plx, -fuseH * 0.95);
        ctx.lineTo(dir * fuseLen * plx, fuseH * 0.95);
        ctx.stroke();
      }

      // Top specular
      const specGrad = ctx.createLinearGradient(0, -fuseH * 1.05, 0, -fuseH * 0.2);
      specGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specGrad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(-fuseLen * 0.75, -fuseH * 1.05, fuseLen * 1.5, fuseH * 0.55);

      // ── Yellow biohazard warning stripes ──
      ctx.fillStyle = 'rgba(250,204,21,0.95)';
      const stripeW = fuseLen * 0.05;
      for (let s = 0; s < 4; s++) {
        const sx = dir * (-fuseLen * 0.35 + s * fuseLen * 0.17);
        ctx.save();
        ctx.translate(sx, 0);
        ctx.rotate(-0.6);
        ctx.fillRect(-stripeW, -fuseH * 0.45, stripeW * 2, fuseH * 0.9);
        ctx.restore();
      }

      // ── Biohazard symbol painted on the hood ──
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#fef08a';
      const bioR = fuseH * 0.45;
      // 3 petals forming the biohazard symbol
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const px = Math.cos(a) * bioR * 0.6;
        const py = Math.sin(a) * bioR * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, bioR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Dark center ring
      ctx.fillStyle = 'rgba(5,46,22,1)';
      ctx.beginPath();
      ctx.arc(0, 0, bioR * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, bioR * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Twin gas canisters underneath (glass cylinders with swirling vapor) ──
      const canY = fuseH * 0.75;
      for (const cdx of [-1, 1]) {
        const cx = dir * cdx * fuseLen * 0.28;
        ctx.save();
        ctx.translate(cx, canY);
        // Metal endcaps
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(-fuseLen * 0.17, -fuseH * 0.33, fuseLen * 0.34, fuseH * 0.1, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(-fuseLen * 0.17, fuseH * 0.23, fuseLen * 0.34, fuseH * 0.1, 1);
        ctx.fill();
        // Glass cylinder
        const glassGrad = ctx.createLinearGradient(0, -fuseH * 0.25, 0, fuseH * 0.25);
        glassGrad.addColorStop(0, 'rgba(134,239,172,0.75)');
        glassGrad.addColorStop(0.5, 'rgba(34,197,94,0.65)');
        glassGrad.addColorStop(1, 'rgba(20,83,45,0.75)');
        ctx.fillStyle = glassGrad;
        ctx.fillRect(-fuseLen * 0.15, -fuseH * 0.25, fuseLen * 0.3, fuseH * 0.5);
        // Swirling vapor inside (two layered ellipses)
        ctx.globalCompositeOperation = 'lighter';
        for (let v = 0; v < 3; v++) {
          const vy = -fuseH * 0.2 + ((tt * 20 + v * 40) % fuseH * 0.5);
          ctx.fillStyle = `rgba(190,245,190,${0.2 - v * 0.05})`;
          ctx.beginPath();
          ctx.ellipse(0, vy, fuseLen * 0.11, fuseH * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        // Highlight strip on the glass
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-fuseLen * 0.12, -fuseH * 0.22, fuseLen * 0.02, fuseH * 0.44);
        // Outer glow
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(74,222,128,0.5)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-fuseLen * 0.15, -fuseH * 0.25, fuseLen * 0.3, fuseH * 0.5);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Gas leak drifting downward (toxic mist)
        for (let p = 0; p < 3; p++) {
          const px = cx + (Math.random() - 0.5) * fuseLen * 0.18;
          const py = canY + fuseH * 0.35 + Math.random() * fuseH * 0.5;
          ctx.fillStyle = `rgba(134,239,172,${0.15 + Math.random() * 0.15})`;
          ctx.beginPath();
          ctx.arc(px, py, 2 + Math.random() * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Short stub wings with sprayer nozzles ──
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen * 0.15, -fuseH * 0.9);
      ctx.lineTo(-dir * fuseLen * 0.1, -fuseH * 1.55);
      ctx.lineTo(-dir * fuseLen * 0.4, -fuseH * 1.4);
      ctx.lineTo(-dir * fuseLen * 0.3, -fuseH * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * fuseLen * 0.15, fuseH * 0.95);
      ctx.lineTo(-dir * fuseLen * 0.1, fuseH * 1.55);
      ctx.lineTo(-dir * fuseLen * 0.4, fuseH * 1.4);
      ctx.lineTo(-dir * fuseLen * 0.3, fuseH * 0.85);
      ctx.closePath();
      ctx.fill();

      // Sprayer nozzles with greenish mist
      for (const wdy of [-1, 1]) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(-dir * fuseLen * 0.2, wdy * fuseH * 1.35, 3, 1.2);
        // Mist
        const mx = -dir * fuseLen * 0.24;
        const my = wdy * fuseH * 1.42;
        const mistGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 5);
        mistGrad.addColorStop(0, 'rgba(134,239,172,0.4)');
        mistGrad.addColorStop(1, 'rgba(134,239,172,0)');
        ctx.fillStyle = mistGrad;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rear thruster (green plume)
      const thrusterGlow = 0.55 + Math.sin(tt * 10) * 0.2;
      const plumeGrad = ctx.createRadialGradient(-dir * fuseLen * 0.95, 0, 0, -dir * fuseLen * 1.15, 0, 12);
      plumeGrad.addColorStop(0, `rgba(134,239,172,${thrusterGlow})`);
      plumeGrad.addColorStop(0.5, `rgba(34,197,94,${thrusterGlow * 0.55})`);
      plumeGrad.addColorStop(1, 'rgba(6,46,22,0)');
      ctx.fillStyle = plumeGrad;
      ctx.beginPath();
      ctx.ellipse(-dir * fuseLen * 1.05, 0, 13, fuseH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cockpit with green tinted canopy
      const cockpitGrad = ctx.createRadialGradient(dir * fuseLen * 0.55, -fuseH * 0.35, 0, dir * fuseLen * 0.55, -fuseH * 0.35, fuseH * 0.5);
      cockpitGrad.addColorStop(0, 'rgba(134,239,172,0.85)');
      cockpitGrad.addColorStop(0.55, 'rgba(34,197,94,0.55)');
      cockpitGrad.addColorStop(1, 'rgba(6,46,22,0)');
      ctx.fillStyle = cockpitGrad;
      ctx.beginPath();
      ctx.ellipse(dir * fuseLen * 0.55, -fuseH * 0.35, fuseH * 0.5, fuseH * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wingtip strobes
      const strobeOn = Math.sin(tt * 6) > 0.2;
      if (strobeOn) {
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(-dir * fuseLen * 0.25, -fuseH * 1.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-dir * fuseLen * 0.25, fuseH * 1.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Health bar
      if (damaged) {
        const barW = sz * 2; const barH = 3; const barY = -sz * 1.9;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
        const hpRatio = d.health / d.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
      }
      ctx.restore();
      continue;
    }

    // Searchlight beam (stronger for trackers/bombers)
    const beamAlpha = d.tier === 'scout' ? 0.03 : d.tier === 'tracker' ? 0.06 : 0.08;
    const beamColor = d.tier === 'bomber' ? '255, 150, 0' : '239, 68, 68';
    ctx.fillStyle = `rgba(${beamColor}, ${beamAlpha})`;
    ctx.beginPath();
    const beamW = d.tier === 'bomber' ? 30 : 20;
    ctx.moveTo(-3, d.size);
    ctx.lineTo(-beamW, groundY - d.pos.y);
    ctx.lineTo(beamW, groundY - d.pos.y);
    ctx.lineTo(3, d.size);
    ctx.fill();

    if (d.tier === 'scout') {
      // ═══ SCOUT — Carbon-fiber surveillance quadcopter ═══
      const sz = d.size;
      const armLen = sz * 1.35;
      const tt = g.elapsed;
      const propAngle = tt * 45;

      // ── Soft under-shadow ──
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.5, sz * 0.9, sz * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Carbon-fiber arms (drawn under the body) ──
      for (let i = 0; i < 4; i++) {
        const armA = (Math.PI / 2) * i + Math.PI / 4;
        const ax = Math.cos(armA) * armLen;
        const ay = Math.sin(armA) * armLen * 0.45;
        const bx = Math.cos(armA) * sz * 0.35;
        const by = Math.sin(armA) * sz * 0.2;
        // Dark core
        ctx.strokeStyle = '#0f1115';
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // Carbon-weave highlight (bright grey thin line)
        ctx.strokeStyle = 'rgba(180,190,210,0.5)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(bx, by - 0.5);
        ctx.lineTo(ax, ay - 0.5);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Motor housing at the arm tip (dark cylinder with chrome rim)
        const motorGrad = ctx.createRadialGradient(ax - 0.5, ay - 0.5, 0, ax, ay, sz * 0.14);
        motorGrad.addColorStop(0, '#5b6270');
        motorGrad.addColorStop(0.6, '#2a2f38');
        motorGrad.addColorStop(1, '#0a0b10');
        ctx.fillStyle = motorGrad;
        ctx.beginPath();
        ctx.arc(ax, ay, sz * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,200,220,0.55)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
        // Hot motor top dot
        ctx.fillStyle = 'rgba(255,120,60,0.75)';
        ctx.beginPath();
        ctx.arc(ax, ay, sz * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // Propeller — translucent disc with 3 visible blade sweeps
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(propAngle + i * 1.3);
        // Fill disc
        ctx.fillStyle = 'rgba(170,185,205,0.18)';
        ctx.beginPath();
        ctx.ellipse(0, 0, sz * 0.5, sz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        // Blade streaks
        ctx.strokeStyle = 'rgba(210,220,235,0.55)';
        ctx.lineWidth = 0.7;
        for (let b = 0; b < 3; b++) {
          const a = (b * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * sz * 0.1, Math.sin(a) * sz * 0.02);
          ctx.lineTo(Math.cos(a) * sz * 0.48, Math.sin(a) * sz * 0.1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Central hull (lozenge-shaped with 3-stop metal gradient) ──
      const bodyGrad = ctx.createLinearGradient(0, -sz * 0.35, 0, sz * 0.35);
      bodyGrad.addColorStop(0, '#6a6d76');
      bodyGrad.addColorStop(0.35, '#2e3138');
      bodyGrad.addColorStop(0.7, '#16181c');
      bodyGrad.addColorStop(1, '#0a0b10');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      // Smooth rounded rectangle body
      ctx.ellipse(0, 0, sz * 0.6, sz * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,145,0.6)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // Top chrome gloss stripe
      const glossGrad = ctx.createLinearGradient(0, -sz * 0.35, 0, 0);
      glossGrad.addColorStop(0, 'rgba(255,255,255,0)');
      glossGrad.addColorStop(0.7, 'rgba(255,255,255,0.22)');
      glossGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glossGrad;
      ctx.beginPath();
      ctx.ellipse(0, -sz * 0.14, sz * 0.42, sz * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Antenna on top
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.15, -sz * 0.3);
      ctx.lineTo(-sz * 0.2, -sz * 0.55);
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(-sz * 0.2, -sz * 0.56, 0.7, 0, Math.PI * 2);
      ctx.fill();

      // ── Gimbal camera pod under the body ──
      // Gimbal arm
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, sz * 0.18);
      ctx.lineTo(0, sz * 0.28);
      ctx.stroke();
      // Spherical gimbal body
      const gimGrad = ctx.createRadialGradient(-sz * 0.05, sz * 0.33, 0, 0, sz * 0.33, sz * 0.2);
      gimGrad.addColorStop(0, '#4a4a4a');
      gimGrad.addColorStop(0.6, '#1a1a1a');
      gimGrad.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = gimGrad;
      ctx.beginPath();
      ctx.arc(0, sz * 0.33, sz * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,200,220,0.5)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Camera lens — glowing cyan
      const lensGrad = ctx.createRadialGradient(0, sz * 0.33, 0, 0, sz * 0.33, sz * 0.12);
      lensGrad.addColorStop(0, 'rgba(200,250,255,0.95)');
      lensGrad.addColorStop(0.4, 'rgba(14,165,233,0.8)');
      lensGrad.addColorStop(1, 'rgba(3,80,130,0.3)');
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.arc(0, sz * 0.33, sz * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Lens ring
      ctx.strokeStyle = 'rgba(230,240,255,0.7)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, sz * 0.33, sz * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      // Inner aperture dot
      ctx.fillStyle = 'rgba(10,15,25,0.9)';
      ctx.beginPath();
      ctx.arc(0, sz * 0.33, sz * 0.04, 0, Math.PI * 2);
      ctx.fill();
      // Specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(-sz * 0.035, sz * 0.305, sz * 0.02, 0, Math.PI * 2);
      ctx.fill();

      // LED cluster — front red + rear green + blinking status
      const ledBlink = Math.sin(tt * 4) > 0;
      ctx.shadowBlur = ledBlink ? 7 : 2;
      // Front red (in facing direction)
      ctx.shadowColor = '#ef4444';
      ctx.fillStyle = ledBlink ? '#ff5555' : '#4a1010';
      ctx.beginPath();
      ctx.arc(sz * 0.42, -sz * 0.12, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Rear green
      ctx.shadowColor = '#22c55e';
      ctx.fillStyle = ledBlink ? '#44ff66' : '#0a3a10';
      ctx.beginPath();
      ctx.arc(-sz * 0.42, -sz * 0.12, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Amber side blinkers
      ctx.shadowColor = '#fbbf24';
      ctx.fillStyle = ledBlink ? '#fcd34d' : '#3a2a05';
      ctx.beginPath();
      ctx.arc(0, sz * 0.05, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Camera flash — occasional bright burst (photographs the player)
      const flashCycle = Math.sin(tt * 2.5);
      if (flashCycle > 0.95) {
        const flashR = 5 + (flashCycle - 0.95) * 40;
        ctx.fillStyle = `rgba(255,255,255,${(flashCycle - 0.95) * 12})`;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(0, sz * 0.33, flashR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

    } else if (d.tier === 'tracker') {
      // TRACKER: Stealth recon drone — dark metallic with delta wings
      const dir = facingRight ? 1 : -1;
      const isDiving = d.bombTimer >= d.bombCooldown * 0.8;
      
      // Sleek dark fuselage — long and thin
      const bodyGrad = ctx.createLinearGradient(0, -d.size * 0.25, 0, d.size * 0.25);
      bodyGrad.addColorStop(0, '#2a2a2e');
      bodyGrad.addColorStop(0.3, '#1a1a1e');
      bodyGrad.addColorStop(0.7, '#222228');
      bodyGrad.addColorStop(1, '#18181c');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 1.5, 0);  // sharp nose
      ctx.lineTo(dir * d.size * 0.5, -d.size * 0.18);
      ctx.lineTo(-dir * d.size * 1.0, -d.size * 0.15);
      ctx.lineTo(-dir * d.size * 1.2, 0);
      ctx.lineTo(-dir * d.size * 1.0, d.size * 0.15);
      ctx.lineTo(dir * d.size * 0.5, d.size * 0.18);
      ctx.closePath();
      ctx.fill();
      // Metallic sheen
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Delta wings — sharp triangular swept back
      ctx.fillStyle = '#1e1e22';
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.1, -d.size * 0.15);
      ctx.lineTo(-dir * d.size * 0.6, -d.size * 1.2);
      ctx.lineTo(-dir * d.size * 1.0, -d.size * 0.8);
      ctx.lineTo(-dir * d.size * 0.5, -d.size * 0.15);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.1, d.size * 0.15);
      ctx.lineTo(-dir * d.size * 0.6, d.size * 1.2);
      ctx.lineTo(-dir * d.size * 1.0, d.size * 0.8);
      ctx.lineTo(-dir * d.size * 0.5, d.size * 0.15);
      ctx.fill();

      // V-tail
      ctx.fillStyle = '#252528';
      ctx.beginPath();
      ctx.moveTo(-dir * d.size * 0.9, -d.size * 0.12);
      ctx.lineTo(-dir * d.size * 1.4, -d.size * 0.5);
      ctx.lineTo(-dir * d.size * 1.25, -d.size * 0.1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-dir * d.size * 0.9, d.size * 0.12);
      ctx.lineTo(-dir * d.size * 1.4, d.size * 0.5);
      ctx.lineTo(-dir * d.size * 1.25, d.size * 0.1);
      ctx.fill();

      // Green phosphor camera lens at nose
      const camPulse = 2.5 + Math.sin(g.elapsed * 4) * 0.8;
      ctx.fillStyle = '#22ff44';
      ctx.shadowColor = '#22ff44';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(dir * d.size * 1.35, 0, camPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Wingtip warning lights (blinking red)
      const ledOn = Math.sin(g.elapsed * 6) > 0;
      if (ledOn) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(-dir * d.size * 0.7, -d.size * 1.05, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-dir * d.size * 0.7, d.size * 1.05, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Stealth exhaust — faint blue glow
      ctx.fillStyle = 'rgba(100,150,255,0.3)';
      ctx.shadowColor = 'rgba(100,150,255,0.5)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(-dir * d.size * 1.15, 0, 2.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Persistent laser tracking line — always visible, brighter when diving
      {
        const laserEndX = (g.player.pos.x - d.pos.x);
        const laserEndY = (g.player.pos.y - d.pos.y);
        const laserAlpha = isDiving ? 0.45 : 0.12 + Math.sin(g.elapsed * 3) * 0.04;
        const laserWidth = isDiving ? 1.5 : 0.8;
        
        // Outer glow
        ctx.strokeStyle = `rgba(34,255,68,${laserAlpha * 0.4})`;
        ctx.lineWidth = laserWidth + 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(dir * d.size * 1.35, 0);
        ctx.lineTo(laserEndX, laserEndY);
        ctx.stroke();
        
        // Core beam
        ctx.strokeStyle = `rgba(34,255,68,${laserAlpha})`;
        ctx.lineWidth = laserWidth;
        ctx.beginPath();
        ctx.moveTo(dir * d.size * 1.35, 0);
        ctx.lineTo(laserEndX, laserEndY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Electric flash at muzzle when diving
        if (isDiving && Math.sin(g.elapsed * 20) > 0.5) {
          ctx.fillStyle = 'rgba(34,255,68,0.7)';
          ctx.shadowColor = '#22ff44';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(dir * d.size * 1.35, 0, 4 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

    } else if (d.tier === 'laser') {
      // ═══ LASER DRONE — Armoured sentinel turret with targeting eye ═══
      const lt = performance.now() * 0.001;
      const sz = d.size;
      const eyeActive = d.laserPhase === 'telegraph' || d.laserPhase === 'firing';
      const isFiring = d.laserPhase === 'firing';

      // ── Hover shadow on ground ──
      const groundDist = g.height * 0.78 - d.pos.y;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, groundDist, sz * 0.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Anti-gravity repulsor glow (beneath) ──
      const repGrad = ctx.createLinearGradient(0, sz * 0.4, 0, sz * 0.8);
      repGrad.addColorStop(0, `rgba(255,60,100,${0.15 + Math.sin(lt * 6) * 0.08})`);
      repGrad.addColorStop(1, 'rgba(255,60,100,0)');
      ctx.fillStyle = repGrad;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.3, sz * 0.35);
      ctx.lineTo(sz * 0.3, sz * 0.35);
      ctx.lineTo(sz * 0.15, sz * 0.75);
      ctx.lineTo(-sz * 0.15, sz * 0.75);
      ctx.closePath();
      ctx.fill();

      // ── Side armour plates (angular, military look) ──
      const armourGrad = ctx.createLinearGradient(-sz * 0.6, 0, sz * 0.6, 0);
      armourGrad.addColorStop(0, '#1a1015');
      armourGrad.addColorStop(0.3, '#2a1520');
      armourGrad.addColorStop(0.5, '#3a2030');
      armourGrad.addColorStop(0.7, '#2a1520');
      armourGrad.addColorStop(1, '#1a1015');
      ctx.fillStyle = armourGrad;
      // Left plate
      ctx.beginPath();
      ctx.moveTo(-sz * 0.35, -sz * 0.35);
      ctx.lineTo(-sz * 0.7, -sz * 0.1);
      ctx.lineTo(-sz * 0.6, sz * 0.25);
      ctx.lineTo(-sz * 0.3, sz * 0.35);
      ctx.closePath();
      ctx.fill();
      // Right plate
      ctx.beginPath();
      ctx.moveTo(sz * 0.35, -sz * 0.35);
      ctx.lineTo(sz * 0.7, -sz * 0.1);
      ctx.lineTo(sz * 0.6, sz * 0.25);
      ctx.lineTo(sz * 0.3, sz * 0.35);
      ctx.closePath();
      ctx.fill();

      // ── Central body (octagonal turret) ──
      const bodyGrad = ctx.createRadialGradient(-sz * 0.1, -sz * 0.1, 0, 0, 0, sz * 0.5);
      bodyGrad.addColorStop(0, '#3a1525');
      bodyGrad.addColorStop(0.6, '#25101a');
      bodyGrad.addColorStop(1, '#180a10');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      const sides = 8;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * sz * 0.4;
        const py = Math.sin(a) * sz * 0.38;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // Turret edge highlight
      ctx.strokeStyle = `rgba(255,60,100,${0.15 + (eyeActive ? 0.2 : 0)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // ── Targeting eye — the core feature ──
      // Outer ring
      ctx.strokeStyle = eyeActive ? `rgba(255,80,120,${0.8 + Math.sin(lt * 12) * 0.2})` : 'rgba(120,30,60,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      // Eye interior glow
      const eyeGlow = eyeActive ? 0.9 : 0.3;
      const eyeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 0.26);
      eyeGrad.addColorStop(0, isFiring ? `rgba(255,255,255,${eyeGlow})` : `rgba(255,60,100,${eyeGlow})`);
      eyeGrad.addColorStop(0.5, `rgba(200,20,70,${eyeGlow * 0.6})`);
      eyeGrad.addColorStop(1, 'rgba(60,10,25,0)');
      ctx.fillStyle = eyeGrad;
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.25, 0, Math.PI * 2);
      ctx.fill();
      // Pupil/lens
      ctx.fillStyle = isFiring ? '#ffffff' : (eyeActive ? 'rgba(255,200,220,0.9)' : 'rgba(120,25,50,0.8)');
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // Crosshair lines inside the eye when active
      if (eyeActive) {
        ctx.strokeStyle = `rgba(255,120,160,${0.6 + Math.sin(lt * 16) * 0.3})`;
        ctx.lineWidth = 0.7;
        const cr = sz * 0.22;
        ctx.beginPath();
        ctx.moveTo(0, -cr); ctx.lineTo(0, cr);
        ctx.moveTo(-cr, 0); ctx.lineTo(cr, 0);
        ctx.stroke();
      }

      // ── Top antenna array ──
      ctx.strokeStyle = '#4a1525';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      // Central antenna
      ctx.beginPath();
      ctx.moveTo(0, -sz * 0.38);
      ctx.lineTo(0, -sz * 0.6);
      ctx.stroke();
      // Antenna tip
      ctx.fillStyle = eyeActive ? '#ff4070' : '#6a2040';
      ctx.beginPath();
      ctx.arc(0, -sz * 0.62, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Side antennas
      ctx.strokeStyle = '#3a1020';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.3, -sz * 0.32);
      ctx.lineTo(-sz * 0.5, -sz * 0.52);
      ctx.moveTo(sz * 0.3, -sz * 0.32);
      ctx.lineTo(sz * 0.5, -sz * 0.52);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // ── Warning glow when about to fire ──
      if (eyeActive) {
        const pulseAlpha = 0.15 + Math.sin(lt * (isFiring ? 24 : 8)) * 0.1;
        const warnGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 0.9);
        warnGrad.addColorStop(0, `rgba(255,40,80,${pulseAlpha})`);
        warnGrad.addColorStop(1, 'rgba(255,40,80,0)');
        ctx.fillStyle = warnGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // ═══ BOMBER — Twin-rotor tiltwing heavy bomber ═══
      // Unique silhouette: wide fuselage, dorsal engine pod, visible bomb
      // bay, blue tinted cockpit — distinct from every other drone.
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      const tt = g.elapsed;
      const bombReady = d.bombTimer >= d.bombCooldown * 0.8;

      // ── Ground shadow ──
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.6, sz * 1.1, sz * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Wide wings (drawn first, behind fuselage) ──
      const wingGrad = ctx.createLinearGradient(0, -sz * 1.5, 0, sz * 1.5);
      wingGrad.addColorStop(0, '#2a3545');
      wingGrad.addColorStop(0.5, '#1a2230');
      wingGrad.addColorStop(1, '#0a1220');
      ctx.fillStyle = wingGrad;
      // Top wing (swept back)
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.4, -sz * 0.5);
      ctx.bezierCurveTo(
        dir * sz * 0.1, -sz * 0.9,
        -dir * sz * 0.3, -sz * 1.5,
        -dir * sz * 0.55, -sz * 1.55
      );
      ctx.lineTo(-dir * sz * 0.95, -sz * 1.35);
      ctx.bezierCurveTo(
        -dir * sz * 0.5, -sz * 1.1,
        -dir * sz * 0.2, -sz * 0.65,
        -dir * sz * 0.55, -sz * 0.5
      );
      ctx.closePath();
      ctx.fill();
      // Wing top edge highlight
      ctx.strokeStyle = 'rgba(120,140,165,0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Bottom wing (mirror)
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.4, sz * 0.55);
      ctx.bezierCurveTo(
        dir * sz * 0.1, sz * 0.95,
        -dir * sz * 0.3, sz * 1.5,
        -dir * sz * 0.55, sz * 1.55
      );
      ctx.lineTo(-dir * sz * 0.95, sz * 1.35);
      ctx.bezierCurveTo(
        -dir * sz * 0.5, sz * 1.1,
        -dir * sz * 0.2, sz * 0.7,
        -dir * sz * 0.55, sz * 0.55
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing panel lines
      ctx.strokeStyle = 'rgba(8,12,20,0.5)';
      ctx.lineWidth = 0.4;
      for (const wy of [-0.95, -0.72, 0.72, 0.95]) {
        ctx.beginPath();
        ctx.moveTo(dir * sz * 0.3, sz * wy * 1.1);
        ctx.lineTo(-dir * sz * 0.45, sz * wy * 1.3);
        ctx.stroke();
      }

      // Wingtip rotor pods (the "twin rotor" design gives it a unique signature)
      for (const wtipSign of [-1, 1]) {
        const tipX = -dir * sz * 0.75;
        const tipY = wtipSign * sz * 1.48;
        // Pod
        const podGrad = ctx.createRadialGradient(tipX - 0.5, tipY - 0.5, 0, tipX, tipY, sz * 0.25);
        podGrad.addColorStop(0, '#4a5261');
        podGrad.addColorStop(0.7, '#18202d');
        podGrad.addColorStop(1, '#0a1018');
        ctx.fillStyle = podGrad;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY, sz * 0.18, sz * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,140,165,0.5)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Spinning rotor disc
        const rotorAlpha = 0.25 + Math.sin(tt * 35 + wtipSign) * 0.1;
        ctx.fillStyle = `rgba(200,210,225,${rotorAlpha})`;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY - wtipSign * sz * 0.1, sz * 0.55, sz * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        // Blur streaks
        ctx.strokeStyle = `rgba(220,230,245,${rotorAlpha * 1.5})`;
        ctx.lineWidth = 0.6;
        for (let b = 0; b < 4; b++) {
          const a = tt * 40 + b * (Math.PI / 2) + wtipSign;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY - wtipSign * sz * 0.1);
          ctx.lineTo(
            tipX + Math.cos(a) * sz * 0.5,
            tipY - wtipSign * sz * 0.1 + Math.sin(a) * sz * 0.1
          );
          ctx.stroke();
        }
      }

      // ── Main heavy fuselage (slate armour) ──
      const bodyLen = sz * 1.4;
      const bodyH = sz * 0.5;
      const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
      bodyGrad.addColorStop(0, '#5a6878');    // highlight
      bodyGrad.addColorStop(0.2, '#3a4452');
      bodyGrad.addColorStop(0.5, '#222c38');
      bodyGrad.addColorStop(0.8, '#111822');
      bodyGrad.addColorStop(1, '#060a10');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * bodyLen, 0);                               // nose
      ctx.bezierCurveTo(
        dir * bodyLen * 0.9, -bodyH * 0.7,
        dir * bodyLen * 0.55, -bodyH * 1.05,
        dir * bodyLen * 0.1, -bodyH * 1.05
      );
      ctx.lineTo(-dir * bodyLen * 0.8, -bodyH * 0.9);             // top edge
      ctx.lineTo(-dir * bodyLen * 1.0, -bodyH * 0.25);            // tail shoulder
      ctx.lineTo(-dir * bodyLen * 1.0, bodyH * 0.25);
      ctx.lineTo(-dir * bodyLen * 0.8, bodyH * 0.9);
      ctx.lineTo(dir * bodyLen * 0.1, bodyH * 1.05);
      ctx.bezierCurveTo(
        dir * bodyLen * 0.55, bodyH * 1.05,
        dir * bodyLen * 0.9, bodyH * 0.7,
        dir * bodyLen, 0
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,100,130,0.55)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // Top specular stripe
      const specBodyGrad = ctx.createLinearGradient(0, -bodyH, 0, -bodyH * 0.3);
      specBodyGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specBodyGrad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      specBodyGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specBodyGrad;
      ctx.fillRect(-bodyLen * 0.8, -bodyH, bodyLen * 1.7, bodyH * 0.55);

      // Panel lines
      ctx.strokeStyle = 'rgba(8,12,20,0.45)';
      ctx.lineWidth = 0.35;
      for (const plx of [-0.55, -0.2, 0.15, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(dir * bodyLen * plx, -bodyH * 0.95);
        ctx.lineTo(dir * bodyLen * plx, bodyH * 0.95);
        ctx.stroke();
      }

      // Rivet dots along the spine
      ctx.fillStyle = 'rgba(100,120,145,0.45)';
      for (let r = 0; r < 6; r++) {
        const rx = dir * bodyLen * (-0.7 + r * 0.27);
        ctx.beginPath();
        ctx.arc(rx, -bodyH * 0.55, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, bodyH * 0.55, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Blue-tinted cockpit canopy up front ──
      const cockpitGrad = ctx.createLinearGradient(0, -bodyH * 0.8, 0, -bodyH * 0.1);
      cockpitGrad.addColorStop(0, 'rgba(180,220,255,0.9)');
      cockpitGrad.addColorStop(0.5, 'rgba(80,140,220,0.7)');
      cockpitGrad.addColorStop(1, 'rgba(20,40,80,0.3)');
      ctx.fillStyle = cockpitGrad;
      ctx.beginPath();
      ctx.moveTo(dir * bodyLen * 0.88, -bodyH * 0.1);
      ctx.bezierCurveTo(
        dir * bodyLen * 0.7, -bodyH * 0.8,
        dir * bodyLen * 0.45, -bodyH * 0.85,
        dir * bodyLen * 0.35, -bodyH * 0.2
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,245,255,0.5)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Cockpit frame divider
      ctx.strokeStyle = 'rgba(20,30,50,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(dir * bodyLen * 0.58, -bodyH * 0.82);
      ctx.lineTo(dir * bodyLen * 0.62, -bodyH * 0.15);
      ctx.stroke();

      // ── Dorsal engine pod (distinctive intake on top) ──
      const intakeGrad = ctx.createLinearGradient(0, -bodyH * 1.55, 0, -bodyH * 1.0);
      intakeGrad.addColorStop(0, '#1a2028');
      intakeGrad.addColorStop(1, '#0a0d12');
      ctx.fillStyle = intakeGrad;
      ctx.beginPath();
      ctx.moveTo(dir * bodyLen * 0.25, -bodyH * 1.02);
      ctx.lineTo(-dir * bodyLen * 0.3, -bodyH * 1.05);
      ctx.lineTo(-dir * bodyLen * 0.15, -bodyH * 1.45);
      ctx.lineTo(dir * bodyLen * 0.15, -bodyH * 1.45);
      ctx.closePath();
      ctx.fill();
      // Intake grill
      ctx.strokeStyle = 'rgba(60,80,100,0.7)';
      ctx.lineWidth = 0.5;
      for (let g2 = 0; g2 < 5; g2++) {
        const gx = dir * bodyLen * (0.1 - g2 * 0.1);
        ctx.beginPath();
        ctx.moveTo(gx, -bodyH * 1.4);
        ctx.lineTo(gx + dir * 0.6, -bodyH * 1.1);
        ctx.stroke();
      }

      // ── Bomb bay (visible when bomb ready, hatch open) ──
      const bayY = bodyH * 0.7;
      if (bombReady) {
        // Dark cavity
        const cavGrad = ctx.createRadialGradient(0, bayY, 0, 0, bayY, sz * 0.55);
        cavGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
        cavGrad.addColorStop(0.6, 'rgba(10,5,0,0.6)');
        cavGrad.addColorStop(1, 'rgba(20,10,0,0)');
        ctx.fillStyle = cavGrad;
        ctx.beginPath();
        ctx.ellipse(0, bayY, sz * 0.55, sz * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glowing hot core — primed bomb
        const primePulse = 0.55 + Math.sin(tt * 10) * 0.25;
        ctx.shadowColor = '#ff4d00';
        ctx.shadowBlur = 16;
        const coreGrad = ctx.createRadialGradient(0, bayY, 0, 0, bayY, sz * 0.3);
        coreGrad.addColorStop(0, `rgba(255,220,100,${primePulse})`);
        coreGrad.addColorStop(0.5, `rgba(255,120,30,${primePulse * 0.8})`);
        coreGrad.addColorStop(1, 'rgba(180,40,0,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.ellipse(0, bayY, sz * 0.3, sz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Sparks dripping out
        for (let si = 0; si < 4; si++) {
          const sx = (Math.random() - 0.5) * sz * 0.6;
          const sy = bayY + Math.random() * sz * 0.3;
          ctx.fillStyle = Math.random() > 0.5 ? '#fff7d9' : '#fbbf24';
          ctx.beginPath();
          ctx.arc(sx, sy, 0.7 + Math.random() * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Closed hatch with outline
        ctx.fillStyle = 'rgba(10,14,22,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, bayY, sz * 0.45, sz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Hatch seam line
      ctx.strokeStyle = 'rgba(200,210,225,0.3)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(-sz * 0.45, bayY);
      ctx.lineTo(sz * 0.45, bayY);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Rear dual thrusters ──
      for (const ey of [-bodyH * 0.35, bodyH * 0.35]) {
        // Nozzle housing
        ctx.fillStyle = '#1a2028';
        ctx.beginPath();
        ctx.ellipse(-dir * bodyLen * 0.95, ey, sz * 0.12, sz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,140,170,0.55)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Hot plume
        const plumeGrad = ctx.createRadialGradient(
          -dir * bodyLen * 0.95, ey, 0,
          -dir * bodyLen * 1.25, ey, sz * 0.35
        );
        plumeGrad.addColorStop(0, 'rgba(255,200,120,0.9)');
        plumeGrad.addColorStop(0.4, 'rgba(249,115,22,0.65)');
        plumeGrad.addColorStop(1, 'rgba(130,40,5,0)');
        ctx.fillStyle = plumeGrad;
        ctx.beginPath();
        ctx.ellipse(-dir * bodyLen * 1.1, ey, sz * 0.28, sz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hot core
        ctx.fillStyle = 'rgba(255,255,230,0.88)';
        ctx.beginPath();
        ctx.ellipse(-dir * bodyLen * 0.98, ey, sz * 0.06, sz * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Painted warning "B-01" insignia
      ctx.save();
      ctx.scale(dir, 1);
      ctx.fillStyle = 'rgba(251,191,36,0.75)';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.font = `bold ${sz * 0.3}px 'Tajawal', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('B-01', sz * 0.05, -bodyH * 0.45);
      ctx.fillText('B-01', sz * 0.05, -bodyH * 0.45);
      ctx.restore();

      // ── Menacing red targeting eye ──
      const eyeGlow = 0.7 + Math.sin(tt * 3) * 0.25;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 18;
      const eyeGrad = ctx.createRadialGradient(dir * bodyLen * 0.95, 0, 0, dir * bodyLen * 0.95, 0, 5);
      eyeGrad.addColorStop(0, `rgba(255,220,220,${eyeGlow})`);
      eyeGrad.addColorStop(0.4, `rgba(255,60,60,${eyeGlow})`);
      eyeGrad.addColorStop(1, 'rgba(130,10,10,0.2)');
      ctx.fillStyle = eyeGrad;
      ctx.beginPath();
      ctx.arc(dir * bodyLen * 0.95, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // === Damage effects: fire & smoke on damaged drones ===
    if (damaged) {
      // Fire glow at center
      const fireGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size * 0.8);
      fireGrad.addColorStop(0, `rgba(255, 100, 0, ${0.3 + Math.sin(d.wobble * 12) * 0.15})`);
      fireGrad.addColorStop(0.6, 'rgba(255, 50, 0, 0.1)');
      fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fireGrad;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Flickering fire tongue
      const fireH = 6 + Math.sin(d.wobble * 15) * 4;
      ctx.fillStyle = `rgba(255, 150, 0, ${0.5 + Math.sin(d.wobble * 10) * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(-3, d.size * 0.3);
      ctx.lineTo(0, d.size * 0.3 + fireH);
      ctx.lineTo(3, d.size * 0.3);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 220, 50, 0.6)`;
      ctx.beginPath();
      ctx.moveTo(-1.5, d.size * 0.3);
      ctx.lineTo(0, d.size * 0.3 + fireH * 0.5);
      ctx.lineTo(1.5, d.size * 0.3);
      ctx.fill();

      // Health bar above drone
      const barW = d.size * 2;
      const barH = 3;
      const barY = -d.size - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
      const hpRatio = d.health / d.maxHealth;
      ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
      ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
    }

    ctx.restore();
  }
}

// ─── Laser beams (drawn in world space after drones) ────
function renderLaserBeams(ctx: CanvasRenderingContext2D, g: GameData) {
  const groundY = g.height * 0.78;
  for (const d of g.drones) {
    if (!d.active || d.tier !== 'laser') continue;
    if (d.laserPhase !== 'telegraph' && d.laserPhase !== 'firing') continue;
    const beamX = d.pos.x;
    const startY = d.pos.y + d.size * 0.35;
    const endY = groundY;
    ctx.save();
    if (d.laserPhase === 'telegraph') {
      const t = performance.now() * 0.002;
      const pulse = 0.3 + Math.sin(t * 8) * 0.25;
      // Scanning line from drone to ground
      ctx.strokeStyle = `rgba(255,40,80,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(beamX, startY);
      ctx.lineTo(beamX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Pulsing dot at drone exit point
      ctx.fillStyle = `rgba(255,80,120,${pulse + 0.3})`;
      ctx.beginPath();
      ctx.arc(beamX, startY, 3, 0, Math.PI * 2);
      ctx.fill();
      // Ground target marker
      ctx.strokeStyle = `rgba(255,40,80,${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(beamX, endY, 12 + Math.sin(t * 4) * 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Firing — beam from drone down to ground
      // Outer glow
      const glowGrad = ctx.createLinearGradient(beamX - 30, 0, beamX + 30, 0);
      glowGrad.addColorStop(0, 'rgba(255,40,80,0)');
      glowGrad.addColorStop(0.3, 'rgba(255,40,80,0.12)');
      glowGrad.addColorStop(0.5, 'rgba(255,80,120,0.35)');
      glowGrad.addColorStop(0.7, 'rgba(255,40,80,0.12)');
      glowGrad.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(beamX - 30, startY, 60, endY - startY);
      // Core beam (white hot)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255,80,120,0.8)';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(beamX, startY);
      ctx.lineTo(beamX, endY);
      ctx.stroke();
      // Inner hot pink
      ctx.strokeStyle = 'rgba(255,180,200,1)';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(beamX, startY);
      ctx.lineTo(beamX, endY);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      // Ground burn with glow
      const burnGrad = ctx.createRadialGradient(beamX, endY, 0, beamX, endY, 22);
      burnGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      burnGrad.addColorStop(0.3, 'rgba(255,120,160,0.7)');
      burnGrad.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = burnGrad;
      ctx.beginPath();
      ctx.arc(beamX, endY, 22, 0, Math.PI * 2);
      ctx.fill();
      // Sparks at impact
      const sparkT = performance.now() * 0.003;
      for (let i = 0; i < 4; i++) {
        const sx = beamX + Math.sin(sparkT + i * 1.5) * 12;
        const sy = endY - 2 - Math.abs(Math.sin(sparkT * 2 + i)) * 10;
        ctx.fillStyle = `rgba(255,200,220,${0.5 + Math.sin(sparkT + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineCap = 'butt';
    }
    ctx.restore();
  }
}

// ─── Player (Procedural Human) ───────────────────────
function renderPlayer(ctx: CanvasRenderingContext2D, g: GameData) {
  const p = g.player;
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  const S = 1.6;
  ctx.scale(S, S);

  const isHit = p.hitTimer > 0;
  if (isHit) {
    const shake = Math.sin(g.elapsed * 80) * 2;
    ctx.translate(shake, 0);
  }

  // Animation offsets
  let legOffset = 0;
  let armOffset = 0;
  let bodyBob = 0;
  let lean = 0;

  if (p.anim === 'walk') {
    const cycle = Math.sin(p.animFrame * Math.PI / 2 + p.animTimer * 15);
    legOffset = cycle * 5;
    armOffset = -cycle * 4;
    bodyBob = Math.abs(cycle) * 1.5;
  } else if (p.anim === 'roll') {
    const rollProgress = 1 - p.dashTimer / 0.25;
    lean = rollProgress * Math.PI * 2;
  } else {
    bodyBob = Math.sin(g.elapsed * 2.5) * 0.8;
  }

  // Dust particles during roll
  if (p.anim === 'roll') {
    for (let i = 0; i < 3; i++) {
      const dx = -10 - Math.random() * 15;
      const dy = -2 + Math.random() * 6;
      ctx.fillStyle = `rgba(180, 160, 130, ${0.15 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(dx, dy, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shadow
  const shadowPulse = 1 + Math.abs(bodyBob) * 0.05;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.ellipse(0, 3, (p.size + 6) * shadowPulse, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, (p.size + 1) * shadowPulse, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.anim === 'roll') ctx.rotate(lean);

  // Use shared drawCharacter
  const isShooting = p.shootTimer > 0;
  drawCharacter(ctx, {
    x: 0, y: 0,
    scale: 1,
    sitting: false,
    facingRight: p.facingRight,
    isDriver: false,
    helmetColor: '#334155',
    bodyBob,
    armOffset,
    legOffset,
    isHit,
    elapsed: g.elapsed,
    isShooting,
    shootTimer: p.shootTimer,
    hasGasMask: p.gasMaskTimer > 0,
    // Don/doff progress (0..1) — donTimer starts at 0.6, doffTimer at 0.45
    gasMaskDon: p.gasMaskTimer > 0 ? 1 - (p.gasMaskDonTimer / 0.6) : 0,
    gasMaskDoff: p.gasMaskDoffTimer > 0 ? (p.gasMaskDoffTimer / 0.45) : 0,
    hasFireSuit: p.fireSuitTimer > 0,
    fireSuitDon: p.fireSuitTimer > 0 ? 1 - (p.fireSuitDonTimer / 0.6) : 0,
    fireSuitDoff: p.fireSuitDoffTimer > 0 ? (p.fireSuitDoffTimer / 0.5) : 0,
  });

  // Health bar above head (drawn after character, in player's local space)
  const hpRatio = p.health / p.maxHealth;
  const headY = -32 + bodyBob;
  const scale = p.facingRight ? 1 : -1;
  if (hpRatio < 1) {
    ctx.save();
    ctx.scale(scale, 1); // undo facing flip for consistent bar
    const barW = 14;
    const barH = 2;
    const barX = -barW / 2;
    const barY2 = headY - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX - 0.5, barY2 - 0.5, barW + 1, barH + 1);
    const hpColor = hpRatio > 0.6 ? '#22c55e' : hpRatio > 0.3 ? '#eab308' : '#ef4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY2, barW * hpRatio, barH);
    ctx.restore();
  }

  // Shield aura
  if (p.shielded) {
    const shieldR = p.size + 12;
    const shieldY = -16;
    const sides = 6;
    const shieldPulse = 0.4 + Math.sin(g.elapsed * 5) * 0.2;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const sx = Math.cos(a) * shieldR;
      const sy = shieldY + Math.sin(a) * shieldR;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(96, 165, 250, ${shieldPulse + 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = `rgba(96, 165, 250, 0.06)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(150, 200, 255, ${shieldPulse * 0.3})`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, shieldY);
      ctx.lineTo(Math.cos(a) * shieldR, shieldY + Math.sin(a) * shieldR);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(96, 165, 250, ${shieldPulse * 0.15})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, shieldY, shieldR + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Bullets ──────────────────────────────────────────
function renderBullets(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const b of g.bullets) {
    if (!b.active) continue;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);

    // Gradient trail based on velocity
    const speed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
    const nx = b.vel.x / speed;
    const ny = b.vel.y / speed;
    const trailLen = Math.min(20, speed * 0.025);

    // Long gradient trail
    const trailGrad = ctx.createLinearGradient(0, 0, -nx * trailLen, -ny * trailLen);
    trailGrad.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
    trailGrad.addColorStop(0.4, 'rgba(251, 191, 36, 0.15)');
    trailGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = b.size * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-nx * trailLen, -ny * trailLen);
    ctx.stroke();

    // Glow
    ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, b.size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Bullet core — bright yellow
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, b.size * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // White hot center
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, b.size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── Particles ────────────────────────────────────────
function renderParticles(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const pt of g.particles) {
    if (!pt.active) continue;
    const alpha = pt.life / pt.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    // Velocity-based trail behind particle
    const speed = Math.sqrt(pt.vel.x * pt.vel.x + pt.vel.y * pt.vel.y);
    if (speed > 30) {
      const trailLen = Math.min(pt.size * 3, speed * 0.02);
      const nx = -pt.vel.x / speed;
      const ny = -pt.vel.y / speed;
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.moveTo(pt.pos.x + nx * trailLen, pt.pos.y + ny * trailLen);
      ctx.lineTo(pt.pos.x - pt.size * 0.3, pt.pos.y);
      ctx.lineTo(pt.pos.x + pt.size * 0.3, pt.pos.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    // Round particle instead of square
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, pt.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Ambient Dust ─────────────────────────────────────
function renderAmbient(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const ap of g.ambientParticles) {
    const alpha = ap.opacity * Math.min(1, ap.life / (ap.maxLife * 0.3));
    ctx.fillStyle = `rgba(180, 170, 150, ${alpha})`;
    ctx.fillRect(ap.pos.x, ap.pos.y, ap.size, ap.size);
  }
}

// ─── Floating Texts ───────────────────────────────────
function renderFloatingTexts(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const ft of g.floatingTexts) {
    const alpha = ft.life / ft.maxLife;
    const scale = 0.8 + (1 - alpha) * 0.4;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${14 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
  }
  ctx.globalAlpha = 1;
}

// ─── HUD — Polished ──────────────────────────────────
let lastDisplayScore = 0;
let scoreBounceTimer = 0;

function drawHeartIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const s = size;
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.1, x - s * 0.6, y - s * 0.4, x - s * 0.6, y);
  ctx.bezierCurveTo(x - s * 0.6, y + s * 0.3, x, y + s * 0.65, x, y + s * 0.8);
  ctx.bezierCurveTo(x, y + s * 0.65, x + s * 0.6, y + s * 0.3, x + s * 0.6, y);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 0.4, x, y - s * 0.1, x, y + s * 0.3);
  ctx.fill();
  ctx.restore();
}

function renderHUD(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const p = g.player;
  const t = Date.now() / 1000;

  // ─ Health bar with shine sweep ─
  const barW = 140, barH = 14, barX = 14, barY = 14;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 5);
  ctx.fill();

  const healthRatio = p.health / p.maxHealth;
  const hGrad = ctx.createLinearGradient(barX, 0, barX + barW * healthRatio, 0);
  if (healthRatio > 0.5) {
    hGrad.addColorStop(0, '#22c55e');
    hGrad.addColorStop(1, '#16a34a');
  } else if (healthRatio > 0.25) {
    hGrad.addColorStop(0, '#eab308');
    hGrad.addColorStop(1, '#ca8a04');
  } else {
    hGrad.addColorStop(0, '#ef4444');
    hGrad.addColorStop(1, '#dc2626');
  }
  ctx.fillStyle = hGrad;
  roundRect(ctx, barX, barY, barW * healthRatio, barH, 4);
  ctx.fill();

  // Shine sweep effect
  const sweepPos = ((t * 0.5) % 2) - 0.5; // -0.5 to 1.5
  if (sweepPos > 0 && sweepPos < 1 && healthRatio > 0.1) {
    const sweepX = barX + barW * healthRatio * sweepPos;
    const shineGrad = ctx.createLinearGradient(sweepX - 15, 0, sweepX + 15, 0);
    shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
    shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shineGrad;
    roundRect(ctx, barX, barY, barW * healthRatio, barH, 4);
    ctx.fill();
  }

  // Heart icon
  drawHeartIcon(ctx, barX - 1, barY + barH / 2 - 3, 6,
    healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#eab308' : '#ef4444');

  // Health text
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.ceil(p.health)}`, barX + 8, barY + barH - 3);

  // ─ Protection indicators (gas mask / fire suit) ─
  // Small pills under the health bar with remaining seconds.
  {
    let indY = barY + barH + 6;
    const indH = 11;
    const indPad = 5;
    const drawPill = (label: string, secs: number, bgCol: string, textCol: string) => {
      if (secs <= 0) return;
      const labelText = `${label} ${Math.ceil(secs)}s`;
      ctx.font = 'bold 9px Tajawal, monospace';
      const textW = ctx.measureText(labelText).width;
      const pillW = textW + indPad * 2;
      // Background pill
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, barX - 2, indY - 1, pillW + 4, indH + 2, indH / 2 + 1);
      ctx.fill();
      ctx.fillStyle = bgCol;
      roundRect(ctx, barX, indY, pillW, indH, indH / 2);
      ctx.fill();
      // Label text
      ctx.fillStyle = textCol;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, barX + indPad, indY + indH / 2);
      indY += indH + 4;
    };
    drawPill('🛡 GAS', p.gasMaskTimer, 'rgba(22,163,74,0.55)', '#ecfccb');
    drawPill('🔥 FIRE', p.fireSuitTimer, 'rgba(234,88,12,0.55)', '#ffedd5');
    drawPill('🔍 MINE', p.minesweeperTimer, 'rgba(251,191,36,0.55)', '#fef3c7');
    ctx.textBaseline = 'alphabetic';
  }

  // ─ Score with bounce ─
  if (g.score !== lastDisplayScore) {
    scoreBounceTimer = 0.3;
    lastDisplayScore = g.score;
  }
  if (scoreBounceTimer > 0) scoreBounceTimer -= 0.016;
  const scoreBounce = scoreBounceTimer > 0 ? 1 + Math.sin(scoreBounceTimer * Math.PI / 0.3) * 0.15 : 1;

  ctx.save();
  ctx.translate(w - 14, 28);
  ctx.scale(scoreBounce, scoreBounce);
  // Flash red during countdown
  if (g.scoreCountdown && g.scoreCountdown.remaining > 0) {
    const flash = Math.sin(g.elapsed * 20) > 0 ? '#ef4444' : '#fbbf24';
    ctx.fillStyle = flash;
  } else {
    ctx.fillStyle = '#fff';
  }
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${g.score}`, 0, 0);
  // Show deduction amount
  if (g.scoreCountdown && g.scoreCountdown.remaining > 0) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`-${g.scoreCountdown.remaining}`, 0, 16);
  }
  ctx.restore();

  ctx.font = '10px Tajawal, sans-serif';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'right';
  ctx.fillText(`أعلى علامة: ${g.highScore}`, w - 14, 42);

  // ─ Wave (removed — shown by renderWaveIndicator instead) ─

  // ─ Dash indicator ─
  if (p.dashCooldown > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`تدحرج ${p.dashCooldown.toFixed(1)}`, w - 14, h - 14);
  } else {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px Tajawal, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('تدحرج ●', w - 14, h - 14);
  }

  // ─ Ammo indicator (visual bullet icons) ─
  if (p.ammo > 0) {
    const maxDisplay = Math.min(p.ammo, 20);
    const iconSize = 3;
    const iconGap = 7;
    const totalIconW = maxDisplay * iconGap;
    const startX = w / 2 - totalIconW / 2;
    const iconY = h - 16;
    for (let i = 0; i < maxDisplay; i++) {
      const ix = startX + i * iconGap;
      // Bullet icon — small rectangle with rounded tip
      ctx.fillStyle = '#d4a017';
      ctx.beginPath();
      ctx.roundRect(ix - iconSize * 0.4, iconY - iconSize, iconSize * 0.8, iconSize * 1.8, 1);
      ctx.fill();
      // Tip
      ctx.fillStyle = '#a04510';
      ctx.beginPath();
      ctx.arc(ix, iconY - iconSize, iconSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.ammo > 20) {
      ctx.fillStyle = '#4a5c2a';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`+${p.ammo - 20}`, startX + totalIconW + 3, iconY + 2);
    }
    // Level indicator
    if (g.bulletLevel > 1) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`×${g.bulletLevel}`, w / 2, iconY + 12);
    }
  }

  // ─ Combo counter with sparks ─
  if (g.comboCount > 1) {
    const comboPulse = 1 + Math.sin(t * 8) * 0.08;
    ctx.save();
    ctx.translate(w / 2, 60);
    ctx.scale(comboPulse, comboPulse);
    const comboGrad = ctx.createLinearGradient(-30, -10, 30, 10);
    comboGrad.addColorStop(0, '#fbbf24');
    comboGrad.addColorStop(0.5, '#f59e0b');
    comboGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = comboGrad;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`×${g.comboMultiplier.toFixed(1)}`, 0, 0);
    // Combo count below
    ctx.fillStyle = 'rgba(251,191,36,0.6)';
    ctx.font = '9px Tajawal, Arial, sans-serif';
    ctx.fillText(`${g.comboCount} إصابة`, 0, 13);

    // Gold sparks around combo counter at ×2+
    if (g.comboMultiplier >= 2) {
      for (let i = 0; i < 4; i++) {
        const sparkAngle = t * 3 + i * Math.PI / 2;
        const sparkR = 30 + Math.sin(t * 5 + i) * 5;
        const sx = Math.cos(sparkAngle) * sparkR;
        const sy = Math.sin(sparkAngle) * sparkR * 0.4;
        const sAlpha = 0.4 + Math.sin(t * 8 + i * 1.5) * 0.3;
        ctx.fillStyle = `rgba(251, 191, 36, ${sAlpha})`;
        ctx.beginPath();
        const ss = 2;
        ctx.moveTo(sx, sy - ss * 2);
        ctx.lineTo(sx + ss * 0.4, sy);
        ctx.lineTo(sx, sy + ss * 2);
        ctx.lineTo(sx - ss * 0.4, sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Bullet level
  if (g.bulletLevel > 1) {
    ctx.fillStyle = g.bulletLevel >= 3 ? '#fbbf24' : '#22c55e';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`سلاح ×${g.bulletLevel}`, 14, 64);
  }

  // ─ Active effects with circular progress ─
  let effectY = 76;
  const drawCircularProgress = (cx: number, cy: number, r: number, ratio: number, color: string) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
  };

  if (g.slowMoTimer > 0) {
    const blink = g.slowMoTimer < 1.5 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    drawCircularProgress(20, effectY - 2, 5, g.slowMoTimer / 5, '#06b6d4');
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`بطيء ${g.slowMoTimer.toFixed(1)}`, 30, effectY + 2);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  if (g.magnetFlashTimer > 0) {
    const blink = g.magnetFlashTimer < 0.5 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    drawCircularProgress(20, effectY - 2, 5, 1, '#94a3b8');
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('مغناطيس', 30, effectY + 2);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  if (p.shielded) {
    const blink = p.shieldTimer < 2 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    drawCircularProgress(20, effectY - 2, 5, p.shieldTimer / 8, '#60a5fa');
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`درع ${p.shieldTimer.toFixed(1)}`, 30, effectY + 2);
    ctx.globalAlpha = 1;
  }
  // Extinguisher timer
  if (p.extinguisherTimer > 0) {
    const blink = p.extinguisherTimer < 2 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    drawCircularProgress(20, effectY - 2, 5, p.extinguisherTimer / 8, '#f97316');
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`إطفاء ${p.extinguisherTimer.toFixed(1)}`, 30, effectY + 2);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  // Gas mask owned icon
  if (g.gasMaskOwned) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 11px Tajawal, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('😷 كمامة نشطة', 15, effectY + 2);
    effectY += 18;
  }

  // Gas mask purchase offer card — styled like upgrade cards (responsive)
  if (g.gasMaskOffer && g.gasMaskOffer.active && g.state === 'playing') {
    const cardW = Math.min(200, g.width - 40);
    const cardH = Math.min(270, g.height * 0.55);
    const cardX = (g.width - cardW) / 2;
    const offerDuration = 8;
    const slideIn = Math.min(1, (offerDuration - g.gasMaskOffer.timer) * 4);
    const fadeOut = g.gasMaskOffer.timer < 1 ? g.gasMaskOffer.timer : 1;
    const slideY = (1 - slideIn) * 80;
    const cardY = g.height * 0.5 - cardH / 2 + slideY;

    // Heavy dark overlay
    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * slideIn * fadeOut})`;
    ctx.fillRect(0, 0, g.width, g.height);

    ctx.globalAlpha = slideIn * fadeOut;

    // Card shadow
    ctx.shadowColor = 'rgba(0, 200, 80, 0.4)';
    ctx.shadowBlur = 30;

    // Card background gradient
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bgGrad.addColorStop(0, 'rgba(20, 83, 45, 0.97)');
    bgGrad.addColorStop(0.5, 'rgba(15, 60, 35, 0.97)');
    bgGrad.addColorStop(1, 'rgba(10, 40, 25, 0.97)');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Border glow
    ctx.strokeStyle = `rgba(74, 222, 128, ${0.5 + Math.sin(g.elapsed * 3) * 0.2})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.stroke();

    // Inner border
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 13);
    ctx.stroke();

    const cx = cardX + cardW / 2;

    // Icon circle background
    const iconY = cardY + 65;
    const iconGrad = ctx.createRadialGradient(cx, iconY, 0, cx, iconY, 36);
    iconGrad.addColorStop(0, 'rgba(74, 222, 128, 0.25)');
    iconGrad.addColorStop(1, 'rgba(74, 222, 128, 0.05)');
    ctx.fillStyle = iconGrad;
    ctx.beginPath();
    ctx.arc(cx, iconY, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gas mask icon (drawn larger)
    ctx.save();
    ctx.translate(cx, iconY);
    const s = 1.4;
    // Mask body
    ctx.fillStyle = '#2d5a3d';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 16 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Eye windows
    ctx.fillStyle = 'rgba(180, 255, 200, 0.4)';
    ctx.strokeStyle = '#3a7a50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-6 * s, -2 * s, 4 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(6 * s, -2 * s, 4 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Filter canister
    ctx.fillStyle = '#1a3a25';
    ctx.beginPath();
    ctx.arc(0, 10 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Filter lines
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3 * s, 9 * s); ctx.lineTo(3 * s, 9 * s);
    ctx.moveTo(-2 * s, 11 * s); ctx.lineTo(2 * s, 11 * s);
    ctx.stroke();
    // Straps
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14 * s, -2 * s); ctx.lineTo(-18 * s, -6 * s);
    ctx.moveTo(14 * s, -2 * s); ctx.lineTo(18 * s, -6 * s);
    ctx.stroke();
    ctx.restore();

    // Title — Arabic
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText('كمامة غاز', cx, cardY + 120);

    // Hint text
    ctx.fillStyle = 'rgba(200, 255, 200, 0.8)';
    ctx.font = '13px Tajawal, sans-serif';
    ctx.fillText('احمِ نفسك من الغاز!', cx, cardY + 148);

    // Cost — first offer is free
    drawOfferPrice(ctx, cx, cardY + 185, g.gasMaskOffer.cost, !g.gasMaskEverOffered);

    // "اضغط على البطاقة للشراء" — full-card hint
    const pressPulse = 0.5 + Math.sin(g.elapsed * 4) * 0.3;
    ctx.fillStyle = `rgba(74, 222, 128, ${pressPulse})`;
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.fillText('اضغط البطاقة للشراء', cx, cardY + 218);

    // Timer bar at bottom
    const timerRatio = g.gasMaskOffer.timer / offerDuration;
    ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, cardW - 12, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(74, 222, 128, 0.7)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, (cardW - 12) * timerRatio, 6, 3);
    ctx.fill();

    // ── Refuse pill below the card ──
    const refuseW = Math.min(150, cardW);
    const refuseH = 34;
    const refuseX = (g.width - refuseW) / 2;
    const refuseY = cardY + cardH + 12;
    // Pill background
    ctx.fillStyle = 'rgba(40,40,50,0.75)';
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.stroke();
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('بدّيش أشتري', refuseX + refuseW / 2, refuseY + refuseH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    ctx.globalAlpha = 1;
  }

  // ── Fire-suit purchase offer card (orange palette, mirrors gas mask) ──
  if (g.fireSuitOffer && g.fireSuitOffer.active && g.state === 'playing') {
    const cardW = Math.min(200, g.width - 40);
    const cardH = Math.min(270, g.height * 0.55);
    const cardX = (g.width - cardW) / 2;
    const offerDuration = 8;
    const slideIn = Math.min(1, (offerDuration - g.fireSuitOffer.timer) * 4);
    const fadeOut = g.fireSuitOffer.timer < 1 ? g.fireSuitOffer.timer : 1;
    const slideY = (1 - slideIn) * 80;
    const cardY = g.height * 0.5 - cardH / 2 + slideY;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * slideIn * fadeOut})`;
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.globalAlpha = slideIn * fadeOut;

    ctx.shadowColor = 'rgba(249, 115, 22, 0.45)';
    ctx.shadowBlur = 30;
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bgGrad.addColorStop(0, 'rgba(124, 45, 18, 0.97)');
    bgGrad.addColorStop(0.5, 'rgba(91, 32, 13, 0.97)');
    bgGrad.addColorStop(1, 'rgba(60, 20, 8, 0.97)');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(251, 146, 60, ${0.55 + Math.sin(g.elapsed * 3) * 0.2})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 146, 60, 0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 13);
    ctx.stroke();

    const cx = cardX + cardW / 2;
    const iconY = cardY + 65;

    // Icon backdrop
    const iconGrad = ctx.createRadialGradient(cx, iconY, 0, cx, iconY, 36);
    iconGrad.addColorStop(0, 'rgba(251, 146, 60, 0.28)');
    iconGrad.addColorStop(1, 'rgba(251, 146, 60, 0.05)');
    ctx.fillStyle = iconGrad;
    ctx.beginPath();
    ctx.arc(cx, iconY, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Big fire suit icon
    ctx.save();
    ctx.translate(cx, iconY);
    const ss = 1.8;
    drawFireSuitIcon(ctx, 20 * ss);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText('بدلة نار', cx, cardY + 120);

    ctx.fillStyle = 'rgba(255, 220, 180, 0.85)';
    ctx.font = '13px Tajawal, sans-serif';
    ctx.fillText('احمِ نفسك من النيران!', cx, cardY + 148);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px Tajawal, sans-serif';
    drawOfferPrice(ctx, cx, cardY + 185, g.fireSuitOffer.cost, !g.fireSuitEverOffered);

    const pressPulse = 0.5 + Math.sin(g.elapsed * 4) * 0.3;
    ctx.fillStyle = `rgba(251, 146, 60, ${pressPulse})`;
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.fillText('اضغط البطاقة للشراء', cx, cardY + 218);

    const timerRatio = g.fireSuitOffer.timer / offerDuration;
    ctx.fillStyle = 'rgba(251, 146, 60, 0.2)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, cardW - 12, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(251, 146, 60, 0.75)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, (cardW - 12) * timerRatio, 6, 3);
    ctx.fill();

    // ── Refuse pill below the card ──
    const refuseW = Math.min(150, cardW);
    const refuseH = 34;
    const refuseX = (g.width - refuseW) / 2;
    const refuseY = cardY + cardH + 12;
    ctx.fillStyle = 'rgba(40,40,50,0.75)';
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('بدّيش أشتري', refuseX + refuseW / 2, refuseY + refuseH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    ctx.globalAlpha = 1;
  }

  // ═══ Minesweeper offer card ═══
  if (g.minesweeperOffer && g.minesweeperOffer.active && g.state === 'playing') {
    const cardW = Math.min(200, g.width - 40);
    const cardH = Math.min(270, g.height * 0.55);
    const cardX = (g.width - cardW) / 2;
    const offerDuration = 8;
    const slideIn = Math.min(1, (offerDuration - g.minesweeperOffer.timer) * 4);
    const fadeOut = g.minesweeperOffer.timer < 1 ? g.minesweeperOffer.timer : 1;
    const slideY = (1 - slideIn) * 80;
    const cardY = g.height * 0.5 - cardH / 2 + slideY;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * slideIn * fadeOut})`;
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.globalAlpha = slideIn * fadeOut;

    ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
    ctx.shadowBlur = 30;
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bgGrad.addColorStop(0, 'rgba(120, 90, 15, 0.97)');
    bgGrad.addColorStop(0.5, 'rgba(90, 65, 10, 0.97)');
    bgGrad.addColorStop(1, 'rgba(60, 43, 6, 0.97)');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(251, 191, 36, ${0.55 + Math.sin(g.elapsed * 3) * 0.2})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 13);
    ctx.stroke();

    const cx = cardX + cardW / 2;
    const iconY = cardY + 65;

    const iconGrad = ctx.createRadialGradient(cx, iconY, 0, cx, iconY, 36);
    iconGrad.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
    iconGrad.addColorStop(1, 'rgba(251, 191, 36, 0.05)');
    ctx.fillStyle = iconGrad;
    ctx.beginPath();
    ctx.arc(cx, iconY, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Metal detector icon — handle + head
    ctx.save();
    ctx.translate(cx, iconY);
    ctx.rotate(-0.25);
    // Handle
    ctx.strokeStyle = '#8b6b2e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.lineTo(-2, 16);
    ctx.stroke();
    // Disc head
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(-2, 18, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a3310';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Pulse dot
    ctx.fillStyle = 'rgba(34,197,94,0.9)';
    ctx.beginPath();
    ctx.arc(-2, 16, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText('كاشف ألغام', cx, cardY + 120);

    ctx.fillStyle = 'rgba(255, 232, 170, 0.85)';
    ctx.font = '13px Tajawal, sans-serif';
    ctx.fillText('اقترب من اللغم لتفكيكه!', cx, cardY + 148);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px Tajawal, sans-serif';
    drawOfferPrice(ctx, cx, cardY + 185, g.minesweeperOffer.cost, !g.minesweeperEverOffered, '1%');

    const pressPulse = 0.5 + Math.sin(g.elapsed * 4) * 0.3;
    ctx.fillStyle = `rgba(251, 191, 36, ${pressPulse})`;
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.fillText('اضغط البطاقة للشراء', cx, cardY + 218);

    const timerRatio = g.minesweeperOffer.timer / offerDuration;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, cardW - 12, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
    roundRect(ctx, cardX + 6, cardY + cardH - 12, (cardW - 12) * timerRatio, 6, 3);
    ctx.fill();

    const refuseW = Math.min(150, cardW);
    const refuseH = 34;
    const refuseX = (g.width - refuseW) / 2;
    const refuseY = cardY + cardH + 12;
    ctx.fillStyle = 'rgba(40,40,50,0.75)';
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, refuseX, refuseY, refuseW, refuseH, refuseH / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('بدّيش أشتري', refuseX + refuseW / 2, refuseY + refuseH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    ctx.globalAlpha = 1;
  }
}

/** Draws the price for an offer card, with strike-through + "أول مرة علينا" on first offer. */
function drawOfferPrice(ctx: CanvasRenderingContext2D, cx: number, baselineY: number, cost: number, firstTime: boolean, suffix?: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (firstTime) {
    // Strike-through original price
    ctx.fillStyle = 'rgba(251,191,36,0.55)';
    ctx.font = 'bold 16px Tajawal, sans-serif';
    const label = suffix ? `⭐ ${cost} ${suffix}` : `⭐ ${cost}`;
    const textW = ctx.measureText(label).width;
    ctx.fillText(label, cx, baselineY - 16);
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - textW / 2 - 3, baselineY - 21);
    ctx.lineTo(cx + textW / 2 + 3, baselineY - 21);
    ctx.stroke();
    // Free label
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 22px Tajawal, sans-serif';
    ctx.fillText('🎁 مجاناً', cx, baselineY + 6);
    ctx.fillStyle = 'rgba(34,197,94,0.9)';
    ctx.font = 'bold 11px Tajawal, sans-serif';
    ctx.fillText('أول مرة علينا', cx, baselineY + 22);
  } else {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px Tajawal, sans-serif';
    ctx.fillText(suffix ? `⭐ ${cost}  (${suffix})` : `⭐ ${cost}`, cx, baselineY);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

// ─── Weather Effects ──────────────────────────────────
function renderRain(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.rainDrops.length === 0) return;
  ctx.strokeStyle = `rgba(150, 170, 200, ${0.15 + g.weatherIntensity * 0.15})`;
  ctx.lineWidth = 1;
  for (const rd of g.rainDrops) {
    ctx.beginPath();
    ctx.moveTo(rd.x, rd.y);
    ctx.lineTo(rd.x + g.windOffset * 8, rd.y + rd.len);
    ctx.stroke();
  }
}

function renderLightning(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.lightningFlash <= 0) return;
  ctx.fillStyle = `rgba(200, 210, 255, ${g.lightningFlash * 0.5})`;
  ctx.fillRect(0, 0, g.width, g.height);
}

// ─── Boss ─────────────────────────────────────────────
function renderBoss(ctx: CanvasRenderingContext2D, g: GameData) {
  const boss = g.boss;
  if (!boss || boss.defeated) return;
  ctx.save();
  ctx.translate(boss.pos.x, boss.pos.y);

  const s = boss.size;
  const isMini = !!boss.isMini;
  const tilt = Math.sin(g.elapsed * (isMini ? 1.2 : 0.8)) * (isMini ? 0.05 : 0.03);
  ctx.rotate(tilt);

  // Mini-boss color tint
  if (isMini) {
    ctx.filter = 'hue-rotate(30deg) saturate(1.4)';
  }

  // Damage flash
  if (boss.damageFlash > 0) {
    ctx.globalAlpha = 0.7 + boss.damageFlash;
  }

  // Mini-boss label
  if (isMini) {
    ctx.save();
    ctx.filter = 'none';
    const pulse = 0.7 + Math.sin(g.elapsed * 5) * 0.3;
    ctx.fillStyle = `rgba(245,158,11,${pulse})`;
    ctx.font = 'bold 11px Tajawal, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ قائد معركة', 0, -s * 0.65);
    ctx.restore();
  }

  // Shadow on ground
  const groundY = g.height * 0.78 - boss.pos.y;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, groundY, s * 0.6, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main fuselage
  const bodyGrad = ctx.createLinearGradient(0, -s * 0.15, 0, s * 0.15);
  bodyGrad.addColorStop(0, '#4a4540');
  bodyGrad.addColorStop(0.5, '#2a2520');
  bodyGrad.addColorStop(1, '#1a1510');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(s * 0.6, 0);        // nose
  ctx.lineTo(s * 0.3, -s * 0.12);
  ctx.lineTo(-s * 0.5, -s * 0.1);
  ctx.lineTo(-s * 0.6, 0);       // tail
  ctx.lineTo(-s * 0.5, s * 0.12);
  ctx.lineTo(s * 0.3, s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a5550';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Wings
  ctx.fillStyle = '#333028';
  // Top wing
  ctx.beginPath();
  ctx.moveTo(s * 0.1, -s * 0.1);
  ctx.lineTo(-s * 0.15, -s * 0.5);
  ctx.lineTo(-s * 0.45, -s * 0.45);
  ctx.lineTo(-s * 0.3, -s * 0.1);
  ctx.fill();
  // Bottom wing
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.12);
  ctx.lineTo(-s * 0.15, s * 0.5);
  ctx.lineTo(-s * 0.45, s * 0.45);
  ctx.lineTo(-s * 0.3, s * 0.12);
  ctx.fill();

  // Tail
  ctx.fillStyle = '#2a2520';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.lineTo(-s * 0.65, -s * 0.2);
  ctx.lineTo(-s * 0.6, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.lineTo(-s * 0.65, s * 0.2);
  ctx.lineTo(-s * 0.6, 0);
  ctx.fill();

  // Cockpit
  ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(s * 0.35, 0, s * 0.08, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Engines (4x)
  const enginePositions = [
    { x: -s * 0.35, y: -s * 0.35 },
    { x: -s * 0.35, y: s * 0.35 },
    { x: -s * 0.25, y: -s * 0.15 },
    { x: -s * 0.25, y: s * 0.18 },
  ];
  for (const ep of enginePositions) {
    ctx.fillStyle = '#f97316';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(ep.x, ep.y, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Exhaust
    const exLen = 8 + Math.random() * 6;
    ctx.fillStyle = `rgba(249, 115, 22, ${0.4 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(ep.x, ep.y - 1.5);
    ctx.lineTo(ep.x - exLen, ep.y);
    ctx.lineTo(ep.x, ep.y + 1.5);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Warning stripes if phase 2+
  if (boss.phase >= 2) {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.1);
    ctx.lineTo(-s * 0.3, s * 0.12);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Weapon hardpoints (missiles under wings)
  ctx.fillStyle = '#555';
  ctx.fillRect(s * 0.05, -s * 0.38, 6, 3);
  ctx.fillRect(s * 0.05, s * 0.35, 6, 3);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(s * 0.1, -s * 0.37, 3, 2);
  ctx.fillRect(s * 0.1, s * 0.36, 3, 2);

  // Damage fire
  if (boss.health < boss.maxHealth * 0.6) {
    const fires = boss.health < boss.maxHealth * 0.3 ? 3 : 1;
    for (let i = 0; i < fires; i++) {
      const fx = (Math.random() - 0.5) * s * 0.5;
      const fy = (Math.random() - 0.5) * s * 0.2;
      const fh = 8 + Math.random() * 8;
      ctx.fillStyle = `rgba(255, 120, 0, ${0.5 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(fx - 3, fy);
      ctx.lineTo(fx, fy + fh);
      ctx.lineTo(fx + 3, fy);
      ctx.fill();
    }
  }

  // Health bar
  const barW = s * 1.2;
  const barH = 5;
  const barY = -s * 0.3 - 12;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  const hpRatio = boss.health / boss.maxHealth;
  const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillStyle = hpColor;
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Player Glow (health-based ambient lighting) ─────
function renderPlayerGlow(ctx: CanvasRenderingContext2D, g: GameData) {
  const p = g.player;
  const hpRatio = p.health / p.maxHealth;
  // Green → Yellow → Red based on health
  const r = hpRatio > 0.5 ? Math.round((1 - hpRatio) * 2 * 200 + 50) : 250;
  const gr = hpRatio > 0.5 ? 200 : Math.round(hpRatio * 2 * 200);
  const b2 = hpRatio > 0.8 ? 100 : 50;
  const pulse = 0.03 + Math.sin(g.elapsed * 3) * 0.01;
  const glowGrad = ctx.createRadialGradient(p.pos.x, p.pos.y - 10, 5, p.pos.x, p.pos.y - 10, 55);
  glowGrad.addColorStop(0, `rgba(${r}, ${gr}, ${b2}, ${pulse})`);
  glowGrad.addColorStop(1, `rgba(${r}, ${gr}, ${b2}, 0)`);
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y - 10, 55, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Off-screen Threat Indicators ─────────────────────
function renderOffscreenIndicators(ctx: CanvasRenderingContext2D, g: GameData) {
  const margin = 20;
  const arrowSize = 8;
  const camX = g.camera.x;

  const threats: { x: number; y: number; color: string }[] = [];

  for (const h of g.hazards) {
    if (!h.active || !h.falling) continue;
    const sx = h.pos.x - camX;
    const sy = h.pos.y;
    if (sx < -10 || sx > g.width + 10 || sy < -10) {
      threats.push({ x: sx, y: sy, color: h.type === 'cluster' ? '#f59e0b' : '#ef4444' });
    }
  }
  for (const d of g.drones) {
    if (!d.active) continue;
    const sx = d.pos.x - camX;
    const sy = d.pos.y;
    if (sx < -10 || sx > g.width + 10 || sy < -10) {
      threats.push({ x: sx, y: sy, color: '#f97316' });
    }
  }

  for (const t of threats) {
    const cx = Math.max(margin, Math.min(g.width - margin, t.x));
    const cy = Math.max(margin, Math.min(g.height - margin, t.y));
    const angle = Math.atan2(t.y - g.height / 2, t.x - g.width / 2);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = 0.7 + Math.sin(g.elapsed * 6) * 0.3;
    ctx.beginPath();
    ctx.moveTo(arrowSize, 0);
    ctx.lineTo(-arrowSize * 0.5, -arrowSize * 0.6);
    ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ─── Shared Character Drawing ────────────────────────
interface CharacterOptions {
  x: number;
  y: number;
  scale: number;
  sitting: boolean;
  facingRight: boolean;
  isDriver: boolean;
  helmetColor: string;
  bodyBob: number;
  armOffset: number;
  legOffset: number;
  isHit: boolean;
  elapsed: number;
  holdingDriver?: boolean;
  isShooting?: boolean;
  shootTimer?: number;
  isWaving?: boolean;
  hasGoggles?: boolean;
  lookingBack?: boolean;
  hasGasMask?: boolean;
  /** Gas mask donning progress (0..1). 0 = not yet worn, 1 = fully worn. */
  gasMaskDon?: number;
  /** Gas mask doffing progress (0..1). 1 = just started lifting, 0 = fully removed. */
  gasMaskDoff?: number;
  hasFireSuit?: boolean;
  /** Fire suit donning progress (0..1). */
  fireSuitDon?: number;
  /** Fire suit doffing progress (0..1). */
  fireSuitDoff?: number;
}

function drawCharacter(ctx: CanvasRenderingContext2D, opts: CharacterOptions) {
  const {
    x, y, scale, sitting, facingRight, isDriver, helmetColor,
    bodyBob, armOffset, legOffset, isHit, elapsed,
    holdingDriver, isShooting, shootTimer, isWaving, hasGoggles, lookingBack, hasGasMask,
    gasMaskDon, gasMaskDoff, hasFireSuit, fireSuitDon, fireSuitDoff,
  } = opts;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const dir = facingRight ? 1 : -1;
  ctx.scale(dir, 1);

  // Fire suit colour override — bright firefighter red with warm highlight.
  // The suit is only considered visually active once the donning animation
  // is far enough along to cover the body (reveal > 0.55).
  const fireSuitFullyOn = !!hasFireSuit && (fireSuitDon ?? 1) >= 0.55 && (fireSuitDoff ?? 0) < 0.45;

  const skinColor = isHit ? '#fca5a5' : '#f0c4a0';
  const skinHighlight = isHit ? '#fecaca' : '#fad5b5';
  const pantsColor = fireSuitFullyOn ? '#b91c1c' : '#1a2f4a';
  const pantsHighlight = fireSuitFullyOn ? '#ef4444' : '#2a4a6a';
  const shoeColor = fireSuitFullyOn ? '#111' : '#1a1a1a';

  const headY = -32 + bodyBob;
  const bodyTopY = -24 + bodyBob;
  const bodyBottomY = -8 + bodyBob;

  // Body shadow
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Legs ──
  if (sitting) {
    // Side-view riding pose: one visible leg in profile, far leg hint behind body
    // The visible (near) leg: hip → thigh forward-down → knee bend → shin back to footpeg
    const hipY = bodyBottomY;
    const pegX = 6; // footpeg is forward-below
    const pegY = bodyBottomY + 16;
    const kneeX = 8; // knee projects forward
    const kneeY = bodyBottomY + 8;

    // Far leg hint (barely visible behind body — darker shade)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f1f33';
    ctx.beginPath();
    ctx.moveTo(-1, hipY + 1);
    ctx.quadraticCurveTo(3, hipY + 7, 4, pegY - 2);
    ctx.stroke();
    // Far boot hint
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(4, pegY - 2);
    ctx.lineTo(6, pegY);
    ctx.stroke();

    // Near leg (main visible leg) — thigh
    ctx.lineWidth = 5.5;
    ctx.strokeStyle = pantsColor;
    ctx.beginPath();
    ctx.moveTo(1, hipY);
    ctx.quadraticCurveTo(5, hipY + 3, kneeX, kneeY);
    ctx.stroke();
    // Knee highlight
    ctx.fillStyle = pantsHighlight;
    ctx.beginPath();
    ctx.arc(kneeX, kneeY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Shin — knee bends back-down to footpeg
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = pantsHighlight;
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.quadraticCurveTo(kneeX - 1, kneeY + 4, pegX, pegY - 2);
    ctx.stroke();
    // Boot
    ctx.lineWidth = 5;
    ctx.strokeStyle = shoeColor;
    ctx.beginPath();
    ctx.moveTo(pegX, pegY - 2);
    ctx.lineTo(pegX + 3, pegY);
    ctx.stroke();
    // Boot sole
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pegX - 1, pegY + 1);
    ctx.lineTo(pegX + 4, pegY + 1);
    ctx.stroke();
  } else {
    // Standing legs with animation
    const backKneeX = -3 - legOffset * 0.6;
    const backKneeY = bodyBottomY + 8;
    const backFootX = -2 - legOffset * 0.3;
    const backFootY = -1;
    ctx.lineWidth = 5;
    ctx.strokeStyle = pantsColor;
    ctx.beginPath();
    ctx.moveTo(-2, bodyBottomY);
    ctx.lineTo(backKneeX, backKneeY);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = pantsHighlight;
    ctx.beginPath();
    ctx.moveTo(backKneeX, backKneeY);
    ctx.lineTo(backFootX, backFootY);
    ctx.stroke();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = shoeColor;
    ctx.beginPath();
    ctx.moveTo(backFootX, backFootY);
    ctx.lineTo(backFootX + 2, 2);
    ctx.stroke();
    // Sole
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(backFootX - 1, 2);
    ctx.lineTo(backFootX + 4, 2);
    ctx.stroke();

    // Front leg
    const frontKneeX = 3 + legOffset * 0.6;
    const frontKneeY = bodyBottomY + 8;
    const frontFootX = 2 + legOffset * 0.3;
    const frontFootY = -1;
    ctx.lineWidth = 5;
    ctx.strokeStyle = pantsColor;
    ctx.beginPath();
    ctx.moveTo(2, bodyBottomY);
    ctx.lineTo(frontKneeX, frontKneeY);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = pantsHighlight;
    ctx.beginPath();
    ctx.moveTo(frontKneeX, frontKneeY);
    ctx.lineTo(frontFootX, frontFootY);
    ctx.stroke();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = shoeColor;
    ctx.beginPath();
    ctx.moveTo(frontFootX, frontFootY);
    ctx.lineTo(frontFootX + 2, 2);
    ctx.stroke();
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(frontFootX - 1, 2);
    ctx.lineTo(frontFootX + 4, 2);
    ctx.stroke();
  }

  // ── Torso with gradient ──
  // Fire suit donning/doffing progress determines a vertical reveal clip
  // of the red torso so the jacket appears to be pulled on from top to
  // bottom (donning) or lifted off (doffing).
  const fireSuitVisible = !!hasFireSuit || (fireSuitDoff ?? 0) > 0;
  const fireSuitReveal = Math.max(0, Math.min(1, (fireSuitDon ?? 1) * (1 - (fireSuitDoff ?? 0))));
  // When the fire suit is fully on, the torso is drawn as a PUFFY polygon:
  // 1.8px wider on each side with outward-curving shoulder and hip flares.
  // This sells the bulky inflated look of a real firefighter bunker gear.
  const puffed = fireSuitVisible && fireSuitReveal >= 1;
  const torsoGrad = ctx.createLinearGradient(0, bodyTopY, 0, bodyBottomY);
  if (isHit) {
    torsoGrad.addColorStop(0, '#ef4444');
    torsoGrad.addColorStop(1, '#dc2626');
  } else if (puffed) {
    // Fully-donned fire suit — bright red with strong contrast shading
    torsoGrad.addColorStop(0, '#fecaca');
    torsoGrad.addColorStop(0.25, '#ef4444');
    torsoGrad.addColorStop(0.65, '#b91c1c');
    torsoGrad.addColorStop(1, '#7f1d1d');
  } else {
    torsoGrad.addColorStop(0, '#5a9ae6');
    torsoGrad.addColorStop(0.4, '#4a90e2');
    torsoGrad.addColorStop(1, '#2563eb');
  }
  ctx.fillStyle = torsoGrad;
  if (puffed) {
    // Puffy silhouette: shoulders flare outward, chest rounded, hips wider
    ctx.beginPath();
    ctx.moveTo(-7.6, bodyTopY + 0.5);
    ctx.quadraticCurveTo(-8.4, bodyTopY + 2, -8.0, bodyTopY + 5);
    ctx.lineTo(-7.4, bodyBottomY - 1);
    ctx.quadraticCurveTo(-7.2, bodyBottomY + 0.5, -6.8, bodyBottomY);
    ctx.lineTo(6.8, bodyBottomY);
    ctx.quadraticCurveTo(7.2, bodyBottomY + 0.5, 7.4, bodyBottomY - 1);
    ctx.lineTo(8.0, bodyTopY + 5);
    ctx.quadraticCurveTo(8.4, bodyTopY + 2, 7.6, bodyTopY + 0.5);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(-6, bodyTopY);
    ctx.lineTo(6, bodyTopY);
    ctx.lineTo(5, bodyBottomY);
    ctx.lineTo(-5, bodyBottomY);
    ctx.closePath();
  }
  ctx.fill();
  ctx.strokeStyle = isHit ? '#b91c1c' : puffed ? '#450a0a' : '#1d4ed8';
  ctx.lineWidth = puffed ? 1 : 0.8;
  ctx.stroke();

  // ── Fire suit overlay: pulled on top-down, removed top-up ──
  if (fireSuitVisible && !isHit) {
    // Compute visible vertical band of the fire suit. When donning, the
    // suit fills top→bottom. When doffing, it empties top→bottom (lifted off).
    const torsoH = bodyBottomY - bodyTopY;
    const donH = torsoH * fireSuitReveal;
    if (donH > 0.2) {
      ctx.save();
      // Clip to the torso polygon so overlay doesn't leak
      ctx.beginPath();
      ctx.moveTo(-6.5, bodyTopY - 0.2);
      ctx.lineTo(6.5, bodyTopY - 0.2);
      ctx.lineTo(5.5, bodyBottomY + 0.2);
      ctx.lineTo(-5.5, bodyBottomY + 0.2);
      ctx.closePath();
      ctx.clip();

      // Red jacket fill — wider to match the puffy silhouette
      const jacketGrad = ctx.createLinearGradient(0, bodyTopY, 0, bodyTopY + donH);
      jacketGrad.addColorStop(0, '#fecaca');
      jacketGrad.addColorStop(0.25, '#ef4444');
      jacketGrad.addColorStop(0.65, '#b91c1c');
      jacketGrad.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = jacketGrad;
      ctx.fillRect(-8.5, bodyTopY, 17, donH);

      // Yellow reflective bands — 3 high-vis stripes (shoulder, waist, hips)
      ctx.fillStyle = '#fde047';
      const bandH = 1.3;
      if (donH > torsoH * 0.28) {
        ctx.fillRect(-7, bodyTopY + torsoH * 0.26, 14, bandH);
        ctx.fillStyle = '#fffbd1';
        ctx.fillRect(-7, bodyTopY + torsoH * 0.26, 14, 0.35);
        ctx.fillStyle = '#fde047';
      }
      if (donH > torsoH * 0.52) {
        ctx.fillRect(-7, bodyTopY + torsoH * 0.5, 14, bandH);
        ctx.fillStyle = '#fffbd1';
        ctx.fillRect(-7, bodyTopY + torsoH * 0.5, 14, 0.35);
        ctx.fillStyle = '#fde047';
      }
      if (donH > torsoH * 0.82) {
        ctx.fillRect(-7, bodyTopY + torsoH * 0.8, 14, bandH);
        ctx.fillStyle = '#fffbd1';
        ctx.fillRect(-7, bodyTopY + torsoH * 0.8, 14, 0.35);
        ctx.fillStyle = '#fde047';
      }

      // Chest badge (white square)
      if (donH > torsoH * 0.4) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-2, bodyTopY + torsoH * 0.35, 4, 2);
        ctx.strokeStyle = 'rgba(80,10,10,0.6)';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(-2, bodyTopY + torsoH * 0.35, 4, 2);
      }

      // Dark outline around the jacket
      ctx.strokeStyle = 'rgba(50,10,10,0.8)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-6, bodyTopY);
      ctx.lineTo(6, bodyTopY);
      ctx.lineTo(5, Math.min(bodyBottomY, bodyTopY + donH));
      ctx.lineTo(-5, Math.min(bodyBottomY, bodyTopY + donH));
      ctx.closePath();
      ctx.stroke();

      // Collar indicator at top
      if (donH > 2) {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-4, bodyTopY - 0.5, 8, 1.2);
      }

      // Pulling-on motion: slight shimmer line at the bottom edge of the revealed area
      if ((fireSuitDon ?? 1) < 1 && fireSuitReveal > 0.05 && fireSuitReveal < 0.95) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-7, bodyTopY + donH - 0.3, 14, 0.6);
      }

      ctx.restore();
    }
  }

  // V-neck collar
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4, bodyTopY + 1);
  ctx.lineTo(0, bodyTopY + 4);
  ctx.lineTo(4, bodyTopY + 1);
  ctx.stroke();

  // Pockets
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-4, bodyTopY + 7, 3, 3);
  ctx.strokeRect(1, bodyTopY + 7, 3, 3);

  // Belt
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(-5.5, bodyBottomY - 2, 11, 2.5);
  // Belt buckle
  ctx.fillStyle = '#c0a050';
  ctx.fillRect(-1, bodyBottomY - 1.8, 2, 2);

  // ── Arms ──
  // When the fire suit is fully on, the sleeves become red and render
  // slightly thicker so they look like padded bunker-gear arms.
  const armColor = isHit ? '#ef4444' : fireSuitFullyOn ? '#b91c1c' : '#3a7bd5';
  const armHighlight = isHit ? '#f87171' : fireSuitFullyOn ? '#ef4444' : '#5a9ae6';

  if (isWaving) {
    // Organic wave — dual oscillation for natural feel
    const waveBase = Math.sin(elapsed * 3) * 0.7 + Math.sin(elapsed * 7) * 0.3;
    const wristWave = Math.sin(elapsed * 5 + 0.5) * 0.25;
    const shoulderLift = Math.sin(elapsed * 3) * 1.5; // subtle shoulder rise
    
    // Back arm relaxed at side
    ctx.lineWidth = 4;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-5, bodyTopY + 3);
    ctx.lineTo(-8, bodyTopY + 12);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(-8, bodyTopY + 12);
    ctx.lineTo(-6, bodyTopY + 18);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(-6, bodyTopY + 18, 2, 0, Math.PI * 2);
    ctx.fill();

    // Front arm — raised up waving with shoulder + wrist articulation
    ctx.save();
    ctx.translate(5, bodyTopY + 3 - shoulderLift);
    ctx.rotate(-0.85 + waveBase * 0.18); // shoulder rotation
    // Upper arm
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -12);
    ctx.stroke();
    // Forearm with wrist rotation
    ctx.save();
    ctx.translate(0, -12);
    ctx.rotate(wristWave); // wrist articulation
    ctx.lineWidth = 4;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, -8);
    ctx.stroke();
    // Open hand
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(3, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Fingers that open/close with phase offset
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 1;
    for (let f = 0; f < 4; f++) {
      const fingerPhase = Math.sin(elapsed * 5 + f * 0.8) * 0.3;
      const fa = -0.5 + f * 0.35 + fingerPhase;
      const fingerLen = 3 + (f === 1 || f === 2 ? 1 : 0); // middle fingers longer
      ctx.beginPath();
      ctx.moveTo(3, -9);
      ctx.lineTo(3 + Math.cos(fa) * fingerLen, -8 + Math.sin(fa) * -fingerLen);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  } else if (isDriver) {
    // Side-view driver: both arms bent with articulated elbow and wrist,
    // hands closing around the handlebar grip. The grip lives in bike-local
    // space at roughly (3, -8) from the driver origin — see renderMotorcycle.
    const gripX = 3;
    const gripY = bodyTopY - 7;

    // ── Far arm (behind body — darker, occluded, reaches same grip plus offset) ──
    const farShoulderX = 2, farShoulderY = bodyTopY + 4;
    const farElbowX = 4.5, farElbowY = bodyTopY + 0.5;
    const farGripX = gripX + 0.8, farGripY = gripY + 0.5;
    // Upper arm
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#2a5a9a';
    ctx.beginPath();
    ctx.moveTo(farShoulderX, farShoulderY);
    ctx.lineTo(farElbowX, farElbowY);
    ctx.stroke();
    // Forearm — curves up toward the far grip
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#1e4a7a';
    ctx.beginPath();
    ctx.moveTo(farElbowX, farElbowY);
    ctx.quadraticCurveTo(farElbowX + 1, farElbowY - 4, farGripX, farGripY);
    ctx.stroke();
    // Far gloved hand wrapped around the grip
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(farGripX, farGripY, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // Dark knuckle outline
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(farGripX, farGripY, 1.6, 0, Math.PI * 2);
    ctx.stroke();

    // ── Near arm (in front — full colour, shoulder → elbow → wrist → fingers) ──
    const shoulderX = 4, shoulderY = bodyTopY + 3;
    const elbowX = 6.5, elbowY = bodyTopY + 0.2;
    const wristX = gripX + 0.2, wristY = gripY - 0.4;

    // Upper arm with subtle jacket shading
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = armColor;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    // Upper arm fabric highlight
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(shoulderX + 0.1, shoulderY - 0.6);
    ctx.lineTo(elbowX + 0.1, elbowY - 0.6);
    ctx.stroke();

    // Elbow joint blob
    ctx.fillStyle = armHighlight;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Forearm — bent curve up toward the handlebar grip
    ctx.lineWidth = 3.7;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.quadraticCurveTo(elbowX + 1.2, elbowY - 3.8, wristX, wristY);
    ctx.stroke();
    // Forearm highlight
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(elbowX + 0.2, elbowY - 0.5);
    ctx.quadraticCurveTo(elbowX + 1.4, elbowY - 4.2, wristX + 0.2, wristY - 0.4);
    ctx.stroke();

    // Wrist glove cuff — small flare where glove meets sleeve
    ctx.fillStyle = '#1f1f1f';
    ctx.beginPath();
    ctx.arc(wristX - 0.3, wristY + 0.3, 1.1, 0, Math.PI * 2);
    ctx.fill();

    // ── Gloved fist gripping the handlebar ──
    // Palm
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(gripX, gripY, 2.3, 1.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Palm highlight (leather sheen)
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(gripX - 0.4, gripY - 0.6, 1, 0.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Knuckle ridges (3 small bumps)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.4;
    for (let k = 0; k < 3; k++) {
      const kx = gripX - 1 + k * 1;
      ctx.beginPath();
      ctx.moveTo(kx, gripY - 1.4);
      ctx.lineTo(kx, gripY - 0.3);
      ctx.stroke();
    }
    // Thumb wrapping over the grip (arc around the bar)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(gripX + 0.6, gripY - 0.4, 1.4, Math.PI * 0.15, Math.PI * 1.2);
    ctx.stroke();
    // Subtle outline
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.ellipse(gripX, gripY, 2.3, 1.8, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (holdingDriver) {
    // Passenger side-view: near arm reaches forward to driver's back, far arm on grab rail behind
    // Far arm — reaches back to grab rail (behind body, subtle)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a5a9a';
    ctx.beginPath();
    ctx.moveTo(-3, bodyTopY + 4);
    ctx.quadraticCurveTo(-7, bodyTopY + 8, -10, bodyTopY + 5);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(-10, bodyTopY + 5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Near arm — reaches forward to hold driver's shoulder/back
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(4, bodyTopY + 3);
    ctx.quadraticCurveTo(8, bodyTopY + 2, 11, bodyTopY + 1);
    ctx.stroke();
    ctx.lineWidth = 3.8;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(11, bodyTopY + 1);
    ctx.lineTo(14, bodyTopY - 1);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(14, bodyTopY - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (isShooting && shootTimer && shootTimer > 0) {
    // Shooting arm raised with pistol
    const shoulderX = 5, shoulderY = bodyTopY + 3;
    const elbowX = 10, elbowY = bodyTopY - 4;
    const handX = 12, handY = bodyTopY - 14;
    ctx.lineWidth = 4;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(handX, handY, 2, 0, Math.PI * 2);
    ctx.fill();
    // Pistol
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-1.2, -9, 2.4, 7);
    ctx.fillStyle = '#333';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.fillStyle = '#555';
    ctx.fillRect(-2.5, 1, 5, 2);
    ctx.restore();
    // Muzzle flash
    if (shootTimer > 0.22) {
      ctx.save();
      ctx.translate(handX, handY - 10);
      ctx.fillStyle = '#fbbf24';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(0, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Back arm normal
    ctx.lineWidth = 4;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-5, bodyTopY + 3);
    ctx.lineTo(-8 + armOffset * 0.5, bodyTopY + 10);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(-8 + armOffset * 0.5, bodyTopY + 10);
    ctx.lineTo(-7 + armOffset * 0.3, bodyTopY + 18);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(-7 + armOffset * 0.3, bodyTopY + 18, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Normal relaxed arms
    // Back arm
    const backElbowX = -8 + armOffset * 0.5;
    const backElbowY = bodyTopY + 10;
    const backHandX = -7 + armOffset * 0.3;
    const backHandY = bodyTopY + 18;
    ctx.lineWidth = 4;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-5, bodyTopY + 3);
    ctx.lineTo(backElbowX, backElbowY);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(backElbowX, backElbowY);
    ctx.lineTo(backHandX, backHandY);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(backHandX, backHandY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Front arm
    const frontElbowX = 8 - armOffset * 0.5;
    const frontElbowY = bodyTopY + 10;
    const frontHandX = 7 - armOffset * 0.3;
    const frontHandY = bodyTopY + 18;
    ctx.lineWidth = 4;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(5, bodyTopY + 3);
    ctx.lineTo(frontElbowX, frontElbowY);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(frontElbowX, frontElbowY);
    ctx.lineTo(frontHandX, frontHandY);
    ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(frontHandX, frontHandY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reset shadow before head
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // ── Head ──
  const headGrad = ctx.createRadialGradient(0, headY - 1, 1, 0, headY, 6);
  headGrad.addColorStop(0, skinHighlight);
  headGrad.addColorStop(1, skinColor);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(0, headY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Helmet with gradient + shine. If the fire suit is fully on, override
  // the helmet to the classic firefighter red + yellow reflective strip.
  const hDark = fireSuitFullyOn ? '#b91c1c' : helmetColor;
  const helmetGrad = ctx.createLinearGradient(0, headY - 8, 0, headY);
  if (fireSuitFullyOn) {
    helmetGrad.addColorStop(0, '#fca5a5');
    helmetGrad.addColorStop(0.45, '#ef4444');
    helmetGrad.addColorStop(1, '#7f1d1d');
  } else {
    helmetGrad.addColorStop(0, hDark);
    helmetGrad.addColorStop(0.5, hDark);
    helmetGrad.addColorStop(1, '#0f172a');
  }
  ctx.fillStyle = helmetGrad;
  ctx.beginPath();
  ctx.arc(0, headY - 1.5, 6.8, Math.PI, 0);
  ctx.fill();
  // Helmet shine
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-1.5, headY - 4, 3, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  // Helmet logo line
  ctx.strokeStyle = 'rgba(255,200,50,0.3)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, headY - 7);
  ctx.lineTo(0, headY - 3);
  ctx.stroke();
   // Chin strap
  ctx.strokeStyle = 'rgba(50,50,50,0.4)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-5, headY - 2);
  ctx.quadraticCurveTo(-4, headY + 4, -2, headY + 5);
  ctx.stroke();

  // ── Goggles (if enabled) ──
  if (hasGoggles) {
    // Goggle strap across helmet
    ctx.strokeStyle = 'rgba(80,60,40,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, headY - 1, 6.2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // Left lens
    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(-2.5, headY - 3.5, 2.5, 1.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right lens
    ctx.beginPath();
    ctx.ellipse(2.5, headY - 3.5, 2.5, 1.8, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Lens reflection
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-2, headY - 4, 1, 0.6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3, headY - 4, 1, 0.6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Bridge between lenses
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-0.5, headY - 3.5);
    ctx.lineTo(0.5, headY - 3.5);
    ctx.stroke();
  }

  // Gas mask donning/doffing progress
  const maskVisible = !!hasGasMask || (gasMaskDoff ?? 0) > 0;
  const maskReveal = Math.max(0, Math.min(1, (gasMaskDon ?? 1) * (1 - (gasMaskDoff ?? 0))));
  if (maskVisible && maskReveal > 0.08) {
    // ── Gas Mask — slides down from above the head during donning ──
    // liftY: how much the whole mask is still hovering above its worn position
    const liftY = (1 - maskReveal) * 6;
    const maskAlpha = Math.min(1, maskReveal * 1.4);
    ctx.save();
    ctx.globalAlpha = maskAlpha;
    ctx.translate(0, -liftY);

    // Mask body (covers lower face)
    ctx.fillStyle = '#2d4a35';
    ctx.beginPath();
    ctx.ellipse(0, headY + 1, 5.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Eye windows (tinted green)
    ctx.fillStyle = 'rgba(100, 255, 150, 0.35)';
    ctx.strokeStyle = '#3a6a4a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(-2.2, headY - 0.5, 2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(2.2, headY - 0.5, 2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye reflections
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(-2.5, headY - 1, 0.8, 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1.8, headY - 1, 0.8, 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Filter canister (side)
    ctx.fillStyle = '#1a3a25';
    ctx.beginPath();
    ctx.arc(5.5, headY + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // Filter lines
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(4.5, headY + 1.5);
    ctx.lineTo(6.5, headY + 1.5);
    ctx.moveTo(4.8, headY + 2.5);
    ctx.lineTo(6.2, headY + 2.5);
    ctx.stroke();

    // Straps
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5, headY);
    ctx.lineTo(-6.5, headY - 3);
    ctx.moveTo(5, headY);
    ctx.lineTo(6.5, headY - 3);
    ctx.stroke();

    ctx.restore();
    // When donning, also draw the eyes underneath so the transition is clean
    if (maskReveal < 1) {
      ctx.globalAlpha = 1 - maskAlpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-2.2, headY - 0.5, 1.6, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(2.2, headY - 0.5, 1.6, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-2.2, headY - 0.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(2.2, headY - 0.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    // ── Eyes ──
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-2.2, headY - 0.5, 1.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-1.8, headY - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(2.5, headY - 0.5, 1.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(2.9, headY - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // ── Eyebrows ──
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = 1;
    if (isHit) {
      ctx.beginPath();
      ctx.moveTo(-3.5, headY - 3);
      ctx.lineTo(-1, headY - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.5, headY - 2);
      ctx.lineTo(4, headY - 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-3.5, headY - 2.5);
      ctx.lineTo(-0.8, headY - 2.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.5, headY - 2.8);
      ctx.lineTo(4, headY - 2.5);
      ctx.stroke();
    }
  }

  ctx.restore();
}


function renderMotorcycle(
  ctx: CanvasRenderingContext2D,
  bike: {
    pos: { x: number; y: number };
    facingRight: boolean;
    wheelAnim: number;
    shakeOffset: { x: number; y: number };
    phase: string;
    speed: number;
    suspCompress?: number;
    leanAngle?: number;
    rpmPhase?: number;
  },
  g: GameData,
  showPassenger: boolean = false,
  passengerDismounting: boolean = false,
  dismountProgress: number = 0
) {
  ctx.save();
  ctx.translate(bike.pos.x, bike.pos.y);
  const dir = bike.facingRight ? 1 : -1;
  ctx.scale(dir, 1);
  ctx.scale(2.4, 2.4);

  // ── Spring-driven suspension (front fork compresses on braking) ──
  const suspFromEngine = bike.suspCompress ?? 0;
  const isBrakingNow = bike.phase === 'idle' || bike.speed < 50;
  // The engine already runs a critically-damped spring; fall back to a
  // static value if the bike somehow isn't physics-enabled.
  const suspCompress = suspFromEngine !== 0 ? suspFromEngine : (isBrakingNow ? -1.5 : 0);
  const rearSuspCompress = suspCompress * 0.4; // rear reacts less

  // Apply visual body lean (pitch) — front lifts on squat, drops on dive
  const lean = bike.leanAngle ?? 0;
  if (Math.abs(lean) > 0.001) {
    ctx.rotate(lean);
  }

  ctx.translate(bike.shakeOffset.x, bike.shakeOffset.y + suspCompress * 0.3);

  // ── Realistic Exhaust Smoke ──
  // Uses a larger puff count, buoyancy-rising particles, curl noise for
  // organic drift, and a 4-layer coloured disc per puff so the trail
  // reads as real turbulent smoke instead of marching ellipses.
  if (bike.phase === 'idle' || bike.phase === 'leaving' || bike.phase === 'entering') {
    const isLeaving = bike.phase === 'leaving';
    const isIdle = bike.phase === 'idle';
    const puffCount = isLeaving ? 16 : isIdle ? 11 : 13;
    const lifeSpan = isLeaving ? 3.2 : 2.8; // seconds per puff
    // Emission rate (puffs per second)
    const emitRate = isLeaving ? 6 : 4.5;

    // Deterministic noise helper (cheap 2-freq hash)
    const curl = (t: number, seed: number) =>
      Math.sin(t * 2.4 + seed * 1.3) * 0.7 +
      Math.sin(t * 5.1 + seed * 2.7) * 0.4 +
      Math.sin(t * 11.3 + seed * 0.7) * 0.2;

    for (let i = 0; i < puffCount; i++) {
      // Age wraps per-puff with a phase offset so they don't all emit at once
      const phase = i / puffCount;
      const rawAge = (g.elapsed * emitRate + phase * lifeSpan) % lifeSpan;
      if (rawAge < 0.02) continue; // just emitted, skip first frame
      const ageRatio = rawAge / lifeSpan; // 0..1

      // Drift from the exhaust tip (-28, -5). Backward velocity + rise.
      const seed = i * 1.71;
      const frict = 1 - Math.pow(1 - ageRatio, 2); // decelerates over time
      const backwardSpeed = isLeaving ? 18 : 7;
      // Smoke rises (buoyancy) — accelerates upward over age
      const rise = ageRatio * ageRatio * 14 + ageRatio * 4;
      // Curl-noise horizontal drift
      const curlX = curl(g.elapsed + seed, seed) * 3.5;
      const curlY = curl(g.elapsed + seed + 100, seed * 1.5) * 2.2;
      // Wind (slow constant drift)
      const windX = (isLeaving ? -2 : -0.6);

      const sx = -28 - (backwardSpeed * rawAge * frict) + curlX + windX * rawAge;
      const sy = -5 - rise + curlY;

      // Growing radius with age
      const baseR = 2 + ageRatio * (isLeaving ? 9 : 6.5);
      const lifeAlpha = Math.pow(1 - ageRatio, 1.4);

      // Colour ramp — hot white → warm grey → cool grey → dark dissipating
      let r: number, gr: number, b: number;
      if (ageRatio < 0.12) {
        // Hot exhaust gases (warm amber)
        const t = ageRatio / 0.12;
        r = 255; gr = Math.round(220 - t * 30); b = Math.round(190 - t * 40);
      } else if (ageRatio < 0.35) {
        const t = (ageRatio - 0.12) / 0.23;
        r = Math.round(240 - t * 40); gr = Math.round(230 - t * 50); b = Math.round(225 - t * 55);
      } else if (ageRatio < 0.7) {
        const t = (ageRatio - 0.35) / 0.35;
        r = Math.round(200 - t * 70); gr = Math.round(195 - t * 75); b = Math.round(190 - t * 75);
      } else {
        const t = (ageRatio - 0.7) / 0.3;
        r = Math.round(130 - t * 40); gr = Math.round(120 - t * 40); b = Math.round(115 - t * 35);
      }

      const alphaBase = lifeAlpha * (isLeaving ? 0.42 : 0.32);

      ctx.save();
      ctx.translate(sx, sy);
      // Organic rotation — slow tumble
      ctx.rotate((seed + g.elapsed * 0.3) % (Math.PI * 2));

      // Multi-disc compound puff (4 slightly offset circles with falloff)
      for (let c = 0; c < 4; c++) {
        const discAngle = (c / 4) * Math.PI * 2 + seed;
        const distC = baseR * 0.28;
        const cx2 = Math.cos(discAngle) * distC;
        const cy2 = Math.sin(discAngle) * distC * 0.7;
        const cr = baseR * (0.7 - c * 0.1);
        // Soft radial gradient per disc for smoke wisps
        const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cr);
        const a = alphaBase * (1 - c * 0.15);
        grad.addColorStop(0, `rgba(${r},${gr},${b},${a})`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx2, cy2, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hot core highlight for young puffs
      if (ageRatio < 0.15) {
        const hotA = (1 - ageRatio / 0.15) * 0.6;
        const hotGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseR * 0.5);
        hotGrad.addColorStop(0, `rgba(255,210,130,${hotA})`);
        hotGrad.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = hotGrad;
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ── Physics-Based Dust with Skid on Braking ──
  if (Math.abs(bike.speed) > 30) {
    const isDecelerating = bike.phase === 'entering' && bike.speed < 200;
    const dustCount = Math.min(10, Math.floor(Math.abs(bike.speed) / 35) + (isDecelerating ? 3 : 0));
    for (let i = 0; i < dustCount; i++) {
      const seed = (g.elapsed * 3 + i * 1.7) % 2;
      const friction = Math.pow(0.93, seed * 15);
      const vx = -(3 + i * 1.2) * friction;
      const vy = -(2 + Math.sin(i * 2.3) * 2) * friction;
      const gravity = seed * seed * 1.5;
      const dx = -20 + vx * seed * 4;
      const dy = 0 + vy * seed * 3 + gravity;
      const dustSize = (1.5 + i * 0.4) * (1 + seed * 0.5);
      const dustAlpha = Math.max(0, 0.28 - seed * 0.14);
      const rotation = seed * (i * 0.8);
      const brown = 140 + Math.round(i * 5);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rotation);
      ctx.fillStyle = `rgba(${brown},${brown - 20},${brown - 40},${dustAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, dustSize * 1.3, dustSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Helper: Metallic Surface Gradient ──
  const drawMetallicSurface = (x: number, y: number, w2: number, h2: number, baseR: number, baseG: number, baseB: number, angle = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const mg = ctx.createLinearGradient(-w2/2, -h2/2, w2/2, h2/2);
    mg.addColorStop(0, `rgb(${Math.min(255,baseR+60)},${Math.min(255,baseG+60)},${Math.min(255,baseB+60)})`);
    mg.addColorStop(0.3, `rgb(${baseR},${baseG},${baseB})`);
    mg.addColorStop(0.7, `rgb(${Math.max(0,baseR-30)},${Math.max(0,baseG-30)},${Math.max(0,baseB-30)})`);
    mg.addColorStop(1, `rgb(${Math.max(0,baseR-50)},${Math.max(0,baseG-50)},${Math.max(0,baseB-50)})`);
    ctx.fillStyle = mg;
    ctx.fillRect(-w2/2, -h2/2, w2, h2);
    // Rim light on top edge
    ctx.strokeStyle = `rgba(255,255,255,0.12)`;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-w2/2, -h2/2);
    ctx.lineTo(w2/2, -h2/2);
    ctx.stroke();
    ctx.restore();
  };

  // ── Wheels with suspension + enhanced treads + brake discs ──
  const wheelR = 8;
  const wheelY = 0;
  const frontWX = 22, rearWX = -20;
  const frontWY = wheelY + suspCompress;
  const rearWY = wheelY + rearSuspCompress;
  const highSpeed = Math.abs(bike.speed) > 150;

  for (const [wx, wy, isFront] of [[frontWX, frontWY, true], [rearWX, rearWY, false]] as [number, number, boolean][]) {
    // ── Dual-layer tire ──
    // Outer rubber ring
    const tireGrad = ctx.createRadialGradient(wx, wy, wheelR - 2.5, wx, wy, wheelR + 1);
    tireGrad.addColorStop(0, '#2a2a2a');
    tireGrad.addColorStop(0.5, '#1a1a1a');
    tireGrad.addColorStop(1, '#111');
    ctx.fillStyle = tireGrad;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR + 0.5, 0, Math.PI * 2);
    ctx.arc(wx, wy, wheelR - 2.5, 0, Math.PI * 2, true);
    ctx.fill();

    // Sidewall line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR - 1.2, 0, Math.PI * 2);
    ctx.stroke();

    // ── Herringbone tread pattern ──
    ctx.strokeStyle = 'rgba(50,50,50,0.6)';
    ctx.lineWidth = 0.5;
    for (let t = 0; t < 24; t++) {
      const tAngle = bike.wheelAnim + t * Math.PI / 12;
      const midR = wheelR - 0.5;
      const outerR = wheelR + 0.3;
      const innerR = wheelR - 2;
      // V-shape: two lines from center outward at angles
      const cx2 = wx + Math.cos(tAngle) * midR;
      const cy2 = wy + Math.sin(tAngle) * midR;
      const perpAngle = tAngle + Math.PI / 2;
      // Left arm of V
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(
        wx + Math.cos(tAngle + 0.08) * outerR + Math.cos(perpAngle) * 0.3,
        wy + Math.sin(tAngle + 0.08) * outerR + Math.sin(perpAngle) * 0.3
      );
      ctx.stroke();
      // Right arm of V
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(
        wx + Math.cos(tAngle - 0.08) * innerR + Math.cos(perpAngle) * -0.3,
        wy + Math.sin(tAngle - 0.08) * innerR + Math.sin(perpAngle) * -0.3
      );
      ctx.stroke();
    }

    // ── Dual rim with chrome luster ──
    const rimGrad = ctx.createRadialGradient(wx - 1, wy - 1, 0, wx, wy, wheelR - 2.5);
    rimGrad.addColorStop(0, '#aaa');
    rimGrad.addColorStop(0.5, '#888');
    rimGrad.addColorStop(1, '#666');
    ctx.strokeStyle = rimGrad as unknown as string;
    // Outer rim
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR - 2.8, 0, Math.PI * 2);
    ctx.strokeStyle = '#999';
    ctx.stroke();
    // Inner rim
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR - 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#777';
    ctx.stroke();
    // Chrome rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR - 2.9, -Math.PI * 0.7, -Math.PI * 0.2);
    ctx.stroke();

    // ── Brake disc (perforated) ──
    const discR = wheelR - 4;
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wx, wy, discR, 0, Math.PI * 2);
    ctx.stroke();
    // Perforations
    ctx.fillStyle = 'rgba(80,80,80,0.4)';
    for (let d = 0; d < 8; d++) {
      const dAngle = bike.wheelAnim * 0.5 + d * Math.PI / 4;
      const dr = discR - 0.5;
      ctx.beginPath();
      ctx.arc(wx + Math.cos(dAngle) * dr, wy + Math.sin(dAngle) * dr, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Brake thermal glow (when braking)
    if (isBrakingNow && isFront) {
      const brGlow = ctx.createRadialGradient(wx, wy, discR - 1, wx, wy, discR + 2);
      brGlow.addColorStop(0, 'rgba(255,120,40,0.08)');
      brGlow.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = brGlow;
      ctx.beginPath();
      ctx.arc(wx, wy, discR + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (highSpeed) {
      // Rotation blur
      ctx.strokeStyle = 'rgba(150,150,150,0.12)';
      ctx.lineWidth = wheelR - 5;
      ctx.beginPath();
      ctx.arc(wx, wy, (wheelR - 3.5) / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // ── 12 Spokes with tapered thickness ──
      for (let i = 0; i < 12; i++) {
        const a = bike.wheelAnim + i * Math.PI / 6;
        const innerSpoke = 2.2;
        const outerSpoke = wheelR - 3.2;
        // Tapered: thicker at hub, thinner at rim
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 0.8 - (i % 2) * 0.2;
        ctx.beginPath();
        ctx.moveTo(wx + Math.cos(a) * innerSpoke, wy + Math.sin(a) * innerSpoke);
        ctx.lineTo(wx + Math.cos(a) * outerSpoke, wy + Math.sin(a) * outerSpoke);
        ctx.stroke();
      }
    }

    // ── Hub (chrome with gradient) ──
    const hubGrad = ctx.createRadialGradient(wx - 0.5, wy - 0.5, 0, wx, wy, 2.5);
    hubGrad.addColorStop(0, '#ccc');
    hubGrad.addColorStop(0.5, '#888');
    hubGrad.addColorStop(1, '#555');
    ctx.fillStyle = hubGrad;
    ctx.beginPath();
    ctx.arc(wx, wy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Axle bolt
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(wx, wy, 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Hub highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(wx - 0.6, wy - 0.6, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Fork tubes (visual suspension) ──
  // Front fork — dual tube with chrome
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(frontWX - 2, -12);
  ctx.lineTo(frontWX - 1, frontWY - wheelR + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(frontWX + 1, -11);
  ctx.lineTo(frontWX + 2, frontWY - wheelR + 1);
  ctx.stroke();
  // Chrome highlights on forks
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(frontWX - 1.5, -12);
  ctx.lineTo(frontWX - 0.5, frontWY - wheelR + 2);
  ctx.stroke();
  // Fork lower (gold anodized)
  ctx.strokeStyle = 'rgba(180,160,60,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(frontWX - 1.5, frontWY - wheelR + 1);
  ctx.lineTo(frontWX - 1.5, frontWY - wheelR + 4);
  ctx.stroke();

  // ── Rear swingarm ──
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(rearWX + 1, rearWY);
  ctx.stroke();
  // Swingarm highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-4, -2.5);
  ctx.lineTo(rearWX + 1, rearWY - 0.5);
  ctx.stroke();

  // ── Fenders (with depth) ──
  // Front fender
  const fenderGrad = ctx.createLinearGradient(frontWX, wheelY - wheelR - 2, frontWX, wheelY - wheelR + 3);
  fenderGrad.addColorStop(0, '#444');
  fenderGrad.addColorStop(0.5, '#333');
  fenderGrad.addColorStop(1, '#222');
  ctx.strokeStyle = fenderGrad as unknown as string;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(frontWX, wheelY, wheelR + 2, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.strokeStyle = '#333';
  ctx.stroke();
  // Front fender highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(frontWX, wheelY, wheelR + 2.8, -Math.PI * 0.7, -Math.PI * 0.3);
  ctx.stroke();
  // Rear fender
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(rearWX, wheelY, wheelR + 2, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.stroke();

  // ── Frame / Body (multi-layer with panel lines) ──
  const frameGrad = ctx.createLinearGradient(-20, -20, 20, 0);
  frameGrad.addColorStop(0, '#252525');
  frameGrad.addColorStop(0.3, '#333');
  frameGrad.addColorStop(0.7, '#2a2a2a');
  frameGrad.addColorStop(1, '#222');
  ctx.fillStyle = frameGrad;
  ctx.beginPath();
  ctx.moveTo(rearWX + 3, wheelY - 2);
  ctx.bezierCurveTo(rearWX + 6, -14, -10, -20, -4, -20);
  ctx.bezierCurveTo(2, -20, 8, -18, 12, -16);
  ctx.bezierCurveTo(16, -14, frontWX - 2, -10, frontWX - 1, wheelY - 4);
  ctx.lineTo(frontWX - 2, wheelY - 2);
  ctx.lineTo(rearWX + 3, wheelY - 2);
  ctx.fill();
  // Panel lines (thin separations)
  ctx.strokeStyle = 'rgba(80,80,80,0.4)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-2, -19);
  ctx.bezierCurveTo(4, -18, 10, -16, 14, -13);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -14);
  ctx.lineTo(6, -8);
  ctx.stroke();
  // Subframe tubes (visible between engine and seat)
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -14);
  ctx.lineTo(-4, -6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.lineTo(2, -6);
  ctx.stroke();

  // ── Side fairing panel (colored accent — metallic blue) ──
  const panelGrad = ctx.createLinearGradient(-6, -16, 8, -6);
  panelGrad.addColorStop(0, '#1e50bf');
  panelGrad.addColorStop(0.3, '#2563eb');
  panelGrad.addColorStop(0.6, '#1e40af');
  panelGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.bezierCurveTo(-2, -17, 4, -15, 8, -12);
  ctx.lineTo(6, -6);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  // Fairing panel line
  ctx.strokeStyle = 'rgba(30,58,138,0.6)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-4, -15);
  ctx.lineTo(6, -9);
  ctx.stroke();
  // Decal stripe on fairing
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-5, -13);
  ctx.bezierCurveTo(0, -13.5, 4, -12, 7, -10);
  ctx.stroke();
  // Environment reflection (moving highlight)
  const reflX = Math.sin(g.elapsed * 0.8) * 4;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.ellipse(reflX, -12, 3, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // ── Engine block (detailed with cylinder depth + crankcase) ──
  // Main block with metallic gradient
  const engGrad = ctx.createLinearGradient(-9, -7, 7, 0);
  engGrad.addColorStop(0, '#4a4a4a');
  engGrad.addColorStop(0.4, '#3a3a3a');
  engGrad.addColorStop(1, '#2a2a2a');
  ctx.fillStyle = engGrad;
  ctx.beginPath();
  ctx.roundRect(-9, -7, 16, 7, 1);
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Cylinder head with 3D depth
  const cylGrad = ctx.createLinearGradient(-3, -10, 5, -7);
  cylGrad.addColorStop(0, '#555');
  cylGrad.addColorStop(0.5, '#4a4a4a');
  cylGrad.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = cylGrad;
  ctx.beginPath();
  ctx.roundRect(-3, -9.5, 8, 3.5, 1);
  ctx.fill();
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 0.3;
  ctx.stroke();
  // Valve covers (protruding bumps)
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.ellipse(-1, -9, 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.ellipse(-1.3, -9.3, 1, 0.5, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.ellipse(3, -9, 1.5, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cooling fins (more detailed)
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 7; i++) {
    const finX = -8 + i * 2.2;
    ctx.beginPath();
    ctx.moveTo(finX, -6.5);
    ctx.lineTo(finX, -0.5);
    ctx.stroke();
    // Fin highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(finX + 0.3, -6.5);
    ctx.lineTo(finX + 0.3, -0.5);
    ctx.stroke();
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 0.5;
  }
  // Crankcase cover (circular)
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.arc(4, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  const ccGrad = ctx.createRadialGradient(3.5, -3.5, 0, 4, -3, 3);
  ccGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
  ccGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  ccGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = ccGrad;
  ctx.beginPath();
  ctx.arc(4, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  // Center bolt
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.arc(4, -3, 0.8, 0, Math.PI * 2);
  ctx.fill();
  // Mounting bolts on engine
  ctx.fillStyle = '#5a5a5a';
  for (const [bx, by] of [[-7, -5], [-7, -1], [5, -6], [5, -1]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(bx, by, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Radiator (small grid in front of engine)
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(8, -6 + i * 1);
    ctx.lineTo(10, -6 + i * 1);
    ctx.stroke();
  }
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(7.5, -6.5, 3, 6);
  // Oil/cooling pipes
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(7, -4);
  ctx.quadraticCurveTo(9, -3, 10, -5);
  ctx.stroke();

  // Ambient occlusion under engine
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 10, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Chain (individual links) ──
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.6;
  const chainSegments = 14;
  for (let i = 0; i < chainSegments; i++) {
    const t = i / chainSegments;
    const cx2 = -4 + (rearWX + 6) * t;
    const cy2 = wheelY - 2 + Math.sin(t * Math.PI) * -0.5;
    ctx.fillStyle = i % 2 === 0 ? '#555' : '#4a4a4a';
    ctx.beginPath();
    ctx.ellipse(cx2, cy2, 1.2, 0.6, bike.wheelAnim * 2 + i * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }
  // Chain sprockets
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(-4, wheelY - 2, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rearWX + 2, rearWY, 2, 0, Math.PI * 2);
  ctx.stroke();

  // ── Fuel tank (sculpted with bezier, specular, pinstripe) ──
  // Tank base shape (3-layer bezier for sculpted look)
  const tankGrad = ctx.createLinearGradient(-8, -22, 6, -14);
  tankGrad.addColorStop(0, '#1e50bf');
  tankGrad.addColorStop(0.25, '#3b82f6');
  tankGrad.addColorStop(0.5, '#2563eb');
  tankGrad.addColorStop(0.75, '#1e40af');
  tankGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = tankGrad;
  ctx.beginPath();
  ctx.moveTo(-8, -15);
  ctx.bezierCurveTo(-8, -20, -4, -21, 0, -20.5);
  ctx.bezierCurveTo(4, -20, 8, -19, 8, -16);
  ctx.bezierCurveTo(8, -14, 4, -13, 0, -13.5);
  ctx.bezierCurveTo(-4, -14, -8, -13, -8, -15);
  ctx.fill();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Knee recess (shadow indent)
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(-5, -16, 2, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5, -16, 2, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Primary specular highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-1, -19, 4.5, 1.2, -0.1, 0, Math.PI);
  ctx.fill();
  // Secondary smaller highlight
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.ellipse(3, -18, 2, 0.6, 0, 0, Math.PI);
  ctx.fill();
  // Pinstripe (gold centerline)
  ctx.strokeStyle = 'rgba(200,170,60,0.35)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(-6, -17);
  ctx.bezierCurveTo(-2, -17.8, 2, -17.5, 6, -16.5);
  ctx.stroke();
  // Tank cap (detailed)
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.arc(0, -20.5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  // Cap hinge
  ctx.fillStyle = '#777';
  ctx.fillRect(-0.3, -22.2, 0.6, 0.8);
  // Cap highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(-0.5, -21, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // ── Exhaust pipe (dual header with heat gradient + heat shield) ──
  // Header pipe 1 (from engine top)
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-4, -5);
  ctx.bezierCurveTo(-10, -4, -15, -3, -18, -4);
  ctx.stroke();
  // Header pipe 2 (from engine bottom)
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.bezierCurveTo(-12, -1, -16, -2, -18, -4);
  ctx.stroke();
  // Main exhaust pipe (merged)
  const exhGrad = ctx.createLinearGradient(-18, -4, -28, -6);
  exhGrad.addColorStop(0, '#aaa');
  exhGrad.addColorStop(0.3, '#999');
  exhGrad.addColorStop(0.7, '#888');
  exhGrad.addColorStop(1, '#777');
  ctx.strokeStyle = exhGrad as unknown as string;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-18, -4);
  ctx.bezierCurveTo(-22, -5, -25, -6, -27, -6);
  ctx.strokeStyle = '#999';
  ctx.stroke();
  // Heat gradient near engine (blue/gold tint)
  ctx.strokeStyle = 'rgba(100,120,200,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -3.5);
  ctx.bezierCurveTo(-10, -3, -14, -2.5, -16, -3.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,160,60,0.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.bezierCurveTo(-11, -3.5, -13, -3, -15, -3.8);
  ctx.stroke();
  // Heat shield (perforated panel above pipe)
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-12, -5.5);
  ctx.lineTo(-24, -7);
  ctx.stroke();
  // Heat shield holes
  ctx.fillStyle = 'rgba(40,40,40,0.3)';
  for (let h = 0; h < 5; h++) {
    ctx.beginPath();
    ctx.arc(-13 - h * 2.4, -6 - h * 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Chrome highlight on exhaust
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-8, -5);
  ctx.bezierCurveTo(-14, -4, -20, -4.5, -24, -6.5);
  ctx.stroke();
  // Exhaust tip (oval opening with depth)
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.ellipse(-27, -6, 2.8, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Inner darkness
  ctx.fillStyle = 'rgba(20,20,20,0.6)';
  ctx.beginPath();
  ctx.ellipse(-27, -6, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chrome rim on tip
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(-27, -6, 2.6, -Math.PI * 0.6, Math.PI * 0.1);
  ctx.stroke();

  // ── Seat (extended dual-cushion with gradient) ──
  const seatGrad = ctx.createLinearGradient(-14, -20, -14, -16);
  seatGrad.addColorStop(0, '#2a2a2a');
  seatGrad.addColorStop(0.5, '#1a1a1a');
  seatGrad.addColorStop(1, '#111');
  ctx.fillStyle = seatGrad;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.bezierCurveTo(-10, -22, -2, -21, 2, -20);
  ctx.bezierCurveTo(5, -19.5, 7, -19, 6, -17);
  ctx.lineTo(-14, -17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Seat stitch line
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-4, -20.5);
  ctx.lineTo(-4, -17.5);
  ctx.stroke();
  // Seat edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-12, -20);
  ctx.bezierCurveTo(-6, -21.5, 0, -20.5, 5, -19);
  ctx.stroke();

  // ── Footpegs (driver + folding passenger peg) ──
  ctx.fillStyle = '#666';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  // Driver footpeg
  ctx.beginPath();
  ctx.roundRect(4, -1, 5, 2, 0.5);
  ctx.fill();
  ctx.stroke();
  // Serrated grip on driver peg
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.3;
  for (let s = 0; s < 3; s++) {
    ctx.beginPath();
    ctx.moveTo(5 + s * 1.2, -0.8);
    ctx.lineTo(5 + s * 1.2, 0.8);
    ctx.stroke();
  }
  // Passenger footpeg (folding style)
  ctx.fillStyle = '#555';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.8;
  // Mount bracket
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(-10, -1);
  ctx.stroke();
  // Peg
  ctx.beginPath();
  ctx.roundRect(-12, -1.5, 4, 1.5, 0.5);
  ctx.fill();
  ctx.stroke();

  // ── Handlebar (with brake/clutch levers + instrument cluster) ──
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.quadraticCurveTo(8, -22, 5, -24);
  ctx.stroke();
  // Grips (rubber texture)
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(5, -24);
  ctx.lineTo(4, -25.5);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Grip texture lines
  ctx.strokeStyle = 'rgba(60,60,60,0.3)';
  ctx.lineWidth = 0.3;
  for (let gr = 0; gr < 4; gr++) {
    const gy = -24.2 - gr * 0.35;
    ctx.beginPath();
    ctx.moveTo(3.8, gy);
    ctx.lineTo(5.2, gy);
    ctx.stroke();
  }
  // Brake lever
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(5, -24.5);
  ctx.lineTo(7, -23);
  ctx.lineTo(8.5, -21);
  ctx.stroke();
  // Clutch lever (other side implied)

  // Mirror
  ctx.fillStyle = 'rgba(150,200,255,0.4)';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(3, -26.5, 2, 1.2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Mirror stalk
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(4, -25.5);
  ctx.lineTo(3.5, -26);
  ctx.stroke();

  // ── Instrument cluster (backlit) ──
  ctx.fillStyle = 'rgba(20,20,20,0.8)';
  ctx.beginPath();
  ctx.roundRect(8, -16, 6, 3, 1);
  ctx.fill();
  // Screen glow
  ctx.fillStyle = `rgba(100,200,150,${0.15 + Math.sin(g.elapsed * 2) * 0.05})`;
  ctx.beginPath();
  ctx.roundRect(8.5, -15.5, 5, 2, 0.5);
  ctx.fill();
  // Tiny indicators
  ctx.fillStyle = 'rgba(50,200,100,0.3)';
  ctx.beginPath();
  ctx.arc(9.5, -14.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,100,50,0.2)';
  ctx.beginPath();
  ctx.arc(11, -14.5, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // ── Small windscreen ──
  ctx.strokeStyle = 'rgba(200,220,255,0.15)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(12, -16);
  ctx.quadraticCurveTo(15, -20, 16, -22);
  ctx.stroke();
  // Windscreen reflection
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(13, -17);
  ctx.quadraticCurveTo(14.5, -19.5, 15, -21);
  ctx.stroke();

  // ── Rear rack (for delivery box) ──
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.lineTo(-22, -18);
  ctx.lineTo(-22, -16);
  ctx.stroke();

  // ── Rim lighting on body top edges ──
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(rearWX + 8, -18);
  ctx.bezierCurveTo(-5, -21, 5, -20, 14, -16);
  ctx.stroke();

  // ── Fresnel rim on fuel tank (edge bloom that sells reflective paint) ──
  {
    const rimGradTank = ctx.createLinearGradient(-8, -22, -8, -13);
    rimGradTank.addColorStop(0, 'rgba(140,200,255,0.22)');
    rimGradTank.addColorStop(0.5, 'rgba(140,200,255,0.06)');
    rimGradTank.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.strokeStyle = rimGradTank as unknown as string;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-8, -15);
    ctx.bezierCurveTo(-8, -20, -4, -21, 0, -20.5);
    ctx.bezierCurveTo(4, -20, 8, -19, 8, -16);
    ctx.strokeStyle = 'rgba(170,220,255,0.18)';
    ctx.stroke();
  }

  // ── Dynamic paint sparkle (occasional micro-highlight on tank) ──
  {
    const sparkT = (g.elapsed * 0.8) % 3;
    if (sparkT < 0.4) {
      const sparkAlpha = (1 - sparkT / 0.4) * 0.6;
      const sparkX = -4 + Math.sin(g.elapsed * 2.3) * 4;
      ctx.fillStyle = `rgba(255,255,255,${sparkAlpha})`;
      ctx.beginPath();
      ctx.arc(sparkX, -19, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Micro-ray
      ctx.strokeStyle = `rgba(255,255,255,${sparkAlpha * 0.5})`;
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.moveTo(sparkX - 1.5, -19);
      ctx.lineTo(sparkX + 1.5, -19);
      ctx.moveTo(sparkX, -20.5);
      ctx.lineTo(sparkX, -17.5);
      ctx.stroke();
    }
  }

  // ── Under-body LED accent strip (modern styling, animated breathing) ──
  {
    const breathe = 0.55 + Math.sin(g.elapsed * 1.8) * 0.25;
    const ledGrad = ctx.createLinearGradient(-18, -1, 14, -1);
    ledGrad.addColorStop(0, `rgba(80,160,255,0)`);
    ledGrad.addColorStop(0.2, `rgba(120,180,255,${0.22 * breathe})`);
    ledGrad.addColorStop(0.5, `rgba(150,200,255,${0.38 * breathe})`);
    ledGrad.addColorStop(0.8, `rgba(120,180,255,${0.22 * breathe})`);
    ledGrad.addColorStop(1, `rgba(80,160,255,0)`);
    ctx.fillStyle = ledGrad;
    ctx.beginPath();
    ctx.roundRect(-18, -1.2, 32, 0.9, 0.4);
    ctx.fill();
    // Core hotline
    ctx.strokeStyle = `rgba(220,240,255,${0.5 * breathe})`;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-15, -0.8);
    ctx.lineTo(10, -0.8);
    ctx.stroke();
    // Glow wash on ground beneath the strip
    const ledGlow = ctx.createRadialGradient(-4, 3, 0, -4, 3, 22);
    ledGlow.addColorStop(0, `rgba(120,180,255,${0.12 * breathe})`);
    ledGlow.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = ledGlow;
    ctx.beginPath();
    ctx.ellipse(-4, 3, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Front running lights (twin amber LEDs flanking the headlight) ──
  {
    const amberPulse = 0.7 + Math.sin(g.elapsed * 3) * 0.3;
    for (const dy of [-1.5, 1.5]) {
      ctx.fillStyle = `rgba(255,180,60,${0.9 * amberPulse})`;
      ctx.beginPath();
      ctx.arc(frontWX + 2, -10 + dy * 1.3, 0.55, 0, Math.PI * 2);
      ctx.fill();
      // Halo
      const amberGrad = ctx.createRadialGradient(frontWX + 2, -10 + dy * 1.3, 0, frontWX + 2, -10 + dy * 1.3, 2);
      amberGrad.addColorStop(0, `rgba(255,180,60,${0.4 * amberPulse})`);
      amberGrad.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = amberGrad;
      ctx.beginPath();
      ctx.arc(frontWX + 2, -10 + dy * 1.3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Orange delivery box (OTLOP) ──
  ctx.fillStyle = '#e8760a';
  const boxX = -24, boxY = -32, boxW = 16, boxH = 14;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 2);
  ctx.fill();
  ctx.strokeStyle = '#b05508';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  // Box lid detail
  ctx.strokeStyle = '#d06808';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(boxX + 2, boxY + 3);
  ctx.lineTo(boxX + boxW - 2, boxY + 3);
  ctx.stroke();
  // Box handle
  ctx.strokeStyle = '#b05508';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boxX + 4, boxY);
  ctx.quadraticCurveTo(boxX + boxW / 2, boxY - 3, boxX + boxW - 4, boxY);
  ctx.stroke();

  // "OTLOP" text — always readable
  ctx.save();
  ctx.scale(dir, 1);
  ctx.scale(1 / 2.4, 1 / 2.4);
  const boxCenterX = dir === 1 ? (boxX + boxW / 2) * 2.4 : -(boxX + boxW / 2) * 2.4;
  const boxCenterY = (boxY + boxH / 2) * 2.4;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OTLOP', boxCenterX, boxCenterY);
  ctx.restore();

  // ── Volumetric Headlight System ──
  // Deterministic micro-flicker (faster + jitter) sells a working halogen lamp
  const flickerIntensity =
    0.88 +
    Math.sin(g.elapsed * 11) * 0.07 +
    Math.sin(g.elapsed * 23) * 0.04 +
    Math.sin(g.elapsed * 47) * 0.02;
  const showLight = bike.phase === 'idle' ? flickerIntensity > 0.82 : true;
  if (showLight) {
    const hlX = frontWX + 5;
    const hlY = -10;

    // ── Multi-layer volumetric cone with falloff + god-ray slices ──
    ctx.save();
    const coneLen = 60;
    const coneHalfAngle = 0.26; // ~30° half-angle — wider, more modern look

    // Layer A: wide ambient haze (low alpha, soft edges)
    const hazeGrad = ctx.createLinearGradient(hlX, hlY, hlX + coneLen, hlY);
    hazeGrad.addColorStop(0, `rgba(255,250,210,${0.16 * flickerIntensity})`);
    hazeGrad.addColorStop(0.35, `rgba(255,245,190,${0.08 * flickerIntensity})`);
    hazeGrad.addColorStop(0.75, `rgba(255,240,170,${0.03 * flickerIntensity})`);
    hazeGrad.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = hazeGrad;
    ctx.beginPath();
    ctx.moveTo(hlX + 3, hlY);
    ctx.lineTo(hlX + coneLen, hlY - Math.sin(coneHalfAngle) * coneLen);
    ctx.lineTo(hlX + coneLen, hlY + Math.sin(coneHalfAngle) * coneLen + 10);
    ctx.closePath();
    ctx.fill();

    // Layer B: tighter core beam
    const coreGrad = ctx.createLinearGradient(hlX, hlY, hlX + coneLen * 0.7, hlY);
    coreGrad.addColorStop(0, `rgba(255,255,230,${0.28 * flickerIntensity})`);
    coreGrad.addColorStop(0.5, `rgba(255,250,200,${0.12 * flickerIntensity})`);
    coreGrad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.moveTo(hlX + 3, hlY);
    ctx.lineTo(hlX + coneLen * 0.8, hlY - Math.sin(coneHalfAngle * 0.55) * coneLen);
    ctx.lineTo(hlX + coneLen * 0.8, hlY + Math.sin(coneHalfAngle * 0.55) * coneLen + 6);
    ctx.closePath();
    ctx.fill();

    // Layer C: noisy god-rays that drift with time
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 6; r++) {
      const seed = r * 1.73 + g.elapsed * 0.4;
      const rayAngle = (r - 2.5) * 0.07 + Math.sin(seed * 1.3) * 0.02;
      const rayLen = 38 + r * 5 + Math.sin(seed * 0.9) * 4;
      const rayAlpha = (0.06 + Math.sin(seed * 1.7) * 0.035) * flickerIntensity;
      const rayGrad = ctx.createLinearGradient(hlX + 3, hlY, hlX + Math.cos(rayAngle) * rayLen, hlY + Math.sin(rayAngle) * rayLen);
      rayGrad.addColorStop(0, `rgba(255,255,220,${Math.max(0, rayAlpha)})`);
      rayGrad.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.strokeStyle = rayGrad as unknown as string;
      ctx.lineWidth = 0.55 + (r % 2) * 0.2;
      ctx.beginPath();
      ctx.moveTo(hlX + 3, hlY);
      ctx.lineTo(hlX + Math.cos(rayAngle) * rayLen, hlY + Math.sin(rayAngle) * rayLen);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    
    // ── Multi-Layer Ground Pool ──
    ctx.save();
    // Outer pool (wide, faint)
    const poolX = frontWX + 18;
    const poolY = 4;
    const poolFlicker = 0.9 + Math.sin(g.elapsed * 6) * 0.1;
    const outerGrad = ctx.createRadialGradient(poolX, poolY, 3, poolX, poolY, 28);
    outerGrad.addColorStop(0, `rgba(255,255,200,${0.12 * flickerIntensity * poolFlicker})`);
    outerGrad.addColorStop(0.3, `rgba(255,255,180,${0.07 * flickerIntensity * poolFlicker})`);
    outerGrad.addColorStop(0.7, `rgba(255,255,150,${0.03 * flickerIntensity})`);
    outerGrad.addColorStop(1, 'rgba(255,255,150,0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner bright pool
    const innerGrad = ctx.createRadialGradient(poolX - 2, poolY, 1, poolX - 2, poolY, 12);
    innerGrad.addColorStop(0, `rgba(255,255,230,${0.18 * flickerIntensity})`);
    innerGrad.addColorStop(0.5, `rgba(255,255,200,${0.08 * flickerIntensity})`);
    innerGrad.addColorStop(1, 'rgba(255,255,180,0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.ellipse(poolX - 2, poolY, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // NOTE: The old code drew 3 extra circular bloom rings around the
    // headlight which looked like halos. The new design keeps only a
    // single small halo right on the lens body — the volumetric cone
    // above already carries the directional light work.


    // ── Headlight Lens (multi-layer glow) ──
    // Outer glow
    ctx.fillStyle = `rgba(255,255,200,${0.08 * flickerIntensity})`;
    ctx.beginPath();
    ctx.ellipse(hlX, hlY, 14, 9, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Mid glow
    ctx.fillStyle = `rgba(255,255,200,${0.18 * flickerIntensity})`;
    ctx.beginPath();
    ctx.ellipse(hlX, hlY, 7, 4.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Lens body
    const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, 3.5);
    hlGrad.addColorStop(0, `rgba(255,255,240,${0.95 * flickerIntensity})`);
    hlGrad.addColorStop(0.6, `rgba(255,255,200,${0.7 * flickerIntensity})`);
    hlGrad.addColorStop(1, `rgba(255,230,150,${0.3 * flickerIntensity})`);
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.ellipse(hlX, hlY, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lens reflection
    ctx.fillStyle = `rgba(255,255,255,${0.5 * flickerIntensity})`;
    ctx.beginPath();
    ctx.ellipse(hlX - 1, hlY - 1, 1.5, 0.8, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Tail Light — small filament + directional backward cast ──
  // Replaces the old concentric-ring "bloom" with a proper red LED lens
  // and a short directional cone aimed backward.
  const isBraking = bike.phase === 'idle' || bike.speed < 30;
  const brakeIntensity = isBraking ? (0.8 + Math.sin(g.elapsed * 4) * 0.15) : 0.5;
  const tailX = rearWX - 2, tailY = -10;

  // Directional cast (linear gradient pointing backward). Not a circle.
  const castLen = isBraking ? 18 : 10;
  const castGrad = ctx.createLinearGradient(tailX, tailY, tailX - castLen, tailY);
  castGrad.addColorStop(0, `rgba(255,40,20,${brakeIntensity * 0.45})`);
  castGrad.addColorStop(0.5, `rgba(200,10,10,${brakeIntensity * 0.15})`);
  castGrad.addColorStop(1, 'rgba(120,0,0,0)');
  ctx.fillStyle = castGrad;
  ctx.beginPath();
  // Narrow triangular cone backward
  ctx.moveTo(tailX, tailY - 2.8);
  ctx.lineTo(tailX - castLen, tailY - castLen * 0.35);
  ctx.lineTo(tailX - castLen, tailY + castLen * 0.35 + 1);
  ctx.lineTo(tailX, tailY + 2.8);
  ctx.closePath();
  ctx.fill();

  // LED body — small, bright, and compact
  const ledGrad = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, 2.6);
  ledGrad.addColorStop(0, `rgba(255,200,180,${brakeIntensity})`);
  ledGrad.addColorStop(0.35, `rgba(255,60,30,${brakeIntensity})`);
  ledGrad.addColorStop(0.75, `rgba(180,10,5,${brakeIntensity * 0.6})`);
  ledGrad.addColorStop(1, 'rgba(80,0,0,0)');
  ctx.fillStyle = ledGrad;
  ctx.beginPath();
  ctx.ellipse(tailX, tailY, 2.6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lens rim (plastic housing)
  ctx.strokeStyle = 'rgba(40,5,5,0.85)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(tailX, tailY, 2.6, 1.8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Tiny specular dot on the lens
  ctx.fillStyle = `rgba(255,200,180,${brakeIntensity * 0.9})`;
  ctx.beginPath();
  ctx.arc(tailX - 0.6, tailY - 0.5, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // ── Wet Asphalt Reflection (red only — no white/yellow behind bike) ──
  ctx.save();
  ctx.translate(0, 10);
  // Tail light reflection (red)
  const tailRefAlpha = isBrakingNow ? 0.06 : 0.03;
  const tailRefGrad = ctx.createRadialGradient(rearWX - 2, 4, 1, rearWX - 2, 4, 15);
  tailRefGrad.addColorStop(0, `rgba(255,30,20,${tailRefAlpha})`);
  tailRefGrad.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = tailRefGrad;
  ctx.beginPath();
  ctx.ellipse(rearWX - 2, 4, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Silhouette ghost (faint inverted)
  ctx.scale(1, -0.12);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(0, -10, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sine wave ripple on reflection
  ctx.globalAlpha = 0.03;
  for (let r = 0; r < 3; r++) {
    const rx = Math.sin(g.elapsed * 1.5 + r * 2) * 3;
    ctx.beginPath();
    ctx.ellipse(rx, -8 + r * 4, 25 - r * 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Dynamic soft shadow (layered contact + cast) ──
  ctx.save();
  // Soft contact shadow directly under the tyres (short and darkest)
  const contactGrad = ctx.createRadialGradient(0, 6, 0, 0, 6, 22);
  contactGrad.addColorStop(0, 'rgba(0,0,0,0.28)');
  contactGrad.addColorStop(0.6, 'rgba(0,0,0,0.08)');
  contactGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = contactGrad;
  ctx.beginPath();
  ctx.ellipse(0, 6, 22, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cast shadow stretched away from the headlight (diagonal)
  ctx.globalAlpha = 0.12;
  const shadowCastGrad = ctx.createLinearGradient(-40, 10, 20, 5);
  shadowCastGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shadowCastGrad.addColorStop(0.3, 'rgba(0,0,0,0.55)');
  shadowCastGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowCastGrad;
  ctx.beginPath();
  ctx.moveTo(-30, 5);
  ctx.lineTo(-42, 12);
  ctx.lineTo(14, 12);
  ctx.lineTo(24, 5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Heat Shimmer (above engine during idle) — enhanced ──
  if (bike.phase === 'idle') {
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let h = 0; h < 8; h++) {
      const hx = -6 + h * 2.5 + Math.sin(g.elapsed * 5 + h * 1.5) * 1.5;
      const hy = -14 - h * 1.8 + Math.sin(g.elapsed * 3.5 + h) * 1;
      const hSize = 1.5 + Math.sin(g.elapsed * 4 + h * 0.7) * 0.5;
      ctx.fillStyle = `rgba(255,200,100,${0.15 + Math.sin(g.elapsed * 6 + h) * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(hx, hy, hSize * 1.3, hSize, g.elapsed * 0.5 + h, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Driver (blue helmet with goggles, waving during dismount) ──
  const engineBob = Math.sin(g.elapsed * 12) * 0.3 + Math.sin(g.elapsed * 19) * 0.1;
  const driverIsWaving = false; // Driver stays in riding pose during dismount
  
  // Bike weight relief: bounce up slightly when passenger gets off
  const weightRelief = passengerDismounting && dismountProgress > 0.65 
    ? Math.sin((dismountProgress - 0.65) / 0.35 * Math.PI) * -1.2 : 0;
  
  drawCharacter(ctx, {
    x: 2, y: -18 + weightRelief,
    scale: 0.5,
    sitting: true,
    facingRight: true,
    isDriver: !driverIsWaving,
    helmetColor: '#2563eb',
    bodyBob: engineBob,
    armOffset: 0,
    legOffset: 0,
    isHit: false,
    elapsed: g.elapsed,
    isWaving: driverIsWaving,
    hasGoggles: true,
  });

  // ── Passenger (player — slate helmet, same as renderPlayer) ──
  if (showPassenger && !passengerDismounting) {
    drawCharacter(ctx, {
      x: -6, y: -18,
      scale: 0.5,
      sitting: true,
      facingRight: true,
      isDriver: false,
      helmetColor: '#334155',
      bodyBob: engineBob,
      armOffset: 0,
      legOffset: 0,
      isHit: false,
      elapsed: g.elapsed,
      holdingDriver: true,
    });
  }

  // ── Simple Dismount: smooth slide off behind bike — no animations, no dust ──
  // NOTE: dismounting character is drawn BEFORE the bike (see renderIntroBike)
  // so this block is now empty — the character is drawn in renderIntroBike before renderMotorcycle

  ctx.restore();

  // ── Emit world-space point lights so the scene picks the bike up as a light source ──
  // Done AFTER ctx.restore() so we can compute coordinates in world space directly.
  emitBikeLights(bike);
}

/**
 * Dispatches point lights for the bike into the global lighting buffer.
 * Coordinates are world-space; the renderer composites lights in the same
 * camera transform so the bike will softly illuminate nearby pixels.
 */
function emitBikeLights(bike: {
  pos: { x: number; y: number };
  facingRight: boolean;
  phase: string;
  speed: number;
}) {
  const dir = bike.facingRight ? 1 : -1;
  // Scale factor used inside renderMotorcycle = 2.4
  const S = 2.4;
  const baseY = bike.pos.y;

  // ── Headlight: warm pool cast forward onto the ground ──
  const hlLocalX = (22 + 5) * dir; // frontWX + 5
  const hlLocalY = -10;
  // NOTE: the bike now draws its own directional cone + LED bodies +
  // ground casts inside renderMotorcycle(). We only emit a SINGLE very
  // subtle warm tint at the ground pool position so the global lighting
  // pass still picks the bike up as a light source — no more concentric
  // halo rings that looked like circles stacked on top of the bike.
  const hlActive = bike.phase === 'idle' || bike.phase === 'leaving' || bike.phase === 'entering';
  if (hlActive) {
    emitLight({
      x: bike.pos.x + (45 * dir),
      y: baseY + 6 * S,
      radius: 70,
      color: 'rgba(255,210,130,',
      intensity: 0.3,
      flicker: 0.05,
    });
  }
}

function renderDeliveryBike(ctx: CanvasRenderingContext2D, g: GameData) {
  const bike = g.deliveryBike;
  if (!bike || !bike.active) return;
  renderMotorcycle(ctx, bike, g, false, false, 0);
}

function renderMinePlanter(ctx: CanvasRenderingContext2D, g: GameData) {
  const m = g.minePlanter;
  if (!m || !m.active) return;
  const planting = m.phase === 'planting';
  const walkCycle = Math.sin(m.walkAnim * 2);
  const legSwing = planting ? 0 : walkCycle * 8;
  const crouchY = planting ? 12 : 0;
  const dir = m.facingRight ? 1 : -1;

  ctx.save();
  ctx.translate(m.pos.x, m.pos.y + crouchY);
  ctx.scale(dir, 1);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ═══ LEGS — camouflage + combat boots ═══
  const legLen = 24 - crouchY * 0.4;
  for (const legOff of [-6, 2 + legSwing * 0.3]) {
    ctx.save();
    ctx.translate(legOff, 0);
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, -legLen, 5, legLen);
    ctx.fillStyle = '#2d5a2d';
    ctx.fillRect(0.5, -legLen * 0.6, 3, 7);
    ctx.fillRect(1, -legLen * 0.2, 4, 6);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(-0.5, 0, 6, 4);
    ctx.restore();
  }

  // ═══ TORSO — tactical vest ═══
  const torsoY = planting ? -32 : -44;
  const torsoH = planting ? 16 : 28;
  const tGrad = ctx.createLinearGradient(0, torsoY, 0, torsoY + torsoH);
  tGrad.addColorStop(0, '#4a6a4a');
  tGrad.addColorStop(1, '#2d4a2d');
  ctx.fillStyle = tGrad;
  ctx.fillRect(-8, torsoY, 16, torsoH);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-7, torsoY + 2, 14, torsoH - 4);
  ctx.fillStyle = '#2d4a2d';
  ctx.fillRect(-5, torsoY + 3, 4, 5);
  ctx.fillRect(1, torsoY + 3, 4, 5);
  ctx.fillStyle = '#5a7a5a';
  ctx.fillRect(-6, torsoY + 9, 5, 6);
  ctx.fillRect(2, torsoY + 6, 5, 5);
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(-8.5, torsoY + torsoH - 2, 17, 2);

  // ═══ ARMS ═══
  ctx.fillStyle = '#4a6a4a';
  if (planting) {
    ctx.fillRect(6, torsoY + 4, 4, 16);
    ctx.fillRect(-10, torsoY + 4, 4, 16);
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath(); ctx.arc(10, torsoY + 21, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-8, torsoY + 21, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    const aSwing = walkCycle * 0.3;
    ctx.save(); ctx.translate(8, torsoY + 3); ctx.rotate(aSwing);
    ctx.fillRect(0, 0, 4, 14);
    ctx.restore();
    ctx.save(); ctx.translate(-8, torsoY + 3); ctx.rotate(-aSwing);
    ctx.fillRect(-4, 0, 4, 14);
    ctx.restore();
  }

  // ═══ BACKPACK ═══
  ctx.fillStyle = '#2d4a2d';
  ctx.fillRect(-6, torsoY + 3, 12, 14);
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(-5, torsoY + 5, 10, 8);

  // ═══ HELMET + FACE ═══
  const hY = planting ? -36 : -48;
  ctx.fillStyle = '#3d5a3d';
  ctx.beginPath(); ctx.arc(0, hY, 8, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(-8, hY, 16, 1.5);
  ctx.fillStyle = '#c9a882';
  ctx.fillRect(-5, hY + 1, 10, 5);
  ctx.fillStyle = '#3d5a3d';
  ctx.fillRect(-6, hY + 4, 12, 3);
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(-2.5, hY + 2.5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2.5, hY + 2.5, 1, 0, Math.PI * 2); ctx.fill();

  // ═══ MINE IN HANDS ═══
  if (planting) {
    const pp = Math.min(1, m.phaseTimer / 1.0);
    const my = -10 + pp * 14;
    const mGrad = ctx.createRadialGradient(-1, my - 1, 0, 0, my, 5.5);
    mGrad.addColorStop(0, '#4a4a4a'); mGrad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = mGrad;
    ctx.beginPath(); ctx.arc(0, my, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-1, my - 6, 2, 5);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(0, my - 6.5, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
  if (planting) {
    ctx.save();
    const a = 0.7 + Math.sin(performance.now() * 0.008) * 0.3;
    ctx.fillStyle = `rgba(251,191,36,${a})`;
    ctx.font = 'bold 10px Tajawal, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ يزرع لغم', m.pos.x, m.pos.y - 70);
    ctx.restore();
  }
}

// ─── Intro Bike + Passenger + Farewell Scene ──────────────────────────
function renderIntroBike(ctx: CanvasRenderingContext2D, g: GameData) {
  const bike = g.introBike;
  if (!bike || !bike.active) return;

  const showPassenger = g.introPhase === 'bikeEnter' || g.introPhase === 'bikeStop';
  const isDismounting = g.introPhase === 'playerDismount';
  const dismountProg = isDismounting ? Math.min(1, g.introTimer / 1.8) : 0;

  // ── Draw dismounting character BEHIND the bike (before bike rendering) ──
  if (isDismounting) {
    const dp = dismountProg;

    // 4-phase natural dismount:
    //   A) anticipate  [0.00 → 0.12]  weight shifts back on the seat
    //   B) leg swing   [0.12 → 0.38]  leg arcs over the seat, body leans
    //   C) free drop   [0.38 → 0.72]  parabolic hop down, knees bent
    //   D) land+stand  [0.72 → 1.00]  squat absorb then rise to idle
    //
    // Everything runs in bike-local coordinates — positive X is forward,
    // negative X is behind the bike. The final position must exactly
    // match the gameplay idle pose.
    const finalOffset = -35;
    let posX: number, posY: number;
    let legAnim = 0, armAnim = 0;
    let squat = 0, rot = 0;

    if (dp < 0.12) {
      // A — Anticipation: rider leans back slightly on the saddle
      const t = dp / 0.12;
      posX = -6 - t * 2;
      posY = 0;
      legAnim = 0;
      armAnim = t * 0.8;
      rot = t * 0.06;
    } else if (dp < 0.38) {
      // B — Leg swing over the seat with a slight body rise
      const t = (dp - 0.12) / 0.26;
      const swing = t * t * (3 - 2 * t); // smoothstep
      posX = -8 - swing * 10;
      posY = -swing * 4 - Math.sin(t * Math.PI) * 2;
      legAnim = swing * 3.5;
      armAnim = 0.8 - swing * 0.6;
      rot = 0.06 - swing * 0.08;
    } else if (dp < 0.72) {
      // C — Free drop behind the bike: parabolic arc with gravity
      const t = (dp - 0.38) / 0.34; // 0..1 during the drop
      const hEase = t * t * (3 - 2 * t);
      posX = -18 - hEase * 14;
      // Parabola: v0*t - 0.5*g*t² (negative y because up is -y on canvas)
      const v0 = 4.5;
      const gAcc = 11;
      const yArc = -(v0 * t - 0.5 * gAcc * t * t) * 3.2;
      posY = yArc;
      legAnim = 3.5 * (1 - t) + t * 4; // spread legs for landing
      armAnim = -0.4 * (1 - Math.abs(t - 0.5) * 2); // subtle arms-out balance
      rot = -0.02;
    } else {
      // D — Landing: squat absorb then rise
      const t = (dp - 0.72) / 0.28;
      posX = -32 - (t * t * (3 - 2 * t)) * 3; // slide last 3px to final -35
      posY = 0;
      // Squat absorption: dip for first half, rise for second
      if (t < 0.4) {
        squat = Math.sin((t / 0.4) * Math.PI) * 4.5;
      } else {
        squat = (1 - ((t - 0.4) / 0.6)) * 4.5 * 0.3;
      }
      legAnim = 4 * (1 - t);
      armAnim = 0;
      rot = 0;
    }

    const dismountX = bike.pos.x + posX;
    const dismountY = bike.pos.y + posY;

    ctx.save();
    ctx.translate(dismountX, dismountY);
    ctx.rotate(rot);
    ctx.scale(1.6, 1.6);
    // Apply squat: shrink vertically around the feet
    if (squat > 0) {
      const yComp = squat / 16;
      ctx.scale(1 + yComp * 0.25, 1 - yComp);
    }
    drawCharacter(ctx, {
      x: 0, y: 0,
      scale: 1,
      sitting: false,
      facingRight: true,
      isDriver: false,
      helmetColor: '#334155',
      bodyBob: 0,
      armOffset: armAnim,
      legOffset: legAnim,
      isHit: false,
      elapsed: g.elapsed,
    });
    ctx.restore();

    // Landing dust puff on phase D boundary
    if (dp > 0.72 && dp < 0.82) {
      const dustT = (dp - 0.72) / 0.1;
      const dustAlpha = (1 - dustT) * 0.55;
      const groundY = g.height * 0.78;
      ctx.save();
      ctx.globalAlpha = dustAlpha;
      for (let i = 0; i < 5; i++) {
        const dx = bike.pos.x - 32 + (Math.random() - 0.5) * 18;
        const dy = groundY - Math.random() * 3;
        const dsz = 2 + Math.random() * 3 + dustT * 2;
        ctx.fillStyle = `rgba(170,155,130,${0.6 - dustT * 0.5})`;
        ctx.beginPath();
        ctx.arc(dx, dy, dsz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Panel 2: Player standing alone — drawn BEFORE bike so player stays behind it
  if (g.introPhase === 'bikeLeave') {
    const p = g.player;
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    ctx.scale(1.6, 1.6);
    drawCharacter(ctx, {
      x: 0, y: 0,
      scale: 1,
      sitting: false,
      facingRight: true,
      isDriver: false,
      helmetColor: '#334155',
      bodyBob: Math.sin(g.elapsed * 2.5) * 0.8,
      armOffset: 0,
      legOffset: 0,
      isHit: false,
      elapsed: g.elapsed,
    });
    ctx.restore();
  }

  renderMotorcycle(ctx, bike, g, showPassenger, isDismounting, dismountProg);
}

// ─── Water Bottle Icon ────────────────────────────────
function drawWaterIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Flat white water bottle
  const bw = s * 0.3, bh = s * 0.8;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.3, bw * 2, bh * 0.8, 3);
  ctx.fill();
  // Cap
  ctx.fillRect(-bw * 0.5, -bh * 0.5, bw, bh * 0.22);
}

// ─── Rest Overlay ─────────────────────────────────────
function renderRestOverlay(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.wavePhase !== 'cards' && g.wavePhase !== 'bike') return;
  // Subtle calm overlay
  ctx.fillStyle = 'rgba(0, 10, 30, 0.15)';
  ctx.fillRect(0, 0, g.width, g.height);
}

// ─── Upgrade Cards ────────────────────────────────────
function renderUpgradeCards(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.wavePhase !== 'cards' || g.upgradeCards.length === 0) return;

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, g.width, g.height);

  // Animate cards sliding in
  const slideIn = Math.min(1, g.cardsShownTimer * 3);
  const eased = 1 - Math.pow(1 - slideIn, 3);

  // ── Title ──
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title (Arabic only)
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 22px Tajawal, Arial, sans-serif';
  ctx.shadowColor = 'rgba(251,191,36,0.3)';
  ctx.shadowBlur = 8;
  ctx.direction = 'rtl';
  ctx.fillText('اختر ترقية', g.width / 2, g.height * 0.20);
  ctx.direction = 'ltr';
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Cards (responsive) ──
  // Scale cards so they always fit the viewport with a safe margin on the
  // narrowest phones (iPhone SE ~ 320 CSS px).
  const cardCount = g.upgradeCards.length;
  const gap = Math.max(8, Math.min(14, g.width * 0.02));
  const horizMargin = Math.max(16, g.width * 0.05);
  const maxTotalW = g.width - horizMargin * 2;
  // Base card width at 130, but shrink to fit if there isn't room
  const idealCardW = 130;
  const totalIdeal = cardCount * idealCardW + (cardCount - 1) * gap;
  const scale = totalIdeal > maxTotalW ? maxTotalW / totalIdeal : 1;
  const cardW = Math.floor(idealCardW * scale);
  const cardH = Math.floor(185 * scale);
  const totalW = cardCount * cardW + (cardCount - 1) * gap;
  const startX = (g.width - totalW) / 2;
  const cardY = g.height * 0.30;

  for (let i = 0; i < g.upgradeCards.length; i++) {
    const card = g.upgradeCards[i];
    const cx = startX + i * (cardW + gap);
    const cy = cardY + (1 - eased) * 80;

    // No selection highlight needed — tap triggers immediately
    const isSelected = false;

    ctx.save();
    ctx.globalAlpha = eased;

    // Scale effect for selected card
    if (isSelected) {
      const centerX = cx + cardW / 2;
      const centerY = cy + cardH / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(1.05, 1.05);
      ctx.translate(-centerX, -centerY);
    }

    // Card shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;

    // Card background — clean dark gradient
    const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
    cardGrad.addColorStop(0, 'rgba(28, 28, 45, 0.97)');
    cardGrad.addColorStop(0.5, 'rgba(22, 22, 38, 0.97)');
    cardGrad.addColorStop(1, 'rgba(16, 16, 30, 0.97)');
    ctx.fillStyle = cardGrad;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cardW, cardH, 14);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Subtle border
    ctx.strokeStyle = isSelected ? card.color : `${card.color}88`;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cardW, cardH, 14);
    ctx.stroke();

    // Top accent line
    ctx.strokeStyle = card.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy + 1);
    ctx.lineTo(cx + cardW - 20, cy + 1);
    ctx.stroke();

    // ── Icon area ──
    const iconY = cy + 55;
    // Icon circle background
    ctx.fillStyle = `${card.color}15`;
    ctx.beginPath();
    ctx.arc(cx + cardW / 2, iconY, 28, 0, Math.PI * 2);
    ctx.fill();
    // Icon ring
    ctx.strokeStyle = `${card.color}33`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx + cardW / 2, iconY, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Icon — larger
    ctx.fillStyle = '#fff';
    ctx.font = '42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.icon, cx + cardW / 2, iconY);

    // Arabic name only — RTL with Tajawal font
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Tajawal, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(card.nameAr, cx + cardW / 2, cy + 115);
    ctx.direction = 'ltr';

    ctx.restore();
  }

  // ── Timer bar ──
  const maxTime = 10;
  const remaining = Math.max(0, maxTime - g.cardsShownTimer);
  const ratio = remaining / maxTime;
  const barW = totalW;
  const barX = startX;
  const barY = cardY + cardH * eased + 20;

  // Background track
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, 4, 2);
  ctx.fill();

  // Progress fill
  const barColor = ratio > 0.3 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * ratio, 4, 2);
  ctx.fill();
}

// ─── Wave Indicator ───────────────────────────────────
function renderWaveIndicator(ctx: CanvasRenderingContext2D, g: GameData) {
  if (g.waveNumber < 1) return;
  const w = g.width;
  const levelNum = g.levelNumber || 1;
  const label = `LVL ${levelNum} — WAVE ${g.waveNumber}`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px Tajawal, monospace';
  const tx = w / 2, ty = 14;
  // Background pill
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  const tw = ctx.measureText(label).width + 16;
  ctx.beginPath();
  ctx.roundRect(tx - tw / 2, ty - 8, tw, 16, 8);
  ctx.fill();
  // Text
  ctx.fillStyle = g.wavePhase === 'active' ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.7)';
  ctx.fillText(label, tx, ty);

  // Level Up announcement (first wave of a new level, briefly)
  if (g.waveNumber > 1 && (g.waveNumber - 1) % 3 === 0 && g.waveElapsed < 3) {
    const alpha = Math.max(0, 1 - g.waveElapsed / 3);
    const scale = 1 + (1 - g.waveElapsed / 3) * 0.3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${Math.round(24 * scale)}px Tajawal, Arial, sans-serif`;
    ctx.shadowColor = 'rgba(251,191,36,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(`LEVEL ${levelNum}`, tx, ty + 35);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── Main Render ──────────────────────────────────────
export function render(ctx: CanvasRenderingContext2D, g: GameData) {
  // Clear per-frame lighting accumulator
  beginFrameLights();

  ctx.save();

  // Camera zoom effect (bike entrance)
  const zoom = g.cameraZoom || 1;
  if (zoom !== 1) {
    const fx = g.cameraFocusX || g.width / 2;
    const fy = g.cameraFocusY || g.height * 0.78;
    ctx.translate(fx, fy);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
  }

  ctx.translate(g.screenShake.x - g.camera.x, g.screenShake.y);

  // ── Ground Fog during intro ──
  const isIntro = g.state === 'intro' && g.introPhase !== 'done';

  renderBackground(ctx, g);
  
  // ── Live flickering windows during intro ──
  if (isIntro) {
    const groundY = g.height * 0.78;
    const camX = g.camera.x;
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const wx = ((i * 157 + 40) % 600) + Math.floor(camX / 600) * 600;
      const wy = groundY - 60 - (i * 43) % 120;
      const winSize = 4 + (i % 3) * 2;
      const flicker = Math.sin(g.elapsed * (1.5 + i * 0.7) + i * 3.1);
      const isOn = flicker > -0.3;
      if (isOn) {
        const colors = ['rgba(255,200,100,', 'rgba(100,180,255,', 'rgba(180,255,150,', 'rgba(255,150,100,'];
        const color = colors[i % colors.length];
        // Window glow
        ctx.fillStyle = `${color}${0.08 + flicker * 0.04})`;
        ctx.fillRect(wx - winSize / 2, wy - winSize / 2, winSize, winSize * 1.3);
        // Ground light spill
        const spillGrad = ctx.createRadialGradient(wx, groundY, 0, wx, groundY, 20 + winSize * 3);
        spillGrad.addColorStop(0, `${color}${0.03 + flicker * 0.015})`);
        spillGrad.addColorStop(1, `${color}0)`);
        ctx.fillStyle = spillGrad;
        ctx.beginPath();
        ctx.ellipse(wx, groundY + 2, 20 + winSize * 2, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  renderCraters(ctx, g);
  renderAmbient(ctx, g);
  renderWarnings(ctx, g);
  renderSmokeTrails(ctx, g);
  renderHazards(ctx, g);
  renderExplosions(ctx, g);
  renderPowerUps(ctx, g);
  renderFirePools(ctx, g);
  renderDeliveryBike(ctx, g);
  renderMinePlanter(ctx, g);
  renderIntroBike(ctx, g);
  renderGasClouds(ctx, g);
  renderDrones(ctx, g);
  renderLaserBeams(ctx, g);
  renderBoss(ctx, g);
  renderBullets(ctx, g);
  // Player shadow on ground
  {
    const p = g.player;
    const groundY = g.height * 0.78;
    const shadowDist = groundY - p.pos.y;
    const shadowScale = Math.max(0.3, 1 - shadowDist * 0.003);
    ctx.fillStyle = `rgba(0,0,0,${0.15 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(p.pos.x, groundY, 12 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Walking dust particles
  {
    const p = g.player;
    const groundY = g.height * 0.78;
    if (p.anim === 'walk' && Math.abs(p.pos.y - groundY) < 5) {
      for (let i = 0; i < 2; i++) {
        const dx = (Math.random() - 0.5) * 8;
        const dy = -Math.random() * 4;
        const sz = 1 + Math.random() * 1.5;
        const alpha = 0.1 + Math.random() * 0.1;
        ctx.fillStyle = `rgba(160, 140, 120, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.pos.x + dx, groundY + dy, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Motion trail during dash
  {
    const p = g.player;
    if (p.isDashing) {
      const trailCount = 4;
      for (let i = 1; i <= trailCount; i++) {
        const trailX = p.pos.x - p.velocity.x * 0.008 * i;
        const trailAlpha = 0.15 - i * 0.035;
        ctx.globalAlpha = Math.max(0, trailAlpha);
        ctx.fillStyle = '#4a90e2';
        ctx.beginPath();
        ctx.ellipse(trailX, p.pos.y - 12, 6, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  // Don't render player separately during intro — renderIntroBike handles all character rendering
  // Fade in playerGlow smoothly after intro ends (0.5s transition)
  const hidePlayer = g.state === 'intro' && g.introPhase !== 'done';
  if (!hidePlayer) {
    // Smooth fade-in for player glow after intro transition
    const glowFade = g.introTransitionTimer !== undefined ? Math.min(1, g.introTransitionTimer / 0.5) : 1;
    if (glowFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = glowFade;
      renderPlayerGlow(ctx, g);
      ctx.restore();
    }
    renderPlayer(ctx, g);
    // Minesweeper tool in the player's hand (drawn after player body)
    if (g.player.minesweeperTimer > 0 || g.player.minesweeperDoffTimer > 0) {
      const p = g.player;
      const donProgress = p.minesweeperDonTimer > 0 ? 1 - (p.minesweeperDonTimer / 0.6) : 1;
      const doffProgress = p.minesweeperDoffTimer > 0 ? (p.minesweeperDoffTimer / 0.4) : 1;
      const vis = p.minesweeperTimer > 0 ? donProgress : doffProgress;
      ctx.save();
      ctx.globalAlpha = vis;
      ctx.translate(p.pos.x + (p.facingRight ? 12 : -12), p.pos.y - 18);
      ctx.rotate(p.facingRight ? 0.4 : -0.4);
      if (!p.facingRight) ctx.scale(-1, 1);
      // Handle (wood/metal)
      ctx.strokeStyle = '#8b6b2e';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, -10);
      ctx.lineTo(6, 14);
      ctx.stroke();
      // Disc head (gold)
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(6, 16, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a0a';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Status LED (pulses green when near a mine, amber otherwise)
      let nearArmedMine = false;
      for (const h of g.hazards) {
        if (h.active && h.type === 'mine' && h.mineState === 'armed') {
          if (Math.abs(h.pos.x - p.pos.x) < 60) { nearArmedMine = true; break; }
        }
      }
      const led = nearArmedMine ? '#22c55e' : '#fbbf24';
      const pulse = 0.5 + Math.sin(g.elapsed * (nearArmedMine ? 10 : 3)) * 0.5;
      ctx.fillStyle = led;
      ctx.globalAlpha = vis * (0.5 + pulse * 0.5);
      ctx.beginPath();
      ctx.arc(6, 14, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  renderParticles(ctx, g);
  renderRain(ctx, g);
  renderFloatingTexts(ctx, g);

  // ── Ground fog during intro ──
  if (isIntro) {
    const groundY = g.height * 0.78;
    const camX = g.camera.x;
    ctx.save();
    ctx.globalAlpha = 0.06;
    const fogWave = Math.sin(g.elapsed * 0.5) * 3;
    const fogGrad = ctx.createLinearGradient(0, groundY - 5, 0, groundY + 15);
    fogGrad.addColorStop(0, 'rgba(150,160,180,0)');
    fogGrad.addColorStop(0.3, 'rgba(150,160,180,1)');
    fogGrad.addColorStop(0.7, 'rgba(130,140,160,0.6)');
    fogGrad.addColorStop(1, 'rgba(130,140,160,0)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(camX - 200, groundY - 5 + fogWave, g.width + 400, 20);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Emit dynamic point lights from key entities (world space) ──
  // Explosions → bright orange flash that fades
  for (const ex of g.explosions) {
    const progress = 1 - ex.life / ex.maxLife;
    const fade = 1 - progress;
    if (fade > 0.05) {
      emitLight({
        x: ex.pos.x,
        y: ex.pos.y,
        radius: ex.size * 4,
        color: 'rgba(255,170,60,',
        intensity: fade * 0.9,
        flicker: 0.1,
      });
    }
  }
  // Fire pools → pulsing red/orange glow
  for (const fp of g.firePools) {
    const life = Math.max(0, Math.min(1, fp.life / fp.maxLife));
    if (life > 0.05) {
      emitLight({
        x: fp.pos.x,
        y: fp.pos.y - 6,
        radius: fp.size * 1.8,
        color: 'rgba(255,120,30,',
        intensity: life * 0.55,
        flicker: 0.35,
      });
    }
  }
  // Boss engines → warm glow behind the plane
  if (g.boss && !g.boss.defeated) {
    emitLight({
      x: g.boss.pos.x - g.boss.size * 0.3,
      y: g.boss.pos.y,
      radius: g.boss.size * 1.2,
      color: 'rgba(255,140,50,',
      intensity: 0.4,
      flicker: 0.2,
    });
  }
  // Player glow (subtle cyan) — lets player "see" themselves in low light
  if (!isIntro && g.deathPhase === 'alive') {
    emitLight({
      x: g.player.pos.x,
      y: g.player.pos.y - 18,
      radius: 70,
      color: 'rgba(120,180,255,',
      intensity: 0.25,
    });
  }

  // ── Missile exhaust glow — adds warm flicker to the trail ──
  for (const hz of g.hazards) {
    if (!hz.active || !hz.falling) continue;
    if (hz.type === 'missile') {
      const angle = Math.atan2(hz.targetPos.y - hz.pos.y, hz.targetPos.x - hz.pos.x);
      const tailX = hz.pos.x - Math.cos(angle) * hz.size * 1.4;
      const tailY = hz.pos.y - Math.sin(angle) * hz.size * 1.4;
      emitLight({
        x: tailX,
        y: tailY,
        radius: 40,
        color: 'rgba(255,160,60,',
        intensity: 0.55,
        flicker: 0.25,
      });
    } else if (hz.type === 'cluster' && hz.clusterPhase === 'flying') {
      emitLight({
        x: hz.pos.x - (hz.clusterVelX && hz.clusterVelX < 0 ? -18 : 18),
        y: hz.pos.y,
        radius: 38,
        color: 'rgba(255,150,80,',
        intensity: 0.45,
        flicker: 0.2,
      });
    }
  }

  // ── Drone engine glows (subtle tint per tier) ──
  for (const d of g.drones) {
    if (!d.active) continue;
    if (d.tier === 'incendiary') {
      emitLight({
        x: d.pos.x,
        y: d.pos.y + d.size * 0.35,
        radius: 55,
        color: 'rgba(255,130,40,',
        intensity: 0.4,
        flicker: 0.25,
      });
    } else if (d.tier === 'chemical') {
      emitLight({
        x: d.pos.x,
        y: d.pos.y + d.size * 0.35,
        radius: 55,
        color: 'rgba(74,222,128,',
        intensity: 0.35,
        flicker: 0.18,
      });
    } else if (d.tier === 'cargo') {
      emitLight({
        x: d.pos.x,
        y: d.pos.y,
        radius: 40,
        color: 'rgba(100,180,255,',
        intensity: 0.22,
        flicker: 0.08,
      });
    }
  }

  // Composite all lights in world space (before we restore camera transform)
  renderLights(ctx);

  ctx.restore();

  // ── Letterbox Bars during intro ──
  if (isIntro) {
    const barH = 20;
    const introProgress = g.introPhase === 'bikeLeave' ? Math.min(1, g.introTimer / 1.5) : 0;
    const barAlpha = 1 - introProgress;
    if (barAlpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${barAlpha * 0.85})`;
      ctx.fillRect(0, 0, g.width, barH);
      ctx.fillRect(0, g.height - barH, g.width, barH);
    }
  }

  // Post-processing: bloom over bright hazards/explosions before overlays
  applyBloom(ctx, g);

  // Lightning flash
  renderLightning(ctx, g);

  // Dynamic vignette — intensifies with low health (red)
  renderVignette(ctx, g);

  // Damage flash with chromatic aberration
  renderDamageFlash(ctx, g);

  // Death transition vignette
  if (g.deathPhase === 'dying') {
    const deathProgress = 1 - Math.max(0, g.deathTimer / 1.5);
    // White vignette growing from edges
    const vigAlpha = deathProgress * 0.6;
    const cx = g.width / 2, cy = g.height / 2;
    const r = Math.max(g.width, g.height) * 0.8;
    const deathGrad = ctx.createRadialGradient(cx, cy, r * (1 - deathProgress * 0.5), cx, cy, r);
    deathGrad.addColorStop(0, 'rgba(255,255,255,0)');
    deathGrad.addColorStop(1, `rgba(255,255,255,${vigAlpha})`);
    ctx.fillStyle = deathGrad;
    ctx.fillRect(0, 0, g.width, g.height);
    // Desaturation overlay
    ctx.fillStyle = `rgba(128,128,128,${deathProgress * 0.3})`;
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Slow-mo — no screen tint

  // Wave Finale — red vignette warning
  if (g.waveFinale && g.wavePhase === 'active') {
    const pulse = 0.15 + Math.sin(g.elapsed * 6) * 0.08;
    const cx = g.width / 2, cy = g.height / 2;
    const r = Math.max(g.width, g.height) * 0.7;
    const vigGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    vigGrad.addColorStop(0, 'rgba(239,68,68,0)');
    vigGrad.addColorStop(1, `rgba(239,68,68,${pulse})`);
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, g.width, g.height);
    // "FINAL BARRAGE" text
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(g.elapsed * 8) * 0.3;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px Tajawal, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u26A0 FINAL BARRAGE', g.width / 2, 32);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Mid-wave event visual cues
  if (g.wavePhase === 'active') {
    const surgeActive = isAnyWaveEventActive(g, 'surge');
    const calmActive = isAnyWaveEventActive(g, 'calm');
    if (surgeActive) {
      const pulse = 0.08 + Math.sin(g.elapsed * 8) * 0.05;
      const cx = g.width / 2, cy = g.height / 2;
      const r = Math.max(g.width, g.height) * 0.7;
      const vigGrad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      vigGrad.addColorStop(0, 'rgba(239,68,68,0)');
      vigGrad.addColorStop(1, `rgba(239,68,68,${pulse})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, g.width, g.height);
    } else if (calmActive) {
      // Soft blue tint for calm
      ctx.fillStyle = 'rgba(96,165,250,0.06)';
      ctx.fillRect(0, 0, g.width, g.height);
    }
  }

  // Scene transition blackout overlay
  if (g.sceneTransition?.active) {
    const blackout = getSceneBlackoutAlpha(g);
    if (blackout > 0) {
      ctx.fillStyle = `rgba(0,0,0,${blackout})`;
      ctx.fillRect(0, 0, g.width, g.height);
    }
  }

  // Wave End Slow-Mo — cinematic vignette + WAVE COMPLETE text
  if (g.waveEndSlowMo > 0) {
    const progress = 1 - g.waveEndSlowMo / 2.0;
    // Dark vignette
    const vigAlpha = 0.3 + progress * 0.2;
    const cx = g.width / 2, cy = g.height / 2;
    const r = Math.max(g.width, g.height) * 0.8;
    const vigGrad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, g.width, g.height);

    // Chromatic Aberration — ease in/out with slow-mo timer (time "bends")
    // Bell curve: peaks at progress=0.5, fades at edges
    const abEase = Math.sin(progress * Math.PI); // 0→1→0 smooth bell
    const maxOffset = 3; // peak pixel offset
    const abOffset = abEase * maxOffset;
    if (abOffset > 0.2) {
      ctx.save();
      // Red channel shift right
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = abEase * 0.06;
      ctx.fillStyle = 'rgba(255,30,30,1)';
      ctx.fillRect(abOffset, 0, g.width, g.height);
      // Blue channel shift left
      ctx.fillStyle = 'rgba(30,30,255,1)';
      ctx.fillRect(-abOffset, 0, g.width, g.height);
      // Green channel subtle vertical shift
      ctx.globalAlpha = abEase * 0.03;
      ctx.fillStyle = 'rgba(30,255,30,1)';
      ctx.fillRect(0, abOffset * 0.5, g.width, g.height);
      ctx.restore();
    }

  }

  // Wave Announce phase — full-screen banner after all threats cleared
  if (g.wavePhase === 'announce' && g.waveAnnounceTimer > 0) {
    const isBreakingNews = g.waveNumber === 1;
    const duration = isBreakingNews ? 5.0 : 3.0;
    const elapsed = duration - g.waveAnnounceTimer;
    let textAlpha = 1;
    if (elapsed < 0.4) textAlpha = elapsed / 0.4;
    else if (g.waveAnnounceTimer < 0.6) textAlpha = g.waveAnnounceTimer / 0.6;

    const nextWave = g.waveNumber + 1;
    ctx.save();

    if (isBreakingNews) {
      // ═══ BREAKING NEWS — خبر عاجل ═══
      const w = g.width;
      const h = g.height;
      const t = g.elapsed;

      // Full dark overlay
      ctx.globalAlpha = textAlpha * 0.85;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = textAlpha;

      // Responsive sizing — larger text
      const isMobile = w < 500;
      const pad = isMobile ? 20 : 40;
      const line1Size = Math.min(isMobile ? 22 : 30, w * 0.06);
      const line2Size = Math.min(isMobile ? 18 : 24, w * 0.048);
      const lineGap = line1Size * 1.5;
      const bannerH = lineGap + line2Size + pad * 2 + 8;
      const bannerY = h * 0.46 - bannerH / 2;

      // Slide-in animation: banner slides from left
      const slideProgress = Math.min(1, elapsed / 0.6);
      const slideEase = 1 - Math.pow(1 - slideProgress, 3); // ease-out cubic
      const slideX = (1 - slideEase) * (-w);

      ctx.save();
      ctx.translate(slideX, 0);

      // Banner gradient — red to darker red
      const bannerGrad = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerH);
      bannerGrad.addColorStop(0, '#cc1c1c');
      bannerGrad.addColorStop(0.4, '#a81212');
      bannerGrad.addColorStop(1, '#6e0808');
      ctx.fillStyle = bannerGrad;
      ctx.fillRect(0, bannerY, w, bannerH);

      // White accent lines top + bottom
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, bannerY, w, 2);
      ctx.fillRect(0, bannerY + bannerH - 2, w, 2);

      // Pulsing glow edge
      const glowPulse = 0.15 + Math.sin(t * 4) * 0.1;
      ctx.fillStyle = `rgba(255,80,80,${glowPulse})`;
      ctx.fillRect(0, bannerY - 4, w, 4);
      ctx.fillRect(0, bannerY + bannerH, w, 4);

      // Line 1: "خبر عاجل:" — bold, bigger
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(line1Size)}px Tajawal, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';
      // Text shadow for depth
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillText('خبر عاجل:', w / 2, bannerY + pad);

      // Line 2: the message — slightly smaller
      ctx.font = `${Math.round(line2Size)}px Tajawal, Arial, sans-serif`;
      ctx.shadowBlur = 4;
      ctx.fillText('المعاصر تدعو مواطنيها الى مغادرة كفرمندا فوراً', w / 2, bannerY + pad + lineGap);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.direction = 'ltr';
      ctx.textBaseline = 'alphabetic';

      ctx.restore(); // undo slide transform
    } else {
      // Standard wave announce
      ctx.globalAlpha = textAlpha * 0.7;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, g.width, g.height);

      const bannerH = 64;
      const bannerY = g.height * 0.48 - bannerH / 2;
      ctx.globalAlpha = textAlpha * 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, bannerY, g.width, bannerH);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = textAlpha * 0.7;
      ctx.beginPath();
      ctx.moveTo(g.width * 0.15, bannerY);
      ctx.lineTo(g.width * 0.85, bannerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.width * 0.15, bannerY + bannerH);
      ctx.lineTo(g.width * 0.85, bannerY + bannerH);
      ctx.stroke();

      ctx.globalAlpha = textAlpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 28px Tajawal, Arial, sans-serif';
      ctx.shadowColor = 'rgba(251,191,36,0.6)';
      ctx.shadowBlur = 16;
      ctx.fillText(`بداية الموجة ${nextWave}`, g.width / 2, g.height * 0.48);
      ctx.direction = 'ltr';
    }

    ctx.restore();
  }

  // Magnet attraction visual effects
  if (g.magnetFlashTimer > 0) {
    const p = g.player;
    const px = p.pos.x - g.camera.x + g.screenShake.x;
    const py = p.pos.y + g.screenShake.y;

    // Magnetic field aura around player
    const auraPhase = g.elapsed * 3;
    const auraAlpha = 0.08 + Math.sin(auraPhase) * 0.04;
    const auraR = 40 + Math.sin(auraPhase * 1.3) * 10;
    const auraGrad = ctx.createRadialGradient(px, py - 15, 5, px, py - 15, auraR);
    auraGrad.addColorStop(0, `rgba(148,163,184,${auraAlpha * 2})`);
    auraGrad.addColorStop(0.5, `rgba(100,116,139,${auraAlpha})`);
    auraGrad.addColorStop(1, 'rgba(100,116,139,0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(px, py - 15, auraR, 0, Math.PI * 2);
    ctx.fill();

    // Rotating magnetic field rings
    ctx.save();
    ctx.translate(px, py - 15);
    for (let ring = 0; ring < 2; ring++) {
      const ringR = 25 + ring * 18;
      const ringAlpha = 0.15 - ring * 0.05;
      const rotation = g.elapsed * (2 + ring * 0.7) * (ring % 2 === 0 ? 1 : -1);
      ctx.strokeStyle = `rgba(148,163,184,${ringAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringR, ringR * 0.4, rotation, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Animated attraction lines to each power-up
    for (const pu of g.powerUps) {
      if (!pu.active) continue;
      const puX = pu.pos.x - g.camera.x + g.screenShake.x;
      const puY = pu.pos.y + g.screenShake.y;
      const dx = puX - px, dy = puY - (py - 15);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > g.width * 0.6 || dist < 5) continue;

      const dirX = dx / dist, dirY = dy / dist;

      // Animated particles flowing from powerup to player
      const numDots = Math.floor(dist / 18);
      for (let i = 0; i < numDots; i++) {
        // Each dot travels along the line, phase-shifted
        const phase = ((g.elapsed * 3 + i * 0.4) % 1);
        const t = 1 - phase; // moving toward player
        const dotX = px + dx * t;
        const dotY = (py - 15) + dy * t;
        const dotAlpha = 0.5 * Math.sin(phase * Math.PI); // fade in/out
        const dotSize = 1.5 + (1 - phase) * 1.5; // bigger near source

        ctx.fillStyle = `rgba(148,163,184,${dotAlpha})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle connecting line
      ctx.strokeStyle = 'rgba(148,163,184,0.1)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.moveTo(px, py - 15);
      ctx.lineTo(puX, puY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small glow at powerup end
      const glowPulse = 0.2 + Math.sin(g.elapsed * 5) * 0.1;
      ctx.fillStyle = `rgba(148,163,184,${glowPulse})`;
      ctx.beginPath();
      ctx.arc(puX, puY, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Off-screen threat indicators
  renderOffscreenIndicators(ctx, g);

  // HUD (no shake)
  renderHUD(ctx, g);

  // Wave warnings removed — all warnings now use cinematic system

  // Cinematic warning overlay (center screen + blur + slow-mo)
  renderCinematicWarning(ctx, g);

  // Wave rest overlay + upgrade cards
  renderRestOverlay(ctx, g);
  renderUpgradeCards(ctx, g);
  renderWaveIndicator(ctx, g);
}

// ─── Cinematic Warning (Full-Screen Center) ───────────
function renderCinematicWarning(ctx: CanvasRenderingContext2D, g: GameData) {
  const cw = g.cinematicWarning;
  if (!cw) return;

  const { width: w, height: h } = g;
  const progress = 1 - cw.timer / cw.duration;
  const isWarning = cw.type === 'warning';

  // Fade: quick in (0.1), hold, quick out (last 0.2)
  let alpha = 1;
  if (progress < 0.1) alpha = progress / 0.1;
  else if (progress > 0.8) alpha = (1 - progress) / 0.2;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, w, h);

  // Glowing band
  const centerY = h * 0.45;
  const bandH = 100;
  const borderGrad = ctx.createLinearGradient(0, centerY - bandH / 2, 0, centerY + bandH / 2);
  borderGrad.addColorStop(0, `${cw.color}00`);
  borderGrad.addColorStop(0.15, `${cw.color}33`);
  borderGrad.addColorStop(0.5, `${cw.color}22`);
  borderGrad.addColorStop(0.85, `${cw.color}33`);
  borderGrad.addColorStop(1, `${cw.color}00`);
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, centerY - bandH / 2, w, bandH);

  // Border lines
  ctx.strokeStyle = cw.color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, centerY - bandH / 2);
  ctx.lineTo(w * 0.9, centerY - bandH / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.1, centerY + bandH / 2);
  ctx.lineTo(w * 0.9, centerY + bandH / 2);
  ctx.stroke();
  ctx.globalAlpha = alpha;

  // === Icon above text ===
  const iconY = centerY - 28;
  const pulse = 0.8 + 0.2 * Math.sin(progress * Math.PI * 6);

  if (isWarning) {
    // Warning triangle with exclamation mark
    const triSize = 20;
    ctx.save();
    ctx.translate(w / 2, iconY);
    ctx.scale(pulse, pulse);

    // Triangle glow
    ctx.shadowColor = cw.color;
    ctx.shadowBlur = 18;

    // Triangle outline
    ctx.beginPath();
    ctx.moveTo(0, -triSize);
    ctx.lineTo(-triSize * 0.9, triSize * 0.6);
    ctx.lineTo(triSize * 0.9, triSize * 0.6);
    ctx.closePath();
    ctx.fillStyle = cw.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner darker triangle
    ctx.beginPath();
    ctx.moveTo(0, -triSize * 0.6);
    ctx.lineTo(-triSize * 0.55, triSize * 0.35);
    ctx.lineTo(triSize * 0.55, triSize * 0.35);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // Exclamation mark
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 2);

    ctx.restore();
  } else {
    // Upgrade arrow icon
    const arrowSize = 16;
    ctx.save();
    ctx.translate(w / 2, iconY);
    ctx.scale(pulse, pulse);

    // Arrow glow
    ctx.shadowColor = cw.color;
    ctx.shadowBlur = 18;

    // Upward arrow
    ctx.beginPath();
    ctx.moveTo(0, -arrowSize);
    ctx.lineTo(-arrowSize * 0.7, 0);
    ctx.lineTo(-arrowSize * 0.25, 0);
    ctx.lineTo(-arrowSize * 0.25, arrowSize * 0.7);
    ctx.lineTo(arrowSize * 0.25, arrowSize * 0.7);
    ctx.lineTo(arrowSize * 0.25, 0);
    ctx.lineTo(arrowSize * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = cw.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  // Main text (Arabic — RTL)
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Tajawal, Arial';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.shadowColor = cw.color;
  ctx.shadowBlur = 20;
  ctx.fillText(cw.text, w / 2, centerY + 6);

  ctx.direction = 'ltr';

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Wave Warning Banners ─────────────────────────────
function renderWaveWarnings(ctx: CanvasRenderingContext2D, g: GameData) {
  if (!g.waveWarnings || g.waveWarnings.length === 0) return;
  const { width: w } = g;

  for (let i = 0; i < g.waveWarnings.length; i++) {
    const ww = g.waveWarnings[i];
    const progress = 1 - ww.life / ww.maxLife;

    // Fade in first 0.5s, fade out last 1s
    let alpha = 1;
    if (progress < 0.12) alpha = progress / 0.12;
    else if (progress > 0.75) alpha = (1 - progress) / 0.25;

    // Slide in from top
    const slideY = progress < 0.1 ? -30 + progress * 300 : 0;
    const y = 60 + i * 55 + slideY;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Banner background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const bannerW = Math.min(380, w - 40);
    const bannerX = (w - bannerW) / 2;
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(bannerX + r, y - 18);
    ctx.lineTo(bannerX + bannerW - r, y - 18);
    ctx.quadraticCurveTo(bannerX + bannerW, y - 18, bannerX + bannerW, y - 18 + r);
    ctx.lineTo(bannerX + bannerW, y + 18 - r);
    ctx.quadraticCurveTo(bannerX + bannerW, y + 18, bannerX + bannerW - r, y + 18);
    ctx.lineTo(bannerX + r, y + 18);
    ctx.quadraticCurveTo(bannerX, y + 18, bannerX, y + 18 - r);
    ctx.lineTo(bannerX, y - 18 + r);
    ctx.quadraticCurveTo(bannerX, y - 18, bannerX + r, y - 18);
    ctx.closePath();
    ctx.fill();

    // Colored left accent
    ctx.fillStyle = ww.color;
    ctx.fillRect(bannerX, y - 18, 4, 36);

    // Pulsing border
    const pulse = 0.3 + Math.sin(g.elapsed * 6) * 0.2;
    ctx.strokeStyle = ww.color;
    ctx.globalAlpha = alpha * pulse;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Main text (Arabic — RTL)
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillStyle = ww.color;
    ctx.font = 'bold 13px Tajawal, Arial';
    ctx.fillText(ww.text, w / 2, y - 2);

    ctx.direction = 'ltr';

    ctx.restore();
  }
}

// ─── Start Screen — Arabic Tutorial Slides ─────────────────────────
export function renderStartScreen(ctx: CanvasRenderingContext2D, w: number, h: number, highScore: number, tutorialPage: number = 0, tutorialFade: number = 1) {
  const t = Date.now() / 1000;

  // ── Shared background ──
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#050510');
  bg.addColorStop(0.4, '#0a0a1a');
  bg.addColorStop(0.7, '#1a0808');
  bg.addColorStop(1, '#050505');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Floating dust particles
  for (let i = 0; i < 30; i++) {
    const px = ((Math.sin(i * 73.1 + t * 0.15) * 0.5 + 0.5) * w * 1.2) - w * 0.1;
    const py = ((Math.cos(i * 47.3 + t * 0.1) * 0.5 + 0.5) * h);
    const sz = 1 + (i % 3) * 0.5;
    const alpha = 0.05 + Math.sin(t * 0.5 + i * 1.7) * 0.03;
    ctx.fillStyle = `rgba(200, 180, 150, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ember/Spark particles — rising golden sparks
  const emberColors = ['255,160,30', '255,120,20', '251,191,36', '255,80,20'];
  for (let i = 0; i < 15; i++) {
    const speed = 0.3 + (i % 5) * 0.15;
    const lifeT = ((t * speed + i * 3.7) % 6) / 6; // 0→1 lifecycle
    const ex = w * (0.1 + ((i * 0.0731 + Math.sin(i * 2.3) * 0.1) % 0.8)) + Math.sin(t * 1.5 + i * 4.1) * 15;
    const ey = h * (1.0 - lifeT * 0.9);
    const eAlpha = Math.sin(lifeT * Math.PI) * 0.6;
    const eSize = 1 + (i % 3);
    if (eAlpha > 0.02) {
      ctx.fillStyle = `rgba(${emberColors[i % emberColors.length]}, ${eAlpha})`;
      ctx.beginPath();
      ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Red glow at bottom
  const bottomGlow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.5);
  bottomGlow.addColorStop(0, 'rgba(180, 30, 20, 0.12)');
  bottomGlow.addColorStop(1, 'rgba(180, 30, 20, 0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // ── Page-specific content with fade ──
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = tutorialFade;

  if (tutorialPage === 0) {
    renderTutorialSlide0(ctx, w, h, t);
  } else if (tutorialPage === 1) {
    renderTutorialSlide1(ctx, w, h, t);
  } else if (tutorialPage === 2) {
    renderTutorialSlide2(ctx, w, h, t);
  } else {
    renderTutorialSlide3(ctx, w, h, t, highScore);
  }

  ctx.globalAlpha = prevAlpha;

  // ── Navigation dots ──
  const dotY = h * 0.92;
  const totalDots = 4;
  const dotSpacing = 14;
  const dotsStartX = w / 2 + ((totalDots - 1) * dotSpacing) / 2;
  for (let i = 0; i < totalDots; i++) {
    const dx = dotsStartX - i * dotSpacing;
    if (i === tutorialPage) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.beginPath();
      ctx.arc(dx, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(150, 150, 150, 0.3)';
      ctx.beginPath();
      ctx.arc(dx, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── "Tap to continue" (pages 0-2 only) ──
  if (tutorialPage < 3) {
    ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
    ctx.font = '15px Tajawal, sans-serif';
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    const tapText = '☝ اكبس للمتابعة';
    ctx.fillText(tapText, w / 2, h * 0.87);
    ctx.direction = 'ltr';
  }

  // Version
  ctx.fillStyle = 'rgba(100,100,100,0.4)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('v1.0', w - 12, h - 10);
  ctx.textAlign = 'center';
}

// ── Helper: Draw professional slide title with double glow ──
function drawSlideTitle(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, yRatio: number) {
  const titleGrad = ctx.createLinearGradient(w / 2 - 100, 0, w / 2 + 100, 0);
  titleGrad.addColorStop(0, '#a08030');
  titleGrad.addColorStop(0.3, '#e0c060');
  titleGrad.addColorStop(0.5, '#ffd700');
  titleGrad.addColorStop(0.7, '#e0c060');
  titleGrad.addColorStop(1, '#a08030');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 34px Tajawal, sans-serif';
  // Outer glow
  ctx.shadowColor = 'rgba(255,200,50,0.15)';
  ctx.shadowBlur = 30;
  ctx.fillText(text, w / 2, h * yRatio);
  // Inner glow (second pass)
  ctx.shadowColor = 'rgba(255,200,50,0.4)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, w / 2, h * yRatio);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

// ── Helper: Glassmorphism Card ──
function drawGlassCard(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, accentColor: string, radius: number = 12) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, x, y, cw, ch, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 0.5;
  roundRect(ctx, x, y, cw, ch, radius);
  ctx.stroke();
  const lineW = cw * 0.5;
  const lineX = x + (cw - lineW) / 2;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = accentColor;
  roundRect(ctx, lineX, y + 1, lineW, 2, 1);
  ctx.fill();
  ctx.globalAlpha = prevAlpha;
}

// ── Slide 0: هدفك ──
function renderTutorialSlide0(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  drawSlideTitle(ctx, w, h, 'شرح عالسريع', 0.14);
  drawGoldDivider(ctx, w, h * 0.18, t);

  const card1W = w * 0.82;
  const card1H = h * 0.22;
  const card1X = (w - card1W) / 2;
  const card1Y = h * 0.23 + Math.sin(t * 1.5) * 2;
  drawGlassCard(ctx, card1X, card1Y, card1W, card1H, 'rgba(239, 68, 68, 0.8)');
  ctx.fillStyle = 'rgba(240, 240, 240, 0.95)';
  ctx.font = 'bold 22px Tajawal, sans-serif';
  ctx.fillText('بتعرف تهِج؟', w / 2, card1Y + card1H * 0.35);
  ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
  ctx.font = '17px Tajawal, sans-serif';
  ctx.fillText('تسقط تهديدات من الأعلى', w / 2, card1Y + card1H * 0.58);
  ctx.fillText('اهرب منها أو أسقطها', w / 2, card1Y + card1H * 0.78);

  const card2W = w * 0.82;
  const card2H = h * 0.26;
  const card2X = (w - card2W) / 2;
  const card2Y = card1Y + card1H + 16 + Math.sin(t * 1.5 + 1.5) * 2;
  drawGlassCard(ctx, card2X, card2Y, card2W, card2H, 'rgba(251, 191, 36, 0.8)');
  ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
  ctx.font = 'bold 21px Tajawal, sans-serif';
  ctx.fillText('بعيد بس قريب', w / 2, card2Y + card2H * 0.25);
  ctx.fillStyle = 'rgba(230, 230, 230, 0.85)';
  ctx.font = '17px Tajawal, sans-serif';
  ctx.fillText('كلما سقط التهديد أقرب إليك', w / 2, card2Y + card2H * 0.48);
  ctx.fillText('حصلت على نقاط أكثر', w / 2, card2Y + card2H * 0.65);

  const vizY = card2Y + card2H * 0.85;
  ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(w / 2, vizY, 5, 0, Math.PI * 2);
  ctx.fill();
  const threatOffset = 25 + Math.sin(t * 2) * 8;
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.beginPath();
  ctx.arc(w / 2 + threatOffset, vizY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(w / 2 + 5, vizY);
  ctx.lineTo(w / 2 + threatOffset - 4, vizY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ── Slide 1: التحكم والمعدات ──
function renderTutorialSlide1(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  drawSlideTitle(ctx, w, h, 'التحكم والمعدات', 0.12);
  drawGoldDivider(ctx, w, h * 0.16, t);

  const ctrlW = w * 0.39;
  const ctrlH = h * 0.1;
  const ctrlGap = w * 0.04;
  const ctrlY = h * 0.20 + Math.sin(t * 1.5) * 1.5;

  const lx = w / 2 - ctrlGap / 2 - ctrlW;
  drawGlassCard(ctx, lx, ctrlY, ctrlW, ctrlH, 'rgba(100, 200, 255, 0.7)');
  ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
  ctx.font = 'bold 17px Tajawal, sans-serif';
  ctx.fillText('الجهة اليسرى', lx + ctrlW / 2, ctrlY + ctrlH * 0.45);
  ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
  ctx.font = '15px Tajawal, sans-serif';
  ctx.fillText('تحريك', lx + ctrlW / 2, ctrlY + ctrlH * 0.75);

  const rx = w / 2 + ctrlGap / 2;
  drawGlassCard(ctx, rx, ctrlY, ctrlW, ctrlH, 'rgba(239, 68, 68, 0.7)');
  ctx.fillStyle = 'rgba(239, 130, 130, 0.9)';
  ctx.font = 'bold 17px Tajawal, sans-serif';
  ctx.fillText('الجهة اليمنى', rx + ctrlW / 2, ctrlY + ctrlH * 0.45);
  ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
  ctx.font = '15px Tajawal, sans-serif';
  ctx.fillText('دحرجة', rx + ctrlW / 2, ctrlY + ctrlH * 0.75);

  ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
  ctx.font = '18px Tajawal, sans-serif';
  ctx.fillText('التقط الصناديق للحصول على', w / 2, ctrlY + ctrlH + 30);

  const items: { name: string; color: string }[] = [
    { name: 'إسعاف', color: '#22c55e' },
    { name: 'درع', color: '#60a5fa' },
    { name: 'تباطؤ', color: '#06b6d4' },
    { name: 'ذخيرة', color: '#8b9a3a' },
    { name: 'مغناطيس', color: '#94a3b8' },
    { name: 'اعتراض', color: '#f97316' },
  ];

  const gridCols = 3;
  const itemW = (w * 0.82 - 16) / gridCols;
  const itemH = h * 0.08;
  const gridStartX = (w - (itemW * gridCols + 8 * (gridCols - 1))) / 2;
  const gridStartY = ctrlY + ctrlH + 48;

  items.forEach((item, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const ix = gridStartX + col * (itemW + 8);
    const iy = gridStartY + row * (itemH + 8) + Math.sin(t * 1.2 + i * 0.8) * 1;
    drawGlassCard(ctx, ix, iy, itemW, itemH, item.color + 'aa', 8);
    // Measure text to position dot with consistent spacing
    ctx.fillStyle = 'rgba(220, 220, 220, 0.8)';
    ctx.font = '15px Tajawal, sans-serif';
    const textW = ctx.measureText(item.name).width;
    const centerX = ix + itemW / 2;
    const dotGap = 8;
    // Draw text centered
    ctx.fillText(item.name, centerX, iy + itemH * 0.55 + 4);
    // Draw dot to the left of text with consistent gap
    const prevA = ctx.globalAlpha;
    ctx.fillStyle = item.color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(centerX + textW / 2 + dotGap, iy + itemH * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = prevA;
  });

  ctx.restore();
}

// ── Slide 2: بطاقات الترقية ──
function renderTutorialSlide2(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  drawSlideTitle(ctx, w, h, 'بطاقات الدعم السريع', 0.14);
  drawGoldDivider(ctx, w, h * 0.18, t);

  const descW = w * 0.82;
  const descH = h * 0.1;
  const descX = (w - descW) / 2;
  const descY = h * 0.22;
  drawGlassCard(ctx, descX, descY, descW, descH, 'rgba(168, 85, 247, 0.6)');
  ctx.fillStyle = 'rgba(230, 230, 230, 0.9)';
  ctx.font = '15px Tajawal, sans-serif';
  ctx.fillText('كل 3 موجات تحصل على بطاقة ترقية', w / 2, descY + descH * 0.42);
  ctx.fillStyle = 'rgba(190, 190, 190, 0.7)';
  ctx.font = '14px Tajawal, sans-serif';
  ctx.fillText('اختر واحدة لتعزيز قدراتك', w / 2, descY + descH * 0.75);

  const cardW = Math.min(90, (w - 56) / 3);
  const cardH = cardW * 1.4;
  const cardGap = 10;
  const totalCardsW = cardW * 3 + cardGap * 2;
  const cardsStartX = (w - totalCardsW) / 2;
  const cardY = descY + descH + 20;

  const sampleCards = [
    { name: 'سرعة', color: '#3b82f6', icon: '→' },
    { name: 'ذخيرة', color: '#22c55e', icon: '+' },
    { name: 'درع', color: '#a855f7', icon: '◇' },
  ];

  sampleCards.forEach((card, i) => {
    const cx = cardsStartX + i * (cardW + cardGap);
    const hover = Math.sin(t * 2 + i * 1.2) * 3;
    const isMiddle = i === 1;
    if (isMiddle) { ctx.shadowColor = `${card.color}40`; ctx.shadowBlur = 20; }

    const cardBg = ctx.createLinearGradient(cx, cardY + hover, cx, cardY + hover + cardH);
    cardBg.addColorStop(0, 'rgba(30, 30, 50, 0.9)');
    cardBg.addColorStop(1, 'rgba(20, 20, 35, 0.95)');
    ctx.fillStyle = cardBg;
    roundRect(ctx, cx, cardY + hover, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = isMiddle ? `${card.color}66` : `${card.color}33`;
    ctx.lineWidth = isMiddle ? 1.5 : 0.8;
    roundRect(ctx, cx, cardY + hover, cardW, cardH, 10);
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

    const barW = cardW * 0.7;
    const prevA = ctx.globalAlpha;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = card.color;
    roundRect(ctx, cx + (cardW - barW) / 2, cardY + hover + 3, barW, 3, 1.5);
    ctx.fill();
    ctx.globalAlpha = prevA;

    ctx.fillStyle = card.color;
    ctx.font = 'bold 24px monospace';
    ctx.direction = 'ltr';
    ctx.fillText(card.icon, cx + cardW / 2, cardY + hover + cardH * 0.45);
    ctx.direction = 'rtl';
    ctx.fillStyle = 'rgba(220, 220, 220, 0.85)';
    ctx.font = '12px Tajawal, sans-serif';
    ctx.fillText(card.name, cx + cardW / 2, cardY + hover + cardH * 0.75);
  });

  ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.font = '14px Tajawal, sans-serif';
  ctx.fillText('اختر بحكمة.. كل بطاقة تغيّر مجرى اللعبة', w / 2, cardY + cardH + 30);

  ctx.restore();
}

// ── Slide 3: Title + Start — Cinematic ──
function renderTutorialSlide3(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, highScore: number) {
  ctx.save();
  ctx.textAlign = 'center';

  // ── 1. Game Logo ──
  const logoY = h * 0.265;
  if (gameLogoImg && gameLogoLoaded) {
    const aspect = gameLogoImg.naturalWidth / gameLogoImg.naturalHeight;
    const logoDrawW = Math.min(w * 0.75, 300);
    const logoDrawH = logoDrawW / aspect;
    ctx.drawImage(gameLogoImg, w / 2 - logoDrawW / 2, logoY - logoDrawH / 2, logoDrawW, logoDrawH);
  }

  // ── 2. "هل أنت مستعد؟" ──
  ctx.direction = 'rtl';
  ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.font = '16px Tajawal, sans-serif';
  ctx.fillText('هل أنت مستعد؟', w / 2, h * 0.48);
  ctx.direction = 'ltr';

  // ── 3. Button "يلا يلا" — larger, elegant ──
  const btnW = 200, btnH = 48;
  const btnX = w / 2 - btnW / 2, btnY = h * 0.53;
  const borderAlpha = 0.5 + Math.sin(t * 1.5) * 0.3;

  // Glowing background
  ctx.fillStyle = `rgba(212, 175, 55, ${0.08 + Math.sin(t * 1.5) * 0.04})`;
  roundRect(ctx, btnX, btnY, btnW, btnH, 8);
  ctx.fill();

  // Outer glow
  ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(251, 191, 36, ${borderAlpha})`;
  ctx.lineWidth = 1.2;
  roundRect(ctx, btnX, btnY, btnW, btnH, 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.direction = 'rtl';
  ctx.fillStyle = 'rgba(251, 210, 120, 1)';
  ctx.font = 'bold 20px Tajawal, sans-serif';
  ctx.fillText('يلا يلا', w / 2, btnY + btnH / 2 + 7);
  ctx.direction = 'ltr';

  // ── 4. High score ──
  if (highScore > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '14px monospace';
    ctx.fillText(`🏆  ${highScore}`, w / 2, h * 0.65);
  }

  // ── 5. Developer signature block with gold frame ──
  // Top divider ─── ◆ ───
  const drawDivider = (y: number, alpha: number) => {
    const dg = ctx.createLinearGradient(w * 0.25, 0, w * 0.75, 0);
    dg.addColorStop(0, 'rgba(251, 191, 36, 0)');
    dg.addColorStop(0.3, `rgba(251, 191, 36, ${alpha})`);
    dg.addColorStop(0.5, `rgba(251, 191, 36, ${alpha * 1.4})`);
    dg.addColorStop(0.7, `rgba(251, 191, 36, ${alpha})`);
    dg.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.strokeStyle = dg;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, y);
    ctx.lineTo(w * 0.75, y);
    ctx.stroke();
    // Diamond
    ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 1.2})`;
    ctx.save();
    ctx.translate(w / 2, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();
  };

  drawDivider(h * 0.74, 0.2);

  // "تطوير"
  ctx.direction = 'rtl';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '13px Tajawal, sans-serif';
  ctx.fillText('تطوير', w / 2, h * 0.78);

  // Arabic name — bold, gold glow
  ctx.shadowColor = 'rgba(251, 191, 36, 0.15)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.font = 'bold 20px Tajawal, sans-serif';
  ctx.fillText('مثقال زيدان', w / 2, h * 0.82);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.direction = 'ltr';

  // English name
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '11px monospace';
  ctx.letterSpacing = '3px';
  ctx.fillText('METHKAL ZIDANE', w / 2, h * 0.855);
  ctx.letterSpacing = '0px';

  // Bottom divider
  drawDivider(h * 0.88, 0.15);

  ctx.restore();
}

// ── Helper: Gold divider line ──
function drawGoldDivider(ctx: CanvasRenderingContext2D, w: number, y: number, t: number) {
  const pulse = 0.3 + Math.sin(t * 3) * 0.15;
  const grad = ctx.createLinearGradient(w * 0.1, 0, w * 0.9, 0);
  grad.addColorStop(0, 'rgba(251, 191, 36, 0)');
  grad.addColorStop(0.4, `rgba(251, 191, 36, ${pulse * 0.7})`);
  grad.addColorStop(0.5, `rgba(251, 191, 36, ${pulse})`);
  grad.addColorStop(0.6, `rgba(251, 191, 36, ${pulse * 0.7})`);
  grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, y);
  ctx.lineTo(w * 0.9, y);
  ctx.stroke();
  // Diamond center point
  ctx.fillStyle = `rgba(251, 191, 36, ${pulse + 0.15})`;
  ctx.save();
  ctx.translate(w / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-2.5, -2.5, 5, 5);
  ctx.restore();
}

// ─── Game Over — Cinematic ────────────────────────────
// Track when game over started for animations
let gameOverStartTime = 0;

export interface GameOverLeaderboardEntry {
  playerName: string;
  score: number;
}

export function renderGameOver(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  score: number, highScore: number, stats?: GameData['stats'],
  leaderboard?: GameOverLeaderboardEntry[],
  playerName?: string,
  playerRank?: number | null,
  waveNumber?: number
) {
  const now = Date.now() / 1000;
  if (gameOverStartTime === 0 || now - gameOverStartTime > 30) gameOverStartTime = now;
  const elapsed = now - gameOverStartTime;
  const t = now; // for animations

  // Dark overlay with fade-in
  const overlayAlpha = Math.min(0.88, elapsed * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // ── Bottom glow (same as tutorial) ──
  const bottomGlow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.5);
  bottomGlow.addColorStop(0, 'rgba(180, 30, 20, 0.15)');
  bottomGlow.addColorStop(1, 'rgba(180, 30, 20, 0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // ── Ember/Spark particles (same as tutorial) ──
  const emberColors = ['255,160,30', '255,120,20', '251,191,36', '255,80,20'];
  for (let i = 0; i < 25; i++) {
    const speed = 0.3 + (i % 5) * 0.15;
    const lifeT = ((t * speed + i * 3.7) % 6) / 6;
    const ex = w * (0.1 + ((i * 0.0731 + Math.sin(i * 2.3) * 0.1) % 0.8)) + Math.sin(t * 1.5 + i * 4.1) * 15;
    const ey = h * (1.0 - lifeT * 0.9);
    const eAlpha = Math.sin(lifeT * Math.PI) * 0.5;
    const eSize = 1 + (i % 3);
    if (eAlpha > 0.02) {
      ctx.fillStyle = `rgba(${emberColors[i % emberColors.length]}, ${eAlpha})`;
      ctx.beginPath();
      ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cracked screen effect
  if (elapsed > 0.1 && elapsed < 2.0) {
    const crackAlpha = Math.min(0.4, (elapsed - 0.1) * 0.8) * Math.max(0, 1 - (elapsed - 0.5) / 1.5);
    ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha})`;
    ctx.lineWidth = 1.5;
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 8; i++) {
      const baseAngle = (i / 8) * Math.PI * 2 + 0.3;
      const len = Math.min(w, h) * (0.2 + Math.sin(i * 3.7) * 0.15);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let px = cx, py = cy;
      for (let s = 0; s < 4; s++) {
        const st = (s + 1) / 4;
        const jitter = (Math.sin(i * 7 + s * 5.1) * 0.3);
        const nx = cx + Math.cos(baseAngle + jitter) * len * st;
        const ny = cy + Math.sin(baseAngle + jitter) * len * st;
        ctx.lineTo(nx, ny);
        px = nx; py = ny;
        if (s === 2 && i % 2 === 0) {
          ctx.moveTo(px, py);
          const branchAngle = baseAngle + (Math.sin(i * 2.3) > 0 ? 0.5 : -0.5);
          ctx.lineTo(px + Math.cos(branchAngle) * len * 0.2, py + Math.sin(branchAngle) * len * 0.2);
          ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  if (elapsed < 0.2) return;

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  const font = "'Tajawal', sans-serif";

  // ─── Title: "العالم منتهاش" using drawSlideTitle style ───
  const titleAlpha = Math.min(1, (elapsed - 0.2) * 3);
  ctx.save();
  ctx.globalAlpha = titleAlpha;
  const shakeX = elapsed < 0.6 ? Math.sin(elapsed * 60) * (1 - (elapsed - 0.2) / 0.4) * 6 : 0;
  const titleY = h * 0.10;

  // Gold gradient title (same as drawSlideTitle)
  const titleGrad = ctx.createLinearGradient(w / 2 - 120, 0, w / 2 + 120, 0);
  titleGrad.addColorStop(0, '#a08030');
  titleGrad.addColorStop(0.3, '#e0c060');
  titleGrad.addColorStop(0.5, '#ffd700');
  titleGrad.addColorStop(0.7, '#e0c060');
  titleGrad.addColorStop(1, '#a08030');
  ctx.font = `bold 38px ${font}`;
  // Black stroke for contrast
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeText('العالم منتهاش', w / 2 + shakeX, titleY);
  // Outer glow
  ctx.shadowColor = 'rgba(255,200,50,0.2)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = titleGrad;
  ctx.fillText('العالم منتهاش', w / 2 + shakeX, titleY);
  // Inner glow
  ctx.shadowColor = 'rgba(255,200,50,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillText('العالم منتهاش', w / 2 + shakeX, titleY);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();

  // ─── Gold divider under title ───
  if (elapsed > 0.3) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (elapsed - 0.3) * 3);
    drawGoldDivider(ctx, w, titleY + 12, t);
    ctx.restore();
  }

  // ─── Score inside glass card ───
  if (elapsed > 0.5) {
    const scoreAlpha = Math.min(1, (elapsed - 0.5) * 3);
    const countProgress = Math.min(1, (elapsed - 0.5) / 1.5);
    const eased = 1 - Math.pow(1 - countProgress, 3);
    const displayScore = Math.floor(score * eased);
    const floatY = Math.sin(t * 1.5) * 2;

    ctx.save();
    ctx.globalAlpha = scoreAlpha;

    const scoreCardW = Math.min(260, w * 0.7);
    const scoreCardH = playerRank ? 80 : 60;
    const scoreCardX = (w - scoreCardW) / 2;
    const scoreCardY = h * 0.14 + floatY;

    drawGlassCard(ctx, scoreCardX, scoreCardY, scoreCardW, scoreCardH, 'rgba(251, 191, 36, 0.8)');

    // Rank
    if (playerRank) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = `bold 18px ${font}`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8;
      ctx.fillText(`انت في المركز: ${playerRank}`, w / 2, scoreCardY + 26);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = `bold 36px ${font}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 15;
    const scoreTextY = playerRank ? scoreCardY + 62 : scoreCardY + 44;
    ctx.fillText(`${displayScore}`, w / 2, scoreTextY);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    ctx.restore();
  }

  // ─── High score / New record ───
  if (elapsed > 0.8) {
    const hsAlpha = Math.min(1, (elapsed - 0.8) * 3);
    const hsY = h * 0.32;
    ctx.save();
    ctx.globalAlpha = hsAlpha;
    ctx.textAlign = 'center';
    if (score >= highScore && highScore > 0) {
      const sparkle = 0.7 + Math.sin(t * 6) * 0.3;
      ctx.fillStyle = `rgba(251, 191, 36, ${sparkle})`;
      ctx.font = `bold 15px ${font}`;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14;
      ctx.fillText('★ رقم قياسي جديد ★', w / 2, hsY);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = `13px ${font}`;
      ctx.fillText(`أعلى علامة: ${highScore}`, w / 2, hsY);
    }
    if (waveNumber) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = `13px ${font}`;
      ctx.fillText(`الموجة ${waveNumber}`, w / 2, hsY + 18);
    }
    ctx.restore();
  }

  // ─── Stat cards with glass effect ───
  if (stats && elapsed > 1.0) {
    const cardW = Math.min(260, w - 30);
    const cardX = (w - cardW) / 2;
    const statItems = [
      { icon: '⏱', label: 'مدة الصمود', value: `${Math.floor(stats.timeSurvived)} ث`, accent: 'rgba(6, 182, 212, 0.7)' },
      { icon: '💀', label: 'طائرات مُسقطة', value: `${stats.dronesDestroyed}`, accent: 'rgba(239, 68, 68, 0.7)' },
      { icon: '📦', label: 'تعزيزات', value: `${stats.powerUpsCollected}`, accent: 'rgba(34, 197, 94, 0.7)' },
      { icon: '✕', label: 'نجاة بأعجوبة', value: `${stats.closeCalls}`, accent: 'rgba(249, 115, 22, 0.7)' },
    ];
    if (stats.bossesDefeated > 0) {
      statItems.push({ icon: '⚔', label: 'زعماء', value: `${stats.bossesDefeated}`, accent: 'rgba(251, 191, 36, 0.7)' });
    }

    const cardStartY = h * 0.36;
    const cardH = 34;
    const gap = 38;

    statItems.forEach((st, i) => {
      const delay = 1.0 + i * 0.12;
      if (elapsed < delay) return;
      const cardAlpha = Math.min(1, (elapsed - delay) * 3);
      const slideX = (1 - Math.min(1, (elapsed - delay) * 4)) * 30;
      const floatY = Math.sin(t * 1.5 + i * 0.8) * 1.5;

      ctx.save();
      ctx.globalAlpha = cardAlpha;
      const cy = cardStartY + i * gap + floatY;

      // Glass card for each stat
      drawGlassCard(ctx, cardX - slideX, cy, cardW, cardH, st.accent, 8);

      // Value on left, label+icon on right (RTL)
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `14px ${font}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${st.icon} ${st.label}`, cardX + cardW - 12 - slideX, cy + cardH / 2 + 5);

      ctx.fillStyle = '#fff';
      ctx.font = `bold 16px ${font}`;
      ctx.textAlign = 'left';
      ctx.fillText(st.value, cardX + 12 - slideX, cy + cardH / 2 + 5);

      ctx.restore();
    });
  }

  // ─── Leaderboard inside glass card ───
  if (leaderboard && leaderboard.length > 0 && elapsed > 1.8) {
    const lbAlpha = Math.min(1, (elapsed - 1.8) * 2.5);
    ctx.save();
    ctx.globalAlpha = lbAlpha;

    const lbW = Math.min(280, w - 20);
    const lbX = (w - lbW) / 2;
    const statCount = stats ? (4 + (stats.bossesDefeated > 0 ? 1 : 0)) : 0;
    const lbStartY = h * 0.36 + statCount * 38 + 16;

    const top5 = leaderboard.slice(0, 5);
    const rowH = 28;
    const headerH = 30;
    const totalH = headerH + top5.length * rowH + 14;

    // Glass card wrapping entire leaderboard
    drawGlassCard(ctx, lbX - 6, lbStartY - 4, lbW + 12, totalH, 'rgba(251, 191, 36, 0.6)', 10);

    // Title
    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold 16px ${font}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(251,191,36,0.3)';
    ctx.shadowBlur = 8;
    ctx.fillText('أقوى ناس 🏆', w / 2, lbStartY + 16);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Gold divider
    drawGoldDivider(ctx, w, lbStartY + 24, t);

    const medals = ['🥇', '🥈', '🥉'];

    top5.forEach((entry, i) => {
      const rowDelay = 1.8 + 0.1 * i;
      if (elapsed < rowDelay) return;
      const rowAlpha = Math.min(1, (elapsed - rowDelay) * 4);
      const ry = lbStartY + headerH + 4 + i * rowH;

      ctx.save();
      ctx.globalAlpha = lbAlpha * rowAlpha;

      const isCurrentPlayer = playerName && entry.playerName === playerName;
      if (isCurrentPlayer) {
        ctx.fillStyle = 'rgba(251,191,36,0.15)';
        roundRect(ctx, lbX, ry - 2, lbW, rowH - 4, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.3)';
        ctx.lineWidth = 0.5;
        roundRect(ctx, lbX, ry - 2, lbW, rowH - 4, 4);
        ctx.stroke();
      }

      // Rank/medal
      const rankText = i < 3 ? medals[i] : `${i + 1}`;
      ctx.fillStyle = isCurrentPlayer ? '#fbbf24' : 'rgba(148,163,184,0.7)';
      ctx.font = i < 3 ? `15px ${font}` : `13px ${font}`;
      ctx.textAlign = 'right';
      ctx.fillText(rankText, lbX + lbW - 8, ry + 14);

      // Name
      ctx.fillStyle = isCurrentPlayer ? '#fbbf24' : 'rgba(226,232,240,0.8)';
      ctx.font = `${isCurrentPlayer ? 'bold ' : ''}14px ${font}`;
      ctx.textAlign = 'right';
      ctx.fillText(entry.playerName, lbX + lbW - (i < 3 ? 28 : 26), ry + 14);

      // Score on left
      ctx.fillStyle = isCurrentPlayer ? '#fbbf24' : 'rgba(148,163,184,0.6)';
      ctx.font = `bold 13px ${font}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${entry.score}`, lbX + 10, ry + 14);

      ctx.restore();
    });

    // If player not in top 5
    if (playerRank && playerRank > 5 && playerName) {
      const extraY = lbStartY + headerH + 4 + top5.length * rowH + 4;
      const extraDelay = 1.8 + 0.1 * top5.length;
      if (elapsed >= extraDelay) {
        const extraAlpha = Math.min(1, (elapsed - extraDelay) * 4);
        ctx.save();
        ctx.globalAlpha = lbAlpha * extraAlpha;

        ctx.strokeStyle = 'rgba(148,163,184,0.2)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(lbX + 10, extraY);
        ctx.lineTo(lbX + lbW - 10, extraY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(251,191,36,0.12)';
        roundRect(ctx, lbX, extraY + 4, lbW, rowH - 4, 4);
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold 13px ${font}`;
        ctx.textAlign = 'right';
        ctx.fillText(`#${playerRank}`, lbX + lbW - 8, extraY + 18);
        ctx.font = `bold 14px ${font}`;
        ctx.fillText(playerName, lbX + lbW - 34, extraY + 18);
        ctx.font = `bold 13px ${font}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${score}`, lbX + 10, extraY + 18);

        ctx.restore();
      }
    }

    ctx.restore();
  }

  // ─── Restart button "عيدها يا كبير" — elegant gold style ───
  if (elapsed > 2.5) {
    const restartAlpha = Math.min(1, (elapsed - 2.5) * 2);
    const pulse = 0.2 + Math.sin(t * 2.5) * 0.1;

    ctx.save();
    ctx.globalAlpha = restartAlpha;

    const btnW = 220, btnH = 50;
    const btnX = w / 2 - btnW / 2, btnY = h * 0.92 - btnH / 2;

    // Subtle glass background
    ctx.fillStyle = `rgba(255,255,255,${0.03 + pulse * 0.02})`;
    roundRect(ctx, btnX, btnY, btnW, btnH, 8);
    ctx.fill();

    // Gold border (same as "يلا يلا" button)
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 0.8;
    roundRect(ctx, btnX, btnY, btnW, btnH, 8);
    ctx.stroke();

    // Text with gold gradient
    const btnGrad = ctx.createLinearGradient(w / 2 - 60, 0, w / 2 + 60, 0);
    btnGrad.addColorStop(0, '#c0a040');
    btnGrad.addColorStop(0.5, '#ffd700');
    btnGrad.addColorStop(1, '#c0a040');
    ctx.fillStyle = btnGrad;
    ctx.font = `bold 18px ${font}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,200,50,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText('عيدها يا كبير', w / 2, btnY + btnH / 2 + 7);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.restore();
  }

  ctx.direction = 'ltr';
}
