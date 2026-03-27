import { GameData, Player } from './types';

const SKY_TOP = '#0c1445';
const SKY_BOTTOM = '#1a0a2e';
const GROUND_TOP = '#2a2520';
const GROUND_BOTTOM = '#1a1512';

// ─── Sky & Environment ────────────────────────────────
function renderSky(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const groundY = h * 0.78;

  // Gradient sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, SKY_TOP);
  skyGrad.addColorStop(0.6, '#1a1040');
  skyGrad.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 137.5 + 50) % w);
    const sy = ((i * 73.1 + 20) % (groundY * 0.5));
    const ss = 0.5 + (i % 3) * 0.5;
    const flicker = 0.3 + Math.sin(g.elapsed * 2 + i) * 0.3;
    ctx.globalAlpha = flicker;
    ctx.fillRect(sx, sy, ss, ss);
  }
  ctx.globalAlpha = 1;

  // Clouds
  for (const c of g.clouds) {
    ctx.fillStyle = `rgba(200, 200, 220, ${c.opacity})`;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.width * 0.25, c.y + 3, c.width * 0.35, c.height * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.width * 0.3, c.y + 2, c.width * 0.3, c.height * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderCitySilhouette(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w } = g;
  const groundY = g.height * 0.78;
  const baseY = groundY;

  // Far buildings (darker, smaller)
  ctx.fillStyle = '#0d0a15';
  const buildings = [
    { x: 0, bw: 40, bh: 80 }, { x: 50, bw: 30, bh: 60 }, { x: 90, bw: 50, bh: 110 },
    { x: 150, bw: 35, bh: 70 }, { x: 200, bw: 45, bh: 95 }, { x: 260, bw: 55, bh: 130 },
    { x: 330, bw: 30, bh: 55 }, { x: 370, bw: 40, bh: 85 }, { x: 420, bw: 60, bh: 140 },
    { x: 490, bw: 35, bh: 65 }, { x: 540, bw: 50, bh: 100 }, { x: 600, bw: 40, bh: 75 },
  ];

  for (const b of buildings) {
    const bx = b.x % w;
    ctx.fillRect(bx, baseY - b.bh, b.bw, b.bh);
    // Lit windows
    ctx.fillStyle = '#fbbf2430';
    for (let wy = baseY - b.bh + 8; wy < baseY - 10; wy += 12) {
      for (let wx = bx + 5; wx < bx + b.bw - 5; wx += 10) {
        if (Math.sin(wx * 3.7 + wy * 2.1 + g.elapsed * 0.1) > 0.3) {
          ctx.fillRect(wx, wy, 4, 5);
        }
      }
    }
    ctx.fillStyle = '#0d0a15';
  }

  // Near buildings (slightly lighter)
  ctx.fillStyle = '#15101e';
  const nearBuildings = [
    { x: 20, bw: 50, bh: 50 }, { x: 100, bw: 60, bh: 40 },
    { x: 300, bw: 70, bh: 45 }, { x: 450, bw: 55, bh: 35 },
  ];
  for (const b of nearBuildings) {
    const bx = b.x % w;
    ctx.fillRect(bx, baseY - b.bh, b.bw, b.bh);
  }
}

