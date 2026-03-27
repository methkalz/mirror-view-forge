import {
  GameData, InputState, Hazard, PowerUp, Particle, Vec2, Crater, FloatingText, Drone, Bullet,
  HazardType, PowerUpType, Explosion, SmokeTrail, Cloud, AmbientParticle, WaveWarning, Boss
} from './types';
import { getFromPool } from './pool';
import { sfxExplosion, sfxPickup, sfxDamage, sfxDash, sfxInterceptor, sfxFootstep, sfxWarning, sfxSlowmo, sfxMagnet, sfxAirstrike, sfxBossSiren, sfxBossExplosion, sfxThunder, updateHeartbeat, stopHeartbeat } from './audio';

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
      ammo: 0,
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
    bullets: [],
    score: 0,
    highScore: parseInt(localStorage.getItem('skyfall_hi') || '0'),
    elapsed: 0,
    difficulty: 1,
    spawnTimer: 0,
    powerUpTimer: 8,
    droneTimer: 90,
    screenShake: { x: 0, y: 0 },
    damageFlash: 0,
    width: w,
    height: h,
    camera: { x: 0, y: 0 },
    stats: { closeCalls: 0, powerUpsCollected: 0, dronesDestroyed: 0, timeSurvived: 0, bossesDefeated: 0 },
    windOffset: 0,
    waveWarnings: [],
    waveTriggered: new Set(),
    bulletLevel: 1,
    slowMoTimer: 0,
    magnetTimer: 0,
    slowMoFactor: 1,
    boss: null,
    bossCount: 0,
    bossTimer: 240,
    rainDrops: [],
    lightningTimer: 0,
    lightningFlash: 0,
    weatherIntensity: 0,
  };
}

