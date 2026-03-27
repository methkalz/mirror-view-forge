import {
  GameData, InputState, Hazard, PowerUp, Particle, Vec2, Crater, FloatingText, Drone,
  HazardType, PowerUpType, Explosion, SmokeTrail, Cloud, AmbientParticle
} from './types';
import { getFromPool } from './pool';
import { sfxExplosion, sfxPickup, sfxDamage, sfxDash, sfxInterceptor, sfxFootstep, sfxWarning } from './audio';

const DASH_SPEED = 500;
const DASH_DURATION = 0.25;
const DASH_COOLDOWN = 1.2;
const CLOSE_CALL_DIST = 45;
const PLAYER_RADIUS = 14;
const GROUND_RATIO = 0.78; // Ground plane at 78% of screen height
const PLAYER_ACCEL = 1200;
const PLAYER_FRICTION = 8;

export function createGame(w: number, h: number): GameData {
  const groundY = h * GROUND_RATIO;
  return {
    state: 'start',
    player: {
      pos: { x: w / 2, y: groundY },
      size: PLAYER_RADIUS,
      speed: 260,
      health: 100,
      maxHealth: 100,
      shielded: false,
      shieldTimer: 0,
      dashCooldown: 0,
      dashTimer: 0,
      isDashing: false,
      dashDir: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      facingRight: true,
      anim: 'idle',
      animFrame: 0,
      animTimer: 0,
      hitTimer: 0,
      groundY,
    },
    hazards: [],
    powerUps: [],
    particles: [],
    craters: [],
    explosions: [],
    smokeTrails: [],
    floatingTexts: [],
    drones: [],
    clouds: initClouds(w, h),
    ambientParticles: [],
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
    camera: { x: 0, y: 0 },
    stats: { closeCalls: 0, powerUpsCollected: 0, dronesDestroyed: 0, timeSurvived: 0 },
    windOffset: 0,
  };
}

function initClouds(w: number, h: number): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * w * 1.5 - w * 0.25,
      y: 20 + Math.random() * h * 0.25,
      width: 60 + Math.random() * 120,
      height: 20 + Math.random() * 30,
      speed: 8 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.2,
    });
  }
  return clouds;
}

export function resetGame(g: GameData) {
  const groundY = g.height * GROUND_RATIO;
  g.state = 'playing';
  g.player.pos = { x: g.width / 2, y: groundY };
  g.player.groundY = groundY;
  g.player.health = g.player.maxHealth;
  g.player.shielded = false;
  g.player.shieldTimer = 0;
  g.player.dashCooldown = 0;
  g.player.dashTimer = 0;
  g.player.isDashing = false;
  g.player.velocity = { x: 0, y: 0 };
  g.player.facingRight = true;
  g.player.anim = 'idle';
  g.player.animFrame = 0;
  g.player.animTimer = 0;
  g.player.hitTimer = 0;
  g.hazards.forEach(h => h.active = false);
  g.powerUps.forEach(p => p.active = false);
  g.particles.forEach(p => p.active = false);
  g.drones.forEach(d => d.active = false);
  g.craters.length = 0;
  g.explosions.length = 0;
  g.smokeTrails.length = 0;
  g.floatingTexts.length = 0;
  g.ambientParticles.length = 0;
  g.clouds = initClouds(g.width, g.height);
  g.score = 0;
  g.elapsed = 0;
  g.difficulty = 1;
  g.spawnTimer = 1.5;
  g.powerUpTimer = 8;
  g.droneTimer = 60;
  g.screenShake = { x: 0, y: 0 };
  g.damageFlash = 0;
  g.camera = { x: 0, y: 0 };
  g.stats = { closeCalls: 0, powerUpsCollected: 0, dronesDestroyed: 0, timeSurvived: 0 };
  g.windOffset = 0;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function spawnParticles(g: GameData, pos: Vec2, count: number, color: string, speed = 150, useGravity = true) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.3 + Math.random() * 0.7);
    const p = getFromPool<Particle>(g.particles, () => ({
      active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
      life: 0, maxLife: 0, color: '', size: 0, gravity: true
    }), 600);
    p.pos = { ...pos };
    p.vel = { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd - (useGravity ? 80 : 0) };
    p.life = 0.4 + Math.random() * 0.5;
    p.maxLife = p.life;
    p.color = color;
    p.size = 2 + Math.random() * 4;
    p.gravity = useGravity;
  }
}

function addExplosion(g: GameData, pos: Vec2, size: number) {
  if (g.explosions.length > 20) g.explosions.shift();
  g.explosions.push({ pos: { ...pos }, life: 0.6, maxLife: 0.6, size, stage: 'flash' });
}