function renderGround(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const groundY = h * 0.78;

  // Ground gradient
  const grdGrad = ctx.createLinearGradient(0, groundY, 0, h);
  grdGrad.addColorStop(0, GROUND_TOP);
  grdGrad.addColorStop(0.3, '#221e18');
  grdGrad.addColorStop(1, GROUND_BOTTOM);
  ctx.fillStyle = grdGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Asphalt texture lines
  ctx.strokeStyle = 'rgba(60, 55, 45, 0.3)';
  ctx.lineWidth = 0.5;
  for (let y = groundY + 5; y < h; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < w; x += 6) {
      ctx.lineTo(x, y + Math.sin(x * 0.15 + y * 0.3) * 1.5);
    }
    ctx.stroke();
  }

  // Cracks
  ctx.strokeStyle = 'rgba(80, 70, 55, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const cx = (i * 97 + 30) % w;
    const cy = groundY + 10 + (i * 31) % 40;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 15 + i * 3, cy + 5);
    ctx.lineTo(cx + 25, cy - 3);
    ctx.stroke();
  }

  // Ground line highlight
  ctx.strokeStyle = 'rgba(100, 90, 70, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
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
    // Ring
    ctx.strokeStyle = `rgba(80, 60, 30, ${alpha * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, c.size * 1.2, c.size * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
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
      ctx.rotate(hz.rotation);
      // Bomb body — dark sphere with fuse
      const bombGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, hz.size);
      bombGrad.addColorStop(0, '#555');
      bombGrad.addColorStop(0.7, '#222');
      bombGrad.addColorStop(1, '#111');
      ctx.fillStyle = bombGrad;
      ctx.beginPath();
      ctx.arc(0, 0, hz.size, 0, Math.PI * 2);
      ctx.fill();
      // Metallic highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(-hz.size * 0.3, -hz.size * 0.3, hz.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Fuse on top
      ctx.strokeStyle = '#8B7355';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -hz.size);
      ctx.quadraticCurveTo(4, -hz.size - 6, 2, -hz.size - 10);
      ctx.stroke();
      // Spark at fuse tip
      const sparkSize = 2 + Math.sin(g.elapsed * 20) * 1.5;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(2, -hz.size - 10, sparkSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(2, -hz.size - 10, sparkSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Warning band
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, hz.size * 0.7, -0.3, Math.PI + 0.3);
      ctx.stroke();
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
    } else {
      // Smoke ring
      const smokeSize = e.size * (1.5 + progress);
      const smokeAlpha = 0.3 * (1 - progress);
      ctx.strokeStyle = `rgba(80, 70, 60, ${smokeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, smokeSize, 0, Math.PI * 2);
      ctx.stroke();
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

    ctx.restore();
  }
}