function initClouds(w: number, h: number): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 12; i++) {
    clouds.push({
      x: Math.random() * w * 3 - w * 0.5,
      y: 15 + Math.random() * h * 0.28,
      width: 80 + Math.random() * 160,
      height: 25 + Math.random() * 40,
      speed: 3 + Math.random() * 7,
      opacity: 0.1 + Math.random() * 0.25,
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
  g.player.ammo = 0;
  g.hazards.forEach(h => h.active = false);
  g.powerUps.forEach(p => p.active = false);
  g.particles.forEach(p => p.active = false);
  g.drones.forEach(d => d.active = false);
  g.bullets.length = 0;
  g.craters.length = 0;
  g.explosions.length = 0;
  g.smokeTrails.length = 0;
  g.floatingTexts.length = 0;
  g.ambientParticles.length = 0;
  g.clouds = initClouds(g.width, g.height);
  g.score = 0;
  g.elapsed = 0;
  g.difficulty = 1;
  g.spawnTimer = 2.5;
  g.powerUpTimer = 8;
  g.droneTimer = 90;
  g.screenShake = { x: 0, y: 0 };
  g.damageFlash = 0;
  g.camera = { x: 0, y: 0 };
  g.stats = { closeCalls: 0, powerUpsCollected: 0, dronesDestroyed: 0, timeSurvived: 0, bossesDefeated: 0 };
  g.windOffset = 0;
  g.waveWarnings = [];
  g.waveTriggered = new Set();
  g.bulletLevel = 1;
  g.slowMoTimer = 0;
  g.magnetTimer = 0;
  g.slowMoFactor = 1;
  g.boss = null;
  g.bossCount = 0;
  g.bossTimer = 240;
  g.rainDrops = [];
  g.lightningTimer = 0;
  g.lightningFlash = 0;
  g.weatherIntensity = 0;
  stopHeartbeat();
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
  const weighted: { type: PowerUpType; w: number }[] = [
    { type: 'medkit', w: 3 }, { type: 'shield', w: 2 }, { type: 'interceptor', w: 2 },
    { type: 'ammo', w: 4 }, { type: 'slowmo', w: 2 }, { type: 'magnet', w: 2 },
    { type: 'airstrike', w: 1 },
  ];
  const totalW = weighted.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * totalW;
  let type: PowerUpType = 'medkit';
  for (const e of weighted) { r -= e.w; if (r <= 0) { type = e.type; break; } }
  const pu = getFromPool<PowerUp>(g.powerUps, () => ({
    active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
    parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
  }), 20);
  pu.type = type;
  pu.pos = { x: 40 + Math.random() * (g.width - 80), y: -20 };
  pu.size = 14;
  pu.parachuting = true;
  pu.fallSpeed = 35 + Math.random() * 15;
  pu.bobTimer = 0;
  pu.groundTimer = 0;
}

function spawnDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, maxHealth: 0, state: 'entering' as const, entryTarget: { x: 0, y: 0 },
    tier: 'scout' as const, bombTimer: 0, bombCooldown: 0, hoverTimer: 0,
    aggroDelay: 0, trackingAccuracy: 0, wobble: 0, altitudeOffset: 0, colorHue: 0
  }), 10);
  const side = Math.random() < 0.5 ? 0 : 1;
  const w = g.width, h = g.height;

  // Unique altitude offset based on active drone count to prevent stacking
  const activeDrones = g.drones.filter(dr => dr.active);
  const altSlot = activeDrones.length;
  d.altitudeOffset = (altSlot % 4) * 35 - 50; // spread across -50 to +55
  d.colorHue = Math.random() * 30 - 15; // slight hue variation

  d.pos = { x: side === 0 ? -20 : w + 20, y: h * 0.15 + Math.random() * h * 0.2 + d.altitudeOffset };
  d.entryTarget = { x: w * 0.15 + Math.random() * w * 0.7, y: h * 0.2 + d.altitudeOffset + Math.random() * h * 0.1 };
  d.state = 'entering';
  d.vel = { x: 0, y: 0 };
  d.wobble = Math.random() * Math.PI * 2; // random phase

  const elapsed = g.elapsed;
  if (elapsed < 150) {
    d.tier = 'scout';
    d.speed = 25 + Math.min(15, (elapsed - 90) * 0.5);
    d.size = 14;
    d.health = 1; d.maxHealth = 1;
    d.aggroDelay = 4 + Math.random() * 3;
    d.trackingAccuracy = 0.1 + Math.random() * 0.1;
    d.bombTimer = 0; d.bombCooldown = 0;
  } else if (elapsed < 210) {
    const roll = Math.random();
    if (roll < 0.5) {
      d.tier = 'scout';
      d.speed = 40 + Math.random() * 15;
      d.size = 14;
      d.health = 1; d.maxHealth = 1;
      d.aggroDelay = 2 + Math.random() * 1.5;
      d.trackingAccuracy = 0.25 + Math.random() * 0.2;
      d.bombTimer = 0; d.bombCooldown = 0;
    } else {
      d.tier = 'tracker';
      d.speed = 50 + Math.random() * 20;
      d.size = 16;
      d.health = 2; d.maxHealth = 2;
      d.aggroDelay = 1.5 + Math.random() * 1;
      d.trackingAccuracy = 0.4 + Math.random() * 0.2;
      d.bombTimer = 0; d.bombCooldown = 0;
    }
  } else {
    const roll = Math.random();
    if (roll < 0.2) {
      d.tier = 'scout';
      d.speed = 50;
      d.size = 14;
      d.health = 1; d.maxHealth = 1;
      d.aggroDelay = 1;
      d.trackingAccuracy = 0.35;
      d.bombTimer = 0; d.bombCooldown = 0;
    } else if (roll < 0.6) {
      d.tier = 'tracker';
      d.speed = 60 + Math.min(30, (elapsed - 150) * 0.2);
      d.size = 16;
      d.health = 2; d.maxHealth = 2;
      d.aggroDelay = 0.5 + Math.random() * 0.5;
      d.trackingAccuracy = 0.5 + Math.min(0.35, (elapsed - 150) * 0.002);
      d.bombTimer = 0; d.bombCooldown = 0;
    } else {
      d.tier = 'bomber';
      d.speed = 45 + Math.random() * 15;
      d.size = 20;
      d.health = 3; d.maxHealth = 3;
      d.aggroDelay = 1;
      d.trackingAccuracy = 0.3;
      d.bombTimer = 0;
      d.bombCooldown = 4 + Math.random() * 2;
    }
  }
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
  g.difficulty = 1 + g.elapsed / 60;
  g.score += Math.round(dt);
  g.windOffset = Math.sin(g.elapsed * 0.3) * 0.5;

  // === Slow-mo & Magnet timers ===
  if (g.slowMoTimer > 0) {
    g.slowMoTimer -= dt;
    g.slowMoFactor = 0.3;
    if (g.slowMoTimer <= 0) { g.slowMoFactor = 1; g.slowMoTimer = 0; }
  } else {
    g.slowMoFactor = 1;
  }
  if (g.magnetTimer > 0) g.magnetTimer -= dt;

  // === Wave warnings ===
  const waveEvents: { time: number; id: string; text: string; sub: string; color: string }[] = [
    { time: 45, id: 'missiles', text: '⚠ تحذير: صواريخ', sub: 'MISSILES DETECTED', color: '#f97316' },
    { time: 85, id: 'clusters', text: '⚠ تحذير: صواريخ متشظية', sub: 'SPLITTING MISSILES INCOMING', color: '#ef4444' },
    { time: 145, id: 'cluster_3', text: '⚠ تشظي ثلاثي!', sub: 'TRIPLE SPLIT MISSILES', color: '#f43f5e' },
    { time: 205, id: 'cluster_4', text: '⚠ تشظي رباعي!', sub: 'QUAD SPLIT MISSILES', color: '#dc2626' },
    { time: 265, id: 'cluster_5', text: '💀 تشظي خماسي!', sub: 'MAX SPLIT — DANGER', color: '#991b1b' },
    { time: 85, id: 'drones_scout', text: '⚠ رصد طائرات استطلاع', sub: 'SCOUT DRONES APPROACHING', color: '#60a5fa' },
    { time: 145, id: 'drones_tracker', text: '⚠ طائرات تتبع معادية', sub: 'TRACKER DRONES INBOUND', color: '#a855f7' },
    { time: 205, id: 'drones_bomber', text: '⚠ قاذفات قنابل!', sub: 'BOMBERS DETECTED — TAKE COVER', color: '#ef4444' },
    { time: 120, id: 'bullet_2', text: '⬆ تطوير: طلقة مزدوجة', sub: 'DOUBLE SHOT UNLOCKED', color: '#22c55e' },
    { time: 200, id: 'bullet_3', text: '⬆ تطوير: طلقة ثلاثية', sub: 'TRIPLE SHOT UNLOCKED', color: '#fbbf24' },
    { time: 235, id: 'boss_warn', text: '🔴 إنذار أحمر!', sub: 'GUNSHIP APPROACHING — STAY ALERT', color: '#dc2626' },
    { time: 235, id: 'boss_prep', text: '📦 إمدادات طارئة!', sub: 'EMERGENCY SUPPLIES DROPPED', color: '#22c55e' },
  ];
  for (const we of waveEvents) {
    if (g.elapsed >= we.time - 5 && !g.waveTriggered.has(we.id)) {
      g.waveTriggered.add(we.id);
      g.waveWarnings.push({ text: we.text, subText: we.sub, life: 4, maxLife: 4, color: we.color });
      if (we.id === 'bullet_2') g.bulletLevel = 2;
      if (we.id === 'bullet_3') g.bulletLevel = 3;
      // Pre-boss: drop guaranteed ammo + medkit
      if (we.id === 'boss_prep') {
        for (const t of ['ammo', 'medkit'] as PowerUpType[]) {
          const pu = getFromPool<PowerUp>(g.powerUps, () => ({
            active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
            parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
          }), 20);
          pu.type = t;
          pu.pos = { x: g.width * 0.3 + Math.random() * g.width * 0.4, y: -20 };
          pu.size = 14;
          pu.parachuting = true;
          pu.fallSpeed = 35;
          pu.bobTimer = 0;
          pu.groundTimer = 0;
        }
      }
    }
  }
  // Update wave warnings
  for (let i = g.waveWarnings.length - 1; i >= 0; i--) {
    g.waveWarnings[i].life -= dt;
    if (g.waveWarnings[i].life <= 0) g.waveWarnings.splice(i, 1);
  }

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

  // === Shooting (multi-shot based on bulletLevel) ===
  if (input.shoot && p.ammo > 0 && !p.isDashing) {
    input.shoot = false;
    p.ammo--;
    const baseX = p.pos.x + (p.facingRight ? 10 : -10);
    const baseY = p.pos.y - 20;
    const angles = g.bulletLevel === 1 ? [0] : g.bulletLevel === 2 ? [-0.1, 0.1] : [-0.15, 0, 0.15];
    for (const angle of angles) {
      const bullet: Bullet = {
        active: true,
        pos: { x: baseX, y: baseY },
        vel: { x: Math.sin(angle) * 600, y: -Math.cos(angle) * 600 },
        size: 3,
        damage: 1,
      };
      g.bullets.push(bullet);
    }
    spawnParticles(g, { x: baseX, y: baseY }, 4, '#fbbf24', 80, false);
  }
  if (input.shoot) input.shoot = false;

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
  const camLeft = g.camera.x - 300;
  const camRight = g.camera.x + g.width + 300;
  for (const c of g.clouds) {
    c.x += c.speed * dt;
    // Recycle based on camera bounds, not screen bounds
    if (c.x - c.width > camRight) {
      c.x = camLeft - c.width - Math.random() * 200;
      c.y = 15 + Math.random() * g.height * 0.28;
      c.opacity = 0.1 + Math.random() * 0.25;
    } else if (c.x + c.width < camLeft - 500) {
      c.x = camRight + Math.random() * 200;
      c.y = 15 + Math.random() * g.height * 0.28;
      c.opacity = 0.1 + Math.random() * 0.25;
    }
  }

  // === Spawn hazards (reduced 60% during boss) ===
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    const spawnRate = Math.max(0.5, 2.0 - g.difficulty * 0.12);
    // During boss fight, reduce hazard spawn rate by 60%
    const bossMultiplier = g.boss && !g.boss.defeated ? 2.5 : 1;
    g.spawnTimer = spawnRate * bossMultiplier;
    const types: HazardType[] = ['shrapnel', 'shrapnel', 'missile'];
    if (g.elapsed >= 90) types.push('cluster', 'cluster');
    spawnHazard(g, types[Math.floor(Math.random() * types.length)]);
    if (g.difficulty >= 4 && Math.random() < 0.25 && !g.boss) {
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

        // Player collision + proximity scoring
        const distToPlayer = dist(h.targetPos, p.pos);
        if (distToPlayer < h.size * 1.5 + p.size) {
          damagePlayer(g, h.damage, h.targetPos);
        } else {
          // Proximity bonus: closer = more points
          const maxBonusDist = 150;
          if (distToPlayer < maxBonusDist) {
            const proximity = 1 - (distToPlayer / maxBonusDist);
            const bonus = Math.floor(10 + proximity * 90); // 10-100 points
            g.score += bonus;
            if (distToPlayer < h.size * 1.5 + p.size + CLOSE_CALL_DIST) {
              g.stats.closeCalls++;
              addFloatingText(g, `Close Call! +${bonus}`, { x: p.pos.x, y: p.pos.y - 40 }, '#fbbf24');
            } else {
              addFloatingText(g, `+${bonus}`, { x: h.targetPos.x, y: h.targetPos.y - 20 }, '#aaa');
            }
          }
        }

        // Cluster split — progressive: 2 at 90s, 3 at 150s, 4 at 210s, 5 at 270s
        if (h.type === 'cluster') {
          const splitCount = Math.min(5, 2 + Math.floor(Math.max(0, g.elapsed - 90) / 60));
          for (let i = 0; i < splitCount; i++) {
            const angle = (Math.PI * 2 / splitCount) * i + Math.random() * 0.4 - Math.PI / 2;
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
      h.pos.x += (dx / d) * h.speed * g.slowMoFactor * dt;
        h.pos.y += (dy / d) * h.speed * g.slowMoFactor * dt;
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
        pu.groundTimer = 0;
      }
    } else {
      // Timeout on ground: 3s base, decreasing with difficulty
      const maxGroundTime = Math.max(1.5, 3 - (g.difficulty - 1) * 0.3);
      pu.groundTimer += dt;
      if (pu.groundTimer >= maxGroundTime) {
        pu.active = false;
        spawnParticles(g, pu.pos, 5, '#888', 60, false);
        continue;
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
        case 'ammo':
          p.ammo = Math.min(30, p.ammo + 8);
          addFloatingText(g, '+8 Ammo', { x: p.pos.x, y: p.pos.y - 40 }, '#a855f7');
          spawnParticles(g, p.pos, 8, '#a855f7', 80);
          break;
        case 'slowmo':
          g.slowMoTimer = 5;
          addFloatingText(g, 'SLOW-MO!', { x: p.pos.x, y: p.pos.y - 40 }, '#06b6d4');
          spawnParticles(g, p.pos, 12, '#06b6d4', 100);
          sfxSlowmo();
          break;
        case 'magnet':
          g.magnetTimer = 8;
          addFloatingText(g, 'MAGNET!', { x: p.pos.x, y: p.pos.y - 40 }, '#ef4444');
          spawnParticles(g, p.pos, 10, '#ef4444', 90);
          sfxMagnet();
          break;
        case 'airstrike': {
          addFloatingText(g, 'AIRSTRIKE!', { x: p.pos.x, y: p.pos.y - 40 }, '#fbbf24');
          g.damageFlash = 0.5; // white flash
          sfxAirstrike();
          // Destroy all hazards
          for (const h of g.hazards) {
            if (h.active) {
              addExplosion(g, h.pos, h.size * 2);
              spawnParticles(g, h.pos, 6, '#f97316', 150);
              h.active = false;
              g.score += 15;
            }
          }
          // Destroy all drones
          for (const dr of g.drones) {
            if (dr.active) {
              addExplosion(g, dr.pos, 20);
              spawnParticles(g, dr.pos, 10, '#f97316', 180);
              dr.active = false;
              g.score += 30;
              g.stats.dronesDestroyed++;
            }
          }
          break;
        }
      }
    }
  }

  // === Magnet attraction ===
  if (g.magnetTimer > 0) {
    const magnetRange = g.width * 0.5;
    for (const pu2 of g.powerUps) {
      if (!pu2.active) continue;
      const dx = p.pos.x - pu2.pos.x;
      const dy = p.pos.y - pu2.pos.y;
      const d2 = Math.sqrt(dx * dx + dy * dy);
      if (d2 < magnetRange && d2 > 5) {
        const speed = 200 * (1 - d2 / magnetRange);
        pu2.pos.x += (dx / d2) * speed * dt;
        pu2.pos.y += (dy / d2) * speed * dt;
      }
    }
  }

  // === Drones ===
  if (g.elapsed >= 90) {
    g.droneTimer -= dt;
    if (g.droneTimer <= 0) {
      const timeSinceDrones = g.elapsed - 90;
      const baseInterval = 30;
      const minInterval = 10;
      const interval = Math.max(minInterval, baseInterval - timeSinceDrones * 0.05);
      g.droneTimer = interval + Math.random() * 5;
      spawnDrone(g);
    }
  }

  for (const d of g.drones) {
    if (!d.active) continue;
    d.wobble += dt;

    // Emit damage smoke if health < maxHealth
    if (d.health < d.maxHealth && d.health > 0) {
      if (Math.random() < 0.4) {
        addSmokeTrail(g, { x: d.pos.x + (Math.random() - 0.5) * d.size, y: d.pos.y + (Math.random() - 0.5) * d.size * 0.5 }, d.size * 0.4);
      }
      // Fire sparks
      if (Math.random() < 0.15) {
        spawnParticles(g, { x: d.pos.x + (Math.random() - 0.5) * d.size, y: d.pos.y }, 1, '#f97316', 40, false);
      }
    }

    if (d.state === 'entering') {
      const dx = d.entryTarget.x - d.pos.x;
      const dy = d.entryTarget.y - d.pos.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 5) {
        // After entering, start aggro delay before tracking
        d.state = 'tracking';
        d.hoverTimer = d.aggroDelay;
      } else {
        d.pos.x += (dx / dd) * d.speed * 2 * dt;
        d.pos.y += (dy / dd) * d.speed * 2 * dt;
      }
    } else if (d.state === 'tracking') {
      // Aggro delay — drone hovers/patrols before actively tracking
      if (d.hoverTimer > 0) {
        d.hoverTimer -= dt;
        // Gentle idle movement (patrol)
        d.pos.x += Math.sin(d.wobble * 1.5) * 20 * dt;
        d.pos.y += Math.cos(d.wobble * 1.2) * 8 * dt;
      } else {
        // Active tracking with accuracy-based steering
        const dx = p.pos.x - d.pos.x;
        const targetY = d.tier === 'bomber' ? p.pos.y - 80 - d.altitudeOffset * 0.5 : p.pos.y - 30 - d.altitudeOffset * 0.5;
        const dy = targetY - d.pos.y;
        const dd = Math.sqrt(dx * dx + dy * dy);
        
        if (dd > 0) {
          const steerForce = 100 * d.trackingAccuracy;
          d.vel.x += (dx / dd) * steerForce * dt;
          d.vel.y += (dy / dd) * steerForce * dt;
          
          if (d.tier === 'scout') {
            d.vel.x += (Math.random() - 0.5) * 60 * dt;
            d.vel.y += (Math.random() - 0.5) * 30 * dt;
          }

          // === Separation force: push away from other active drones ===
          for (const other of g.drones) {
            if (!other.active || other === d) continue;
            const sx = d.pos.x - other.pos.x;
            const sy = d.pos.y - other.pos.y;
            const sd = Math.sqrt(sx * sx + sy * sy);
            const minSep = d.size + other.size + 30;
            if (sd < minSep && sd > 0) {
              const force = (minSep - sd) * 3;
              d.vel.x += (sx / sd) * force * dt;
              d.vel.y += (sy / sd) * force * dt;
            }
          }
          
          const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
          if (vLen > d.speed) {
            d.vel.x = (d.vel.x / vLen) * d.speed;
            d.vel.y = (d.vel.y / vLen) * d.speed;
          }
        }
        d.pos.x += d.vel.x * g.slowMoFactor * dt;
        d.pos.y += d.vel.y * g.slowMoFactor * dt;

        // Keep drones in upper portion of screen
        const minY = g.height * 0.08;
        const maxY = g.height * 0.58;
        d.pos.y = Math.max(minY, Math.min(maxY, d.pos.y));
        d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

        // Bomber: drop bombs when above player
        if (d.tier === 'bomber') {
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 40) {
            d.bombTimer = 0;
            // Spawn a hazard directly below drone
            const bomb = getFromPool<Hazard>(g.hazards, () => ({
              active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
              speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
              rotation: 0, trailTimer: 0
            }));
            bomb.type = 'cluster';
            bomb.pos = { x: d.pos.x, y: d.pos.y + d.size };
            bomb.targetPos = { x: d.pos.x + (Math.random() - 0.5) * 30, y: g.height * GROUND_RATIO };
            bomb.speed = 200;
            bomb.size = 10;
            bomb.damage = 18;
            bomb.warningDuration = 0;
            bomb.warningTimer = 0;
            bomb.falling = true;
            bomb.splitDone = false;
            bomb.rotation = 0;
            bomb.trailTimer = 0;
            sfxWarning();
            addFloatingText(g, '💣', { x: d.pos.x, y: d.pos.y + 15 }, '#ef4444');
          }
        }

        // Collision with player (scouts/trackers only do kamikaze)
        if (d.tier !== 'bomber' && dist(d.pos, p.pos) < d.size + p.size) {
          const dmg = d.tier === 'scout' ? 8 : 15;
          damagePlayer(g, dmg, d.pos);
          spawnParticles(g, d.pos, 12, '#ef4444', 120);
          addExplosion(g, d.pos, 20);
          sfxExplosion();
          d.active = false;
        }
      }

      // Destroy by fresh craters
      for (const c of g.craters) {
        if (c.life > c.maxLife - 0.15 && dist(d.pos, c.pos) < c.size + d.size) {
          d.health--;
          if (d.health <= 0) {
            d.active = false;
            spawnParticles(g, d.pos, 12, '#f97316', 150);
            addExplosion(g, d.pos, 18);
            sfxExplosion();
            const bonus = d.tier === 'bomber' ? 50 : d.tier === 'tracker' ? 35 : 25;
            addFloatingText(g, `Drone Down! +${bonus}`, d.pos, '#f97316');
            g.score += bonus;
            g.stats.dronesDestroyed++;
          }
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

  // === Update bullets ===
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    if (!b.active) { g.bullets.splice(i, 1); continue; }
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    if (b.pos.y < -20 || b.pos.x < -20 || b.pos.x > g.width + 20) {
      g.bullets.splice(i, 1);
      continue;
    }
    // Hit hazards (shrapnel=1, missile=2, cluster=2)
    let hit = false;
    for (const h of g.hazards) {
      if (!h.active || !h.falling) continue;
      if (dist(b.pos, h.pos) < h.size + b.size + 4) {
        h.active = false;
        sfxExplosion();
        addExplosion(g, h.pos, h.size * 2);
        spawnParticles(g, h.pos, 8, '#f97316', 150);
        const distToPlayer = dist(h.pos, p.pos);
        const proximity = Math.max(0, 1 - distToPlayer / 200);
        const bonus = Math.floor(20 + proximity * 80);
        g.score += bonus;
        addFloatingText(g, `Shot! +${bonus}`, h.pos, '#a855f7');
        hit = true;
        break;
      }
    }
    if (hit) { g.bullets.splice(i, 1); continue; }
    // Hit drones
    for (const d of g.drones) {
      if (!d.active) continue;
      if (dist(b.pos, d.pos) < d.size + b.size + 4) {
        d.health--;
        spawnParticles(g, b.pos, 6, '#f97316', 100);
        addExplosion(g, b.pos, 8); // small hit flash
        if (d.health <= 0) {
          d.active = false;
          addExplosion(g, d.pos, 20);
          sfxExplosion();
          spawnParticles(g, d.pos, 15, '#f97316', 180);
          spawnParticles(g, d.pos, 8, '#555', 100);
          const bonus = d.tier === 'bomber' ? 80 : d.tier === 'tracker' ? 50 : 30;
          addFloatingText(g, `Shot Down! +${bonus}`, d.pos, '#a855f7');
          g.score += bonus;
          g.stats.dronesDestroyed++;
        } else {
          // Damaged but not destroyed — visual feedback
          addFloatingText(g, `HIT!`, b.pos, '#ff6b35');
        }
        hit = true;
        break;
      }
    }
    if (hit) { g.bullets.splice(i, 1); continue; }
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

  // === Weather ===
  g.weatherIntensity = Math.min(1, Math.max(0, (g.elapsed - 120) / 180));
  // Rain
  const targetDrops = Math.floor(g.weatherIntensity * 60);
  while (g.rainDrops.length < targetDrops) {
    g.rainDrops.push({
      x: Math.random() * g.width * 1.2 - g.width * 0.1,
      y: Math.random() * g.height * 0.8,
      speed: 400 + Math.random() * 300,
      len: 8 + Math.random() * 12,
    });
  }
  for (let i = g.rainDrops.length - 1; i >= 0; i--) {
    const rd = g.rainDrops[i];
    rd.y += rd.speed * dt;
    rd.x += g.windOffset * 50 * dt;
    if (rd.y > g.height * 0.78) {
      if (g.rainDrops.length > targetDrops) {
        g.rainDrops.splice(i, 1);
      } else {
        rd.y = -10;
        rd.x = Math.random() * g.width * 1.2 - g.width * 0.1;
      }
    }
  }
  // Lightning
  if (g.elapsed > 180) {
    g.lightningTimer -= dt;
    if (g.lightningTimer <= 0) {
      g.lightningTimer = 15 + Math.random() * 20;
      g.lightningFlash = 0.4;
      sfxThunder();
    }
  }
  if (g.lightningFlash > 0) g.lightningFlash -= dt * 3;

  // === Heartbeat ===
  updateHeartbeat(g.difficulty);

  // === Boss ===
  g.bossTimer -= dt;
  if (g.bossTimer <= 0 && !g.boss) {
    spawnBoss(g);
    g.bossTimer = 240 + g.bossCount * 30;
  }
  if (g.boss && !g.boss.defeated) {
    updateBoss(g, dt);
  }
}

// ========== BOSS SYSTEM ==========

function spawnBoss(g: GameData) {
  const count = g.bossCount;
  // First boss: 10 HP, subsequent: 15 + count*5
  const baseHP = count === 0 ? 10 : 15 + count * 5;
  const side = Math.random() < 0.5 ? -80 : g.width + 80;
  // First boss: slower attacks (4.5s cooldown)
  const cooldown = count === 0 ? 4.5 : Math.max(1.5, 3 - count * 0.3);
  g.boss = {
    pos: { x: side, y: g.height * 0.12 },
    vel: { x: 0, y: 0 },
    health: baseHP,
    maxHealth: baseHP,
    size: 80,
    phase: 1,
    attackTimer: cooldown,
    attackCooldown: cooldown,
    attackPattern: 'missiles',
    entered: false,
    defeated: false,
    entryTarget: { x: g.width * 0.5, y: g.height * 0.12 },
    carpetX: 0,
    carpetDir: 1,
    spawnedDrones: 0,
    damageFlash: 0,
  };
  sfxBossSiren();
  g.waveWarnings.push({
    text: '⚠ GUNSHIP INCOMING!',
    subText: 'PREPARE FOR HEAVY ASSAULT',
    life: 4,
    maxLife: 4,
    color: '#dc2626',
  });
}

function updateBoss(g: GameData, dt: number) {
  const boss = g.boss!;
  const p = g.player;
  const groundY = g.height * GROUND_RATIO;

  boss.damageFlash = Math.max(0, boss.damageFlash - dt * 4);

  // Entry
  if (!boss.entered) {
    const dx = boss.entryTarget.x - boss.pos.x;
    const dy = boss.entryTarget.y - boss.pos.y;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < 5) {
      boss.entered = true;
    } else {
      boss.pos.x += (dx / dd) * 60 * dt;
      boss.pos.y += (dy / dd) * 60 * dt;
    }
    return;
  }

  // Phase determination with cooldown between phases
  const hpRatio = boss.health / boss.maxHealth;
  const newPhase = hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3;
  if (newPhase !== boss.phase) {
    boss.phase = newPhase;
    // Phase transition: 2s cooldown + warning + power-up drop
    boss.attackTimer = 2.0;
    const phaseText = newPhase === 2 ? 'PHASE 2!' : 'PHASE 3!';
    g.waveWarnings.push({ text: `⚡ ${phaseText}`, subText: 'BOSS PATTERN SHIFT', life: 2.5, maxLife: 2.5, color: '#fbbf24' });
    // Drop a random power-up as mid-fight reward
    const rewardTypes: PowerUpType[] = ['medkit', 'ammo', 'shield'];
    const pu = getFromPool<PowerUp>(g.powerUps, () => ({
      active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
      parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
    }), 20);
    pu.type = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
    pu.pos = { x: g.width * 0.3 + Math.random() * g.width * 0.4, y: -20 };
    pu.size = 14;
    pu.parachuting = true;
    pu.fallSpeed = 40;
    pu.bobTimer = 0;
    pu.groundTimer = 0;
  }

  // Slow patrol movement
  boss.pos.x += Math.sin(g.elapsed * 0.5) * 30 * dt;
  boss.pos.y += Math.cos(g.elapsed * 0.7) * 10 * dt;
  boss.pos.y = Math.max(g.height * 0.08, Math.min(g.height * 0.2, boss.pos.y));
  boss.pos.x = Math.max(40, Math.min(g.width - 40, boss.pos.x));

  // Attacks
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    boss.attackTimer = boss.attackCooldown;
    if (boss.phase === 1) {
      // Phase 1: 3 rapid missiles
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (!g.boss || g.boss.defeated) return;
          const h = getFromPool<Hazard>(g.hazards, () => ({
            active: false, type: 'missile' as const, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
            speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
            rotation: 0, trailTimer: 0
          }));
          h.type = 'missile';
          h.pos = { x: g.boss!.pos.x + (Math.random() - 0.5) * 30, y: g.boss!.pos.y + 20 };
          h.targetPos = { x: p.pos.x + (Math.random() - 0.5) * 60, y: groundY };
          h.speed = 250;
          h.size = 10;
          h.damage = g.bossCount === 0 ? 12 : 18;
          h.warningDuration = g.bossCount === 0 ? 1.2 : 0.6;
          h.warningTimer = h.warningDuration;
          h.falling = false;
          h.rotation = 0;
          h.trailTimer = 0;
          sfxWarning();
        }, i * 300);
      }
    } else if (boss.phase === 2) {
      // Phase 2: carpet bombing from left to right
      const bombCount = 6;
      for (let i = 0; i < bombCount; i++) {
        setTimeout(() => {
          if (!g.boss || g.boss.defeated) return;
          const bx = (g.width / (bombCount + 1)) * (i + 1);
          const h = getFromPool<Hazard>(g.hazards, () => ({
            active: false, type: 'shrapnel' as const, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
            speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
            rotation: 0, trailTimer: 0
          }));
          h.type = 'cluster';
          h.pos = { x: bx, y: g.boss!.pos.y + 20 };
          h.targetPos = { x: bx, y: groundY };
          h.speed = 250;
          h.size = 12;
          h.damage = g.bossCount === 0 ? 10 : 16;
          h.warningDuration = g.bossCount === 0 ? 1.0 : 0.4;
          h.warningTimer = h.warningDuration;
          h.falling = false;
          h.rotation = 0;
          h.trailTimer = 0;
          sfxWarning();
        }, i * 200);
      }
    } else {
      // Phase 3: spawn escort drones + missiles
      if (boss.spawnedDrones < 2 + g.bossCount) {
        boss.spawnedDrones++;
        spawnDrone(g);
      }
      // Also fire 2 missiles
      for (let i = 0; i < 2; i++) {
        const h = getFromPool<Hazard>(g.hazards, () => ({
          active: false, type: 'missile' as const, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
          speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
          rotation: 0, trailTimer: 0
        }));
        h.type = 'missile';
        h.pos = { x: boss.pos.x + (i === 0 ? -20 : 20), y: boss.pos.y + 15 };
        h.targetPos = { x: p.pos.x + (Math.random() - 0.5) * 80, y: groundY };
        h.speed = 280;
        h.size = 10;
        h.damage = g.bossCount === 0 ? 14 : 20;
        h.warningDuration = g.bossCount === 0 ? 1.0 : 0.5;
        h.warningTimer = h.warningDuration;
        h.falling = false;
        h.rotation = 0;
        h.trailTimer = 0;
        sfxWarning();
      }
    }
  }

  // Bullet hits on boss
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    if (!b.active) continue;
    if (dist(b.pos, boss.pos) < boss.size * 0.5 + b.size) {
      boss.health--;
      boss.damageFlash = 0.3;
      spawnParticles(g, b.pos, 5, '#f97316', 100);
      addExplosion(g, b.pos, 8);
      g.bullets.splice(i, 1);
      if (boss.health <= 0) {
        defeatBoss(g);
      }
    }
  }

  // Damage smoke
  if (boss.health < boss.maxHealth * 0.7 && Math.random() < 0.5) {
    addSmokeTrail(g, { x: boss.pos.x + (Math.random() - 0.5) * boss.size * 0.6, y: boss.pos.y + (Math.random() - 0.5) * 20 }, 6);
  }
  if (boss.health < boss.maxHealth * 0.35 && Math.random() < 0.3) {
    spawnParticles(g, { x: boss.pos.x + (Math.random() - 0.5) * boss.size * 0.5, y: boss.pos.y }, 1, '#f97316', 40, false);
  }
}

