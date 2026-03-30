import { GameData, Player, FirePool, GasCloud } from './types';
import bgFallbackUrl from '../assets/bg-skyfall.jpeg';
import type { BackgroundPhase } from './backgroundConfig';

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

// Dynamic layers loaded from DB config
let bgLayers: BgLayer[] = [];
let bgPhases: BackgroundPhase[] = [];
let bgConfigLoaded = false;

/** Called once from GameLoader to inject background config */
export function setBackgroundConfig(phases: BackgroundPhase[]) {
  bgPhases = phases;
  bgConfigLoaded = true;
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
} {
  const defaultResult = {
    imgA: fallbackLoaded ? fallbackImg : null, imgB: null, fade: 0,
    overlayTop: [12,20,69], overlayMid: [26,16,46], overlayBottom: [26,10,46], overlayOpacity: 0.4,
  };

  if (!bgConfigLoaded || bgPhases.length === 0) return defaultResult;

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

    if (elapsed < fadeStart) {
      return {
        imgA,
        imgB: null,
        fade: 0,
        overlayTop: parseRGB(current.overlayTop),
        overlayMid: parseRGB(current.overlayMid),
        overlayBottom: parseRGB(current.overlayBottom),
        overlayOpacity: current.overlayOpacity,
      };
    }

    if (elapsed < fadeEnd) {
      const linearFade = (elapsed - fadeStart) / (fadeEnd - fadeStart);
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
      };
    }

    resolvedIdx = i + 1;
  }

  const resolved = bgPhases[resolvedIdx];
  const resolvedLayer = bgLayers[resolvedIdx];

  return {
    imgA: resolvedLayer?.loaded ? resolvedLayer.image : (fallbackLoaded ? fallbackImg : null),
    imgB: null,
    fade: 0,
    overlayTop: parseRGB(resolved.overlayTop),
    overlayMid: parseRGB(resolved.overlayMid),
    overlayBottom: parseRGB(resolved.overlayBottom),
    overlayOpacity: resolved.overlayOpacity,
  };
}

/** Draw a single centered image that covers the viewport with margin for camera movement */
function drawSingleImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, h: number, viewportW: number, camX: number, parallax: number) {
  const imgAspect = img.width / img.height;
  const drawH = h;
  let drawW = drawH * imgAspect;

  // Ensure image is wide enough to cover viewport + extra margin for parallax camera movement
  const cameraMargin = 400;
  const minWidth = viewportW + cameraMargin;
  if (drawW < minWidth) {
    drawW = minWidth;
  }

  // Center the image horizontally, then shift by parallax
  const drawX = (viewportW - drawW) / 2 - camX * parallax;

  ctx.drawImage(img, drawX, 0, drawW, drawH);
}

// ─── Background with Cross-fade ───────────────────────
function renderBackground(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const camX = g.camera.x;
  const margin = 200;
  const left = camX - margin;
  const right = camX + w + margin;
  const totalW = right - left;
  const parallax = 0.3;

  const blend = getPhaseBlend(g.elapsed);

  if (blend.imgA) {
    // Draw primary image
    drawTiledImage(ctx, blend.imgA, h, camX, left, right, parallax);

    // Cross-fade second image on top
    if (blend.imgB && blend.fade > 0) {
      ctx.save();
      ctx.globalAlpha = blend.fade;
      drawTiledImage(ctx, blend.imgB, h, camX, left, right, parallax);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#0c1445';
    ctx.fillRect(left, 0, totalW, h);
  }

  // Dynamic color overlay from config
  const overlayGrad = ctx.createLinearGradient(0, 0, 0, h);
  const op = blend.overlayOpacity;
  overlayGrad.addColorStop(0, `rgba(${blend.overlayTop[0]},${blend.overlayTop[1]},${blend.overlayTop[2]},${op})`);
  overlayGrad.addColorStop(0.5, `rgba(${blend.overlayMid[0]},${blend.overlayMid[1]},${blend.overlayMid[2]},${op * 0.85})`);
  overlayGrad.addColorStop(1, `rgba(${blend.overlayBottom[0]},${blend.overlayBottom[1]},${blend.overlayBottom[2]},${op * 0.95})`);
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(left, 0, totalW, h);

  // Stars — more visible at night (later elapsed)
  const groundY = h * 0.78;
  const nightFactor = Math.min(1, Math.max(0, (g.elapsed - 200) / 100));
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
      // Body with metallic gradient
      const bodyGrad = ctx.createLinearGradient(-hz.size, -hz.size * 0.35, -hz.size, hz.size * 0.35);
      bodyGrad.addColorStop(0, '#7a8088');
      bodyGrad.addColorStop(0.4, '#5a5f65');
      bodyGrad.addColorStop(1, '#3a3f45');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(hz.size * 1.2, 0);
      ctx.lineTo(-hz.size, -hz.size * 0.35);
      ctx.lineTo(-hz.size, hz.size * 0.35);
      ctx.closePath();
      ctx.fill();
      // Outline
      ctx.strokeStyle = '#9a9fa8';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Nose cone (red)
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(hz.size * 1.2, 0);
      ctx.lineTo(hz.size * 0.7, -hz.size * 0.2);
      ctx.lineTo(hz.size * 0.7, hz.size * 0.2);
      ctx.closePath();
      ctx.fill();
      // Stripes
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-hz.size * 0.2, -hz.size * 0.3, 3, hz.size * 0.6);
      // Fins
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.moveTo(-hz.size * 0.8, -hz.size * 0.35);
      ctx.lineTo(-hz.size * 1.1, -hz.size * 0.7);
      ctx.lineTo(-hz.size * 0.5, -hz.size * 0.35);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-hz.size * 0.8, hz.size * 0.35);
      ctx.lineTo(-hz.size * 1.1, hz.size * 0.7);
      ctx.lineTo(-hz.size * 0.5, hz.size * 0.35);
      ctx.fill();
      // Exhaust flame (multi-layered)
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-hz.size, 0);
      ctx.lineTo(-hz.size - 14 - Math.random() * 10, -4 - Math.random() * 3);
      ctx.lineTo(-hz.size - 14 - Math.random() * 10, 4 + Math.random() * 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-hz.size, 0);
      ctx.lineTo(-hz.size - 8 - Math.random() * 5, -2);
      ctx.lineTo(-hz.size - 8 - Math.random() * 5, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff8';
      ctx.beginPath();
      ctx.moveTo(-hz.size, 0);
      ctx.lineTo(-hz.size - 3 - Math.random() * 3, -1);
      ctx.lineTo(-hz.size - 3 - Math.random() * 3, 1);
      ctx.closePath();
      ctx.fill();
    } else if (hz.type === 'cluster') {
      // Horizontal flying missile with phases
      const phase = hz.clusterPhase || 'flying';
      const flyingRight = (hz.clusterVelX || 0) > 0;
      const dir = flyingRight ? 1 : -1;

      if (phase === 'done') {
        // Fading smoke puff
        const alpha = Math.min(1, (hz.clusterTimer || 0) / 0.4);
        ctx.fillStyle = `rgba(100,90,80,${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(0, 0, hz.size * 2.5 * (1 - alpha * 0.3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.scale(dir, 1);
        // Rotate missile based on vertical velocity for arc effect
        const velY = hz.clusterVelY || 0;
        const arcAngle = Math.atan2(velY, Math.abs(hz.clusterVelX || 300));
        ctx.rotate(arcAngle);

        // === Ballistic missile design ===
        const bodyLen = hz.size * 3.5;
        const bodyH = hz.size * 0.6;

        // Main body — olive/grey military gradient
        const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
        bodyGrad.addColorStop(0, '#6b7a5d');
        bodyGrad.addColorStop(0.3, '#4a5640');
        bodyGrad.addColorStop(0.7, '#3d4a35');
        bodyGrad.addColorStop(1, '#2d3628');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(bodyLen * 0.4, 0);
        ctx.quadraticCurveTo(bodyLen * 0.4, -bodyH, bodyLen * 0.2, -bodyH);
        ctx.lineTo(-bodyLen * 0.55, -bodyH * 0.85);
        ctx.lineTo(-bodyLen * 0.65, 0);
        ctx.lineTo(-bodyLen * 0.55, bodyH * 0.85);
        ctx.lineTo(bodyLen * 0.2, bodyH);
        ctx.quadraticCurveTo(bodyLen * 0.4, bodyH, bodyLen * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Nose cone — long red warhead
        const noseLen = bodyLen * 0.45;
        const noseGrad = ctx.createLinearGradient(bodyLen * 0.4, 0, bodyLen * 0.4 + noseLen, 0);
        noseGrad.addColorStop(0, '#991b1b');
        noseGrad.addColorStop(0.6, '#b91c1c');
        noseGrad.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = noseGrad;
        ctx.beginPath();
        ctx.moveTo(bodyLen * 0.4 + noseLen, 0);
        ctx.quadraticCurveTo(bodyLen * 0.4 + noseLen * 0.3, -bodyH * 0.15, bodyLen * 0.4, -bodyH * 0.7);
        ctx.lineTo(bodyLen * 0.4, bodyH * 0.7);
        ctx.quadraticCurveTo(bodyLen * 0.4 + noseLen * 0.3, bodyH * 0.15, bodyLen * 0.4 + noseLen, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Warning stripes — yellow/black bands
        for (let i = 0; i < 3; i++) {
          const sx = bodyLen * (-0.1 + i * 0.15);
          ctx.fillStyle = i % 2 === 0 ? 'rgba(234,179,8,0.4)' : 'rgba(0,0,0,0.3)';
          ctx.fillRect(sx, -bodyH * 0.85, 2.5, bodyH * 1.7);
        }

        // 4 Fins — top, bottom, plus angled side fins
        ctx.fillStyle = '#374131';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.6;
        // Top fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.45, -bodyH * 0.85);
        ctx.lineTo(-bodyLen * 0.65, -bodyH * 2.5);
        ctx.lineTo(-bodyLen * 0.3, -bodyH * 0.85);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Bottom fin
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.45, bodyH * 0.85);
        ctx.lineTo(-bodyLen * 0.65, bodyH * 2.5);
        ctx.lineTo(-bodyLen * 0.3, bodyH * 0.85);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Upper-side fin (smaller)
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.5, -bodyH * 0.5);
        ctx.lineTo(-bodyLen * 0.62, -bodyH * 1.6);
        ctx.lineTo(-bodyLen * 0.38, -bodyH * 0.5);
        ctx.closePath();
        ctx.fill();
        // Lower-side fin (smaller)
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.5, bodyH * 0.5);
        ctx.lineTo(-bodyLen * 0.62, bodyH * 1.6);
        ctx.lineTo(-bodyLen * 0.38, bodyH * 0.5);
        ctx.closePath();
        ctx.fill();

        // Exhaust nozzle
        ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.arc(-bodyLen * 0.65, 0, bodyH * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Exhaust flame (flying phase)
        if (phase === 'flying') {
          // Outer flame — orange
          const flameLen = bodyLen * 0.6 + Math.random() * 12;
          ctx.fillStyle = '#ea580c';
          ctx.beginPath();
          ctx.moveTo(-bodyLen * 0.65, -bodyH * 0.4);
          ctx.lineTo(-bodyLen * 0.65 - flameLen, 0);
          ctx.lineTo(-bodyLen * 0.65, bodyH * 0.4);
          ctx.closePath();
          ctx.fill();
          // Middle flame — yellow
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(-bodyLen * 0.65, -bodyH * 0.25);
          ctx.lineTo(-bodyLen * 0.65 - flameLen * 0.65, 0);
          ctx.lineTo(-bodyLen * 0.65, bodyH * 0.25);
          ctx.closePath();
          ctx.fill();
          // Inner flame — white hot
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath();
          ctx.moveTo(-bodyLen * 0.65, -bodyH * 0.12);
          ctx.lineTo(-bodyLen * 0.65 - flameLen * 0.3, 0);
          ctx.lineTo(-bodyLen * 0.65, bodyH * 0.12);
          ctx.closePath();
          ctx.fill();
        }

        // Opening phase: longitudinal split with red glow
        if (phase === 'opening') {
          const openT = 1 - Math.max(0, (hz.clusterTimer || 0) / 1.0);
          const gap = openT * bodyH * 2.5;

          // Internal red glow
          ctx.fillStyle = `rgba(239,68,68,${0.3 + openT * 0.7})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, bodyLen * 0.3, Math.max(0.1, bodyH * (1 + openT * 1.5)), 0, 0, Math.PI * 2);
          ctx.fill();

          // Crack lines along the body
          ctx.strokeStyle = `rgba(251,191,36,${0.5 + openT * 0.5})`;
          ctx.lineWidth = 1.5 + openT * 2.5;
          ctx.beginPath();
          ctx.moveTo(-bodyLen * 0.4, -gap);
          ctx.lineTo(bodyLen * 0.35, -gap * 0.8);
          ctx.moveTo(-bodyLen * 0.4, gap);
          ctx.lineTo(bodyLen * 0.35, gap * 0.8);
          ctx.stroke();

          // Sparks
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#fbbf24';
            const sparkX = (Math.random() - 0.5) * bodyLen * 0.6;
            const sparkY = (Math.random() - 0.5) * gap * 2;
            ctx.fillRect(sparkX, sparkY, 2, 2);
          }
        }

        ctx.restore();
      }
    } else if (hz.isClusterBomb) {
      // Cluster bomb — small lit/heated metal sphere with light smoke
      ctx.rotate(hz.rotation);
      const s = hz.size;

      // Light smoke trail above the bomb
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

      // Subtle thin halo
      const haloGrad = ctx.createRadialGradient(0, 0, s * 0.8, 0, 0, s * 1.3);
      haloGrad.addColorStop(0, 'rgba(253,224,71,0.12)');
      haloGrad.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Main sphere — soft lemon-yellow gradient
      const bombGrad = ctx.createRadialGradient(-s * 0.15, -s * 0.15, s * 0.1, 0, 0, s);
      bombGrad.addColorStop(0, '#fef9c3');
      bombGrad.addColorStop(0.5, '#fde047');
      bombGrad.addColorStop(1, '#eab308');
      ctx.fillStyle = bombGrad;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();

      // Small white highlight
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(-s * 0.2, -s * 0.2, s * 0.25, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Shrapnel — angular metal chunk with better detail
      ctx.rotate(hz.rotation);
      const shrapGrad = ctx.createLinearGradient(-hz.size, -hz.size, hz.size, hz.size);
      shrapGrad.addColorStop(0, '#9a9590');
      shrapGrad.addColorStop(0.5, '#78716c');
      shrapGrad.addColorStop(1, '#57534e');
      ctx.fillStyle = shrapGrad;
      ctx.beginPath();
      const pts = [
        { x: -hz.size, y: -hz.size * 0.4 },
        { x: -hz.size * 0.3, y: -hz.size },
        { x: hz.size * 0.5, y: -hz.size * 0.6 },
        { x: hz.size, y: hz.size * 0.2 },
        { x: hz.size * 0.3, y: hz.size * 0.8 },
        { x: -hz.size * 0.6, y: hz.size * 0.4 },
      ];
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      // Edge highlight
      ctx.strokeStyle = '#b8b2aa';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Scratch marks
      ctx.strokeStyle = 'rgba(200,195,185,0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-hz.size * 0.5, -hz.size * 0.2);
      ctx.lineTo(hz.size * 0.3, hz.size * 0.1);
      ctx.stroke();
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
  // White box with colored cross
  const b = s * 0.7;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(-b, -b, b * 2, b * 2, 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(-b * 0.2, -b * 0.65, b * 0.4, b * 1.3);
  ctx.fillRect(-b * 0.65, -b * 0.2, b * 1.3, b * 0.4);
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, s: number) {
  const h = s * 0.85, w = s * 0.7;
  // Shield shape
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.quadraticCurveTo(w, -h * 0.6, w, -h * 0.1);
  ctx.quadraticCurveTo(w * 0.8, h * 0.6, 0, h);
  ctx.quadraticCurveTo(-w * 0.8, h * 0.6, -w, -h * 0.1);
  ctx.quadraticCurveTo(-w, -h * 0.6, 0, -h);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -h, 0, h);
  sg.addColorStop(0, '#93c5fd');
  sg.addColorStop(0.5, '#3b82f6');
  sg.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = '#bfdbfe';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Star
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const r = i % 2 === 0 ? s * 0.3 : s * 0.12;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](Math.cos(a) * r, Math.sin(a) * r + h * 0.05);
  }
  ctx.closePath();
  ctx.fill();
}

function drawAmmoIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Crossed bullets — military style
  const bh = s * 0.55, bw = s * 0.18;
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.rotate(side * 0.4);
    // Casing
    const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
    bg.addColorStop(0, '#7a6008');
    bg.addColorStop(0.3, '#d4a017');
    bg.addColorStop(0.5, '#f0c040');
    bg.addColorStop(0.7, '#d4a017');
    bg.addColorStop(1, '#7a6008');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-bw, -bh * 0.15, bw * 2, bh * 0.85, 1.5);
    ctx.fill();
    // Belt groove
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-bw, bh * 0.5);
    ctx.lineTo(bw, bh * 0.5);
    ctx.stroke();
    // Tip
    ctx.fillStyle = '#a04510';
    ctx.beginPath();
    ctx.moveTo(-bw * 0.7, -bh * 0.15);
    ctx.quadraticCurveTo(0, -bh, bw * 0.7, -bh * 0.15);
    ctx.closePath();
    ctx.fill();
    // Tip highlight
    ctx.fillStyle = 'rgba(255,220,150,0.35)';
    ctx.beginPath();
    ctx.moveTo(-bw * 0.15, -bh * 0.15);
    ctx.quadraticCurveTo(0, -bh * 0.85, bw * 0.15, -bh * 0.15);
    ctx.closePath();
    ctx.fill();
    // Casing highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-bw * 0.1, -bh * 0.1, bw * 0.2, bh * 0.55);
    ctx.restore();
  }
}

function drawSlowMoIcon(ctx: CanvasRenderingContext2D, s: number, elapsed: number) {
  // Clock face
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
  ctx.fillStyle = '#06b6d4';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawMagnetIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Large horseshoe magnet — red left pole, blue right pole, silver arc
  const w = s * 0.8, h = s * 0.9, t = s * 0.32;
  
  // Silver curved bottom (horseshoe base)
  const arcGrad = ctx.createLinearGradient(-w, h * 0.3, w, h * 0.3);
  arcGrad.addColorStop(0, '#c0c0c0');
  arcGrad.addColorStop(0.5, '#f0f0f0');
  arcGrad.addColorStop(1, '#c0c0c0');
  ctx.strokeStyle = arcGrad;
  ctx.lineWidth = t;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, h * 0.35, w - t / 2, 0, Math.PI);
  ctx.stroke();
  // White outline on curve
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, h * 0.35, w + 2, 0, Math.PI);
  ctx.stroke();
  
  // Left pole (red)
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-w, -h * 0.45, t, h * 0.8);
  ctx.strokeRect(-w, -h * 0.45, t, h * 0.8);
  // Right pole (blue)
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(w - t, -h * 0.45, t, h * 0.8);
  ctx.strokeRect(w - t, -h * 0.45, t, h * 0.8);
  
  // White tip markers (N/S)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-w + 1, -h * 0.45, t - 2, t * 0.5);
  ctx.fillRect(w - t + 1, -h * 0.45, t - 2, t * 0.5);
  
  // Field lines between poles
  ctx.strokeStyle = 'rgba(100,180,255,0.4)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const arcR = s * 0.2 + i * s * 0.15;
    ctx.beginPath();
    ctx.arc(0, -h * 0.2, arcR, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
}

function drawAirstrikeIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Mini jet silhouette
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  // Fuselage
  ctx.moveTo(s * 0.9, 0);
  ctx.lineTo(-s * 0.6, -s * 0.12);
  ctx.lineTo(-s * 0.9, -s * 0.1);
  ctx.lineTo(-s * 0.9, s * 0.1);
  ctx.lineTo(-s * 0.6, s * 0.12);
  ctx.closePath();
  ctx.fill();
  // Wings
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
  // Tail fins
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
  // Mini rocket with flame
  const bw = s * 0.25, bh = s * 0.8;
  // Body
  const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
  bg.addColorStop(0, '#78716c');
  bg.addColorStop(0.5, '#d6d3d1');
  bg.addColorStop(1, '#78716c');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.3, bw * 2, bh * 0.7, 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-bw, -bh * 0.3);
  ctx.quadraticCurveTo(0, -bh, bw, -bh * 0.3);
  ctx.closePath();
  ctx.fill();
  // Fins
  ctx.fillStyle = '#57534e';
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
  // Flame
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(-bw * 0.6, bh * 0.4);
  ctx.quadraticCurveTo(0, bh * 0.85, bw * 0.6, bh * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff8';
  ctx.beginPath();
  ctx.moveTo(-bw * 0.3, bh * 0.4);
  ctx.quadraticCurveTo(0, bh * 0.65, bw * 0.3, bh * 0.4);
  ctx.closePath();
  ctx.fill();
}

function drawExtinguisherIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Red cylinder body
  const bw = s * 0.3, bh = s * 0.75;
  const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
  bg.addColorStop(0, '#991b1b');
  bg.addColorStop(0.3, '#dc2626');
  bg.addColorStop(0.6, '#ef4444');
  bg.addColorStop(1, '#991b1b');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.4, bw * 2, bh, 3);
  ctx.fill();
  // Nozzle on top
  ctx.fillStyle = '#333';
  ctx.fillRect(-bw * 0.3, -bh * 0.55, bw * 0.6, bh * 0.2);
  // Handle
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bw * 0.3, -bh * 0.4);
  ctx.quadraticCurveTo(bw * 1.2, -bh * 0.6, bw * 0.8, -bh * 0.2);
  ctx.stroke();
  // Label band
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-bw * 0.8, -bh * 0.05, bw * 1.6, bh * 0.2);
  // Fire icon on label
  ctx.fillStyle = '#f97316';
  ctx.font = `${s * 0.3}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔥', 0, bh * 0.05);
}

function drawGasMaskIcon(ctx: CanvasRenderingContext2D, s: number) {
  // Mask outline
  const mw = s * 0.65, mh = s * 0.7;
  ctx.fillStyle = '#1a3a2a';
  ctx.beginPath();
  ctx.ellipse(0, 0, mw, mh, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner mask — darker
  ctx.fillStyle = '#0f2a1a';
  ctx.beginPath();
  ctx.ellipse(0, mh * 0.05, mw * 0.8, mh * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye lenses — circular, reflective green
  for (const ex of [-mw * 0.35, mw * 0.35]) {
    ctx.fillStyle = '#065f46';
    ctx.beginPath();
    ctx.arc(ex, -mh * 0.15, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Lens reflection
    ctx.fillStyle = 'rgba(16,185,129,0.4)';
    ctx.beginPath();
    ctx.arc(ex - s * 0.05, -mh * 0.2, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  // Filter canister at bottom
  ctx.fillStyle = '#374151';
  ctx.beginPath();
  ctx.roundRect(-mw * 0.25, mh * 0.3, mw * 0.5, mh * 0.35, 2);
  ctx.fill();
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Grill lines on filter
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 3; i++) {
    const gy = mh * 0.38 + i * mh * 0.1;
    ctx.beginPath();
    ctx.moveTo(-mw * 0.18, gy);
    ctx.lineTo(mw * 0.18, gy);
    ctx.stroke();
  }
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
    gasmask:      { base: '#16a34a', light: '#22c55e', dark: '#14532d' },
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

    // ── Professional 3D Parachute ──
    if (pu.parachuting) {
      const cW = 32, cH = 20;
      const cY = -32;
      const panels = 8;
      const sway = Math.sin(pu.bobTimer * 1.8) * 0.05;
      const billow = Math.sin(pu.bobTimer * 3.5) * 1.5;
      ctx.save();
      ctx.rotate(sway);

      // Canopy panels with 3D shading — military camo for ammo
      const camoColors = ['#4a5c2a', '#6b7d3a', '#8b7d5a', '#5c4a2a', '#3d4a2a', '#7a6b3a', '#5a6b3a', '#6b5a2a'];
      for (let i = 0; i < panels; i++) {
        const startA = Math.PI + (i / panels) * Math.PI;
        const endA = Math.PI + ((i + 1) / panels) * Math.PI;
        const midA = (startA + endA) / 2;
        const lightFactor = 0.5 + Math.cos(midA - Math.PI * 1.5) * 0.5;
        if (pu.type === 'ammo') {
          // Military camo pattern
          const cc = camoColors[i % camoColors.length];
          const cr = parseInt(cc.slice(1, 3), 16);
          const cg = parseInt(cc.slice(3, 5), 16);
          const cb = parseInt(cc.slice(5, 7), 16);
          ctx.fillStyle = `rgb(${Math.min(255, cr + lightFactor * 30)},${Math.min(255, cg + lightFactor * 30)},${Math.min(255, cb + lightFactor * 30)})`;
        } else {
          const r = parseInt(cols.base.slice(1, 3), 16);
          const gr = parseInt(cols.base.slice(3, 5), 16);
          const b = parseInt(cols.base.slice(5, 7), 16);
          const lr = Math.min(255, r + lightFactor * 60);
          const lg = Math.min(255, gr + lightFactor * 60);
          const lb = Math.min(255, b + lightFactor * 60);
          ctx.fillStyle = `rgb(${lr},${lg},${lb})`;
        }
        ctx.globalAlpha = fadeAlpha * 0.8;
        ctx.beginPath();
        ctx.ellipse(0, cY + billow * 0.3, cW, cH + billow, 0, startA, endA);
        ctx.lineTo(0, cY);
        ctx.closePath();
        ctx.fill();
      }
      // Military star on ammo parachute
      if (pu.type === 'ammo') {
        ctx.globalAlpha = fadeAlpha * 0.6;
        ctx.fillStyle = '#e5e5d0';
        ctx.beginPath();
        const starX = 0, starY = cY - cH * 0.15, starR = 5;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          const a2 = a + Math.PI / 5;
          ctx.lineTo(starX + Math.cos(a) * starR, starY + Math.sin(a) * starR);
          ctx.lineTo(starX + Math.cos(a2) * starR * 0.4, starY + Math.sin(a2) * starR * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = fadeAlpha;
      }
      ctx.globalAlpha = fadeAlpha;

      // Wrinkle lines between panels
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.6;
      for (let i = 1; i < panels; i++) {
        const a = Math.PI + (i / panels) * Math.PI;
        const rx = Math.cos(a) * cW;
        const ry = Math.sin(a) * (cH + billow) + cY + billow * 0.3;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(0, cY);
        ctx.stroke();
      }

      // Canopy outline
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, cY + billow * 0.3, cW, cH + billow, 0, Math.PI, 0);
      ctx.stroke();

      // Specular highlight on top
      const specGrad = ctx.createRadialGradient(-cW * 0.2, cY - cH * 0.3, 0, -cW * 0.2, cY - cH * 0.3, cW * 0.5);
      specGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.ellipse(-cW * 0.2, cY - cH * 0.1, cW * 0.45, cH * 0.4, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Inner shadow under canopy
      const shadowGrad = ctx.createLinearGradient(0, cY, 0, cY + cH * 0.7);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.25)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, cY + 3, cW * 0.85, cH * 0.35, 0, 0, Math.PI);
      ctx.fill();

      // 6 strings with natural drape
      ctx.strokeStyle = 'rgba(200,195,185,0.6)';
      ctx.lineWidth = 0.7;
      const stringPoints = [-0.92, -0.58, -0.22, 0.22, 0.58, 0.92];
      for (const frac of stringPoints) {
        const a = Math.PI + (frac + 1) * 0.5 * Math.PI;
        const sx = Math.cos(a) * cW;
        const sy = Math.sin(a) * (cH + billow) + cY + billow * 0.3;
        const drape = 4 + Math.abs(frac) * 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(
          sx * 0.5, sy + drape,
          frac > 0 ? 2 : -2, -10,
          0, -4
        );
        ctx.stroke();
      }

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
    const facingRight = d.vel.x >= 0;
    const tilt = Math.sin(d.wobble * 2) * 0.05;
    const damaged = d.health < d.maxHealth;
    // Extra wobble when damaged
    const damageTilt = damaged ? Math.sin(d.wobble * 8) * 0.08 : 0;
    ctx.rotate(tilt + damageTilt);

    // === CARGO DRONE ===
    if (d.tier === 'cargo') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;

      // Rope hanging down to crate
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.2, sz * 0.4);
      ctx.lineTo(-sz * 0.15, sz * 1.8);
      ctx.moveTo(sz * 0.2, sz * 0.4);
      ctx.lineTo(sz * 0.15, sz * 1.8);
      ctx.stroke();

      // Golden crate below
      const crateY = sz * 1.8;
      const crateW = sz * 0.7;
      const crateH = sz * 0.5;
      const crateGrad = ctx.createLinearGradient(0, crateY - crateH / 2, 0, crateY + crateH / 2);
      crateGrad.addColorStop(0, '#daa520');
      crateGrad.addColorStop(0.5, '#b8860b');
      crateGrad.addColorStop(1, '#8b6914');
      ctx.fillStyle = crateGrad;
      ctx.fillRect(-crateW / 2, crateY - crateH / 2, crateW, crateH);
      // Crate edge
      ctx.strokeStyle = '#6b4c0a';
      ctx.lineWidth = 1;
      ctx.strokeRect(-crateW / 2, crateY - crateH / 2, crateW, crateH);
      // Cross straps
      ctx.strokeStyle = 'rgba(100,70,20,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-crateW / 2, crateY - crateH / 2);
      ctx.lineTo(crateW / 2, crateY + crateH / 2);
      ctx.moveTo(crateW / 2, crateY - crateH / 2);
      ctx.lineTo(-crateW / 2, crateY + crateH / 2);
      ctx.stroke();

      // Orange fuselage
      const bodyGrad = ctx.createLinearGradient(0, -sz * 0.35, 0, sz * 0.35);
      bodyGrad.addColorStop(0, '#e8760a');
      bodyGrad.addColorStop(0.4, '#d4680a');
      bodyGrad.addColorStop(1, '#b05508');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * sz * 1.2, 0);
      ctx.lineTo(dir * sz * 0.5, -sz * 0.35);
      ctx.lineTo(-dir * sz * 0.8, -sz * 0.3);
      ctx.lineTo(-dir * sz * 1.0, 0);
      ctx.lineTo(-dir * sz * 0.8, sz * 0.35);
      ctx.lineTo(dir * sz * 0.5, sz * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8b4500';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Wings
      ctx.fillStyle = '#c25a08';
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, -sz * 0.3);
      ctx.lineTo(-dir * sz * 0.3, -sz * 1.1);
      ctx.lineTo(-dir * sz * 0.7, -sz * 0.9);
      ctx.lineTo(-dir * sz * 0.5, -sz * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, sz * 0.35);
      ctx.lineTo(-dir * sz * 0.3, sz * 1.1);
      ctx.lineTo(-dir * sz * 0.7, sz * 0.9);
      ctx.lineTo(-dir * sz * 0.5, sz * 0.35);
      ctx.fill();

      // Dual engines
      for (const ey of [-sz * 0.15, sz * 0.15]) {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.ellipse(-dir * sz * 0.95, ey, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Exhaust
        ctx.fillStyle = `rgba(100,180,255,${0.3 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(-dir * sz * 0.95, ey - 1.5);
        ctx.lineTo(-dir * (sz * 0.95 + 6 + Math.random() * 4), ey);
        ctx.lineTo(-dir * sz * 0.95, ey + 1.5);
        ctx.fill();
      }

      // "OTLOP" label on body — always readable (never mirrored)
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(7, sz * 0.22)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText(d.label || 'OTLOP', 0, -sz * 0.05);
      ctx.globalAlpha = 1;
      ctx.restore();

      // Blinking light on nose
      if (Math.sin(g.elapsed * 3) > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(dir * sz * 1.1, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Health bar
      if (damaged) {
        const barW = sz * 2;
        const barH = 3;
        const barY = -sz * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
        const hpRatio = d.health / d.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
      }

      ctx.restore();
      continue;
    }

    // === INCENDIARY DRONE ===
    if (d.tier === 'incendiary') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      // Red-orange fuselage
      const bodyGrad = ctx.createLinearGradient(0, -sz * 0.3, 0, sz * 0.3);
      bodyGrad.addColorStop(0, '#dc2626');
      bodyGrad.addColorStop(0.5, '#ea580c');
      bodyGrad.addColorStop(1, '#b91c1c');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * sz * 1.1, 0);
      ctx.lineTo(dir * sz * 0.4, -sz * 0.3);
      ctx.lineTo(-dir * sz * 0.7, -sz * 0.25);
      ctx.lineTo(-dir * sz * 0.9, 0);
      ctx.lineTo(-dir * sz * 0.7, sz * 0.3);
      ctx.lineTo(dir * sz * 0.4, sz * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Fuel tank underneath — glowing
      const tankPulse = 0.5 + Math.sin(g.elapsed * 4) * 0.3;
      ctx.fillStyle = `rgba(249, 115, 22, ${tankPulse})`;
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.35, sz * 0.35, sz * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Wings
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, -sz * 0.25);
      ctx.lineTo(-dir * sz * 0.3, -sz * 0.9);
      ctx.lineTo(-dir * sz * 0.6, -sz * 0.25);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, sz * 0.3);
      ctx.lineTo(-dir * sz * 0.3, sz * 0.9);
      ctx.lineTo(-dir * sz * 0.6, sz * 0.3);
      ctx.fill();
      // Engine exhaust
      ctx.fillStyle = '#f97316';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(-dir * sz * 0.85, 0, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Health bar
      if (damaged) {
        const barW = sz * 2; const barH = 3; const barY = -sz * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
        const hpRatio = d.health / d.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
      }
      ctx.restore();
      continue;
    }

    // === CHEMICAL DRONE ===
    if (d.tier === 'chemical') {
      const dir = facingRight ? 1 : -1;
      const sz = d.size;
      // Dark green fuselage
      const bodyGrad = ctx.createLinearGradient(0, -sz * 0.3, 0, sz * 0.3);
      bodyGrad.addColorStop(0, '#14532d');
      bodyGrad.addColorStop(0.5, '#166534');
      bodyGrad.addColorStop(1, '#14532d');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * sz * 1.1, 0);
      ctx.lineTo(dir * sz * 0.4, -sz * 0.3);
      ctx.lineTo(-dir * sz * 0.7, -sz * 0.25);
      ctx.lineTo(-dir * sz * 0.9, 0);
      ctx.lineTo(-dir * sz * 0.7, sz * 0.3);
      ctx.lineTo(dir * sz * 0.4, sz * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Gas canister underneath — green glow
      const gasPulse = 0.4 + Math.sin(g.elapsed * 3) * 0.2;
      ctx.fillStyle = `rgba(74, 222, 128, ${gasPulse})`;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.35, sz * 0.3, sz * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // ☣ symbol on body
      ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
      ctx.font = `${sz * 0.4}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☣', 0, 0);
      // Wings
      ctx.fillStyle = '#052e16';
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, -sz * 0.25);
      ctx.lineTo(-dir * sz * 0.3, -sz * 0.9);
      ctx.lineTo(-dir * sz * 0.6, -sz * 0.25);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * sz * 0.1, sz * 0.3);
      ctx.lineTo(-dir * sz * 0.3, sz * 0.9);
      ctx.lineTo(-dir * sz * 0.6, sz * 0.3);
      ctx.fill();
      // Engine
      ctx.fillStyle = '#16a34a';
      ctx.shadowColor = '#16a34a';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(-dir * sz * 0.85, 0, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Health bar
      if (damaged) {
        const barW = sz * 2; const barH = 3; const barY = -sz * 0.5;
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
      // SCOUT: Professional quadcopter with camera sensor
      const armLen = d.size * 1.3;
      // Central body — darker, more defined
      const bodyGrad = ctx.createRadialGradient(-1, -1, 0, 0, 0, d.size * 0.65);
      bodyGrad.addColorStop(0, '#4a4a4a');
      bodyGrad.addColorStop(0.6, '#2a2a2a');
      bodyGrad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size * 0.55, d.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Camera/sensor pod underneath
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.ellipse(0, d.size * 0.25, d.size * 0.2, d.size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // Camera lens
      ctx.fillStyle = '#0ea5e9';
      ctx.shadowColor = '#0ea5e9';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, d.size * 0.25, d.size * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 4 arms — thicker with joint details
      const propAngle = g.elapsed * 30;
      for (let i = 0; i < 4; i++) {
        const armA = (Math.PI / 2) * i + Math.PI / 4;
        const ax = Math.cos(armA) * armLen;
        const ay = Math.sin(armA) * armLen * 0.5;
        // Arm with gradient
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(armA) * d.size * 0.35, Math.sin(armA) * d.size * 0.25);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // Joint circle
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Rotor disc — motion blur effect
        const rotAlpha = 0.25 + Math.sin(propAngle + i * 2) * 0.1;
        ctx.strokeStyle = `rgba(200,200,200,${rotAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(ax, ay, d.size * 0.45, d.size * 0.18, propAngle + i, 0, Math.PI * 2);
        ctx.stroke();
        // Rotor fill for blur
        ctx.fillStyle = `rgba(180,180,180,${rotAlpha * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(ax, ay, d.size * 0.42, d.size * 0.16, propAngle + i, 0, Math.PI * 2);
        ctx.fill();
      }

      // LED indicators — red (front) and green (rear)
      const ledBlink = Math.sin(g.elapsed * 4) > 0;
      // Front LED (red)
      ctx.fillStyle = ledBlink ? '#ef4444' : '#4a1010';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = ledBlink ? 6 : 0;
      ctx.beginPath();
      ctx.arc(d.size * 0.3, -d.size * 0.15, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Rear LED (green)
      ctx.fillStyle = ledBlink ? '#22c55e' : '#0a3a10';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = ledBlink ? 6 : 0;
      ctx.beginPath();
      ctx.arc(-d.size * 0.3, -d.size * 0.15, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

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

      // Laser tracking line when diving
      if (isDiving) {
        const laserEndX = (g.player.pos.x - d.pos.x);
        const laserEndY = (g.player.pos.y - d.pos.y);
        ctx.strokeStyle = 'rgba(34,255,68,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(dir * d.size * 1.35, 0);
        ctx.lineTo(laserEndX, laserEndY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

    } else {
      // BOMBER: Massive heavy military drone — wide body with bomb bay
      const dir = facingRight ? 1 : -1;
      // Heavy fuselage — dark brown military
      const bodyGrad = ctx.createLinearGradient(0, -d.size * 0.45, 0, d.size * 0.45);
      bodyGrad.addColorStop(0, '#4a3d30');
      bodyGrad.addColorStop(0.3, '#3a2f25');
      bodyGrad.addColorStop(0.7, '#2a2018');
      bodyGrad.addColorStop(1, '#1a1510');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 1.3, 0);
      ctx.lineTo(dir * d.size * 0.6, -d.size * 0.45);
      ctx.lineTo(-dir * d.size * 0.9, -d.size * 0.4);
      ctx.lineTo(-dir * d.size * 1.1, 0);
      ctx.lineTo(-dir * d.size * 0.9, d.size * 0.45);
      ctx.lineTo(dir * d.size * 0.6, d.size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a4a35';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Very wide wings
      ctx.fillStyle = '#2a2018';
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.3, -d.size * 0.4);
      ctx.lineTo(-dir * d.size * 0.2, -d.size * 1.5);
      ctx.lineTo(-dir * d.size * 0.8, -d.size * 1.3);
      ctx.lineTo(-dir * d.size * 0.6, -d.size * 0.4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.3, d.size * 0.45);
      ctx.lineTo(-dir * d.size * 0.2, d.size * 1.5);
      ctx.lineTo(-dir * d.size * 0.8, d.size * 1.3);
      ctx.lineTo(-dir * d.size * 0.6, d.size * 0.45);
      ctx.fill();

      // Bomb bay indicator — glowing underside
      const bombReady = d.bombTimer >= d.bombCooldown * 0.8;
      if (bombReady) {
        ctx.fillStyle = 'rgba(255, 80, 0, 0.5)';
        ctx.shadowColor = '#ff5000';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(0, d.size * 0.35, d.size * 0.5, d.size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Bomb bay hatch lines
      ctx.strokeStyle = 'rgba(255, 150, 50, 0.3)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.ellipse(0, d.size * 0.3, d.size * 0.4, d.size * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dual engines — larger with exhaust
      for (const ey of [-d.size * 0.2, d.size * 0.2]) {
        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(-dir * d.size * 1.05, ey, 3.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Exhaust flame
        const exLen = 10 + Math.random() * 8;
        ctx.fillStyle = `rgba(249, 115, 22, ${0.5 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(-dir * d.size * 1.05, ey - 2);
        ctx.lineTo(-dir * (d.size * 1.05 + exLen), ey);
        ctx.lineTo(-dir * d.size * 1.05, ey + 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Warning stripes — more prominent
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.15, -d.size * 0.4);
      ctx.lineTo(dir * d.size * 0.15, d.size * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-dir * d.size * 0.3, -d.size * 0.38);
      ctx.lineTo(-dir * d.size * 0.3, d.size * 0.43);
      ctx.stroke();
      ctx.setLineDash([]);

      // Red eye — large and menacing
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(dir * d.size * 1.0, 0, 4, 0, Math.PI * 2);
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
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${g.score}`, 0, 0);
  ctx.restore();

  ctx.font = '10px monospace';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'right';
  ctx.fillText(`HI: ${g.highScore}`, w - 14, 42);

  // ─ Wave (removed — shown by renderWaveIndicator instead) ─

  // ─ Dash indicator ─
  if (p.dashCooldown > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`ROLL ${p.dashCooldown.toFixed(1)}s`, w - 14, h - 14);
  } else {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ROLL ●', w - 14, h - 14);
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
    ctx.fillText(`×${g.comboMultiplier.toFixed(1)} COMBO`, 0, 0);
    // Combo count below
    ctx.fillStyle = 'rgba(251,191,36,0.6)';
    ctx.font = '9px monospace';
    ctx.fillText(`${g.comboCount} hits`, 0, 13);

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
    ctx.fillText(`SHOT LV.${g.bulletLevel}`, 14, 64);
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
    ctx.fillText(`SLOW ${g.slowMoTimer.toFixed(1)}s`, 30, effectY + 2);
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
    ctx.fillText('MAGNET', 30, effectY + 2);
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
    ctx.fillText(`SHIELD ${p.shieldTimer.toFixed(1)}s`, 30, effectY + 2);
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
    ctx.fillText(`FIRE ${p.extinguisherTimer.toFixed(1)}s`, 30, effectY + 2);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  // Gas mask timer
  if (p.gasMaskTimer > 0) {
    const blink = p.gasMaskTimer < 3 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    drawCircularProgress(20, effectY - 2, 5, p.gasMaskTimer / 15, '#16a34a');
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`MASK ${p.gasMaskTimer.toFixed(1)}s`, 30, effectY + 2);
    ctx.globalAlpha = 1;
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
  const tilt = Math.sin(g.elapsed * 0.8) * 0.03;
  ctx.rotate(tilt);

  // Damage flash
  if (boss.damageFlash > 0) {
    ctx.globalAlpha = 0.7 + boss.damageFlash;
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
  // Boss label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GUNSHIP', 0, barY - 4);

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
}

function drawCharacter(ctx: CanvasRenderingContext2D, opts: CharacterOptions) {
  const {
    x, y, scale, sitting, facingRight, isDriver, helmetColor,
    bodyBob, armOffset, legOffset, isHit, elapsed,
    holdingDriver, isShooting, shootTimer, isWaving, hasGoggles, lookingBack,
  } = opts;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const dir = facingRight ? 1 : -1;
  ctx.scale(dir, 1);

  const skinColor = isHit ? '#fca5a5' : '#f0c4a0';
  const skinHighlight = isHit ? '#fecaca' : '#fad5b5';
  const pantsColor = '#1a2f4a';
  const pantsHighlight = '#2a4a6a';
  const shoeColor = '#1a1a1a';

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
  const torsoGrad = ctx.createLinearGradient(0, bodyTopY, 0, bodyBottomY);
  if (isHit) {
    torsoGrad.addColorStop(0, '#ef4444');
    torsoGrad.addColorStop(1, '#dc2626');
  } else {
    torsoGrad.addColorStop(0, '#5a9ae6');
    torsoGrad.addColorStop(0.4, '#4a90e2');
    torsoGrad.addColorStop(1, '#2563eb');
  }
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-6, bodyTopY);
  ctx.lineTo(6, bodyTopY);
  ctx.lineTo(5, bodyBottomY);
  ctx.lineTo(-5, bodyBottomY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = isHit ? '#b91c1c' : '#1d4ed8';
  ctx.lineWidth = 0.8;
  ctx.stroke();

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
  const armColor = isHit ? '#ef4444' : '#3a7bd5';
  const armHighlight = isHit ? '#f87171' : '#5a9ae6';

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
    // Side-view: bent-elbow arm reaching to handlebar with proper joint articulation
    // Far arm hint (behind torso — darker, partially hidden)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a5a9a';
    ctx.beginPath();
    ctx.moveTo(2, bodyTopY + 4);
    ctx.quadraticCurveTo(6, bodyTopY + 1, 10, bodyTopY - 3);
    ctx.stroke();
    // Far gloved hand
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(10, bodyTopY - 3, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Near arm — shoulder → bent elbow (~120°) → forearm → grip on handlebar (inward)
    // Upper arm: shoulder to elbow
    const shoulderX = 4, shoulderY = bodyTopY + 3;
    const elbowX = 8, elbowY = bodyTopY + 1;
    const handleX = 5, handleY = bodyTopY - 9;
    
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    // Elbow joint highlight
    ctx.fillStyle = armHighlight;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 2, 0, Math.PI * 2);
    ctx.fill();
    // Forearm: elbow to handlebar grip (bent upward)
    ctx.lineWidth = 4;
    ctx.strokeStyle = armHighlight;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.quadraticCurveTo(elbowX + 2, elbowY - 5, handleX, handleY);
    ctx.stroke();
    // Gloved hand gripping handlebar
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(handleX, handleY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Knuckle detail
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(handleX, handleY - 1, 1, 0, Math.PI * 2);
    ctx.fill();
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

  // Helmet with gradient + shine
  const hDark = helmetColor;
  const helmetGrad = ctx.createLinearGradient(0, headY - 8, 0, headY);
  // Derive lighter/darker shades from base color
  helmetGrad.addColorStop(0, hDark);
  helmetGrad.addColorStop(0.5, hDark);
  helmetGrad.addColorStop(1, '#0f172a');
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

  ctx.restore();
}


function renderMotorcycle(ctx: CanvasRenderingContext2D, bike: { pos: { x: number; y: number }; facingRight: boolean; wheelAnim: number; shakeOffset: { x: number; y: number }; phase: string; speed: number }, g: GameData, showPassenger: boolean = false, passengerDismounting: boolean = false, dismountProgress: number = 0) {
  ctx.save();
  ctx.translate(bike.pos.x, bike.pos.y);
  const dir = bike.facingRight ? 1 : -1;
  ctx.scale(dir, 1);
  ctx.scale(2.4, 2.4);

  // Suspension physics: front fork compresses on braking
  const isBrakingNow = bike.phase === 'idle' || bike.speed < 50;
  const suspTarget = isBrakingNow ? -1.5 : 0;
  const suspCompress = suspTarget; // simplified spring
  const rearSuspCompress = suspTarget * 0.4; // rear reacts less

  ctx.translate(bike.shakeOffset.x, bike.shakeOffset.y + suspCompress * 0.3);

  // ── Advanced Exhaust with Vortex Turbulence ──
  if (bike.phase === 'idle' || bike.phase === 'leaving' || bike.phase === 'entering') {
    const isLeaving = bike.phase === 'leaving';
    const puffCount = isLeaving ? 10 : (bike.phase === 'idle' ? 5 : 7);
    for (let i = 0; i < puffCount; i++) {
      const age = (g.elapsed * (isLeaving ? 2.5 : 1.5) + i * 0.6) % 2.5;
      const friction = Math.pow(0.92, age * 10);
      const baseVx = isLeaving ? -20 : -8;
      const baseVy = isLeaving ? -6 : -8;
      // Vortex turbulence: local swirl offset
      const seedAngle = i * 2.3 + g.elapsed * 0.5;
      const vortex = Math.sin(age * 5 + seedAngle) * 2;
      const vortexY = Math.cos(age * 4 + seedAngle) * 1.5;
      const windDrift = Math.sin(g.elapsed * 2 + i * 1.3) * 2 + vortex;
      const sx = -28 + baseVx * age * friction + windDrift;
      const sy = -5 + baseVy * age * friction + Math.sin(g.elapsed * 3 + i) * 1.5 + vortexY;
      const scaleX = 1 + age * 1.0;
      const baseR = 2 + age * (isLeaving ? 5.5 : 3.5);
      const lifeAlpha = Math.max(0, 1 - age / 2.5);
      // 4-stage color: bright white → white-grey → grey-brown → transparent
      const ageRatio = age / 2.5;
      let r: number, gr: number, b: number;
      if (ageRatio < 0.2) {
        r = 220; gr = 220; b = 225; // bright white
      } else if (ageRatio < 0.5) {
        r = 200 - (ageRatio - 0.2) * 130; gr = 200 - (ageRatio - 0.2) * 140; b = 210 - (ageRatio - 0.2) * 160;
      } else if (ageRatio < 0.8) {
        r = 160 - (ageRatio - 0.5) * 100; gr = 155 - (ageRatio - 0.5) * 120; b = 160 - (ageRatio - 0.5) * 140;
      } else {
        r = 130; gr = 119; b = 118;
      }
      const alpha = lifeAlpha * (isLeaving ? 0.38 : 0.28);
      // Each puff = 4 overlapping circles for organic turbulent shape
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scaleX, 1);
      for (let c = 0; c < 4; c++) {
        const cx2 = Math.cos(c * 1.6 + i + age * 2) * baseR * 0.35;
        const cy2 = Math.sin(c * 1.6 + i + age * 1.5) * baseR * 0.3;
        const cr = baseR * (0.55 + c * 0.12);
        ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(gr)},${Math.round(b)},${alpha * (1 - c * 0.12)})`;
        ctx.beginPath();
        ctx.arc(cx2, cy2, cr, 0, Math.PI * 2);
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

  // ── Wheels with suspension + treads + rotation blur ──
  const wheelR = 8;
  const wheelY = 0;
  const frontWX = 22, rearWX = -20;
  const frontWY = wheelY + suspCompress; // front fork compressed
  const rearWY = wheelY + rearSuspCompress;

  const highSpeed = Math.abs(bike.speed) > 150;

  for (const [wx, wy] of [[frontWX, frontWY], [rearWX, rearWY]] as [number, number][]) {
    // Tire outer
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    // Tire tread marks (grooves on rubber)
    ctx.strokeStyle = 'rgba(60,60,60,0.5)';
    ctx.lineWidth = 0.8;
    for (let t = 0; t < 12; t++) {
      const tAngle = bike.wheelAnim + t * Math.PI / 6;
      const innerR = wheelR - 1.8;
      const outerR = wheelR + 0.5;
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(tAngle) * innerR, wy + Math.sin(tAngle) * innerR);
      ctx.lineTo(wx + Math.cos(tAngle) * outerR, wy + Math.sin(tAngle) * outerR);
      ctx.stroke();
    }

    // Rim
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR - 3, 0, Math.PI * 2);
    ctx.stroke();

    if (highSpeed) {
      // Rotation blur — replace spokes with motion arc
      ctx.strokeStyle = 'rgba(150,150,150,0.15)';
      ctx.lineWidth = wheelR - 4;
      ctx.beginPath();
      ctx.arc(wx, wy, (wheelR - 3) / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Spokes (visible at low speed)
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 6; i++) {
        const a = bike.wheelAnim + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(wx + Math.cos(a) * 2, wy + Math.sin(a) * 2);
        ctx.lineTo(wx + Math.cos(a) * (wheelR - 3), wy + Math.sin(a) * (wheelR - 3));
        ctx.stroke();
      }
    }

    // Hub (chrome)
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, Math.PI * 2);
    ctx.fill();
    // Hub highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(wx - 0.5, wy - 0.5, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Fork tubes (visual suspension) ──
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 1.5;
  // Front fork
  ctx.beginPath();
  ctx.moveTo(frontWX - 2, -12);
  ctx.lineTo(frontWX - 1, frontWY - wheelR + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(frontWX + 1, -11);
  ctx.lineTo(frontWX + 2, frontWY - wheelR + 1);
  ctx.stroke();
  // Chrome fork highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(frontWX - 1.5, -12);
  ctx.lineTo(frontWX - 0.5, frontWY - wheelR + 2);
  ctx.stroke();

  // ── Fenders ──
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  // Front fender
  ctx.beginPath();
  ctx.arc(frontWX, wheelY, wheelR + 2, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.stroke();
  // Rear fender
  ctx.beginPath();
  ctx.arc(rearWX, wheelY, wheelR + 2, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.stroke();

  // ── Frame / Body (streamlined motorcycle shape with bezier curves) ──
  const frameGrad = ctx.createLinearGradient(-20, -20, 20, 0);
  frameGrad.addColorStop(0, '#222');
  frameGrad.addColorStop(0.5, '#333');
  frameGrad.addColorStop(1, '#252525');
  ctx.fillStyle = frameGrad;
  ctx.beginPath();
  ctx.moveTo(rearWX + 3, wheelY - 2);
  ctx.bezierCurveTo(rearWX + 6, -14, -10, -20, -4, -20);
  ctx.bezierCurveTo(2, -20, 8, -18, 12, -16);
  ctx.bezierCurveTo(16, -14, frontWX - 2, -10, frontWX - 1, wheelY - 4);
  ctx.lineTo(frontWX - 2, wheelY - 2);
  ctx.lineTo(rearWX + 3, wheelY - 2);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // ── Side panel (colored accent between engine and seat) ──
  const panelGrad = ctx.createLinearGradient(-6, -16, 6, -8);
  panelGrad.addColorStop(0, '#1e40af');
  panelGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.bezierCurveTo(-2, -17, 4, -15, 8, -12);
  ctx.lineTo(6, -6);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── Engine block (detailed) ──
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.roundRect(-9, -7, 16, 7, 1);
  ctx.fill();
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Cooling fins
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-7 + i * 3, -6);
    ctx.lineTo(-7 + i * 3, -1);
    ctx.stroke();
  }
  // Cylinder head accent
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.roundRect(-3, -9, 8, 3, 1);
  ctx.fill();

  // ── Chain / drive belt ──
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(-4, wheelY - 2);
  ctx.lineTo(rearWX + 2, wheelY);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Fuel tank (sculpted, with highlight) ──
  const tankGrad = ctx.createLinearGradient(-8, -22, 6, -14);
  tankGrad.addColorStop(0, '#1e40af');
  tankGrad.addColorStop(0.4, '#3b82f6');
  tankGrad.addColorStop(0.6, '#2563eb');
  tankGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = tankGrad;
  ctx.beginPath();
  ctx.ellipse(0, -16, 9, 4.5, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Tank shine (top highlight)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(-1, -18, 5, 1.5, -0.1, 0, Math.PI);
  ctx.fill();
  // Tank cap
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.arc(0, -20, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // ── Exhaust pipe (curved, with heat shimmer) ──
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.bezierCurveTo(-12, -2, -18, -1, -22, -5);
  ctx.bezierCurveTo(-24, -6, -26, -7, -27, -6);
  ctx.stroke();
  // Chrome highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.bezierCurveTo(-14, -3, -20, -2, -24, -6);
  ctx.stroke();
  // Exhaust tip
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.ellipse(-27, -6, 2.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.5;
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
  // Seat stitch line (divider between driver & passenger)
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-4, -20.5);
  ctx.lineTo(-4, -17.5);
  ctx.stroke();

  // ── Footpegs ──
  ctx.fillStyle = '#666';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  // Driver footpeg
  ctx.beginPath();
  ctx.roundRect(4, -1, 5, 2, 0.5);
  ctx.fill();
  ctx.stroke();
  // Passenger footpeg
  ctx.beginPath();
  ctx.roundRect(-10, -1, 5, 2, 0.5);
  ctx.fill();
  ctx.stroke();

  // ── Handlebar (with mirrors) — curves INWARD toward driver ──
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.quadraticCurveTo(8, -22, 5, -24);
  ctx.stroke();
  // Grips (rubber)
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(5, -24);
  ctx.lineTo(4, -25.5);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Mirror
  ctx.fillStyle = 'rgba(150,200,255,0.4)';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(3, -26.5, 2, 1.2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ── Rear rack (for delivery box) ──
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.lineTo(-22, -18);
  ctx.lineTo(-22, -16);
  ctx.stroke();

  // ── Orange delivery box (OTLOP) — drawn FIRST (behind characters) ──
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
  const flickerIntensity = 0.85 + Math.sin(g.elapsed * 8) * 0.1 + Math.sin(g.elapsed * 13) * 0.05;
  const showLight = bike.phase === 'idle' ? flickerIntensity > 0.82 : true;
  if (showLight) {
    const hlX = frontWX + 5;
    const hlY = -10;
    
    // ── Volumetric Light Cone (triangle from headlight forward) ──
    ctx.save();
    const coneLen = 50;
    const coneAngle = 0.22; // ~25° half-angle
    const coneGrad = ctx.createLinearGradient(hlX, hlY, hlX + coneLen, hlY);
    coneGrad.addColorStop(0, `rgba(255,255,200,${0.12 * flickerIntensity})`);
    coneGrad.addColorStop(0.4, `rgba(255,255,180,${0.06 * flickerIntensity})`);
    coneGrad.addColorStop(1, 'rgba(255,255,150,0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(hlX + 3, hlY);
    ctx.lineTo(hlX + coneLen, hlY - Math.sin(coneAngle) * coneLen);
    ctx.lineTo(hlX + coneLen, hlY + Math.sin(coneAngle) * coneLen + 8);
    ctx.closePath();
    ctx.fill();
    
    // ── Light Rays (oscillating thin lines inside cone) ──
    for (let r = 0; r < 4; r++) {
      const rayAngle = (r - 1.5) * 0.08 + Math.sin(g.elapsed * 1.5 + r * 2) * 0.03;
      const rayLen = 35 + r * 8;
      const rayAlpha = (0.06 + Math.sin(g.elapsed * 2 + r * 1.7) * 0.03) * flickerIntensity;
      ctx.strokeStyle = `rgba(255,255,220,${rayAlpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(hlX + 3, hlY);
      ctx.lineTo(hlX + Math.cos(rayAngle) * rayLen, hlY + Math.sin(rayAngle) * rayLen);
      ctx.stroke();
    }
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
    
    // ── Enhanced Bloom Layers (3 extra radial layers) ──
    const bloomLayers = [
      { r: 20, alpha: 0.06 },
      { r: 35, alpha: 0.035 },
      { r: 50, alpha: 0.018 },
    ];
    for (const bl of bloomLayers) {
      const bGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, bl.r);
      bGrad.addColorStop(0, `rgba(255,255,220,${bl.alpha * flickerIntensity})`);
      bGrad.addColorStop(0.5, `rgba(255,255,200,${bl.alpha * 0.4 * flickerIntensity})`);
      bGrad.addColorStop(1, 'rgba(255,255,180,0)');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(hlX, hlY, bl.r, 0, Math.PI * 2);
      ctx.fill();
    }
    
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

  // ── Tail Light — Physically correct RED with radial gradient bloom ──
  const isBraking = bike.phase === 'idle' || bike.speed < 30;
  const brakeIntensity = isBraking ? (0.8 + Math.sin(g.elapsed * 4) * 0.15) : 0.5;
  const tailX = rearWX - 2, tailY = -10;
  
  // Layer 1: Wide ambient red glow (bloom)
  const outerGlow = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, isBraking ? 14 : 8);
  outerGlow.addColorStop(0, `rgba(255,0,0,${brakeIntensity * 0.15})`);
  outerGlow.addColorStop(0.4, `rgba(200,0,0,${brakeIntensity * 0.08})`);
  outerGlow.addColorStop(1, 'rgba(150,0,0,0)');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.ellipse(tailX, tailY, isBraking ? 14 : 8, isBraking ? 7 : 4, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Layer 2: Core red glow
  const coreGlow = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, 4);
  coreGlow.addColorStop(0, `rgba(255,60,30,${brakeIntensity})`);
  coreGlow.addColorStop(0.5, `rgba(220,20,10,${brakeIntensity * 0.7})`);
  coreGlow.addColorStop(1, `rgba(180,0,0,${brakeIntensity * 0.2})`);
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.ellipse(tailX, tailY, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Layer 3: Hot center (bright red-orange filament)
  const hotCenter = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, 1.8);
  hotCenter.addColorStop(0, `rgba(255,120,80,${brakeIntensity * 0.9})`);
  hotCenter.addColorStop(0.6, `rgba(255,40,20,${brakeIntensity * 0.6})`);
  hotCenter.addColorStop(1, 'rgba(200,0,0,0)');
  ctx.fillStyle = hotCenter;
  ctx.beginPath();
  ctx.ellipse(tailX, tailY, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Layer 4: Specular highlight
  ctx.fillStyle = `rgba(255,180,160,${brakeIntensity * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(tailX + 0.5, tailY - 0.8, 0.8, 0.4, 0.3, 0, Math.PI * 2);
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

  // ── Dynamic Shadow (from overhead street light) ──
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  // Long shadow stretching to the right-back
  ctx.moveTo(-25, 5);
  ctx.lineTo(-40, 12);
  ctx.lineTo(10, 12);
  ctx.lineTo(25, 5);
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
}

function renderDeliveryBike(ctx: CanvasRenderingContext2D, g: GameData) {
  const bike = g.deliveryBike;
  if (!bike || !bike.active) return;
  renderMotorcycle(ctx, bike, g, false, false, 0);
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
    
    // Simple dismount: slide off behind bike, end exactly at gameplay idle pose
    // Final position must be: posX = final offset, posY = 0 (ground), arms/legs = 0 (idle)
    
    let posX: number, posY: number, armAnim: number, legAnim: number;
    
    if (dp < 0.4) {
      // Phase 1: Slide off the seat, moving behind bike
      const t = dp / 0.4;
      const smooth = t * t * (3 - 2 * t); // smoothstep
      posX = -6 - smooth * 20; // move behind
      posY = -smooth * 2; // slight lift then settle
      armAnim = 0;
      legAnim = smooth * 2;
    } else {
      // Phase 2: Settle to exact ground position (idle pose)
      const t = (dp - 0.4) / 0.6;
      const ease = 1 - Math.pow(1 - t, 3); // ease out
      posX = -26 - ease * 9; // settle to final position (-35)
      posY = -2 * (1 - ease); // ease to exactly 0 (ground)
      armAnim = 0; // idle pose
      legAnim = 2 * (1 - ease); // settle to 0 (idle)
    }
    
    const dismountX = bike.pos.x + posX;
    const dismountY = bike.pos.y + posY;

    ctx.save();
    ctx.translate(dismountX, dismountY);
    ctx.scale(1.6, 1.6); // Same scale as renderPlayer
    drawCharacter(ctx, {
      x: 0, y: 0, // Same as renderPlayer
      scale: 1, // Same as renderPlayer
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
  // Blue bottle shape
  const bw = s * 0.3, bh = s * 0.8;
  const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
  bg.addColorStop(0, '#0284c7');
  bg.addColorStop(0.3, '#38bdf8');
  bg.addColorStop(0.7, '#0ea5e9');
  bg.addColorStop(1, '#0284c7');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-bw, -bh * 0.3, bw * 2, bh * 0.8, 3);
  ctx.fill();
  // Cap
  ctx.fillStyle = '#fff';
  ctx.fillRect(-bw * 0.5, -bh * 0.5, bw, bh * 0.22);
  // Water drops
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(-bw * 0.2, -bh * 0.05, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Label
  ctx.fillStyle = '#fff';
  ctx.font = `${s * 0.18}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💧', 0, bh * 0.1);
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

  // Main title
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.shadowColor = 'rgba(251,191,36,0.3)';
  ctx.shadowBlur = 8;
  ctx.fillText('CHOOSE UPGRADE', g.width / 2, g.height * 0.20);
  ctx.shadowBlur = 0;

  // Arabic subtitle (RTL)
  ctx.fillStyle = 'rgba(251,191,36,0.6)';
  ctx.font = '15px Tajawal, Arial, sans-serif';
  ctx.direction = 'rtl';
  ctx.fillText('اختر ترقية', g.width / 2, g.height * 0.20 + 26);
  ctx.direction = 'ltr';
  ctx.restore();

  // ── Cards ──
  const cardW = 130, cardH = 185, gap = 12;
  const totalW = g.upgradeCards.length * cardW + (g.upgradeCards.length - 1) * gap;
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

    // ── Name (English) ──
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.name, cx + cardW / 2, cy + 105);

    // Arabic name — RTL with Tajawal font
    ctx.fillStyle = card.color;
    ctx.font = 'bold 13px Tajawal, Arial, sans-serif';
    ctx.direction = 'rtl';
    ctx.fillText(card.nameAr, cx + cardW / 2, cy + 126);
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
  renderIntroBike(ctx, g);
  renderGasClouds(ctx, g);
  renderDrones(ctx, g);
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

  // Lightning flash
  renderLightning(ctx, g);

  // Dynamic vignette — intensifies with low health (red)
  {
    const { width: vw, height: vh } = g;
    const cx = vw / 2, cy = vh / 2;
    const r = Math.max(vw, vh) * 0.7;
    const hpRatio = g.player.health / g.player.maxHealth;
    const dangerIntensity = Math.max(0, 1 - hpRatio * 2); // 0 above 50%, up to 1 at 0%
    const baseAlpha = 0.45 + dangerIntensity * 0.25;
    const redTint = dangerIntensity * 0.3;

    const vigGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(0.6, `rgba(${Math.round(redTint * 200)},0,0,0.08)`);
    vigGrad.addColorStop(1, `rgba(${Math.round(redTint * 200)},0,0,${baseAlpha})`);
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, vw, vh);
  }

  // Damage flash with chromatic aberration
  if (g.damageFlash > 0) {
    ctx.fillStyle = `rgba(200, 30, 30, ${g.damageFlash * 0.4})`;
    ctx.fillRect(0, 0, g.width, g.height);
    // Chromatic aberration effect — shift edges
    const abStr = Math.min(3, g.damageFlash * 6);
    if (abStr > 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = abStr * 0.06;
      // Red channel shift right
      ctx.fillStyle = 'rgba(255,0,0,1)';
      ctx.fillRect(abStr, 0, g.width, g.height);
      // Blue channel shift left
      ctx.fillStyle = 'rgba(0,0,255,1)';
      ctx.fillRect(-abStr, 0, g.width, g.height);
      ctx.restore();
    }
  }

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

  // Slow-mo screen tint
  if (g.slowMoTimer > 0) {
    const pulse = 0.08 + Math.sin(g.elapsed * 4) * 0.03;
    ctx.fillStyle = `rgba(6, 182, 212, ${pulse})`;
    ctx.fillRect(0, 0, g.width, g.height);
  }

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

    // "WAVE COMPLETE" text
    const textAlpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = textAlpha;
    ctx.textAlign = 'center';
    // English
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px Tajawal, Arial, sans-serif';
    ctx.shadowColor = 'rgba(251,191,36,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(`WAVE ${g.waveNumber} COMPLETE`, g.width / 2, g.height * 0.42);
    // Arabic
    ctx.fillStyle = 'rgba(251,191,36,0.7)';
    ctx.font = 'bold 18px Tajawal, Arial, sans-serif';
    ctx.direction = 'rtl';
    ctx.fillText(`انتهت الموجة ${g.waveNumber}`, g.width / 2, g.height * 0.42 + 32);
    ctx.direction = 'ltr';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
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

  // Sub text (English — LTR)
  ctx.direction = 'ltr';
  ctx.shadowBlur = 8;
  ctx.fillStyle = cw.color;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(cw.subText, w / 2, centerY + 28);

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

    // Sub text (English — LTR)
    ctx.direction = 'ltr';
    ctx.fillStyle = 'rgba(200,200,200,0.8)';
    ctx.font = '9px monospace';
    ctx.fillText(ww.subText, w / 2, y + 12);

    ctx.restore();
  }
}

// ─── Start Screen — Cinematic ─────────────────────────
export function renderStartScreen(ctx: CanvasRenderingContext2D, w: number, h: number, highScore: number) {
  const t = Date.now() / 1000;

  // Dark gradient background
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

  // Red glow at bottom
  const bottomGlow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.5);
  bottomGlow.addColorStop(0, 'rgba(180, 30, 20, 0.12)');
  bottomGlow.addColorStop(1, 'rgba(180, 30, 20, 0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // ─ SKYFALL metallic title ─
  ctx.save();
  ctx.textAlign = 'center';

  // Embossed shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = 'bold 44px monospace';
  ctx.fillText('SKYFALL', w / 2 + 2, h * 0.24 + 2);

  // Metallic gradient text
  const titleGrad = ctx.createLinearGradient(w / 2 - 100, h * 0.18, w / 2 + 100, h * 0.28);
  titleGrad.addColorStop(0, '#c0c0c0');
  titleGrad.addColorStop(0.3, '#f0e6d0');
  titleGrad.addColorStop(0.5, '#ffd700');
  titleGrad.addColorStop(0.7, '#f0e6d0');
  titleGrad.addColorStop(1, '#c0c0c0');
  ctx.fillStyle = titleGrad;
  ctx.shadowColor = 'rgba(255,200,50,0.3)';
  ctx.shadowBlur = 25;
  ctx.fillText('SKYFALL', w / 2, h * 0.24);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // SURVIVAL with red pulse
  const survPulse = 0.7 + Math.sin(t * 2.5) * 0.3;
  const survGrad = ctx.createLinearGradient(w / 2 - 60, 0, w / 2 + 60, 0);
  survGrad.addColorStop(0, `rgba(200, 40, 40, ${survPulse})`);
  survGrad.addColorStop(0.5, `rgba(239, 68, 68, ${survPulse})`);
  survGrad.addColorStop(1, `rgba(200, 40, 40, ${survPulse})`);
  ctx.fillStyle = survGrad;
  ctx.font = 'bold 18px monospace';
  ctx.fillText('SURVIVAL', w / 2, h * 0.30);
  ctx.restore();

  // Animated glowing divider
  const divPulse = 0.3 + Math.sin(t * 3) * 0.2;
  const divGrad = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
  divGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
  divGrad.addColorStop(0.5, `rgba(239, 68, 68, ${divPulse})`);
  divGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.35);
  ctx.lineTo(w * 0.85, h * 0.35);
  ctx.stroke();

  // Instructions
  ctx.fillStyle = 'rgba(180,180,180,0.6)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  const isMobile = 'ontouchstart' in window;
  if (isMobile) {
    ctx.fillText('Left side: Move  |  Right side: Dodge', w / 2, h * 0.42);
  } else {
    ctx.fillText('A/D: Move  |  Space: Dodge Roll', w / 2, h * 0.42);
  }

  // Power-up legend with colored dots
  const puLegend = [
    { icon: '♥', label: 'Medkit', color: '#22c55e' },
    { icon: '◆', label: 'Shield', color: '#60a5fa' },
    { icon: '⚡', label: 'Intercept', color: '#f97316' },
    { icon: '⏳', label: 'Slow-Mo', color: '#06b6d4' },
    { icon: '🧲', label: 'Magnet', color: '#94a3b8' },
    { icon: '⊕', label: 'Ammo', color: '#4a5c2a' },
  ];
  const cols = 3;
  const colW = w * 0.7 / cols;
  const startX = w * 0.15 + colW / 2;
  ctx.font = '10px monospace';
  puLegend.forEach((pu, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = startX + col * colW;
    const py = h * 0.49 + row * 18;
    // Colored dot
    ctx.fillStyle = pu.color;
    ctx.beginPath();
    ctx.arc(px - 30, py - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`${pu.icon} ${pu.label}`, px - 22, py);
  });
  ctx.textAlign = 'center';

  if (highScore > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px monospace';
    ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.62);
  }

  // Version
  ctx.fillStyle = 'rgba(100,100,100,0.4)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('v1.0', w - 12, h - 10);
  ctx.textAlign = 'center';

  // ─ TAP TO START button ─
  const btnW = 180, btnH = 38;
  const btnX = w / 2 - btnW / 2, btnY = h * 0.78 - btnH / 2;
  const btnPulse = 0.5 + Math.sin(t * 3) * 0.3;

  // Button glow
  ctx.shadowColor = `rgba(251, 191, 36, ${btnPulse * 0.4})`;
  ctx.shadowBlur = 20;
  // Button border
  const btnBorderGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnBorderGrad.addColorStop(0, `rgba(251, 191, 36, ${0.3 + btnPulse * 0.2})`);
  btnBorderGrad.addColorStop(0.5, `rgba(251, 191, 36, ${0.5 + btnPulse * 0.3})`);
  btnBorderGrad.addColorStop(1, `rgba(251, 191, 36, ${0.3 + btnPulse * 0.2})`);
  ctx.strokeStyle = btnBorderGrad;
  ctx.lineWidth = 1.5;
  roundRect(ctx, btnX, btnY, btnW, btnH, 8);
  ctx.stroke();
  // Button fill
  ctx.fillStyle = 'rgba(251, 191, 36, 0.06)';
  roundRect(ctx, btnX, btnY, btnW, btnH, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Button text
  ctx.fillStyle = `rgba(251, 191, 36, ${0.7 + btnPulse * 0.3})`;
  ctx.font = 'bold 15px monospace';
  ctx.fillText(isMobile ? 'TAP TO START' : 'PRESS ENTER', w / 2, h * 0.78 + 5);
}

// ─── Game Over — Cinematic ────────────────────────────
// Track when game over started for animations
let gameOverStartTime = 0;

export function renderGameOver(ctx: CanvasRenderingContext2D, w: number, h: number, score: number, highScore: number, stats?: GameData['stats']) {
  const now = Date.now() / 1000;
  if (gameOverStartTime === 0 || now - gameOverStartTime > 30) gameOverStartTime = now;
  const elapsed = now - gameOverStartTime;

  // Dark overlay with fade-in
  const overlayAlpha = Math.min(0.8, elapsed * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // Cracked screen effect — white cracks from center
  if (elapsed > 0.1 && elapsed < 2.0) {
    const crackAlpha = Math.min(0.4, (elapsed - 0.1) * 0.8) * Math.max(0, 1 - (elapsed - 0.5) / 1.5);
    ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha})`;
    ctx.lineWidth = 1.5;
    const cx = w / 2, cy = h / 2;
    // Generate deterministic cracks from center
    for (let i = 0; i < 8; i++) {
      const baseAngle = (i / 8) * Math.PI * 2 + 0.3;
      const len = Math.min(w, h) * (0.2 + Math.sin(i * 3.7) * 0.15);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let px = cx, py = cy;
      const segments = 4;
      for (let s = 0; s < segments; s++) {
        const t = (s + 1) / segments;
        const jitter = (Math.sin(i * 7 + s * 5.1) * 0.3);
        const nx = cx + Math.cos(baseAngle + jitter) * len * t;
        const ny = cy + Math.sin(baseAngle + jitter) * len * t;
        ctx.lineTo(nx, ny);
        px = nx; py = ny;
        // Branch crack
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

  // Only show content after initial fade
  if (elapsed < 0.2) return;

  ctx.textAlign = 'center';

  // GAME OVER title — fade in at 0.2s
  const titleAlpha = Math.min(1, (elapsed - 0.2) * 3);
  ctx.save();
  ctx.globalAlpha = titleAlpha;
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 32px monospace';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 20;
  ctx.fillText('GAME OVER', w / 2, h * 0.22);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();

  // Score with count-up animation — starts at 0.5s
  if (elapsed > 0.5) {
    const scoreAlpha = Math.min(1, (elapsed - 0.5) * 3);
    const countUpDuration = 1.5;
    const countProgress = Math.min(1, (elapsed - 0.5) / countUpDuration);
    const eased = 1 - Math.pow(1 - countProgress, 3); // ease-out cubic
    const displayScore = Math.floor(score * eased);

    ctx.save();
    ctx.globalAlpha = scoreAlpha;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${displayScore}`, w / 2, h * 0.34);
    ctx.fillStyle = 'rgba(150,150,150,0.6)';
    ctx.font = '10px monospace';
    ctx.fillText('SCORE', w / 2, h * 0.30);
    ctx.restore();
  }

  // High score — at 0.8s
  if (elapsed > 0.8) {
    const hsAlpha = Math.min(1, (elapsed - 0.8) * 3);
    ctx.save();
    ctx.globalAlpha = hsAlpha;
    if (score >= highScore && highScore > 0) {
      // Golden sparkle effect for new high score
      const sparkle = 0.7 + Math.sin(now * 6) * 0.3;
      ctx.fillStyle = `rgba(251, 191, 36, ${sparkle})`;
      ctx.font = 'bold 14px monospace';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 12;
      ctx.fillText('★ NEW HIGH SCORE ★', w / 2, h * 0.40);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.40);
    }
    ctx.restore();
  }

  // Stat cards — staggered from 1.2s
  if (stats && elapsed > 1.2) {
    const cardW = Math.min(200, w - 40);
    const cardX = (w - cardW) / 2;
    const statItems = [
      { icon: '⏱', label: 'Time', value: `${Math.floor(stats.timeSurvived)}s`, color: '#06b6d4' },
      { icon: '✕', label: 'Close Calls', value: `${stats.closeCalls}`, color: '#f97316' },
      { icon: '📦', label: 'Power-ups', value: `${stats.powerUpsCollected}`, color: '#22c55e' },
      { icon: '💀', label: 'Drones', value: `${stats.dronesDestroyed}`, color: '#ef4444' },
    ];
    if (stats.bossesDefeated > 0) {
      statItems.push({ icon: '⚔', label: 'Bosses', value: `${stats.bossesDefeated}`, color: '#fbbf24' });
    }

    statItems.forEach((st, i) => {
      const delay = 1.2 + i * 0.2;
      if (elapsed < delay) return;
      const cardAlpha = Math.min(1, (elapsed - delay) * 3);
      const slideX = (1 - Math.min(1, (elapsed - delay) * 4)) * 30;

      ctx.save();
      ctx.globalAlpha = cardAlpha;

      const cy = h * 0.47 + i * 32;

      // Card background
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, cardX - slideX, cy - 10, cardW, 26, 4);
      ctx.fill();
      // Left accent
      ctx.fillStyle = st.color;
      ctx.fillRect(cardX - slideX, cy - 10, 3, 26);

      // Icon + label
      ctx.fillStyle = st.color;
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${st.icon} ${st.label}`, cardX + 10 - slideX, cy + 5);
      // Value
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(st.value, cardX + cardW - 10 - slideX, cy + 5);

      ctx.restore();
    });
  }

  // Restart prompt — at 2.5s with prominent border
  if (elapsed > 2.5) {
    const restartAlpha = Math.min(1, (elapsed - 2.5) * 2);
    const pulse = 0.5 + Math.sin(now * 3) * 0.3;
    const isMobile = 'ontouchstart' in window;
    const btnText = isMobile ? 'TAP TO RESTART' : 'PRESS ENTER';
    const btnW = 170, btnH = 34;
    const btnX = w / 2 - btnW / 2, btnY = h * 0.85 - btnH / 2;

    ctx.save();
    ctx.globalAlpha = restartAlpha;

    // Button border with pulse
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.stroke();
    // Subtle fill
    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`;
    roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.fill();

    // Text
    ctx.globalAlpha = restartAlpha * (0.6 + pulse * 0.4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(btnText, w / 2, h * 0.85 + 5);
    ctx.restore();
  }
}