// ─── Power-ups ────────────────────────────────────────
function renderPowerUps(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const pu of g.powerUps) {
    if (!pu.active) continue;

    // Fade out when about to expire on ground
    let fadeAlpha = 1;
    if (!pu.parachuting) {
      const maxGroundTime = Math.max(1.5, 3 - (g.difficulty - 1) * 0.3);
      const remaining = maxGroundTime - pu.groundTimer;
      if (remaining < 1.5) {
        // Blink effect in last 1.5s
        fadeAlpha = remaining < 0.8 ? (Math.sin(g.elapsed * 16) * 0.5 + 0.5) : 0.6 + remaining * 0.27;
      }
    }

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(pu.pos.x, pu.pos.y);
    const bob = Math.sin(pu.bobTimer * 3) * 3;
    ctx.translate(0, bob);

    if (pu.parachuting) {
      // Better parachute — dome shape with panels
      const canopyW = 22, canopyH = 14;
      // Main canopy
      ctx.fillStyle = pu.type === 'medkit' ? 'rgba(34, 197, 94, 0.5)' :
                      pu.type === 'shield' ? 'rgba(96, 165, 250, 0.5)' :
                      pu.type === 'slowmo' ? 'rgba(6, 182, 212, 0.5)' :
                      pu.type === 'magnet' ? 'rgba(239, 68, 68, 0.5)' :
                      pu.type === 'airstrike' ? 'rgba(251, 191, 36, 0.5)' :
                      'rgba(249, 115, 22, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, -26, canopyW, canopyH, 0, Math.PI, 0);
      ctx.fill();
      // Canopy outline
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Panel lines
      ctx.beginPath();
      ctx.moveTo(-11, -26); ctx.lineTo(-8, -38);
      ctx.moveTo(0, -26); ctx.lineTo(0, -40);
      ctx.moveTo(11, -26); ctx.lineTo(8, -38);
      ctx.stroke();
      // Strings
      ctx.strokeStyle = 'rgba(200,200,200,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.lineTo(-18, -26);
      ctx.moveTo(8, -4); ctx.lineTo(18, -26);
      ctx.moveTo(-2, -6); ctx.lineTo(-5, -26);
      ctx.moveTo(2, -6); ctx.lineTo(5, -26);
      ctx.stroke();
    }

    let color = '#22c55e';
    let icon = '♥';
    if (pu.type === 'shield') { color = '#60a5fa'; icon = '◆'; }
    if (pu.type === 'interceptor') { color = '#f97316'; icon = '⚡'; }
    if (pu.type === 'ammo') { color = '#a855f7'; icon = '⊕'; }
    if (pu.type === 'slowmo') { color = '#06b6d4'; icon = '⏳'; }
    if (pu.type === 'magnet') { color = '#ef4444'; icon = '🧲'; }
    if (pu.type === 'airstrike') { color = '#fbbf24'; icon = '✈'; }

    // Glow
    const glowGrad = ctx.createRadialGradient(0, 0, pu.size * 0.5, 0, 0, pu.size * 2.5);
    glowGrad.addColorStop(0, `${color}50`);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, pu.size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Item circle with border
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, pu.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Icon
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${pu.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 1);

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
      // SCOUT: Small quadcopter — 4 arms with rotors
      const armLen = d.size * 1.2;
      // Central body
      const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size * 0.6);
      bodyGrad.addColorStop(0, '#555');
      bodyGrad.addColorStop(1, '#333');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size * 0.5, d.size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 4 arms
      const propAngle = g.elapsed * 25;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const armA = (Math.PI / 2) * i + Math.PI / 4;
        const ax = Math.cos(armA) * armLen;
        const ay = Math.sin(armA) * armLen * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // Rotor disc
        ctx.strokeStyle = `rgba(180,180,180,${0.3 + Math.sin(propAngle + i * 2) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(ax, ay, d.size * 0.4, d.size * 0.15, propAngle + i, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
      }

      // LED indicator
      const ledBlink = Math.sin(g.elapsed * 4) > 0;
      ctx.fillStyle = ledBlink ? '#22c55e' : '#1a5c30';
      ctx.beginPath();
      ctx.arc(0, -d.size * 0.15, 1.5, 0, Math.PI * 2);
      ctx.fill();

    } else if (d.tier === 'tracker') {
      // TRACKER: Sleek military drone — elongated body with swept wings
      const dir = facingRight ? 1 : -1;
      // Main body (fuselage)
      const bodyGrad = ctx.createLinearGradient(0, -d.size * 0.3, 0, d.size * 0.3);
      bodyGrad.addColorStop(0, '#4a4a4a');
      bodyGrad.addColorStop(0.5, '#2a2a2a');
      bodyGrad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 1.3, 0);  // nose
      ctx.lineTo(dir * d.size * 0.3, -d.size * 0.25);
      ctx.lineTo(-dir * d.size, -d.size * 0.2);
      ctx.lineTo(-dir * d.size * 1.1, 0);
      ctx.lineTo(-dir * d.size, d.size * 0.2);
      ctx.lineTo(dir * d.size * 0.3, d.size * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Wings
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(0, -d.size * 0.2);
      ctx.lineTo(-dir * d.size * 0.4, -d.size * 0.9);
      ctx.lineTo(-dir * d.size * 0.8, -d.size * 0.7);
      ctx.lineTo(-dir * d.size * 0.3, -d.size * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, d.size * 0.2);
      ctx.lineTo(-dir * d.size * 0.4, d.size * 0.9);
      ctx.lineTo(-dir * d.size * 0.8, d.size * 0.7);
      ctx.lineTo(-dir * d.size * 0.3, d.size * 0.2);
      ctx.fill();

      // Tail fins
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.moveTo(-dir * d.size * 0.9, 0);
      ctx.lineTo(-dir * d.size * 1.2, -d.size * 0.4);
      ctx.lineTo(-dir * d.size * 1.1, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-dir * d.size * 0.9, 0);
      ctx.lineTo(-dir * d.size * 1.2, d.size * 0.4);
      ctx.lineTo(-dir * d.size * 1.1, 0);
      ctx.fill();

      // Engine glow
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(-dir * d.size * 1.05, 0, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Red targeting eye
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(dir * d.size * 0.8, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

    } else {
      // BOMBER: Heavy military drone — large body with bomb bay
      const dir = facingRight ? 1 : -1;
      // Heavy fuselage
      const bodyGrad = ctx.createLinearGradient(0, -d.size * 0.4, 0, d.size * 0.4);
      bodyGrad.addColorStop(0, '#3d3530');
      bodyGrad.addColorStop(0.5, '#2a2420');
      bodyGrad.addColorStop(1, '#1a1510');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 1.2, 0);
      ctx.lineTo(dir * d.size * 0.5, -d.size * 0.4);
      ctx.lineTo(-dir * d.size * 0.8, -d.size * 0.35);
      ctx.lineTo(-dir * d.size * 1.0, 0);
      ctx.lineTo(-dir * d.size * 0.8, d.size * 0.4);
      ctx.lineTo(dir * d.size * 0.5, d.size * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4a4035';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Wide wings
      ctx.fillStyle = '#2a2420';
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.2, -d.size * 0.35);
      ctx.lineTo(-dir * d.size * 0.2, -d.size * 1.3);
      ctx.lineTo(-dir * d.size * 0.7, -d.size * 1.1);
      ctx.lineTo(-dir * d.size * 0.5, -d.size * 0.35);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.2, d.size * 0.4);
      ctx.lineTo(-dir * d.size * 0.2, d.size * 1.3);
      ctx.lineTo(-dir * d.size * 0.7, d.size * 1.1);
      ctx.lineTo(-dir * d.size * 0.5, d.size * 0.4);
      ctx.fill();

      // Bomb bay indicator (underside glow)
      const bombReady = d.bombTimer >= d.bombCooldown * 0.8;
      if (bombReady) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, d.size * 0.3, d.size * 0.4, d.size * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dual engines
      ctx.fillStyle = '#f97316';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.ellipse(-dir * d.size * 0.95, -d.size * 0.15, 2.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-dir * d.size * 0.95, d.size * 0.15, 2.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Warning stripes
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dir * d.size * 0.1, -d.size * 0.35);
      ctx.lineTo(dir * d.size * 0.1, d.size * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);

      // Red eye
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(dir * d.size * 0.9, 0, 3, 0, Math.PI * 2);
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

  // Shadow on ground
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, p.size + 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const scale = p.facingRight ? 1 : -1;
  ctx.scale(scale, 1);

  // Hit flash
  const isHit = p.hitTimer > 0;
  const bodyColor = isHit ? '#ef4444' : '#3b82f6';
  const skinColor = isHit ? '#fca5a5' : '#f5d0a9';
  const pantsColor = '#1e3a5f';
  const shoeColor = '#2d2d2d';

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
    ctx.rotate(lean);
  }

  const headY = -32 + bodyBob;
  const bodyTopY = -24 + bodyBob;
  const bodyBottomY = -8 + bodyBob;

  // ─ Legs ─
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Back leg
  ctx.strokeStyle = pantsColor;
  ctx.beginPath();
  ctx.moveTo(-2, bodyBottomY);
  ctx.lineTo(-3 - legOffset, bodyBottomY + 10);
  ctx.lineTo(-2 - legOffset * 0.5, -1);
  ctx.stroke();
  ctx.strokeStyle = shoeColor;
  ctx.beginPath();
  ctx.moveTo(-2 - legOffset * 0.5, -1);
  ctx.lineTo(-1 - legOffset * 0.3, 1);
  ctx.stroke();

  // Front leg
  ctx.strokeStyle = pantsColor;
  ctx.beginPath();
  ctx.moveTo(2, bodyBottomY);
  ctx.lineTo(3 + legOffset, bodyBottomY + 10);
  ctx.lineTo(2 + legOffset * 0.5, -1);
  ctx.stroke();
  ctx.strokeStyle = shoeColor;
  ctx.beginPath();
  ctx.moveTo(2 + legOffset * 0.5, -1);
  ctx.lineTo(3 + legOffset * 0.3, 1);
  ctx.stroke();

  // ─ Torso ─
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-6, bodyTopY);
  ctx.lineTo(6, bodyTopY);
  ctx.lineTo(5, bodyBottomY);
  ctx.lineTo(-5, bodyBottomY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ─ Arms ─
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // Back arm
  ctx.strokeStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-5, bodyTopY + 3);
  ctx.lineTo(-8 + armOffset, bodyTopY + 14);
  ctx.stroke();
  ctx.strokeStyle = skinColor;
  ctx.beginPath();
  ctx.moveTo(-8 + armOffset, bodyTopY + 14);
  ctx.lineTo(-7 + armOffset * 0.5, bodyTopY + 19);
  ctx.stroke();

  // Front arm
  ctx.strokeStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(5, bodyTopY + 3);
  ctx.lineTo(8 - armOffset, bodyTopY + 14);
  ctx.stroke();
  ctx.strokeStyle = skinColor;
  ctx.beginPath();
  ctx.moveTo(8 - armOffset, bodyTopY + 14);
  ctx.lineTo(7 - armOffset * 0.5, bodyTopY + 19);
  ctx.stroke();

  // ─ Head ─
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(0, headY, 6, 0, Math.PI * 2);
  ctx.fill();
  // Hair/helmet
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, headY - 1.5, 6.5, Math.PI, 0);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(2, headY - 1, 2, 2);

  // Shield aura
  if (p.shielded) {
    ctx.scale(scale, 1); // undo facing for symmetry
    ctx.beginPath();
    ctx.arc(0, -16, p.size + 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(96, 165, 250, ${0.4 + Math.sin(g.elapsed * 5) * 0.2})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(96, 165, 250, 0.08)';
    ctx.fill();
  }

  ctx.restore();
}

// ─── Bullets ──────────────────────────────────────────
function renderBullets(ctx: CanvasRenderingContext2D, g: GameData) {
  for (const b of g.bullets) {
    if (!b.active) continue;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    // Glow
    ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, b.size * 3, 0, Math.PI * 2);
    ctx.fill();
    // Bullet tracer
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(0, 0, b.size * 0.8, b.size * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Core
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 0, b.size * 0.3, b.size * 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Trail
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.beginPath();
    ctx.ellipse(0, b.size * 4, b.size * 0.5, b.size * 5, 0, 0, Math.PI * 2);
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
    ctx.fillRect(pt.pos.x - pt.size / 2, pt.pos.y - pt.size / 2, pt.size, pt.size);
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

// ─── HUD ──────────────────────────────────────────────
function renderHUD(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;
  const p = g.player;

  // Health bar with gradient
  const barW = 140, barH = 12, barX = 14, barY = 14;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 3);
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
  roundRect(ctx, barX, barY, barW * healthRatio, barH, 2);
  ctx.fill();

  // Health icon
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`♥ ${Math.ceil(p.health)}`, barX + 4, barY + barH - 2);

  // Score (right side)
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${g.score}`, w - 14, 28);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText(`HI: ${g.highScore}`, w - 14, 42);

  // Wave
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  // Wave progress bar
  const waveNum = Math.floor(g.difficulty);
  const waveProgress = g.difficulty - waveNum;
  ctx.fillText(`WAVE ${waveNum}`, 14, 42);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
  ctx.fillRect(14, 46, 60, 3);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(14, 46, 60 * waveProgress, 3);

  // Dash indicator
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

  // Shield indicator moved to active effects section below

  // Ammo indicator with bullet level
  if (p.ammo > 0) {
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    const lvlText = g.bulletLevel > 1 ? ` ×${g.bulletLevel}` : '';
    ctx.fillText(`⊕ ${p.ammo}${lvlText}`, w / 2, h - 14);
  }

  // Bullet level indicator
  if (g.bulletLevel > 1) {
    ctx.fillStyle = g.bulletLevel >= 3 ? '#fbbf24' : '#22c55e';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SHOT LV.${g.bulletLevel}`, 14, 62);
  }

  // Active effect indicators (left side, below wave)
  let effectY = 72;
  if (g.slowMoTimer > 0) {
    const blink = g.slowMoTimer < 1.5 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`⏳ SLOW ${g.slowMoTimer.toFixed(1)}s`, 14, effectY);
    // Progress bar
    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.fillRect(14, effectY + 2, 60, 3);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(14, effectY + 2, 60 * (g.slowMoTimer / 5), 3);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  if (g.magnetTimer > 0) {
    const blink = g.magnetTimer < 2 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`🧲 MAGNET ${g.magnetTimer.toFixed(1)}s`, 14, effectY);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(14, effectY + 2, 60, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(14, effectY + 2, 60 * (g.magnetTimer / 8), 3);
    ctx.globalAlpha = 1;
    effectY += 18;
  }
  if (p.shielded) {
    const blink = p.shieldTimer < 2 ? (Math.sin(g.elapsed * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`◆ SHIELD ${p.shieldTimer.toFixed(1)}s`, 14, effectY);
    ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
    ctx.fillRect(14, effectY + 2, 60, 3);
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(14, effectY + 2, 60 * (p.shieldTimer / 8), 3);
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

// ─── Player Glow (ambient lighting) ──────────────────
function renderPlayerGlow(ctx: CanvasRenderingContext2D, g: GameData) {
  const p = g.player;
  const glowGrad = ctx.createRadialGradient(p.pos.x, p.pos.y - 10, 5, p.pos.x, p.pos.y - 10, 60);
  glowGrad.addColorStop(0, 'rgba(100, 150, 255, 0.04)');
  glowGrad.addColorStop(1, 'rgba(100, 150, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y - 10, 60, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Main Render ──────────────────────────────────────
export function render(ctx: CanvasRenderingContext2D, g: GameData) {
  ctx.save();
  ctx.translate(g.screenShake.x - g.camera.x, g.screenShake.y);

  renderSky(ctx, g);
  renderCitySilhouette(ctx, g);
  renderGround(ctx, g);
  renderCraters(ctx, g);
  renderAmbient(ctx, g);
  renderWarnings(ctx, g);
  renderSmokeTrails(ctx, g);
  renderHazards(ctx, g);
  renderExplosions(ctx, g);
  renderPowerUps(ctx, g);
  renderDrones(ctx, g);
  renderBoss(ctx, g);
  renderBullets(ctx, g);
  renderPlayerGlow(ctx, g);
  renderPlayer(ctx, g);
  renderParticles(ctx, g);
  renderRain(ctx, g);
  renderFloatingTexts(ctx, g);

  ctx.restore();

  // Lightning flash
  renderLightning(ctx, g);

  // Damage flash (full screen, no shake)
  if (g.damageFlash > 0) {
    ctx.fillStyle = `rgba(200, 30, 30, ${g.damageFlash * 0.4})`;
    ctx.fillRect(0, 0, g.width, g.height);
  }

  // Slow-mo screen tint
  if (g.slowMoTimer > 0) {
    const pulse = 0.08 + Math.sin(g.elapsed * 4) * 0.03;
    ctx.fillStyle = `rgba(6, 182, 212, ${pulse})`;
    ctx.fillRect(0, 0, g.width, g.height);
  }

  // Magnet attraction lines
  if (g.magnetTimer > 0) {
    const p = g.player;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    for (const pu of g.powerUps) {
      if (!pu.active) continue;
      const d = Math.sqrt((pu.pos.x - p.pos.x) ** 2 + (pu.pos.y - p.pos.y) ** 2);
      if (d < g.width * 0.5) {
        ctx.beginPath();
        ctx.moveTo(p.pos.x - g.camera.x + g.screenShake.x, p.pos.y + g.screenShake.y);
        ctx.lineTo(pu.pos.x - g.camera.x + g.screenShake.x, pu.pos.y + g.screenShake.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // HUD (no shake)
  renderHUD(ctx, g);

  // Wave warnings (cinematic banner at top)
  renderWaveWarnings(ctx, g);
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

    // Main text
    ctx.textAlign = 'center';
    ctx.fillStyle = ww.color;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(ww.text, w / 2, y - 2);

    // Sub text
    ctx.fillStyle = 'rgba(200,200,200,0.8)';
    ctx.font = '9px monospace';
    ctx.fillText(ww.subText, w / 2, y + 12);

    ctx.restore();
  }
}

// ─── Start Screen ─────────────────────────────────────
export function renderStartScreen(ctx: CanvasRenderingContext2D, w: number, h: number, highScore: number) {
  // Dark scene
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a0a1a');
  bg.addColorStop(0.5, '#1a0a2e');
  bg.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Animated falling missiles in background
  const t = Date.now() / 1000;
  for (let i = 0; i < 8; i++) {
    const mx = (w * 0.1) + (w * 0.8 / 7) * i;
    const my = ((t * 40 + i * 100) % (h + 40)) - 20;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI * 0.75);
    ctx.fillStyle = 'rgba(100, 100, 120, 0.15)';
    ctx.fillRect(-3, -10, 6, 20);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
    ctx.fillRect(-2, 8, 4, 8);
    ctx.restore();
  }

  // Title
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 20;
  ctx.fillText('SKYFALL', w / 2, h * 0.25);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SURVIVAL', w / 2, h * 0.31);

  // Divider
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.36);
  ctx.lineTo(w * 0.7, h * 0.36);
  ctx.stroke();

  // Instructions
  ctx.fillStyle = '#888';
  ctx.font = '12px monospace';
  const isMobile = 'ontouchstart' in window;
  if (isMobile) {
    ctx.fillText('Left side: Move', w / 2, h * 0.46);
    ctx.fillText('Right side: Dodge roll', w / 2, h * 0.51);
  } else {
    ctx.fillText('A/D or ←/→: Move', w / 2, h * 0.46);
    ctx.fillText('Space: Dodge Roll', w / 2, h * 0.51);
  }

  // Power-up legend
  ctx.font = '10px monospace';
  ctx.fillStyle = '#22c55e';
  ctx.fillText('♥ Medkit', w / 2 - 90, h * 0.58);
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('◆ Shield', w / 2, h * 0.58);
  ctx.fillStyle = '#f97316';
  ctx.fillText('⚡ Intercept', w / 2 + 90, h * 0.58);
  ctx.fillStyle = '#06b6d4';
  ctx.fillText('⏳ Slow-Mo', w / 2 - 60, h * 0.63);
  ctx.fillStyle = '#ef4444';
  ctx.fillText('🧲 Magnet', w / 2 + 60, h * 0.63);

  if (highScore > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '13px monospace';
    ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.70);
  }

  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(t * 3) * 0.3})`;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(isMobile ? 'TAP TO START' : 'PRESS ENTER', w / 2, h * 0.82);
}