function addSmokeTrail(g: GameData, pos: Vec2, size: number) {
  if (g.smokeTrails.length > 80) g.smokeTrails.shift();
  g.smokeTrails.push({ pos: { ...pos }, life: 0.8, maxLife: 0.8, size, alpha: 0.5 });
}

function addFloatingText(g: GameData, text: string, pos: Vec2, color: string) {
  if (g.floatingTexts.length > 15) g.floatingTexts.shift();
  g.floatingTexts.push({ text, pos: { ...pos }, life: 1.5, maxLife: 1.5, color });
}

function spawnAmbientParticle(g: GameData) {
  const ap: AmbientParticle = {
    pos: { x: Math.random() * g.width, y: Math.random() * g.height * 0.8 },
    vel: { x: -5 + Math.random() * 10 + g.windOffset * 20, y: 5 + Math.random() * 15 },
    life: 3 + Math.random() * 4,
    maxLife: 7,
    size: 1 + Math.random() * 2,
    opacity: 0.1 + Math.random() * 0.25,
  };
  g.ambientParticles.push(ap);
}

function spawnHazard(g: GameData, type: HazardType) {
  const h = getFromPool<Hazard>(g.hazards, () => ({
    active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
    speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
    rotation: 0, trailTimer: 0
  }));
  const groundY = g.height * GROUND_RATIO;
  const tx = 30 + Math.random() * (g.width - 60);
  const ty = groundY - 5 + Math.random() * 10; // Impacts near ground level
  h.type = type;
  h.targetPos = { x: tx, y: ty };
  h.pos = { x: tx + (Math.random() - 0.5) * 80, y: -40 };
  h.falling = false;
  h.splitDone = false;
  h.rotation = Math.random() * Math.PI * 2;
  h.trailTimer = 0;

  switch (type) {
    case 'shrapnel':
      h.speed = 350 + g.difficulty * 20;
      h.size = 8;
      h.damage = 10;
      h.warningDuration = 0.7;
      break;
    case 'missile':
      h.speed = 220 + g.difficulty * 15;
      h.size = 12;
      h.damage = 22;
      h.warningDuration = 1.2;
      break;
    case 'cluster':
      h.speed = 180 + g.difficulty * 10;
      h.size = 14;
      h.damage = 16;
      h.warningDuration = 1.4;
      break;
  }
  h.warningTimer = h.warningDuration;
  sfxWarning();
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
  pu.fallSpeed = 35 + Math.random() * 15;
  pu.bobTimer = 0;
}

function spawnDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, state: 'entering', entryTarget: { x: 0, y: 0 }
  }), 10);
  const side = Math.random() < 0.5 ? 0 : 1;
  const w = g.width, h = g.height;
  d.pos = { x: side === 0 ? -20 : w + 20, y: h * 0.2 + Math.random() * h * 0.3 };
  d.entryTarget = { x: w * 0.2 + Math.random() * w * 0.6, y: h * 0.3 + Math.random() * h * 0.2 };
  d.speed = 70 + g.difficulty * 5;
  d.size = 14;
  d.health = 1;
  d.state = 'entering';
  d.vel = { x: 0, y: 0 };
}

function damagePlayer(g: GameData, dmg: number, sourcePos: Vec2) {
  const p = g.player;
  if (p.shielded) {
    p.shielded = false;
    p.shieldTimer = 0;
    spawnParticles(g, p.pos, 10, '#60a5fa', 120);
    addFloatingText(g, 'Shield!', p.pos, '#60a5fa');
    return;
  }
  p.health = Math.max(0, p.health - dmg);
  p.hitTimer = 0.3;
  p.anim = 'hit';
  g.damageFlash = 0.35;
  // Knockback
  const kdir = sourcePos.x < p.pos.x ? 1 : -1;
  p.velocity.x += kdir * 200;
  sfxDamage();
  if (p.health <= 0) {
    g.state = 'gameover';
    g.stats.timeSurvived = g.elapsed;
    if (g.score > g.highScore) {
      g.highScore = g.score;
      localStorage.setItem('skyfall_hi', g.score.toString());
    }
  }
}

