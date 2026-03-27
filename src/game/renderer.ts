import { GameData } from './types';

const GROUND_COLOR = '#2a2a2a';
const GROUND_LINE = '#333';

export function render(ctx: CanvasRenderingContext2D, g: GameData) {
  const { width: w, height: h } = g;

  ctx.save();
  ctx.translate(g.screenShake.x, g.screenShake.y);

  // Ground
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, w, h);
  // Ground texture lines
  ctx.strokeStyle = GROUND_LINE;
  ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < w; x += 10) {
      ctx.lineTo(x, y + (Math.sin(x * 0.1 + y) * 2));
    }
    ctx.stroke();
  }

  // Craters
  for (const c of g.craters) {
    const alpha = c.life / c.maxLife * 0.6;
    ctx.fillStyle = `rgba(20, 20, 20, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, c.size, c.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(60, 60, 60, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Warning indicators
  for (const hz of g.hazards) {
    if (!hz.active || hz.falling) continue;
    const progress = 1 - hz.warningTimer / hz.warningDuration;
    const radius = hz.size * 2 * progress;
    const alpha = 0.3 + progress * 0.4;
    ctx.beginPath();
    ctx.arc(hz.targetPos.x, hz.targetPos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
    ctx.fill();
    // Pulsing ring
    ctx.beginPath();
    ctx.arc(hz.targetPos.x, hz.targetPos.y, radius + 5 * Math.sin(progress * 10), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Falling hazards
  for (const hz of g.hazards) {
    if (!hz.active || !hz.falling) continue;
    ctx.save();
    ctx.translate(hz.pos.x, hz.pos.y);
    
    if (hz.type === 'missile') {
      // Missile body
      const angle = Math.atan2(hz.targetPos.y - hz.pos.y, hz.targetPos.x - hz.pos.x);
      ctx.rotate(angle);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(-hz.size, -hz.size * 0.4, hz.size * 2, hz.size * 0.8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hz.size * 0.6, -hz.size * 0.3, hz.size * 0.5, hz.size * 0.6);
      // Flame trail
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-hz.size, 0);
      ctx.lineTo(-hz.size - 8 - Math.random() * 6, -4);
      ctx.lineTo(-hz.size - 8 - Math.random() * 6, 4);
      ctx.fill();
    } else if (hz.type === 'cluster') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, 0, hz.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.font = `bold ${hz.size}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', 0, 0);
    } else {
      // Shrapnel
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      const points = 5;
      for (let i = 0; i < points; i++) {
        const a = (Math.PI * 2 / points) * i + g.elapsed * 5;
        const r = hz.size * (i % 2 === 0 ? 1 : 0.5);
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Power-ups
  for (const pu of g.powerUps) {
    if (!pu.active) continue;
    ctx.save();
    ctx.translate(pu.pos.x, pu.pos.y);
    const bob = Math.sin(pu.bobTimer * 3) * 3;
    ctx.translate(0, bob);

    // Parachute
    if (pu.parachuting) {
      ctx.strokeStyle = '#a3a3a3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, -2); ctx.lineTo(-12, -20);
      ctx.moveTo(8, -2); ctx.lineTo(12, -20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(0, -22, 14, Math.PI, 0);
      ctx.fill();
    }

    // Item
    let color = '#22c55e';
    let icon = '♥';
    if (pu.type === 'shield') { color = '#60a5fa'; icon = '◆'; }
    if (pu.type === 'interceptor') { color = '#f97316'; icon = '⚡'; }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, pu.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${pu.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 1);
    
    // Glow
    ctx.beginPath();
    ctx.arc(0, 0, pu.size + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `${color}80`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // Drones
  for (const d of g.drones) {
    if (!d.active) continue;
    ctx.save();
    ctx.translate(d.pos.x, d.pos.y);
    // Body
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.arc(0, 0, d.size, 0, Math.PI * 2);
    ctx.fill();
    // Eye glow
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, d.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Propeller lines
    const propAngle = g.elapsed * 15;
    ctx.strokeStyle = '#a3a3a3';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = propAngle + (Math.PI / 2) * i;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * d.size * 1.3, Math.sin(a) * d.size * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Player
  const p = g.player;
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);

  // Shield aura
  if (p.shielded) {
    ctx.beginPath();
    ctx.arc(0, 0, p.size + 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(96, 165, 250, ${0.5 + Math.sin(g.elapsed * 5) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = `rgba(96, 165, 250, 0.1)`;
    ctx.fill();
  }

  // Dash trail
  if (p.isDashing) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.3)';
    ctx.beginPath();
    ctx.arc(-p.dashDir.x * 15, -p.dashDir.y * 15, p.size + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player body
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(0, 0, p.size, 0, Math.PI * 2);
  ctx.fill();
  // Inner detail
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(0, -2, p.size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Border
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.size, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Particles
  for (const pt of g.particles) {
    if (!pt.active) continue;
    const alpha = pt.life / pt.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.pos.x - pt.size / 2, pt.pos.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // Floating texts
  for (const ft of g.floatingTexts) {
    const alpha = ft.life / ft.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // screen shake

  // Damage flash
  if (g.damageFlash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${g.damageFlash * 0.5})`;
    ctx.fillRect(0, 0, w, h);
  }

  // === HUD ===
  // Health bar
  const barW = 160, barH = 14, barX = 15, barY = 15;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
  const healthRatio = p.health / p.maxHealth;
  const healthColor = healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillStyle = healthColor;
  ctx.fillRect(barX, barY, barW * healthRatio, barH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2, barY - 2, barW + 4, barH + 4);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(p.health)}/${p.maxHealth}`, barX + barW / 2, barY + barH - 2);

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${g.score}`, w - 15, 30);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`HI: ${g.highScore}`, w - 15, 46);

  // Difficulty
  ctx.fillStyle = '#fbbf24';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`WAVE ${g.difficulty}`, 15, 46);

  // Dash cooldown indicator
  if (p.dashCooldown > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`DASH ${p.dashCooldown.toFixed(1)}s`, w - 15, h - 15);
  } else {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('DASH READY', w - 15, h - 15);
  }

  // Shield indicator
  if (p.shielded) {
    ctx.fillStyle = '#60a5fa';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SHIELD ${p.shieldTimer.toFixed(1)}s`, 15, h - 15);
  }
}

export function renderStartScreen(ctx: CanvasRenderingContext2D, w: number, h: number, highScore: number) {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SKYFALL', w / 2, h * 0.28);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('SURVIVAL', w / 2, h * 0.35);

  // Decorative missiles
  const t = Date.now() / 1000;
  for (let i = 0; i < 5; i++) {
    const mx = (w * 0.15) + (w * 0.7 / 4) * i;
    const my = (h * 0.15 + Math.sin(t + i) * 20);
    ctx.fillStyle = '#6b728080';
    ctx.fillRect(mx - 3, my, 6, 16);
    ctx.fillStyle = '#ef444480';
    ctx.fillRect(mx - 2, my + 12, 4, 6);
  }

  // Instructions
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '13px monospace';
  const isMobile = 'ontouchstart' in window;
  if (isMobile) {
    ctx.fillText('Left side: Move joystick', w / 2, h * 0.50);
    ctx.fillText('Right side: Tap to dash', w / 2, h * 0.55);
  } else {
    ctx.fillText('WASD / Arrows: Move', w / 2, h * 0.50);
    ctx.fillText('Space: Dash', w / 2, h * 0.55);
  }

  // Power-up legend
  ctx.font = '11px monospace';
  ctx.fillStyle = '#22c55e';
  ctx.fillText('♥ Medkit   ', w / 2 - 60, h * 0.64);
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('◆ Shield   ', w / 2, h * 0.64);
  ctx.fillStyle = '#f97316';
  ctx.fillText('⚡ Intercept', w / 2 + 70, h * 0.64);

  if (highScore > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '14px monospace';
    ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.73);
  }

  // Start prompt
  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(t * 3) * 0.3})`;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(isMobile ? 'TAP TO START' : 'PRESS ENTER', w / 2, h * 0.83);
}

export function renderGameOver(ctx: CanvasRenderingContext2D, w: number, h: number, score: number, highScore: number) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', w / 2, h * 0.35);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`Score: ${score}`, w / 2, h * 0.46);

  if (score >= highScore && highScore > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('★ NEW HIGH SCORE ★', w / 2, h * 0.54);
  } else {
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '14px monospace';
    ctx.fillText(`Best: ${highScore}`, w / 2, h * 0.54);
  }

  const t = Date.now() / 1000;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(t * 3) * 0.3})`;
  ctx.font = 'bold 16px monospace';
  const isMobile = 'ontouchstart' in window;
  ctx.fillText(isMobile ? 'TAP TO RESTART' : 'PRESS ENTER', w / 2, h * 0.68);
}
