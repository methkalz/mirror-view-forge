import {
  GameData, InputState, Hazard, PowerUp, Particle, Vec2, Crater, FloatingText, Drone,
  HazardType, PowerUpType
} from './types';
import { getFromPool } from './pool';
import { sfxExplosion, sfxPickup, sfxDamage, sfxDash, sfxInterceptor } from './audio';

const DASH_SPEED = 600;
const DASH_DURATION = 0.15;
const DASH_COOLDOWN = 1.0;
const CLOSE_CALL_DIST = 40;
const PLAYER_RADIUS = 14;

export function createGame(w: number, h: number): GameData {
  return {
    state: 'start',
    player: {
      pos: { x: w / 2, y: h / 2 },
      size: PLAYER_RADIUS,
      speed: 200,
      health: 100,
      maxHealth: 100,
      shielded: false,
      shieldTimer: 0,
      dashCooldown: 0,
      dashTimer: 0,
      isDashing: false,
      dashDir: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    },
    hazards: [],
    powerUps: [],
    particles: [],
    craters: [],
    floatingTexts: [],
    drones: [],
    score: 0,
    highScore: parseInt(localStorage.getItem('skyfall_hi') || '0'),
    elapsed: 0,
    difficulty: 1,
    spawnTimer: 0,
    powerUpTimer: 8,
    droneTimer: 60,
    screenShake: { x: 0, y: 0 },
    damageFlash: 0,
    width: w,
    height: h,
  };
}

export function resetGame(g: GameData) {
  g.state = 'playing';
  g.player.pos = { x: g.width / 2, y: g.height / 2 };
  g.player.health = g.player.maxHealth;
  g.player.shielded = false;
  g.player.shieldTimer = 0;
  g.player.dashCooldown = 0;
  g.player.dashTimer = 0;
  g.player.isDashing = false;
  g.player.velocity = { x: 0, y: 0 };
  g.hazards.forEach(h => h.active = false);
  g.powerUps.forEach(p => p.active = false);
  g.particles.forEach(p => p.active = false);
  g.drones.forEach(d => d.active = false);
  g.craters.length = 0;
  g.floatingTexts.length = 0;
  g.score = 0;
  g.elapsed = 0;
  g.difficulty = 1;
  g.spawnTimer = 1.5;
  g.powerUpTimer = 8;
  g.droneTimer = 60;
  g.screenShake = { x: 0, y: 0 };
  g.damageFlash = 0;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

function spawnParticles(g: GameData, pos: Vec2, count: number, color: string, speed = 150) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.3 + Math.random() * 0.7);
    const p = getFromPool<Particle>(g.particles, () => ({
      active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
      life: 0, maxLife: 0, color: '', size: 0
    }), 500);
    p.pos = { ...pos };
    p.vel = { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd };
    p.life = 0.3 + Math.random() * 0.3;
    p.maxLife = p.life;
    p.color = color;
    p.size = 2 + Math.random() * 3;
  }
}

function addFloatingText(g: GameData, text: string, pos: Vec2, color: string) {
  g.floatingTexts.push({ text, pos: { ...pos }, life: 1.2, maxLife: 1.2, color });
}

function spawnHazard(g: GameData, type: HazardType) {
  const h = getFromPool<Hazard>(g.hazards, () => ({
    active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
    speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false
  }));
  const tx = 30 + Math.random() * (g.width - 60);
  const ty = 30 + Math.random() * (g.height - 60);
  h.type = type;
  h.targetPos = { x: tx, y: ty };
  h.pos = { x: tx + (Math.random() - 0.5) * 40, y: -30 };
  h.falling = false;
  h.splitDone = false;

  switch (type) {
    case 'shrapnel':
      h.speed = 400 + g.difficulty * 20;
      h.size = 6;
      h.damage = 8;
      h.warningDuration = 0.6;
      break;
    case 'missile':
      h.speed = 250 + g.difficulty * 15;
      h.size = 10;
      h.damage = 20;
      h.warningDuration = 1.0;
      break;
    case 'cluster':
      h.speed = 200 + g.difficulty * 10;
      h.size = 12;
      h.damage = 15;
      h.warningDuration = 1.2;
      break;
  }
  h.warningTimer = h.warningDuration;
}