// ─── Game Over ────────────────────────────────────────
export function renderGameOver(ctx: CanvasRenderingContext2D, w: number, h: number, score: number, highScore: number, stats?: GameData['stats']) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 15;
  ctx.fillText('GAME OVER', w / 2, h * 0.28);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`Score: ${score}`, w / 2, h * 0.40);

  if (score >= highScore && highScore > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('★ NEW HIGH SCORE ★', w / 2, h * 0.47);
  } else {
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.47);
  }

  // Stats
  if (stats) {
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    const statY = h * 0.55;
    ctx.fillText(`Time: ${Math.floor(stats.timeSurvived)}s`, w / 2, statY);
    ctx.fillText(`Close Calls: ${stats.closeCalls}`, w / 2, statY + 18);
    ctx.fillText(`Power-ups: ${stats.powerUpsCollected}`, w / 2, statY + 36);
    ctx.fillText(`Drones: ${stats.dronesDestroyed}`, w / 2, statY + 54);
    if (stats.bossesDefeated > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Bosses: ${stats.bossesDefeated}`, w / 2, statY + 72);
    }
  }

  const t = Date.now() / 1000;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(t * 3) * 0.3})`;
  ctx.font = 'bold 14px monospace';
  const isMobile = 'ontouchstart' in window;
  ctx.fillText(isMobile ? 'TAP TO RESTART' : 'PRESS ENTER', w / 2, h * 0.85);
}