function handleInterceptor(g: GameData) {
  sfxInterceptor();
  const activeHazards = g.hazards
    .filter(h => h.active)
    .sort((a, b) => dist(a.falling ? a.pos : a.targetPos, g.player.pos) -
                     dist(b.falling ? b.pos : b.targetPos, g.player.pos));
  
  const targets = activeHazards.slice(0, 3);
  for (const h of targets) {
    const explodePos = h.falling ? h.pos : h.targetPos;
    spawnParticles(g, explodePos, 15, '#f97316', 200);
    addExplosion(g, explodePos, h.size * 2);
    h.active = false;
  }
  const activeDrones = g.drones.filter(d => d.active)
    .sort((a, b) => dist(a.pos, g.player.pos) - dist(b.pos, g.player.pos));
  if (activeDrones.length > 0) {
    spawnParticles(g, activeDrones[0].pos, 12, '#ef4444', 150);
    addExplosion(g, activeDrones[0].pos, 20);
    activeDrones[0].active = false;
    g.stats.dronesDestroyed++;
  }
}

let footstepTimer = 0;

export function update(g: GameData, input: InputState, dt: number) {
  if (g.state !== 'playing') return;

  dt = Math.min(dt, 0.05);
  g.elapsed += dt;
  g.difficulty = 1 + Math.floor(g.elapsed / 30);
  g.score = Math.floor(g.elapsed);
  g.windOffset = Math.sin(g.elapsed * 0.3) * 0.5;

  const p = g.player;
  const groundY = g.height * GROUND_RATIO;
  p.groundY = groundY;

  // === Player movement (horizontal only with momentum) ===
  let moveX = 0;

  if (input.keys.has('a') || input.keys.has('arrowleft')) moveX -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) moveX += 1;

  // Touch joystick (horizontal component only)
  if (input.touchJoystick.active) {
    const jdx = input.touchJoystick.current.x - input.touchJoystick.origin.x;
    const jdist = Math.abs(jdx);
    if (jdist > 10) {
      moveX = jdx / jdist;
    }
  }

  // Hit timer
  if (p.hitTimer > 0) {
    p.hitTimer -= dt;
    if (p.hitTimer <= 0) p.anim = 'idle';
  }

  // Dash (roll)
  if (p.dashCooldown > 0) p.dashCooldown -= dt;
  if ((input.dash || input.touchDash) && !p.isDashing && p.dashCooldown <= 0 && Math.abs(moveX) > 0) {
    p.isDashing = true;
    p.dashTimer = DASH_DURATION;
    p.dashDir = { x: moveX > 0 ? 1 : -1, y: 0 };
    p.dashCooldown = DASH_COOLDOWN;
    p.anim = 'roll';
    p.animFrame = 0;
    sfxDash();
    input.dash = false;
    input.touchDash = false;
  }

  if (p.isDashing) {
    p.dashTimer -= dt;
    p.velocity.x = p.dashDir.x * DASH_SPEED;
    p.animTimer += dt;
    if (p.dashTimer <= 0) {
      p.isDashing = false;
      p.anim = 'idle';
    }
  } else if (p.anim !== 'hit') {
    // Apply acceleration with friction
    p.velocity.x += moveX * PLAYER_ACCEL * dt;
    p.velocity.x -= p.velocity.x * PLAYER_FRICTION * dt;

    // Walking animation
    if (Math.abs(moveX) > 0.1) {
      p.facingRight = moveX > 0;
      if (p.anim !== 'walk') {
        p.anim = 'walk';
        p.animFrame = 0;
        p.animTimer = 0;
      }
      p.animTimer += dt;
      if (p.animTimer > 0.12) {
        p.animTimer = 0;
        p.animFrame = (p.animFrame + 1) % 4;
        // Footstep sound
        footstepTimer += dt;
        if (p.animFrame % 2 === 0) sfxFootstep();
      }
    } else {
      if (p.anim === 'walk') p.anim = 'idle';
      p.animTimer += dt;
    }
  }

  p.pos.x += p.velocity.x * dt;
  p.pos.y = groundY; // Lock to ground

  // Bounds
  p.pos.x = Math.max(p.size + 5, Math.min(g.width - p.size - 5, p.pos.x));

  // Friction for stop
  if (!p.isDashing && Math.abs(p.velocity.x) < 5) p.velocity.x = 0;

  // Shield timer
  if (p.shielded) {
    p.shieldTimer -= dt;
    if (p.shieldTimer <= 0) p.shielded = false;
  }

  // Camera follow with lag
  const targetCamX = (p.pos.x - g.width / 2) * 0.15;
  g.camera.x += (targetCamX - g.camera.x) * 2 * dt;

  // === Ambient particles ===
  if (g.ambientParticles.length < 15 && Math.random() < 0.15) {
    spawnAmbientParticle(g);
  }
  for (let i = g.ambientParticles.length - 1; i >= 0; i--) {
    const ap = g.ambientParticles[i];
    ap.life -= dt;
    ap.pos.x += ap.vel.x * dt;
    ap.pos.y += ap.vel.y * dt;
    if (ap.life <= 0 || ap.pos.y > g.height) g.ambientParticles.splice(i, 1);
  }

  // === Clouds ===
  for (const c of g.clouds) {
    c.x += c.speed * dt;
    if (c.x > g.width + c.width) c.x = -c.width;
  }

  // === Spawn hazards ===
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    const spawnRate = Math.max(0.3, 1.5 - g.difficulty * 0.1);
    g.spawnTimer = spawnRate;
    const types: HazardType[] = ['shrapnel', 'shrapnel', 'missile'];
    if (g.elapsed >= 45) types.push('cluster', 'cluster');
    spawnHazard(g, types[Math.floor(Math.random() * types.length)]);
    if (g.difficulty >= 3 && Math.random() < 0.3) {
      spawnHazard(g, types[Math.floor(Math.random() * types.length)]);
    }
  }

  // === Update hazards ===
  for (const h of g.hazards) {
    if (!h.active) continue;
    h.rotation += dt * (h.type === 'shrapnel' ? 8 : 2);

    if (!h.falling) {
      h.warningTimer -= dt;
      if (h.warningTimer <= 0) h.falling = true;
    } else {
      // Smoke trail
      h.trailTimer -= dt;
      if (h.trailTimer <= 0) {
        h.trailTimer = 0.05;
        addSmokeTrail(g, h.pos, h.size * 0.6);
      }

      const dx = h.targetPos.x - h.pos.x;
      const dy = h.targetPos.y - h.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      
      // Wind effect
      h.pos.x += g.windOffset * 15 * dt;
      
      if (d < 8) {
        // Impact
        h.active = false;
        sfxExplosion();
        
        // Multi-stage explosion
        addExplosion(g, h.targetPos, h.type === 'missile' ? h.size * 3 : h.size * 2);
        
        // Ground debris particles
        const colors = ['#ef4444', '#f97316', '#fbbf24', '#6b7280', '#4b5563'];
        for (const c of colors.slice(0, 3)) {
          spawnParticles(g, h.targetPos, h.type === 'missile' ? 6 : 3, c, h.type === 'missile' ? 250 : 150);
        }
        
        g.craters.push({ pos: { ...h.targetPos }, size: h.size * 2.5, life: 8, maxLife: 8 });
        
        // Directional screen shake
        const shakeStr = h.type === 'missile' ? 12 : 5;
        const shakeDirX = h.targetPos.x < g.width / 2 ? 1 : -1;
        g.screenShake = {
          x: shakeDirX * shakeStr * (0.5 + Math.random() * 0.5),
          y: -(shakeStr * 0.7 + Math.random() * shakeStr * 0.3)
        };

        // Player collision
        if (dist(h.targetPos, p.pos) < h.size * 1.5 + p.size) {
          damagePlayer(g, h.damage, h.targetPos);
        } else if (dist(h.targetPos, p.pos) < h.size * 1.5 + p.size + CLOSE_CALL_DIST) {
          g.score += 50;
          g.stats.closeCalls++;
          addFloatingText(g, 'Close Call! +50', { x: p.pos.x, y: p.pos.y - 40 }, '#fbbf24');
        }

        // Cluster split
        if (h.type === 'cluster') {
          for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5 - Math.PI / 2;
            const splitDist = 50 + Math.random() * 40;
            const sh = getFromPool<Hazard>(g.hazards, () => ({
              active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
              speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
              rotation: 0, trailTimer: 0
            }));
            sh.type = 'shrapnel';
            sh.pos = { x: h.targetPos.x, y: h.targetPos.y - 30 };
            sh.targetPos = {
              x: h.targetPos.x + Math.cos(angle) * splitDist,
              y: groundY - 5 + Math.random() * 10
            };
            sh.speed = 300;
            sh.size = 6;
            sh.damage = 8;
            sh.warningDuration = 0.3;
            sh.warningTimer = 0.3;
            sh.falling = false;
            sh.rotation = Math.random() * Math.PI * 2;
            sh.trailTimer = 0;
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
      pu.pos.x += g.windOffset * 8 * dt; // Wind
      if (pu.pos.y >= groundY - 10) {
        pu.parachuting = false;
        pu.pos.y = groundY - 10;
      }
    }
    pu.bobTimer += dt;

    if (dist(pu.pos, p.pos) < pu.size + p.size + 5) {
      pu.active = false;
      sfxPickup();
      g.stats.powerUpsCollected++;
      switch (pu.type) {
        case 'medkit':
          p.health = Math.min(p.maxHealth, p.health + 30);
          addFloatingText(g, '+30 HP', { x: p.pos.x, y: p.pos.y - 40 }, '#22c55e');
          spawnParticles(g, p.pos, 8, '#22c55e', 80);
          break;
        case 'shield':
          p.shielded = true;
          p.shieldTimer = 8;
          addFloatingText(g, 'Shield!', { x: p.pos.x, y: p.pos.y - 40 }, '#60a5fa');
          spawnParticles(g, p.pos, 8, '#60a5fa', 80);
          break;
        case 'interceptor':
          handleInterceptor(g);
          addFloatingText(g, 'Interceptor!', { x: p.pos.x, y: p.pos.y - 40 }, '#f97316');
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
      const dx = p.pos.x - d.pos.x;
      const dy = p.pos.y - 30 - d.pos.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > 0) {
        d.vel.x += (dx / dd) * 100 * dt;
        d.vel.y += (dy / dd) * 100 * dt;
        const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
        if (vLen > d.speed) {
          d.vel.x = (d.vel.x / vLen) * d.speed;
          d.vel.y = (d.vel.y / vLen) * d.speed;
        }
      }
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;

      if (dist(d.pos, p.pos) < d.size + p.size) {
        damagePlayer(g, 15, d.pos);
        spawnParticles(g, d.pos, 12, '#ef4444', 120);
        addExplosion(g, d.pos, 20);
        sfxExplosion();
        d.active = false;
      }

      for (const c of g.craters) {
        if (c.life > c.maxLife - 0.15 && dist(d.pos, c.pos) < c.size + d.size) {
          d.active = false;
          spawnParticles(g, d.pos, 12, '#f97316', 150);
          addExplosion(g, d.pos, 18);
          sfxExplosion();
          addFloatingText(g, 'Drone Down! +25', d.pos, '#f97316');
          g.score += 25;
          g.stats.dronesDestroyed++;
          break;
        }
      }
    }
  }

  // === Update particles with gravity ===
  for (const pt of g.particles) {
    if (!pt.active) continue;
    pt.life -= dt;
    if (pt.life <= 0) { pt.active = false; continue; }
    pt.pos.x += pt.vel.x * dt;
    pt.pos.y += pt.vel.y * dt;
    if (pt.gravity) {
      pt.vel.y += 400 * dt; // Gravity
      // Bounce on ground
      if (pt.pos.y > groundY) {
        pt.pos.y = groundY;
        pt.vel.y = -pt.vel.y * 0.3;
        pt.vel.x *= 0.7;
      }
    }
    pt.vel.x *= 0.97;
  }

  // === Update explosions ===
  for (let i = g.explosions.length - 1; i >= 0; i--) {
    const e = g.explosions[i];
    e.life -= dt;
    const progress = 1 - e.life / e.maxLife;
    if (progress < 0.15) e.stage = 'flash';
    else if (progress < 0.5) e.stage = 'fireball';
    else e.stage = 'smoke';
    if (e.life <= 0) g.explosions.splice(i, 1);
  }

  // === Update smoke trails ===
  for (let i = g.smokeTrails.length - 1; i >= 0; i--) {
    const s = g.smokeTrails[i];
    s.life -= dt;
    s.pos.y -= 10 * dt;
    s.alpha = (s.life / s.maxLife) * 0.4;
    s.size += 8 * dt;
    if (s.life <= 0) g.smokeTrails.splice(i, 1);
  }

  // === Update craters (cap at 30) ===
  while (g.craters.length > 30) g.craters.shift();
  for (let i = g.craters.length - 1; i >= 0; i--) {
    g.craters[i].life -= dt;
    if (g.craters[i].life <= 0) g.craters.splice(i, 1);
  }

  // === Update floating texts ===
  for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
    g.floatingTexts[i].life -= dt;
    g.floatingTexts[i].pos.y -= 35 * dt;
    if (g.floatingTexts[i].life <= 0) g.floatingTexts.splice(i, 1);
  }

  // === Screen shake decay ===
  g.screenShake.x *= 0.82;
  g.screenShake.y *= 0.82;
  if (Math.abs(g.screenShake.x) < 0.3) g.screenShake.x = 0;
  if (Math.abs(g.screenShake.y) < 0.3) g.screenShake.y = 0;

  if (g.damageFlash > 0) g.damageFlash -= dt * 2;
}