function spawnPowerUp(g: GameData) {
  const types: PowerUpType[] = ['medkit', 'shield', 'interceptor'];
  const type = types[Math.floor(Math.random() * types.length)];
  const pu = getFromPool<PowerUp>(g.powerUps, () => ({
    active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
    parachuting: false, fallSpeed: 0, bobTimer: 0
  }), 20);
  pu.type = type;
  pu.pos = { x: 40 + Math.random() * (g.width - 80), y: -20 };
  pu.size = 14;
  pu.parachuting = true;
  pu.fallSpeed = 40 + Math.random() * 20;
  pu.bobTimer = 0;
}

function spawnDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, state: 'entering', entryTarget: { x: 0, y: 0 }
  }), 10);
  const side = Math.floor(Math.random() * 4);
  const w = g.width, h = g.height;
  switch (side) {
    case 0: d.pos = { x: Math.random() * w, y: -20 }; break;
    case 1: d.pos = { x: w + 20, y: Math.random() * h }; break;
    case 2: d.pos = { x: Math.random() * w, y: h + 20 }; break;
    default: d.pos = { x: -20, y: Math.random() * h }; break;
  }
  d.entryTarget = { x: w * 0.2 + Math.random() * w * 0.6, y: h * 0.2 + Math.random() * h * 0.6 };
  d.speed = 80 + g.difficulty * 5;
  d.size = 12;
  d.health = 1;
  d.state = 'entering';
  d.vel = { x: 0, y: 0 };
}

function damagePlayer(g: GameData, dmg: number, sourcePos: Vec2) {
  if (g.player.shielded) {
    g.player.shielded = false;
    g.player.shieldTimer = 0;
    spawnParticles(g, g.player.pos, 8, '#60a5fa', 100);
    addFloatingText(g, 'Shield!', g.player.pos, '#60a5fa');
    return;
  }
  g.player.health = Math.max(0, g.player.health - dmg);
  g.damageFlash = 0.3;
  sfxDamage();
  if (g.player.health <= 0) {
    g.state = 'gameover';
    if (g.score > g.highScore) {
      g.highScore = g.score;
      localStorage.setItem('skyfall_hi', g.score.toString());
    }
  }
}

function handleInterceptor(g: GameData) {
  sfxInterceptor();
  // Destroy 3 nearest active hazards
  const activeHazards = g.hazards
    .filter(h => h.active)
    .sort((a, b) => dist(a.pos.x < 0 ? a.targetPos : a.pos, g.player.pos) -
                     dist(b.pos.x < 0 ? b.targetPos : b.pos, g.player.pos));
  
  const targets = activeHazards.slice(0, 3);
  for (const h of targets) {
    const explodePos = h.falling ? h.pos : h.targetPos;
    spawnParticles(g, explodePos, 12, '#f97316', 200);
    h.active = false;
  }
  // Also destroy nearest drone
  const activeDrones = g.drones.filter(d => d.active)
    .sort((a, b) => dist(a.pos, g.player.pos) - dist(b.pos, g.player.pos));
  if (activeDrones.length > 0) {
    spawnParticles(g, activeDrones[0].pos, 10, '#ef4444', 150);
    activeDrones[0].active = false;
  }
}