function defeatBoss(g: GameData) {
  const boss = g.boss!;
  boss.defeated = true;
  g.bossCount++;
  g.stats.bossesDefeated++;

  // Cinematic explosion sequence
  sfxBossExplosion();
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const ox = (Math.random() - 0.5) * boss.size;
      const oy = (Math.random() - 0.5) * 40;
      addExplosion(g, { x: boss.pos.x + ox, y: boss.pos.y + oy }, 30);
      spawnParticles(g, { x: boss.pos.x + ox, y: boss.pos.y + oy }, 12, '#f97316', 200);
      sfxExplosion();
    }, i * 250);
  }
  setTimeout(() => {
    addExplosion(g, boss.pos, 60);
    spawnParticles(g, boss.pos, 25, '#fbbf24', 300);
    g.screenShake = { x: 20, y: -20 };
    g.boss = null;
  }, 1300);

  // Rewards
  g.score += 500;
  addFloatingText(g, `BOSS DOWN! +500`, boss.pos, '#fbbf24');

  // Guaranteed power-up drop
  const pu = getFromPool<PowerUp>(g.powerUps, () => ({
    active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
    parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
  }), 20);
  const types: PowerUpType[] = ['medkit', 'shield', 'ammo', 'slowmo'];
  pu.type = types[Math.floor(Math.random() * types.length)];
  pu.pos = { x: boss.pos.x, y: boss.pos.y };
  pu.size = 14;
  pu.parachuting = true;
  pu.fallSpeed = 30;
  pu.bobTimer = 0;
  pu.groundTimer = 0;
}