export function update(g: GameData, input: InputState, dt: number) {
  if (g.state !== 'playing') return;

  dt = Math.min(dt, 0.05); // Cap delta
  g.elapsed += dt;
  g.difficulty = 1 + Math.floor(g.elapsed / 30);
  g.score = Math.floor(g.elapsed);

  // === Player movement ===
  const p = g.player;
  let moveX = 0, moveY = 0;

  // Keyboard
  if (input.keys.has('w') || input.keys.has('arrowup')) moveY -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown')) moveY += 1;
  if (input.keys.has('a') || input.keys.has('arrowleft')) moveX -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) moveX += 1;

  // Touch joystick
  if (input.touchJoystick.active) {
    const jdx = input.touchJoystick.current.x - input.touchJoystick.origin.x;
    const jdy = input.touchJoystick.current.y - input.touchJoystick.origin.y;
    const jdist = Math.sqrt(jdx * jdx + jdy * jdy);
    if (jdist > 10) {
      moveX = jdx / jdist;
      moveY = jdy / jdist;
    }
  }

  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
  if (moveLen > 0) {
    moveX /= moveLen;
    moveY /= moveLen;
  }

  // Dash
  if (p.dashCooldown > 0) p.dashCooldown -= dt;
  if ((input.dash || input.touchDash) && !p.isDashing && p.dashCooldown <= 0 && moveLen > 0) {
    p.isDashing = true;
    p.dashTimer = DASH_DURATION;
    p.dashDir = { x: moveX, y: moveY };
    p.dashCooldown = DASH_COOLDOWN;
    sfxDash();
    input.dash = false;
    input.touchDash = false;
  }

  if (p.isDashing) {
    p.dashTimer -= dt;
    p.pos.x += p.dashDir.x * DASH_SPEED * dt;
    p.pos.y += p.dashDir.y * DASH_SPEED * dt;
    if (p.dashTimer <= 0) p.isDashing = false;
  } else {
    p.pos.x += moveX * p.speed * dt;
    p.pos.y += moveY * p.speed * dt;
  }

  // Bounds
  p.pos.x = Math.max(p.size, Math.min(g.width - p.size, p.pos.x));
  p.pos.y = Math.max(p.size, Math.min(g.height - p.size, p.pos.y));

  // Shield timer
  if (p.shielded) {
    p.shieldTimer -= dt;
    if (p.shieldTimer <= 0) p.shielded = false;
  }

  // === Spawn hazards ===
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    const spawnRate = Math.max(0.3, 1.5 - g.difficulty * 0.1);
    g.spawnTimer = spawnRate;
    const types: HazardType[] = ['shrapnel', 'shrapnel', 'missile'];
    if (g.elapsed >= 45) types.push('cluster', 'cluster');
    spawnHazard(g, types[Math.floor(Math.random() * types.length)]);
    // Extra spawns at higher difficulty
    if (g.difficulty >= 3 && Math.random() < 0.3) {
      spawnHazard(g, types[Math.floor(Math.random() * types.length)]);
    }
  }

  // === Update hazards ===
  for (const h of g.hazards) {
    if (!h.active) continue;

    if (!h.falling) {
      h.warningTimer -= dt;
      if (h.warningTimer <= 0) h.falling = true;
    } else {
      // Move toward target
      const dx = h.targetPos.x - h.pos.x;
      const dy = h.targetPos.y - h.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 5) {
        // Impact
        h.active = false;
        sfxExplosion();
        spawnParticles(g, h.targetPos, h.type === 'missile' ? 15 : 8,
          h.type === 'missile' ? '#ef4444' : '#f97316');
        g.craters.push({ pos: { ...h.targetPos }, size: h.size * 2, life: 5, maxLife: 5 });
        g.screenShake = {
          x: (Math.random() - 0.5) * (h.type === 'missile' ? 10 : 4),
          y: (Math.random() - 0.5) * (h.type === 'missile' ? 10 : 4)
        };

        // Check player hit
        if (dist(h.targetPos, p.pos) < h.size + p.size) {
          damagePlayer(g, h.damage, h.targetPos);
        } else if (dist(h.targetPos, p.pos) < h.size + p.size + CLOSE_CALL_DIST) {
          // Close call!
          g.score += 50;
          addFloatingText(g, 'Close Call! +50', p.pos, '#fbbf24');
        }

        // Cluster split
        if (h.type === 'cluster') {
          for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
            const splitDist = 40 + Math.random() * 30;
            const sh = getFromPool<Hazard>(g.hazards, () => ({
              active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
              speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false
            }));
            sh.type = 'shrapnel';
            sh.pos = { ...h.targetPos };
            sh.targetPos = {
              x: h.targetPos.x + Math.cos(angle) * splitDist,
              y: h.targetPos.y + Math.sin(angle) * splitDist
            };
            sh.speed = 350;
            sh.size = 5;
            sh.damage = 8;
            sh.warningDuration = 0.3;
            sh.warningTimer = 0.3;
            sh.falling = false;
          }
        }
      } else {
        h.pos.x += (dx / d) * h.speed * dt;
        h.pos.y += (dy / d) * h.speed * dt;
      }
    }
  }

  // === Spawn & update power-ups ===
  g.powerUpTimer -= dt;
  if (g.powerUpTimer <= 0) {
    g.powerUpTimer = 8 + Math.random() * 5;
    spawnPowerUp(g);
  }

  for (const pu of g.powerUps) {
    if (!pu.active) continue;
    if (pu.parachuting) {
      pu.pos.y += pu.fallSpeed * dt;
      if (pu.pos.y >= g.height * 0.3 + Math.random() * g.height * 0.5) {
        pu.parachuting = false;
      }
    }
    pu.bobTimer += dt;

    // Collect
    if (dist(pu.pos, p.pos) < pu.size + p.size) {
      pu.active = false;
      sfxPickup();
      switch (pu.type) {
        case 'medkit':
          p.health = Math.min(p.maxHealth, p.health + 30);
          addFloatingText(g, '+30 HP', p.pos, '#22c55e');
          spawnParticles(g, p.pos, 6, '#22c55e', 80);
          break;
        case 'shield':
          p.shielded = true;
          p.shieldTimer = 8;
          addFloatingText(g, 'Shield!', p.pos, '#60a5fa');
          spawnParticles(g, p.pos, 6, '#60a5fa', 80);
          break;
        case 'interceptor':
          handleInterceptor(g);
          addFloatingText(g, 'Interceptor!', p.pos, '#f97316');
          break;
      }
    }
  }

  // === Drones ===
  if (g.elapsed >= 60) {
    g.droneTimer -= dt;
    if (g.droneTimer <= 0) {
      g.droneTimer = Math.max(8, 20 - g.difficulty * 1.5);
      spawnDrone(g);
    }
  }

  for (const d of g.drones) {
    if (!d.active) continue;
    if (d.state === 'entering') {
      const dx = d.entryTarget.x - d.pos.x;
      const dy = d.entryTarget.y - d.pos.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 5) {
        d.state = 'tracking';
      } else {
        d.pos.x += (dx / dd) * d.speed * 2 * dt;
        d.pos.y += (dy / dd) * d.speed * 2 * dt;
      }
    } else {
      // Track player
      const dx = p.pos.x - d.pos.x;
      const dy = p.pos.y - d.pos.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > 0) {
        d.vel.x += (dx / dd) * 120 * dt;
        d.vel.y += (dy / dd) * 120 * dt;
        const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
        if (vLen > d.speed) {
          d.vel.x = (d.vel.x / vLen) * d.speed;
          d.vel.y = (d.vel.y / vLen) * d.speed;
        }
      }
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;

      // Collision with player
      if (dist(d.pos, p.pos) < d.size + p.size) {
        damagePlayer(g, 15, d.pos);
        spawnParticles(g, d.pos, 10, '#ef4444', 120);
        sfxExplosion();
        d.active = false;
      }

      // Drone hit by nearby explosions (craters)
      for (const c of g.craters) {
        if (c.life > c.maxLife - 0.1 && dist(d.pos, c.pos) < c.size + d.size) {
          d.active = false;
          spawnParticles(g, d.pos, 10, '#f97316', 150);
          sfxExplosion();
          addFloatingText(g, 'Drone Down!', d.pos, '#f97316');
          g.score += 25;
          break;
        }
      }
    }
  }

  // === Update particles ===
  for (const pt of g.particles) {
    if (!pt.active) continue;
    pt.life -= dt;
    if (pt.life <= 0) { pt.active = false; continue; }
    pt.pos.x += pt.vel.x * dt;
    pt.pos.y += pt.vel.y * dt;
    pt.vel.x *= 0.95;
    pt.vel.y *= 0.95;
  }

  // === Update craters ===
  for (let i = g.craters.length - 1; i >= 0; i--) {
    g.craters[i].life -= dt;
    if (g.craters[i].life <= 0) g.craters.splice(i, 1);
  }

  // === Update floating texts ===
  for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
    g.floatingTexts[i].life -= dt;
    g.floatingTexts[i].pos.y -= 40 * dt;
    if (g.floatingTexts[i].life <= 0) g.floatingTexts.splice(i, 1);
  }

  // === Screen shake decay ===
  g.screenShake.x *= 0.85;
  g.screenShake.y *= 0.85;
  if (Math.abs(g.screenShake.x) < 0.5) g.screenShake.x = 0;
  if (Math.abs(g.screenShake.y) < 0.5) g.screenShake.y = 0;

  // === Damage flash decay ===
  if (g.damageFlash > 0) g.damageFlash -= dt;
}
