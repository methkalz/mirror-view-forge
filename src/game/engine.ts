import {
  GameData, InputState, Hazard, PowerUp, Particle, Vec2, Crater, FloatingText, Drone, Bullet,
  HazardType, PowerUpType, Explosion, SmokeTrail, Cloud, AmbientParticle, WaveWarning, Boss, DroneTier,
  FirePool, GasCloud, UpgradeCard, DeliveryBike, IntroPhase
} from './types';
import type { DifficultyProfile, RemoteWaveConfig } from './config';
import { getFromPool } from './pool';
import { sfxExplosion, sfxImpactLight, sfxImpactHeavy, sfxPickup, sfxDamage, sfxDash, sfxInterceptor, sfxFootstep, sfxWarning, sfxSlowmo, sfxMagnet, sfxAirstrike, sfxBossSiren, sfxBossExplosion, sfxThunder, sfxShoot1, sfxShoot2, sfxShoot3, sfxCombo, sfxCloseCall, sfxBikeEngine, sfxBikeBrake, sfxBikeIdle, sfxBikeDepart, sfxWarningAlert, sfxUpgradeAlert, sfxWaveComplete, sfxLevelUp, sfxGameOver, sfxGameStart, sfxUpgradeSelect, sfxScoreTick, startPeriodicAmbient, stopPeriodicAmbient, sfxWarningShrapnel, sfxWarningMissile, sfxWarningCluster, sfxWarningDrone, sfxWarningBoss, sfxWarningHazard, sfxWarningBomber } from './audio';

const DASH_SPEED = 500;
const DASH_DURATION = 0.25;
const DASH_COOLDOWN = 0.8;
const CLOSE_CALL_DIST = 45;
const PLAYER_RADIUS = 22;
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
      shootTimer: 0,
      gasMaskTimer: 0,
      extinguisherTimer: 0,
      maxAmmo: 30,
      speedMultiplier: 1,
      slowMoDuration: 5,
      shieldDuration: 8,
      pickupRange: 5,
      bulletDamage: 1,
      dashCooldownBase: DASH_COOLDOWN,
    },
    hazards: [],
    powerUps: [],
    particles: [],
    craters: [],
    explosions: [],
    smokeTrails: [],
    floatingTexts: [],
    drones: [],
    clouds: initClouds(),
    ambientParticles: [],
    bullets: [],
    score: 0,
    highScore: parseInt(localStorage.getItem('skyfall_hi') || '0'),
    elapsed: 0,
    difficulty: 1,
    spawnTimer: 3.5,
    powerUpTimer: 10 + Math.random() * 5,
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
    magnetFlashTimer: 0,
    slowMoFactor: 1,
    boss: null,
    bossCount: 0,
    bossTimer: 240,
    rainDrops: [],
    lightningTimer: 0,
    lightningFlash: 0,
    weatherIntensity: 0,
    cinematicWarning: null,
    warningLockUntil: 0,
    pendingWaveEvents: [],
    activatedWaveEvents: new Set(),
    missileStartTime: 5 + Math.random() * 5,
    hitStopTimer: 0,
    comboCount: 0,
    comboTimer: 0,
    comboMultiplier: 1,
    microSlowTimer: 0,
    deathTimer: 0,
    deathPhase: 'alive',
    firstAmmoDropped: false,
    cargoTimer: 120,
    clearingTimer: 0,
    firePools: [],
    gasClouds: [],
    incendiaryTimer: 160,
    chemicalTimer: 200,
    // Wave system
    waveNumber: 1,
    wavePhase: 'active',
    waveTimer: 60,
    levelNumber: 1,
    deliveryBike: null,
    upgradeCards: [],
    selectedUpgrade: null,
    cardsShownTimer: 0,
    waveElapsed: 0,
    cameraZoom: 1,
    cameraZoomTarget: 1,
    cameraFocusX: w / 2,
    cameraFocusY: h * GROUND_RATIO,
    bikeZoomTimer: 0,
    waveEndSlowMo: 0,
    waveFinale: false,
    waveAnnounceTimer: 0,
    activeHazardCount: 0,
    // Intro system
    introPhase: 'done' as IntroPhase,
    introTimer: 0,
    introBike: null,
    introPlayerOffset: 0,
    introPlayerJumpY: 0,
    introTransitionTimer: 0,
    tutorialPage: 0,
    tutorialFade: 1,
    difficultyProfile: null,
    remoteWaveOverrides: [],
    gasMaskOffer: null,
    gasMaskOwned: false,
    gasMaskOfferDelay: 0,
    scoreCountdown: null,
  };
}

function initClouds(): Cloud[] {
  return [];
}

export function resetGame(g: GameData) {
  const groundY = g.height * GROUND_RATIO;
  g.state = 'intro';
  g.player.pos = { x: g.width / 2, y: groundY };
  g.player.groundY = groundY;
  g.player.health = 100;
  g.player.maxHealth = 100;
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
  g.player.shootTimer = 0;
  g.player.gasMaskTimer = 0;
  g.player.extinguisherTimer = 0;
  g.player.maxAmmo = 30;
  g.player.speedMultiplier = 1;
  g.player.slowMoDuration = 5;
  g.player.shieldDuration = 8;
  g.player.pickupRange = 5;
  g.player.bulletDamage = 1;
  g.player.dashCooldownBase = DASH_COOLDOWN;
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
  g.clouds = initClouds();
  g.score = 0;
  g.elapsed = 0;
  g.difficulty = 1;
  g.spawnTimer = 3.5;
  g.powerUpTimer = 10 + Math.random() * 5;
  g.droneTimer = 90; // will be overridden below by wave1 recipe
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
  g.cinematicWarning = null;
  g.warningLockUntil = 0;
  g.pendingWaveEvents = [];
  g.activatedWaveEvents = new Set();
  g.missileStartTime = 5 + Math.random() * 5;
  g.hitStopTimer = 0;
  g.comboCount = 0;
  g.comboTimer = 0;
  g.comboMultiplier = 1;
  g.microSlowTimer = 0;
  g.deathTimer = 0;
  g.deathPhase = 'alive';
  g.firstAmmoDropped = false;
  g.cargoTimer = 120;
  g.firePools = [];
  g.gasClouds = [];
  g.incendiaryTimer = 160; // will be overridden below by wave1 recipe
  g.chemicalTimer = 200; // will be overridden below by wave1 recipe
  g.gasMaskOffer = null;
  g.gasMaskOwned = false;
  g.gasMaskOfferDelay = 0;
  g.scoreCountdown = null;
  // Wave system reset
  g.waveNumber = 1;
  g.wavePhase = 'active';
  g.levelNumber = 1;
  // Apply wave 1 recipe from overrides/profile instead of hardcoded 60
  const wave1Recipe = getWaveRecipe(1, g);
  g.waveTimer = wave1Recipe.duration || 60;
  g.bulletLevel = wave1Recipe.bulletLevel;
  // Override timers from wave 1 recipe so admin settings apply immediately
  g.spawnTimer = wave1Recipe.spawnInterval || g.spawnTimer;
  g.droneTimer = wave1Recipe.droneInterval > 0 ? (wave1Recipe.droneInterval * 0.5) : 90;
  g.incendiaryTimer = wave1Recipe.hasIncendiary ? (8 + Math.random() * 10) : 160;
  g.chemicalTimer = wave1Recipe.hasChemical ? (10 + Math.random() * 10) : 200;
  g.deliveryBike = null;
  g.upgradeCards = [];
  g.selectedUpgrade = null;
  g.cardsShownTimer = 0;
  g.waveElapsed = 0;
  g.waveEndSlowMo = 0;
  g.waveFinale = false;
  g.activeHazardCount = 0;
  // Intro setup
  g.introPhase = 'bikeEnter';
  g.introTimer = 0;
  g.introPlayerOffset = 0;
  g.introPlayerJumpY = 0;
  g.introTransitionTimer = 0;
  const bikeStartX = -80;
  g.introBike = {
    active: true,
    pos: { x: bikeStartX, y: g.player.groundY },
    speed: 280,
    facingRight: true,
    phase: 'entering',
    dropX: g.width / 2,
    dropped: false,
    wheelAnim: 0,
    idleTimer: 0,
    shakeOffset: { x: 0, y: 0 },
  };
  g.player.pos = { x: bikeStartX, y: g.player.groundY };
  g.cameraZoomTarget = 1.5;
  g.cameraZoom = 1;
  g.cameraFocusX = g.width / 2;
  g.cameraFocusY = g.player.groundY;
}

// ─── Intro Sequence ──────────────────────────────────
export function updateIntro(g: GameData, dt: number) {
  g.introTimer += dt;
  const bike = g.introBike;
  if (!bike) return;

  // Cinematic easeOutExpo camera zoom
  const zoomDiff = g.cameraZoomTarget - g.cameraZoom;
  const easeOutZoom = 1 - Math.pow(0.005, dt * 2.5);
  g.cameraZoom += zoomDiff * easeOutZoom;

  // Update wheel animation
  bike.wheelAnim += bike.speed * dt * 0.05;

  const centerX = g.width / 2;

  switch (g.introPhase) {
    case 'bikeEnter': {
      // Play bike engine sound at start
      if (g.introTimer < dt * 2) sfxBikeEngine();
      // Bike enters from left, decelerates toward center
      const distToCenter = centerX - bike.pos.x;
      // Decelerate as we approach
      const decelZone = 200;
      if (distToCenter < decelZone) {
        bike.speed = Math.max(30, 280 * (distToCenter / decelZone));
      }
      bike.pos.x += bike.speed * dt;
      // Player rides with bike
      g.player.pos.x = bike.pos.x;

      // Camera follows bike
      g.cameraFocusX = bike.pos.x;

      if (bike.pos.x >= centerX) {
        bike.pos.x = centerX;
        g.player.pos.x = centerX;
        bike.speed = 0;
        g.introPhase = 'bikeStop';
        g.introTimer = 0;
        // Engine idle shake
        bike.phase = 'idle';
        sfxBikeBrake();
        sfxBikeIdle();
      }
      break;
    }
    case 'bikeStop': {
      // Organic Perlin-like idle vibration (multi-sine, not random)
      const tS = g.elapsed;
      const vibeX = Math.sin(tS * 12) * 0.3 + Math.sin(tS * 19) * 0.15 + Math.sin(tS * 31) * 0.08;
      const vibeY = Math.sin(tS * 14) * 0.2 + Math.sin(tS * 23) * 0.1;
      bike.shakeOffset = { x: vibeX, y: vibeY };
      g.cameraFocusX = bike.pos.x;

      // Camera shake on brake impact — stronger, exponential decay
      if (g.introTimer < dt * 2) {
        g.screenShake = { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2 };
      } else if (g.introTimer < 0.2) {
        const decay = Math.pow(0.85, (g.introTimer / dt));
        g.screenShake = { x: g.screenShake.x * decay, y: g.screenShake.y * decay };
      } else {
        g.screenShake = { x: 0, y: 0 };
      }

      if (g.introTimer > 1.2) {
        g.introPhase = 'playerDismount';
        g.introTimer = 0;
        g.introPlayerOffset = 0;
      }
      break;
    }
    case 'playerDismount': {
      // Organic vibration continues (lighter)
      const tD = g.elapsed;
      const vibeXD = Math.sin(tD * 12) * 0.2 + Math.sin(tD * 19) * 0.1;
      const vibeYD = Math.sin(tD * 14) * 0.1;
      bike.shakeOffset = { x: vibeXD, y: vibeYD };
      
      // 4-phase professional dismount with BACKWARD jump arc
      const dismountDuration = 1.8;
      const dp = Math.min(1, g.introTimer / dismountDuration);
      
      // Phase 0: Anticipation [0→0.15] — still on bike
      // Phase 1: Arc Leg Swing [0.15→0.40] — leg swings over seat
      // Phase 2: Gravity Drop [0.40→0.70] — parabolic jump BEHIND bike
      // Phase 3: Landing [0.70→1.0] — squat absorb + settle
      if (dp < 0.15) {
        // Still on bike, subtle weight shift
        g.player.pos.x = bike.pos.x;
        g.introPlayerJumpY = 0;
      } else if (dp < 0.70) {
        // Parabolic jump arc: up then down, moving BEHIND (left of) bike
        const jumpT = (dp - 0.15) / 0.55; // 0→1 over phases 1+2
        const horizontalEase = jumpT * jumpT * (3 - 2 * jumpT); // smoothstep
        g.introPlayerOffset = -horizontalEase * 40; // negative = behind bike
        g.player.pos.x = bike.pos.x + g.introPlayerOffset;
        // Parabolic arc: initialVelocity * t - 0.5 * g * t²
        const initialVelocity = 3.5;
        const gravity = 5.0;
        g.introPlayerJumpY = -(initialVelocity * jumpT - 0.5 * gravity * jumpT * jumpT) * 12;
      } else {
        // Landing phase: ease to final position
        const landT = (dp - 0.70) / 0.30;
        const easeOut = 1 - (1 - landT) * (1 - landT);
        g.introPlayerOffset = -40 + easeOut * 5; // settle slightly
        g.player.pos.x = bike.pos.x + g.introPlayerOffset;
        g.introPlayerJumpY = 0; // on the ground
      }
      g.player.facingRight = true;

      // Camera tracks midpoint
      g.cameraFocusX = (bike.pos.x + g.player.pos.x) / 2;

      if (g.introTimer > dismountDuration) {
        g.player.pos.x = bike.pos.x - 35;
        g.player.pos.y = g.player.groundY;
        g.introPhase = 'bikeLeave';
        g.introTimer = 0;
        g.introTransitionTimer = 0;
        bike.phase = 'leaving';
        bike.speed = 0;
        bike.facingRight = true;
        g.cameraZoomTarget = 1.0;
        g.player.anim = 'idle';
      }
      break;
    }
    case 'bikeLeave': {
      // Play depart sound at start
      if (g.introTimer < dt * 2) sfxBikeDepart();
      // Smooth transition timer for fade between intro char and real player
      g.introTransitionTimer += dt;
      
      // Bike accelerates and leaves to the right
      bike.speed += 400 * dt;
      bike.pos.x += bike.speed * dt;
      bike.wheelAnim += bike.speed * dt * 0.05;
      bike.shakeOffset = { x: 0, y: 0 };

      // Player looks at departing bike (faces right toward bike)
      g.player.facingRight = true;
      g.player.anim = 'idle';

      // Camera follows player
      g.cameraFocusX = g.player.pos.x;

      if (bike.pos.x > g.width + 100) {
        g.introPhase = 'done';
        g.introTimer = 0;
        g.introBike = null;
        g.state = 'playing';
        g.cameraZoomTarget = 1.0;
        g.cameraZoom = 1.0;
        sfxGameStart();
        startPeriodicAmbient();
        g.player.facingRight = true; // reset facing for gameplay
      }
      break;
    }
    case 'done':
      break;
  }
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

const MAX_MISSILE_SPEED = 450; // missile can't cross screen in < 0.8s

// ===== WAVE RECIPE SYSTEM =====
interface WaveRecipe {
  threats: HazardType[];
  maxConcurrent: number;
  spawnInterval: number;
  droneInterval: number;
  droneTiers: DroneTier[];
  clusterSplits: number;
  bulletLevel: number;
  phaseInDelay: number;
  hasChemical?: boolean;
  hasIncendiary?: boolean;
  hasBoss?: boolean;
  duration: number;
  surgeMultiplier: number;
  warningText?: string | null;
  warningColor?: string;
  warningType?: string;
  warningSoundKey?: string | null;
}

function generateWaveFromProfile(wave: number, profile: DifficultyProfile): WaveRecipe {
  // Determine available threats
  const threats: HazardType[] = [];
  for (const [type, unlockWave] of Object.entries(profile.threatsUnlock)) {
    if (wave >= unlockWave) threats.push(type as HazardType);
  }
  if (threats.length === 0) threats.push('shrapnel');

  // Determine available drones
  const droneTiers: DroneTier[] = [];
  for (const [type, unlockWave] of Object.entries(profile.dronesUnlock)) {
    if (wave >= unlockWave) droneTiers.push(type as DroneTier);
  }

  // Calculate scaling
  const maxConcurrent = Math.min(
    profile.maxConcurrentCap,
    Math.round(profile.baseMaxConcurrent + profile.concurrentGrowth * (wave - 1))
  );

  const spawnInterval = Math.max(
    profile.minSpawnInterval,
    profile.baseSpawnInterval - profile.spawnIntervalDecay * (wave - 1)
  );

  // Cluster splits (only after cluster is unlocked)
  const clusterUnlock = profile.threatsUnlock['cluster'] || 999;
  let clusterSplits = 0;
  if (wave >= clusterUnlock) {
    clusterSplits = Math.min(
      profile.clusterSplitsCap,
      Math.round(profile.clusterSplitsBase + profile.clusterSplitsGrowth * (wave - clusterUnlock))
    );
  }

  // Drone interval
  let droneInterval = 0;
  if (droneTiers.length > 0) {
    const firstDroneWave = Math.min(...Object.values(profile.dronesUnlock));
    const wavesSinceDrones = wave - firstDroneWave;
    droneInterval = Math.max(
      profile.droneIntervalMin,
      profile.droneIntervalBase * Math.pow(profile.droneIntervalDecay, wavesSinceDrones)
    );
  }

  // Bullet level
  let bulletLevel = 1;
  for (const [level, unlockWave] of Object.entries(profile.bulletLevelWaves)) {
    if (wave >= unlockWave) bulletLevel = Math.max(bulletLevel, parseInt(level));
  }

  // Boss
  const hasBoss = wave >= profile.bossStartWave && ((wave - profile.bossStartWave) % profile.bossEveryNWaves === 0);

  // Chemical/Incendiary (based on drones_unlock)
  const hasChemical = wave >= (profile.dronesUnlock['chemical'] || 999);
  const hasIncendiary = wave >= (profile.dronesUnlock['incendiary'] || 999);

  // Phase-in delay for waves introducing new threats
  const isNewThreatWave = Object.values(profile.threatsUnlock).includes(wave) ||
    Object.values(profile.dronesUnlock).includes(wave);
  const phaseInDelay = isNewThreatWave ? profile.phaseInDelay : 0;

  return {
    threats,
    maxConcurrent,
    spawnInterval,
    droneInterval,
    droneTiers,
    clusterSplits,
    bulletLevel,
    phaseInDelay,
    hasChemical,
    hasIncendiary,
    hasBoss,
    duration: profile.waveDuration,
    surgeMultiplier: 1,
  };
}

function remoteToRecipe(r: RemoteWaveConfig): WaveRecipe {
  return {
    threats: r.threats as HazardType[],
    maxConcurrent: r.maxConcurrent,
    spawnInterval: r.spawnRate,
    droneInterval: r.droneInterval,
    droneTiers: r.droneTypes as DroneTier[],
    clusterSplits: r.clusterSplits,
    bulletLevel: r.bulletLevel,
    phaseInDelay: r.phaseInDelay,
    hasChemical: r.hasChemical,
    hasIncendiary: r.hasIncendiary,
    hasBoss: r.hasBoss,
    duration: r.duration,
    surgeMultiplier: r.surgeMultiplier,
    warningText: r.warningText,
    warningColor: r.warningColor,
    warningType: r.warningType,
    warningSoundKey: r.warningSoundKey,
  };
}

function getWaveRecipe(wave: number, g?: GameData): WaveRecipe {
  // 1. Check remote overrides
  if (g?.remoteWaveOverrides) {
    const override = g.remoteWaveOverrides.find(r => r.waveNumber === wave);
    if (override) return remoteToRecipe(override);
  }

  // 2. Check difficulty profile for auto-generation
  if (g?.difficultyProfile) {
    return generateWaveFromProfile(wave, g.difficultyProfile);
  }

  // 3. Fallback to hardcoded recipes
  const D = 60; const S = 1; // default duration & surge
  if (wave <= 1) return { threats: ['shrapnel'], maxConcurrent: 3, spawnInterval: 2.5, droneInterval: 0, droneTiers: [], clusterSplits: 0, bulletLevel: 1, phaseInDelay: 0, duration: D, surgeMultiplier: S };
  if (wave === 2) return { threats: ['shrapnel', 'missile'], maxConcurrent: 4, spawnInterval: 2.2, droneInterval: 0, droneTiers: [], clusterSplits: 0, bulletLevel: 1, phaseInDelay: 12, duration: D, surgeMultiplier: S };
  if (wave === 3) return { threats: ['shrapnel', 'missile'], maxConcurrent: 5, spawnInterval: 2.0, droneInterval: 0, droneTiers: [], clusterSplits: 0, bulletLevel: 2, phaseInDelay: 0, duration: D, surgeMultiplier: S };
  if (wave === 4) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 4, spawnInterval: 2.1, droneInterval: 0, droneTiers: [], clusterSplits: 2, bulletLevel: 2, phaseInDelay: 15, duration: D, surgeMultiplier: S };
  if (wave === 5) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.8, droneInterval: 22, droneTiers: ['scout'], clusterSplits: 2, bulletLevel: 2, phaseInDelay: 12, duration: D, surgeMultiplier: S };
  if (wave === 6) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.7, droneInterval: 20, droneTiers: ['scout'], clusterSplits: 3, bulletLevel: 2, phaseInDelay: 0, duration: D, surgeMultiplier: S };
  if (wave === 7) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 7, spawnInterval: 1.6, droneInterval: 18, droneTiers: ['scout', 'tracker'], clusterSplits: 3, bulletLevel: 2, phaseInDelay: 12, duration: D, surgeMultiplier: S };
  if (wave === 8) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 7, spawnInterval: 1.5, droneInterval: 16, droneTiers: ['scout', 'tracker'], clusterSplits: 4, bulletLevel: 3, phaseInDelay: 15, duration: D, surgeMultiplier: S };
  if (wave === 9) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 8, spawnInterval: 1.4, droneInterval: 14, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 4, bulletLevel: 3, phaseInDelay: 12, duration: D, surgeMultiplier: S };
  if (wave === 10) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 8, spawnInterval: 1.3, droneInterval: 14, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 4, bulletLevel: 3, phaseInDelay: 15, hasChemical: true, duration: D, surgeMultiplier: S };
  if (wave === 11) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 9, spawnInterval: 1.2, droneInterval: 12, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 4, bulletLevel: 3, phaseInDelay: 15, hasIncendiary: true, duration: D, surgeMultiplier: S };
  if (wave === 12) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 10, spawnInterval: 1.0, droneInterval: 12, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 5, bulletLevel: 3, phaseInDelay: 12, hasBoss: true, hasChemical: true, hasIncendiary: true, duration: D, surgeMultiplier: S };
  const extra = wave - 12;
  return {
    threats: ['shrapnel', 'missile', 'cluster'],
    maxConcurrent: Math.min(12, 10 + Math.floor(extra / 2)),
    spawnInterval: Math.max(0.6, 0.9 - extra * 0.03),
    droneInterval: Math.max(8, 11 - extra * 0.5),
    droneTiers: ['scout', 'tracker', 'bomber'] as DroneTier[],
    clusterSplits: Math.min(6, 5 + Math.floor(extra / 3)),
    bulletLevel: 3,
    phaseInDelay: 0,
    hasBoss: extra % 3 === 0,
    hasChemical: true,
    hasIncendiary: true,
    duration: D,
    surgeMultiplier: S,
  };
}

// Warning messages for new threats introduced in each wave
export const WAVE_WARNINGS: Record<number, { id: string; text: string; sub: string; color: string; type: 'warning' | 'upgrade' }[]> = {
  1: [{ id: 'w1_shrapnel', text: 'تحذير: شظايا متساقطة!', sub: '', color: '#ef4444', type: 'warning' }],
  2: [{ id: 'w2_missile', text: 'تحذير: صواريخ قادمة!', sub: '', color: '#dc2626', type: 'warning' }],
  3: [{ id: 'w3_bullet2', text: 'تطوير: طلقة مزدوجة', sub: '', color: '#22c55e', type: 'upgrade' }],
  4: [{ id: 'w4_cluster', text: 'تحذير: صواريخ متشظية!', sub: '', color: '#f43f5e', type: 'warning' }],
  5: [{ id: 'w5_drone', text: 'تحذير: طائرات استطلاع!', sub: '', color: '#ef4444', type: 'warning' }],
  6: [{ id: 'w6_cluster3', text: 'تحذير: تشظي ثلاثي!', sub: '', color: '#ef4444', type: 'warning' }],
  7: [{ id: 'w7_tracker', text: 'تحذير: طائرات تتبع!', sub: '', color: '#dc2626', type: 'warning' }],
  8: [
    { id: 'w8_bullet3', text: 'تطوير: طلقة ثلاثية', sub: '', color: '#22c55e', type: 'upgrade' },
    { id: 'w8_cluster4', text: 'تحذير: تشظي رباعي!', sub: '', color: '#dc2626', type: 'warning' },
  ],
  9: [{ id: 'w9_bomber', text: 'تحذير: قاذفات قنابل!', sub: '', color: '#ef4444', type: 'warning' }],
  10: [
    { id: 'w10_gasmask', text: 'إمدادات: كمامة غاز!', sub: '', color: '#16a34a', type: 'upgrade' },
    { id: 'w10_chemical', text: 'تحذير: طائرات كيميائية!', sub: '', color: '#15803d', type: 'warning' },
  ],
  11: [
    { id: 'w11_extinguisher', text: 'إمدادات: طفاية حريق!', sub: '', color: '#f97316', type: 'upgrade' },
    { id: 'w11_incendiary', text: 'تحذير: طائرات حارقة!', sub: '', color: '#ea580c', type: 'warning' },
  ],
  12: [
    { id: 'w12_boss', text: 'تحذير: طائرة حربية!', sub: '', color: '#dc2626', type: 'warning' },
    { id: 'w12_cluster5', text: 'تحذير: تشظي خماسي!', sub: '', color: '#991b1b', type: 'warning' },
  ],
};

function spawnHazard(g: GameData, type: HazardType) {
  const recipe = getWaveRecipe(g.waveNumber, g);

  const h = getFromPool<Hazard>(g.hazards, () => ({
    active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
    speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
    rotation: 0, trailTimer: 0
  }));
  const groundY = g.height * GROUND_RATIO;
  const tx = 30 + Math.random() * (g.width - 60);
  const ty = groundY - 5 + Math.random() * 10;
  h.type = type;
  h.targetPos = { x: tx, y: ty };
  h.pos = { x: tx + (Math.random() - 0.5) * 80, y: -40 };
  h.falling = false;
  h.splitDone = false;
  h.rotation = Math.random() * Math.PI * 2;
  h.trailTimer = 0;

  switch (type) {
    case 'shrapnel':
      h.speed = Math.min(280 + g.difficulty * 20 + Math.random() * 140, MAX_MISSILE_SPEED * 0.8);
      h.size = 8;
      h.damage = 10;
      h.warningDuration = 0.7;
      break;
    case 'missile':
      h.speed = Math.min(160 + g.difficulty * 15 + Math.random() * 100, MAX_MISSILE_SPEED);
      h.size = 12;
      h.damage = 22;
      h.warningDuration = 1.2;
      break;
    case 'cluster': {
      const fromRight = Math.random() > 0.5;
      const startX = fromRight ? g.width + 40 : -40;
      const flyY = g.height * (0.12 + Math.random() * 0.2);
      h.pos = { x: startX, y: flyY };
      h.targetPos = { x: g.width / 2, y: flyY };
      const baseSpeed = Math.min(120 + g.difficulty * 5 + Math.random() * 40, MAX_MISSILE_SPEED * 0.7);
      h.clusterVelX = fromRight ? -baseSpeed : baseSpeed;
      h.clusterVelY = -(10 + Math.random() * 15);
      h.clusterStartSpeed = baseSpeed;
      h.clusterPhase = 'flying';
      h.clusterTimer = 0;
      h.speed = 0;
      h.size = 14;
      h.damage = 16;
      h.warningDuration = 0;
      h.warningTimer = 0;
      h.falling = true;
      break;
    }
  }
  h.warningTimer = h.warningDuration;
  g.activeHazardCount++;
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

function configureDroneByTier(d: Drone, tier: DroneTier, elapsed: number) {
  d.tier = tier;
  if (tier === 'scout') {
    d.speed = 35 + Math.min(25, elapsed * 0.08);
    d.size = 18;
    d.health = 1;
    d.maxHealth = 1;
    d.aggroDelay = 2.5 + Math.random() * 1.5;
    d.trackingAccuracy = 0.2 + Math.min(0.25, elapsed * 0.0015);
    d.bombTimer = 0;
    d.bombCooldown = 0;
    return;
  }

  if (tier === 'tracker') {
    d.speed = 70 + Math.min(30, elapsed * 0.07);
    d.size = 22;
    d.health = 2;
    d.maxHealth = 2;
    d.aggroDelay = 1.0 + Math.random() * 1.0;
    d.trackingAccuracy = 0.7 + Math.min(0.15, elapsed * 0.001);
    d.bombTimer = 0;
    d.bombCooldown = 3.5 + Math.random() * 1.5; // dive attack cooldown
    return;
  }

  d.speed = 42 + Math.min(18, elapsed * 0.04);
  d.size = 28;
  d.health = 3;
  d.maxHealth = 3;
  d.aggroDelay = 0.8 + Math.random() * 0.8;
  d.trackingAccuracy = 0.35 + Math.min(0.15, elapsed * 0.0008);
  d.bombTimer = 0;
  d.bombCooldown = 4 + Math.random() * 2;
}

function spawnDrone(g: GameData, forcedTier?: DroneTier) {
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

  const unlockedTiers: DroneTier[] = [];
  if (g.activatedWaveEvents.has('drones_scout')) unlockedTiers.push('scout');
  if (g.activatedWaveEvents.has('drones_tracker')) unlockedTiers.push('tracker');
  if (g.activatedWaveEvents.has('drones_bomber')) unlockedTiers.push('bomber');
  const selectedTier = forcedTier
    ?? (unlockedTiers.length > 0
      ? unlockedTiers[Math.floor(Math.random() * unlockedTiers.length)]
      : 'scout');

  configureDroneByTier(d, selectedTier, g.elapsed);
}

function spawnCargoDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, maxHealth: 0, state: 'entering' as const, entryTarget: { x: 0, y: 0 },
    tier: 'scout' as const, bombTimer: 0, bombCooldown: 0, hoverTimer: 0,
    aggroDelay: 0, trackingAccuracy: 0, wobble: 0, altitudeOffset: 0, colorHue: 0
  }), 10);
  const fromRight = Math.random() > 0.5;
  const startX = fromRight ? g.width + 40 : -40;
  const flyY = g.height * (0.08 + Math.random() * 0.04);
  const speed = 40 + Math.random() * 20;
  d.pos = { x: startX, y: flyY };
  d.entryTarget = { x: fromRight ? -60 : g.width + 60, y: flyY };
  d.vel = { x: fromRight ? -speed : speed, y: 0 };
  d.speed = speed;
  d.size = 35;
  d.health = 3;
  d.maxHealth = 3;
  d.state = 'tracking';
  d.tier = 'cargo';
  d.hoverTimer = 0;
  d.aggroDelay = 0;
  d.trackingAccuracy = 0;
  d.bombTimer = 0;
  d.bombCooldown = 0;
  d.wobble = Math.random() * Math.PI * 2;
  d.altitudeOffset = 0;
  d.colorHue = 30;
  d.cargoType = Math.random() > 0.5 ? 'airstrike' : 'medkit';
  d.label = 'OTLOP';
}

function spawnIncendiaryDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, maxHealth: 0, state: 'entering' as const, entryTarget: { x: 0, y: 0 },
    tier: 'scout' as const, bombTimer: 0, bombCooldown: 0, hoverTimer: 0,
    aggroDelay: 0, trackingAccuracy: 0, wobble: 0, altitudeOffset: 0, colorHue: 0
  }), 10);
  const side = Math.random() < 0.5 ? 0 : 1;
  d.pos = { x: side === 0 ? -20 : g.width + 20, y: g.height * 0.15 + Math.random() * g.height * 0.15 };
  d.entryTarget = { x: g.width * 0.2 + Math.random() * g.width * 0.6, y: g.height * 0.2 + Math.random() * g.height * 0.1 };
  d.state = 'entering';
  d.vel = { x: 0, y: 0 };
  d.speed = 50 + Math.min(20, g.elapsed * 0.05);
  d.size = 24;
  d.health = 2;
  d.maxHealth = 2;
  d.tier = 'incendiary';
  d.hoverTimer = 0;
  d.aggroDelay = 1.5 + Math.random() * 1.0;
  d.trackingAccuracy = 0.5;
  d.bombTimer = 0;
  d.bombCooldown = 3.5 + Math.random() * 2;
  d.wobble = Math.random() * Math.PI * 2;
  d.altitudeOffset = 0;
  d.colorHue = 15; // orange-red
  d.fireDropTimer = 0;
}

function spawnChemicalDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, () => ({
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, maxHealth: 0, state: 'entering' as const, entryTarget: { x: 0, y: 0 },
    tier: 'scout' as const, bombTimer: 0, bombCooldown: 0, hoverTimer: 0,
    aggroDelay: 0, trackingAccuracy: 0, wobble: 0, altitudeOffset: 0, colorHue: 0
  }), 10);
  const side = Math.random() < 0.5 ? 0 : 1;
  d.pos = { x: side === 0 ? -20 : g.width + 20, y: g.height * 0.12 + Math.random() * g.height * 0.15 };
  d.entryTarget = { x: g.width * 0.2 + Math.random() * g.width * 0.6, y: g.height * 0.18 + Math.random() * g.height * 0.1 };
  d.state = 'entering';
  d.vel = { x: 0, y: 0 };
  d.speed = 35 + Math.min(15, g.elapsed * 0.04);
  d.size = 24;
  d.health = 2;
  d.maxHealth = 2;
  d.tier = 'chemical';
  d.hoverTimer = 0;
  d.aggroDelay = 1.0 + Math.random() * 1.0;
  d.trackingAccuracy = 0.4;
  d.bombTimer = 0;
  d.bombCooldown = 4.0 + Math.random() * 2;
  d.wobble = Math.random() * Math.PI * 2;
  d.altitudeOffset = 0;
  d.colorHue = 120; // green
  d.gasDropTimer = 0;
}

function queueWaveEvent(
  g: GameData,
  event: { id: string; text: string; sub: string; color: string; duration: number; type: 'warning' | 'upgrade' }
) {
  const resolveDelay = 2 + Math.random() * 3;
  const resolveAt = g.elapsed + resolveDelay;

  // Cooldown after warning disappears before next warning can appear
  // Early events (shrapnel/missiles): 3-6s gap, all others: 7s minimum
  const isEarlyEvent = event.id === 'shrapnel_start' || event.id === 'missiles';
  const cooldownGap = isEarlyEvent ? (3 + Math.random() * 3) : 7;
  const lockEnd = g.elapsed + event.duration + resolveDelay + cooldownGap;

  g.waveTriggered.add(event.id);
  g.warningLockUntil = lockEnd;
  g.pendingWaveEvents.push({ id: event.id, resolveAt });

  g.cinematicWarning = {
    text: event.text,
    subText: event.sub,
    color: event.color,
    timer: event.duration,
    duration: event.duration,
    type: event.type,
  };
  g.slowMoFactor = 0.1;
  // Play different sound based on event type
  if (event.type === 'warning') {
    // Play threat-specific warning sound based on event id
    const id = event.id;
    if (id.includes('shrapnel')) sfxWarningShrapnel();
    else if (id.includes('missile')) sfxWarningMissile();
    else if (id.includes('cluster')) sfxWarningCluster();
    else if (id.includes('drone') || id.includes('tracker') || id.includes('chemical') || id.includes('incendiary')) sfxWarningDrone();
    else if (id.includes('boss')) sfxWarningBoss();
    else if (id.includes('bomber')) sfxWarningBomber();
    else if (id.includes('gas') || id.includes('fire') || id.includes('extinguisher')) sfxWarningHazard();
    else sfxWarningAlert();
  } else if (event.type === 'upgrade') sfxUpgradeAlert();
}

function applyWaveEvent(g: GameData, id: string) {
  g.activatedWaveEvents.add(id);

  // Spawn initial hazard for demonstration
  if (id.includes('shrapnel')) { spawnHazard(g, 'shrapnel'); return; }
  if (id.includes('missile') && !id.includes('cluster')) { spawnHazard(g, 'missile'); return; }
  if (id.includes('cluster') && !id.includes('split')) { spawnHazard(g, 'cluster'); return; }

  // Bullet level upgrades
  if (id.includes('bullet2')) { g.bulletLevel = Math.max(g.bulletLevel, 2); return; }
  if (id.includes('bullet3')) { g.bulletLevel = Math.max(g.bulletLevel, 3); return; }

  // Drone spawns
  if (id.includes('drone') && !id.includes('incendiary') && !id.includes('chemical')) {
    g.droneTimer = Math.min(g.droneTimer, 2 + Math.random() * 3);
    return;
  }

  // Boss
  if (id.includes('boss')) {
    if (!g.boss) {
      spawnBoss(g, false);
      g.bossTimer = 240 + g.bossCount * 30;
    }
    return;
  }

  // Extinguisher drop
  if (id.includes('extinguisher')) {
    const pu = getFromPool<PowerUp>(g.powerUps, () => ({
      active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
      parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
    }), 20);
    pu.type = 'extinguisher';
    pu.pos = { x: g.width * 0.3 + Math.random() * g.width * 0.4, y: -20 };
    pu.size = 14; pu.parachuting = true; pu.fallSpeed = 30; pu.bobTimer = 0; pu.groundTimer = 0;
    return;
  }

  // Gas mask drop — removed, now purchased via card only

  // Incendiary drones
  if (id.includes('incendiary')) {
    g.incendiaryTimer = Math.min(g.incendiaryTimer, 2 + Math.random() * 3);
    spawnIncendiaryDrone(g);
    return;
  }

  // Chemical drones
  if (id.includes('chemical')) {
    g.chemicalTimer = Math.min(g.chemicalTimer, 2 + Math.random() * 3);
    spawnChemicalDrone(g);
    return;
  }
}

function resolvePendingWaveEvents(g: GameData) {
  for (let i = g.pendingWaveEvents.length - 1; i >= 0; i--) {
    const pending = g.pendingWaveEvents[i];
    if (g.elapsed >= pending.resolveAt) {
      applyWaveEvent(g, pending.id);
      g.pendingWaveEvents.splice(i, 1);
    }
  }

  if (g.pendingWaveEvents.length === 0 && g.elapsed >= g.warningLockUntil) {
    g.warningLockUntil = 0;
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
  g.hitStopTimer = Math.max(g.hitStopTimer, 0.06);
  // Knockback
  const kdir = sourcePos.x < p.pos.x ? 1 : -1;
  p.velocity.x += kdir * 200;
  sfxDamage();
  if (p.health <= 0) {
    // Death transition instead of instant gameover
    g.deathPhase = 'dying';
    g.deathTimer = 1.5;
    g.slowMoFactor = 0.15;
    g.hitStopTimer = Math.max(g.hitStopTimer, 0.15);
  }
}

function incrementCombo(g: GameData) {
  g.comboCount++;
  g.comboTimer = 3;
  g.comboMultiplier = Math.min(3, 1 + Math.floor(g.comboCount / 3) * 0.5);
  if (g.comboCount > 1) sfxCombo(g.comboCount);
}

function comboScore(g: GameData, base: number): number {
  return Math.floor(base * g.comboMultiplier);
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
    g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
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

// ===== WAVE SYSTEM =====
const ALL_UPGRADES: Omit<UpgradeCard, 'applied'>[] = [
  { id: 'ammo_cap', name: 'Ammo Capacity+', nameAr: 'سعة ذخيرة+', description: 'Max ammo 30→40', icon: '🔫', color: '#a855f7' },
  { id: 'max_health', name: 'Reinforced', nameAr: 'صحة محسّنة', description: 'Max HP 100→130', icon: '❤', color: '#22c55e' },
  { id: 'speed_up', name: 'Speed Boost', nameAr: 'سرعة حركة+', description: 'Move speed +20%', icon: '🏃', color: '#06b6d4' },
  { id: 'slowmo_ext', name: 'Time Warp', nameAr: 'تباطؤ مطوّل', description: 'Slow-Mo 5→7s', icon: '⏳', color: '#8b5cf6' },
  { id: 'dash_fast', name: 'Quick Roll', nameAr: 'دحرجة سريعة', description: 'Dash CD 0.8→0.5s', icon: '💨', color: '#f59e0b' },
  { id: 'shield_ext', name: 'Fortified', nameAr: 'درع ممتد', description: 'Shield 8→12s', icon: '🛡', color: '#3b82f6' },
  { id: 'pickup_range', name: 'Magnetism', nameAr: 'جذب مغناطيسي', description: 'Pickup range +50%', icon: '🧲', color: '#94a3b8' },
  { id: 'bullet_dmg', name: 'Heavy Rounds', nameAr: 'ضربة قوية', description: 'Bullet damage +1', icon: '💥', color: '#ef4444' },
];

function generateUpgradeCards(g: GameData): UpgradeCard[] {
  // Shuffle and pick 3
  const pool = ALL_UPGRADES.filter(u => {
    // Don't offer already-maxed upgrades
    if (u.id === 'ammo_cap' && g.player.maxAmmo >= 50) return false;
    if (u.id === 'max_health' && g.player.maxHealth >= 200) return false;
    if (u.id === 'speed_up' && g.player.speedMultiplier >= 1.6) return false;
    if (u.id === 'bullet_dmg' && g.player.bulletDamage >= 4) return false;
    return true;
  });
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(u => ({ ...u, applied: false }));
}

export function applyUpgrade(g: GameData, cardId: string) {
  const p = g.player;
  switch (cardId) {
    case 'ammo_cap': p.maxAmmo += 10; break;
    case 'max_health': p.maxHealth += 30; p.health = Math.min(p.health + 30, p.maxHealth); break;
    case 'speed_up': p.speedMultiplier += 0.2; break;
    case 'slowmo_ext': p.slowMoDuration += 2; break;
    case 'dash_fast': p.dashCooldownBase = Math.max(0.3, p.dashCooldownBase - 0.3); break;
    case 'shield_ext': p.shieldDuration += 4; break;
    case 'pickup_range': p.pickupRange += 2.5; break;
    case 'bullet_dmg': p.bulletDamage += 1; break;
  }
  sfxUpgradeSelect();
  g.selectedUpgrade = cardId;
  // Transition to bike phase instead of directly starting next wave
  g.wavePhase = 'bike';
  g.upgradeCards = [];
  g.cardsShownTimer = 0;
  spawnDeliveryBike(g);
  // Start zoom-in towards bike
  g.cameraZoomTarget = 1.5;
  g.bikeZoomTimer = 3.0;
  addFloatingText(g, 'UPGRADE!', { x: g.width / 2, y: g.height * 0.35 }, '#fbbf24');
}

function spawnDeliveryBike(g: GameData) {
  const fromRight = Math.random() > 0.5;
  const groundY = g.height * GROUND_RATIO;
  const speed = 140 + Math.random() * 80; // slower for better visibility
  const dropX = g.width * (0.2 + Math.random() * 0.6);
  g.deliveryBike = {
    active: true,
    pos: { x: fromRight ? g.width + 100 : -100, y: groundY },
    speed: fromRight ? -speed : speed,
    facingRight: !fromRight,
    phase: 'entering',
    dropX,
    dropped: false,
    wheelAnim: 0,
    idleTimer: 0,
    shakeOffset: { x: 0, y: 0 },
  };
}

function updateDeliveryBike(g: GameData, dt: number) {
  const bike = g.deliveryBike;
  if (!bike || !bike.active) return;

  const groundY = g.height * GROUND_RATIO;
  bike.pos.y = groundY;
  bike.wheelAnim += Math.abs(bike.speed) * dt * 0.1;

  if (bike.phase === 'entering') {
    bike.pos.x += bike.speed * dt;
    // Check if near drop point
    const distToDrop = Math.abs(bike.pos.x - bike.dropX);
    if (distToDrop < 30) {
      bike.phase = 'slowing';
    }
  } else if (bike.phase === 'slowing') {
    // Decelerate
    const decel = bike.speed > 0 ? -400 : 400;
    bike.speed += decel * dt;
    bike.pos.x += bike.speed * dt;
    if (Math.abs(bike.speed) < 30) {
      bike.phase = 'dropping';
      bike.speed = 0;
    }
  } else if (bike.phase === 'dropping') {
    if (!bike.dropped) {
      bike.dropped = true;
      // Drop water bottle
      const pu = getFromPool<PowerUp>(g.powerUps, () => ({
        active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
        parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
      }), 20);
      pu.type = 'water';
      pu.pos = { x: bike.pos.x, y: groundY - 12 };
      pu.size = 12;
      pu.parachuting = false;
      pu.fallSpeed = 0;
      pu.bobTimer = 0;
      pu.groundTimer = -999; // Don't expire during rest
    }
    // Transition to idle (promotional stop — 4 seconds)
    bike.phase = 'idle';
    bike.idleTimer = 4.0;
    bike.speed = 0;
  } else if (bike.phase === 'idle') {
    // Promotional stop — stronger engine vibration
    bike.idleTimer -= dt;
    const t = g.elapsed * 35;
    bike.shakeOffset.x = Math.sin(t) * 0.15 + Math.sin(t * 1.7) * 0.15;
    bike.shakeOffset.y = Math.sin(t * 1.3) * 0.2 + Math.cos(t * 2.1) * 0.1;
    if (bike.idleTimer <= 0) {
      bike.phase = 'leaving';
      const leaveDir = bike.facingRight ? 1 : -1;
      bike.speed = leaveDir * 40;
    }
  } else if (bike.phase === 'leaving') {
    // Accelerate away
    const accel = bike.facingRight ? 500 : -500;
    bike.speed += accel * dt;
    bike.pos.x += bike.speed * dt;
    if (bike.pos.x < -120 || bike.pos.x > g.width + 120) {
      bike.active = false;
      g.deliveryBike = null;
    }
  }

  // Engine vibration during movement (lighter than idle)
  if (bike && bike.active && bike.phase !== 'idle') {
    const t = g.elapsed * 25;
    bike.shakeOffset.x = Math.sin(t) * 0.1;
    bike.shakeOffset.y = Math.sin(t * 1.5) * 0.08;
  }
}

function startNextWave(g: GameData) {
  g.waveNumber++;
  g.levelNumber = Math.floor((g.waveNumber - 1) / 3) + 1;
  g.waveElapsed = 0;
  g.waveFinale = false;
  g.wavePhase = 'active';

  // Apply recipe settings for this wave
  const recipe = getWaveRecipe(g.waveNumber, g);
  g.waveTimer = recipe.duration || 60;
  g.bulletLevel = Math.max(g.bulletLevel, recipe.bulletLevel);

  // Queue wave warnings — recipe custom warnings take priority over hardcoded
  if (recipe.warningText) {
    const customId = `custom_w${g.waveNumber}`;
    if (!g.waveTriggered.has(customId)) {
      const delay = recipe.phaseInDelay || 0;
      if (delay <= 0) {
        queueWaveEvent(g, { id: customId, text: recipe.warningText, sub: '', color: recipe.warningColor || '#ef4444', type: (recipe.warningType as 'warning' | 'upgrade') || 'warning', duration: 2.0 });
      }
    }
  }
  const warnings = WAVE_WARNINGS[g.waveNumber];
  if (warnings) {
    for (const w of warnings) {
      if (!g.waveTriggered.has(w.id)) {
        const delay = recipe.phaseInDelay || 0;
        if (delay > 0) {
          // Will be triggered later by wave elapsed check
        } else {
          queueWaveEvent(g, { ...w, duration: 2.0 });
        }
      }
    }
  }

  // Gas mask purchase offer — delayed after chemical warning
  if (recipe.hasChemical && !g.gasMaskOwned && g.player.gasMaskTimer <= 0) {
    g.gasMaskOfferDelay = 2.5;
  }
}

function updateWaveSystem(g: GameData, input: InputState, dt: number) {
  // === Wave End Slow-Mo ===
  if (g.waveEndSlowMo > 0) {
    g.waveEndSlowMo -= dt;
    g.slowMoFactor = 0.2;
    // Player moves at 0.7x during slow-mo (feels powerful)
    if (g.waveEndSlowMo <= 0) {
      g.slowMoFactor = 1;
      // Now enter clearing
      g.wavePhase = 'clearing';
      sfxWaveComplete();
      // Force-clear hazards immediately
      for (const h of g.hazards) {
        if (h.active) {
          addExplosion(g, h.pos, h.size * 1.5);
          h.active = false;
          g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        }
      }
      // Force drones to leave at 5x speed
      for (const d of g.drones) {
        if (d.active && d.tier !== 'cargo') {
          const exitDir = d.pos.x < g.width / 2 ? -1 : 1;
          d.vel.x = exitDir * d.speed * 5;
          d.vel.y = -d.speed * 2;
        }
      }
    }
    return;
  }

  if (g.wavePhase === 'active') {
    g.waveTimer -= dt;

    // Gas mask offer delay countdown
    if (g.gasMaskOfferDelay > 0) {
      g.gasMaskOfferDelay -= dt;
      if (g.gasMaskOfferDelay <= 0) {
        g.gasMaskOfferDelay = 0;
        const cost = Math.max(10, Math.ceil(g.score * 0.1));
        g.gasMaskOffer = { active: true, timer: 8, cost };
        g.slowMoFactor = 0.1; // Heavy slow-mo while offer is shown
        sfxUpgradeAlert(); // Same sound as upgrade cards
      }
    }

    // Gas mask offer timer
    if (g.gasMaskOffer && g.gasMaskOffer.active) {
      g.gasMaskOffer.timer -= dt;
      if (g.gasMaskOffer.timer <= 0) {
        g.gasMaskOffer = null;
        g.slowMoFactor = 1; // Restore normal speed
      }
      // Handle purchase via cardClick
      if (input.cardClick) {
        const { x, y } = input.cardClick;
        // Card is centered: 200x270
        const cardW = 200, cardH = 270;
        const cardX = (g.width - cardW) / 2;
        const cardY = g.height * 0.5 - cardH / 2;
        if (x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH) {
          input.cardClick = null;
          if (g.score >= g.gasMaskOffer.cost) {
            // Start score countdown animation instead of instant deduction
            const cost = g.gasMaskOffer.cost;
            g.scoreCountdown = { remaining: cost, tickTimer: 0, totalCost: cost };
            g.gasMaskOwned = true;
            g.gasMaskOffer = null;
            g.slowMoFactor = 0.5; // Partial slow-mo during countdown
            sfxUpgradeSelect();
            addFloatingText(g, 'كمامة! 🛡️', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#16a34a');
            spawnParticles(g, g.player.pos, 10, '#16a34a', 90);
          } else {
            addFloatingText(g, 'نقاط غير كافية!', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#ef4444');
          }
        }
      }
    }

    // Score countdown animation
    if (g.scoreCountdown) {
      g.scoreCountdown.tickTimer -= dt;
      if (g.scoreCountdown.tickTimer <= 0) {
        // Deduct in chunks for smooth countdown
        const chunk = Math.max(1, Math.ceil(g.scoreCountdown.remaining / 10));
        const deduct = Math.min(chunk, g.scoreCountdown.remaining);
        g.score -= deduct;
        g.scoreCountdown.remaining -= deduct;
        g.scoreCountdown.tickTimer = 0.04; // Fast ticks
        // Metallic tick sound for score countdown
        sfxScoreTick();
        if (g.scoreCountdown.remaining <= 0) {
          g.scoreCountdown = null;
          g.slowMoFactor = 1; // Restore normal speed
          addFloatingText(g, 'كمامة! 🛡️', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#16a34a');
          spawnParticles(g, g.player.pos, 10, '#16a34a', 90);
        }
      }
    }

    if (g.waveTimer <= 5 && !g.waveFinale) {
      g.waveFinale = true;
    }

    if (g.waveTimer <= 0) {
      g.waveFinale = false;
      // Cinematic slow-mo transition
      g.waveEndSlowMo = 2.0;
      g.slowMoFactor = 0.2;
      return;
    }
  } else if (g.wavePhase === 'clearing') {
    // Force-clear all powerups, fire pools, gas clouds
    for (const pu of g.powerUps) { if (pu.active) pu.active = false; }
    g.firePools.length = 0;
    g.gasClouds.length = 0;

    // Clearing timeout timer
    g.clearingTimer = (g.clearingTimer || 0) + dt;

    // Force-clear drones that left screen
    for (const d of g.drones) {
      if (d.active && d.tier !== 'cargo') {
        if (d.pos.x < -60 || d.pos.x > g.width + 60 || d.pos.y < -60) {
          d.active = false;
        }
      }
    }

    // Force-remove all remaining drones after 5 seconds timeout
    if (g.clearingTimer >= 5) {
      for (const d of g.drones) {
        if (d.active && d.tier !== 'cargo') {
          addExplosion(g, d.pos, 15);
          d.active = false;
        }
      }
    }

    // Check if scene is clear
    const activeDrones = g.drones.filter(d => d.active && d.tier !== 'cargo').length;
    if (g.activeHazardCount <= 0 && activeDrones === 0) {
      g.clearingTimer = 0;
      g.activeHazardCount = 0; // safety reset
      // Only show cards+bike at end of level (every 3 waves)
      if (g.waveNumber % 3 === 0) {
        g.wavePhase = 'cards';
        g.upgradeCards = generateUpgradeCards(g);
        g.cardsShownTimer = 0;
        g.selectedUpgrade = null;
        sfxLevelUp();
      } else {
        // Enter announce phase instead of starting next wave immediately
        g.wavePhase = 'announce';
        g.waveAnnounceTimer = 3.0; // 3 seconds
      }
    }
  } else if (g.wavePhase === 'announce') {
    g.waveAnnounceTimer -= dt;
    if (g.waveAnnounceTimer <= 0) {
      startNextWave(g);
    }
  } else if (g.wavePhase === 'cards') {
    g.cardsShownTimer += dt;

    // Handle card selection via input
    if (input.cardClick && g.upgradeCards.length > 0) {
      const { x, y } = input.cardClick;
      input.cardClick = null;
      const cardW = 130, cardH = 185, gap = 12;
      const totalW = g.upgradeCards.length * cardW + (g.upgradeCards.length - 1) * gap;
      const startX = (g.width - totalW) / 2;
      const cardY = g.height * 0.30;
      for (let i = 0; i < g.upgradeCards.length; i++) {
        const cx = startX + i * (cardW + gap);
        if (x >= cx && x <= cx + cardW && y >= cardY && y <= cardY + cardH) {
          applyUpgrade(g, g.upgradeCards[i].id);
          break;
        }
      }
    }

    // Auto-select after 10s
    if (g.cardsShownTimer > 10 && g.upgradeCards.length > 0) {
      const randomCard = g.upgradeCards[Math.floor(Math.random() * g.upgradeCards.length)];
      applyUpgrade(g, randomCard.id);
    }
  } else if (g.wavePhase === 'bike') {
    updateDeliveryBike(g, dt);

    if (g.deliveryBike && g.deliveryBike.active) {
      g.cameraFocusX += (g.deliveryBike.pos.x - g.cameraFocusX) * 0.08;
      g.cameraFocusY += (g.deliveryBike.pos.y - 20 - g.cameraFocusY) * 0.08;
    }

    if (g.bikeZoomTimer > 0) {
      g.bikeZoomTimer -= dt;
      if (g.bikeZoomTimer <= 0) {
        g.cameraZoomTarget = 1.0;
      }
    }

    g.cameraZoom += (g.cameraZoomTarget - g.cameraZoom) * 0.04;
    if (Math.abs(g.cameraZoom - g.cameraZoomTarget) < 0.005) g.cameraZoom = g.cameraZoomTarget;

    // When bike leaves, start next wave
    if (!g.deliveryBike || !g.deliveryBike.active) {
      g.cameraZoom = 1.0;
      g.cameraZoomTarget = 1.0;
      g.selectedUpgrade = null;
      startNextWave(g);
    }
  }
}


export function update(g: GameData, input: InputState, dt: number) {
  if (g.state !== 'playing') return;

  dt = Math.min(dt, 0.05);

  // Hit stop — freeze all logic
  if (g.hitStopTimer > 0) {
    g.hitStopTimer -= dt;
    return;
  }

  // Death transition
  if (g.deathPhase === 'dying') {
    g.deathTimer -= dt;
    g.slowMoFactor = 0.15;
    g.elapsed += dt * 0.15;
    // Still update particles/explosions for visual
    g.damageFlash = Math.max(0, g.damageFlash - dt * 0.5);
    if (g.deathTimer <= 0) {
      g.deathPhase = 'dead';
      g.state = 'gameover';
      g.stats.timeSurvived = g.elapsed;
      sfxGameOver();
      stopPeriodicAmbient();
      if (g.score > g.highScore) {
        g.highScore = g.score;
        localStorage.setItem('skyfall_hi', g.score.toString());
      }
    }
    return;
  }

  // Micro slow-mo (independent of power-up slow-mo)
  if (g.microSlowTimer > 0) {
    g.microSlowTimer -= dt;
    if (g.slowMoTimer <= 0) {
      g.slowMoFactor = 0.3;
    }
  } else if (g.slowMoTimer <= 0 && g.cinematicWarning === null) {
    g.slowMoFactor = 1;
  }

  // Combo timer
  if (g.comboTimer > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) {
      g.comboCount = 0;
      g.comboMultiplier = 1;
    }
  }

  g.elapsed += dt;
  g.waveElapsed += dt;
  g.difficulty = 1 + g.elapsed / 120; // slower difficulty scaling
  if (g.wavePhase === 'active') g.score += Math.round(dt);
  g.windOffset = Math.sin(g.elapsed * 0.3) * 0.5;

  // === Wave Phase System ===
  updateWaveSystem(g, input, dt);

  // === Cinematic warning timer ===
  if (g.cinematicWarning) {
    g.cinematicWarning.timer -= dt;
    g.slowMoFactor = 0.1;
    if (g.cinematicWarning.timer <= 0) {
      g.cinematicWarning = null;
      g.slowMoFactor = 1;
    }
  }

  resolvePendingWaveEvents(g);

  // === Slow-mo & Magnet timers ===
  if (!g.cinematicWarning && g.waveEndSlowMo <= 0 && g.slowMoTimer > 0) {
    g.slowMoTimer -= dt;
    g.slowMoFactor = 0.3;
    if (g.slowMoTimer <= 0) { g.slowMoFactor = 1; g.slowMoTimer = 0; }
  } else if (!g.cinematicWarning && g.waveEndSlowMo <= 0 && g.slowMoTimer <= 0) {
    g.slowMoFactor = 1;
  }
  if (g.magnetTimer > 0) g.magnetTimer -= dt;
  if (g.magnetFlashTimer > 0) g.magnetFlashTimer -= dt;

  // === Wave-based warning system ===
  const recipe = getWaveRecipe(g.waveNumber, g);
  const warnings = WAVE_WARNINGS[g.waveNumber];
  if (warnings && g.wavePhase === 'active') {
    for (const w of warnings) {
      if (g.waveTriggered.has(w.id)) continue;
      // Check phaseInDelay — trigger after delay seconds into the wave
      const delay = recipe.phaseInDelay || 0;
      if (g.waveElapsed >= delay) {
        if (!g.cinematicWarning && g.pendingWaveEvents.length === 0 && g.elapsed >= g.warningLockUntil) {
          queueWaveEvent(g, { ...w, duration: 2.0 });
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
    p.dashCooldown = p.dashCooldownBase;
    p.anim = 'roll';
    p.animFrame = 0;
    sfxDash();
    input.dash = false;
    input.touchDash = false;
  }

  // === Shoot timer countdown ===
  if (p.shootTimer > 0) p.shootTimer -= dt;

  // === Shooting (multi-shot based on bulletLevel) ===
  if (input.shoot && p.ammo > 0 && !p.isDashing) {
    input.shoot = false;
    p.ammo--;
    p.shootTimer = 0.3;
    if (g.bulletLevel >= 3) sfxShoot3();
    else if (g.bulletLevel >= 2) sfxShoot2();
    else sfxShoot1();
    p.velocity.x += p.facingRight ? -18 : 18;
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

  // Clouds removed — stars only

  // === Spawn hazards — Recipe-based system ===
  if (g.elapsed >= 3 && !g.cinematicWarning && g.wavePhase === 'active') {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      const recipe = getWaveRecipe(g.waveNumber, g);

      // Build available threat types based on recipe + phaseInDelay
      const types: HazardType[] = [];
      for (const t of recipe.threats) {
        // New threats (not in previous wave) respect phaseInDelay
        const prevRecipe = g.waveNumber > 1 ? getWaveRecipe(g.waveNumber - 1, g) : { threats: [] as string[] };
        const isNew = !prevRecipe.threats.includes(t);
        if (isNew && g.waveElapsed < recipe.phaseInDelay) continue;
        types.push(t as HazardType);
        if (t === 'shrapnel') types.push('shrapnel'); // weight shrapnel higher
      }

      if (types.length === 0) {
        g.spawnTimer = 0.12;
      } else {
        // Pity system — reduce maxConcurrent when player is low health
        // DISABLED during Wave Finale — player must face real danger for a satisfying victory
        let effectiveMax = recipe.maxConcurrent;
        if (!g.waveFinale) {
          if (g.player.health < 20) effectiveMax = Math.max(2, effectiveMax - 1);
          if (g.player.health < 10) effectiveMax = Math.max(2, effectiveMax - 2);
        }

        // Wave Finale — boost for shrapnel only
        if (g.waveFinale) effectiveMax += 3;

        // Check activeHazardCount
        if (g.activeHazardCount < effectiveMax) {
          const type = types[Math.floor(Math.random() * types.length)];
          // During finale, only spawn shrapnel for performance
          if (g.waveFinale) {
            spawnHazard(g, 'shrapnel');
          } else {
            spawnHazard(g, type);
          }
        }

        // SpawnRate from recipe (finale = half interval for shrapnel)
        let interval = recipe.spawnInterval;
        if (g.waveFinale) interval *= 0.5;
        const bossMultiplier = g.boss && !g.boss.defeated ? 2.5 : 1;
        g.spawnTimer = interval * bossMultiplier;
      }
    }
  }

  // === Update hazards ===
  for (const h of g.hazards) {
    if (!h.active) continue;
    h.rotation += dt * (h.type === 'shrapnel' ? 8 : 2);

    // === Cluster missile: horizontal flying phases ===
    if (h.type === 'cluster' && h.clusterPhase) {
      h.trailTimer -= dt;
      if (h.trailTimer <= 0) {
        h.trailTimer = 0.04;
        addSmokeTrail(g, { x: h.pos.x, y: h.pos.y }, h.size * 0.5);
      }

      const startSpd = h.clusterStartSpeed || 350;

      if (h.clusterPhase === 'flying') {
        // Decelerate but keep minimum 35% speed (heavy missile)
        const decel = startSpd * 0.6 * dt;
        if (h.clusterVelX! > 0) {
          h.clusterVelX = Math.max(h.clusterVelX! - decel, startSpd * 0.35);
        } else {
          h.clusterVelX = Math.min(h.clusterVelX! + decel, -startSpd * 0.35);
        }
        h.pos.x += h.clusterVelX! * g.slowMoFactor * dt;

        // Arc trajectory — gravity pulls missile down
        h.clusterVelY = (h.clusterVelY || 0) + 40 * dt;
        // Terminal velocity cap
        h.clusterVelY = Math.min(h.clusterVelY!, 120);
        h.pos.y += h.clusterVelY * g.slowMoFactor * dt;

        // Check if slowed enough to open
        if (Math.abs(h.clusterVelX!) <= startSpd * 0.4) {
          h.clusterPhase = 'opening';
          h.clusterTimer = 1.0;
        }
        // Off-screen removal
        if (h.pos.x < -100 || h.pos.x > g.width + 100 || h.pos.y > g.height + 50) {
          h.active = false;
          g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        }
      } else if (h.clusterPhase === 'opening') {
        h.clusterTimer! -= dt;
        // Gradual deceleration from 60% to 50% during opening
        const openProgress = 1 - (h.clusterTimer! / 1.0);
        const openSpeedFactor = 0.6 - openProgress * 0.1; // 0.6 → 0.5
        h.pos.x += (h.clusterVelX! * openSpeedFactor) * g.slowMoFactor * dt;
        h.clusterVelY = (h.clusterVelY || 0) + 50 * dt;
        // Terminal velocity cap
        h.clusterVelY = Math.min(h.clusterVelY!, 120);
        h.pos.y += h.clusterVelY * g.slowMoFactor * dt;
        if (h.clusterTimer! <= 0) {
          h.clusterPhase = 'releasing';
          h.clusterTimer = 0.1;
        }
      } else if (h.clusterPhase === 'releasing') {
        // Keep moving at 50% speed while releasing
        h.pos.x += (h.clusterVelX! * 0.5) * g.slowMoFactor * dt;

        // Release glowing bombs downward — use recipe cluster splits
        const recipe = getWaveRecipe(g.waveNumber, g);
        let splitCount = Math.max(2, recipe.clusterSplits);

        for (let i = 0; i < splitCount; i++) {
          const spreadX = (i - (splitCount - 1) / 2) * 35 + (Math.random() - 0.5) * 20;
          const sh = getFromPool<Hazard>(g.hazards, () => ({
            active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
            speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
            rotation: 0, trailTimer: 0
          }));
          sh.type = 'shrapnel';
          sh.isClusterBomb = true;
          sh.pos = { x: h.pos.x + spreadX, y: h.pos.y + 10 };
          // Bombs fall vertically — no horizontal drift
          sh.targetPos = { x: h.pos.x + spreadX, y: groundY - 5 + Math.random() * 10 };
          sh.speed = 60 + Math.random() * 100; // varied falling speeds
          sh.size = 5 + Math.random() * 4; // larger, varied sub-bombs
          sh.damage = 7;
          sh.warningDuration = 0.3;
          sh.warningTimer = 0.3;
          sh.falling = false;
          sh.rotation = Math.random() * Math.PI * 2;
          sh.trailTimer = 0;
        }
        // Explosion with metal debris
        h.clusterPhase = 'done';
        h.clusterTimer = 0.5;
        addExplosion(g, h.pos, h.size * 1.8);
        // Metal debris particles
        const metalColors = ['#888', '#aaa', '#ccc', '#666', '#999', '#bbb'];
        for (let mi = 0; mi < 18; mi++) {
          const mc = metalColors[Math.floor(Math.random() * metalColors.length)];
          const angle = Math.random() * Math.PI * 2;
          const spd = 150 + Math.random() * 100;
          const p = getFromPool<Particle>(g.particles, () => ({
            active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
            life: 0, maxLife: 0, color: '', size: 0, gravity: false
          }), 200);
          p.pos = { x: h.pos.x + (Math.random() - 0.5) * 10, y: h.pos.y + (Math.random() - 0.5) * 10 };
          p.vel = { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd - 50 };
          p.life = 0.8 + Math.random() * 0.6;
          p.maxLife = p.life;
          p.color = mc;
          p.size = 1.5 + Math.random() * 3;
          p.gravity = true;
        }
        sfxImpactLight();
      } else if (h.clusterPhase === 'done') {
        // Keep drifting at 40% speed until fade
        h.pos.x += (h.clusterVelX! * 0.4) * g.slowMoFactor * dt;
        h.clusterTimer! -= dt;
        if (h.clusterTimer! <= 0) {
          h.active = false;
          g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        }
      }
      continue; // skip normal hazard logic for clusters
    }

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
        g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        if (h.type === 'shrapnel') sfxImpactLight();
        else if (h.type === 'missile') sfxImpactHeavy();
        else sfxExplosion();
        
        addExplosion(g, h.targetPos, h.type === 'missile' ? h.size * 3 : h.size * 2);
        
        const colors = ['#ef4444', '#f97316', '#fbbf24', '#6b7280', '#4b5563'];
        for (const c of colors.slice(0, 3)) {
          spawnParticles(g, h.targetPos, h.type === 'missile' ? 6 : 3, c, h.type === 'missile' ? 250 : 150);
        }
        
        g.craters.push({ pos: { ...h.targetPos }, size: h.size * 2.5, life: 8, maxLife: 8 });
        
        const shakeStr = h.type === 'missile' ? 12 : 5;
        const shakeDirX = h.targetPos.x < g.width / 2 ? 1 : -1;
        g.screenShake = {
          x: shakeDirX * shakeStr * (0.5 + Math.random() * 0.5),
          y: -(shakeStr * 0.7 + Math.random() * shakeStr * 0.3)
        };

        const distToPlayer = dist(h.targetPos, p.pos);
        if (distToPlayer < h.size * 1.5 + p.size) {
          damagePlayer(g, h.damage, h.targetPos);
        } else {
          const maxBonusDist = 150;
          if (distToPlayer < maxBonusDist) {
            const proximity = 1 - (distToPlayer / maxBonusDist);
            const bonus = Math.floor(10 + proximity * 90);
            g.score += bonus;
            if (distToPlayer < h.size * 1.5 + p.size + CLOSE_CALL_DIST) {
              g.stats.closeCalls++;
              g.microSlowTimer = 0.15;
              sfxCloseCall();
              addFloatingText(g, `Close Call! +${bonus}`, { x: p.pos.x, y: p.pos.y - 40 }, '#fbbf24');
            } else {
              addFloatingText(g, `+${bonus}`, { x: h.targetPos.x, y: h.targetPos.y - 20 }, '#aaa');
            }
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
    if (!g.firstAmmoDropped && g.elapsed >= 10) {
      // Force first drop to be ammo
      g.firstAmmoDropped = true;
      const pu = getFromPool<PowerUp>(g.powerUps, () => ({
        active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
        parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
      }), 20);
      pu.type = 'ammo';
      pu.pos = { x: 40 + Math.random() * (g.width - 80), y: -20 };
      pu.size = 14;
      pu.parachuting = true;
      pu.fallSpeed = 35 + Math.random() * 15;
      pu.bobTimer = 0;
      pu.groundTimer = 0;
    } else {
      spawnPowerUp(g);
    }
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
          p.dashCooldown = 0; // instant dash recharge
          addFloatingText(g, '+30 HP', { x: p.pos.x, y: p.pos.y - 40 }, '#22c55e');
          spawnParticles(g, p.pos, 8, '#22c55e', 80);
          break;
        case 'shield':
          p.shielded = true;
          p.shieldTimer = p.shieldDuration;
          addFloatingText(g, 'Shield!', { x: p.pos.x, y: p.pos.y - 40 }, '#60a5fa');
          spawnParticles(g, p.pos, 8, '#60a5fa', 80);
          break;
        case 'interceptor':
          handleInterceptor(g);
          addFloatingText(g, 'Interceptor!', { x: p.pos.x, y: p.pos.y - 40 }, '#f97316');
          break;
        case 'ammo':
          p.ammo = Math.min(p.maxAmmo, p.ammo + 8);
          p.dashCooldown = 0; // instant dash recharge
          addFloatingText(g, '+8 Ammo', { x: p.pos.x, y: p.pos.y - 40 }, '#a855f7');
          spawnParticles(g, p.pos, 8, '#a855f7', 80);
          break;
        case 'slowmo':
          g.slowMoTimer = p.slowMoDuration;
          addFloatingText(g, 'SLOW-MO!', { x: p.pos.x, y: p.pos.y - 40 }, '#06b6d4');
          spawnParticles(g, p.pos, 12, '#06b6d4', 100);
          sfxSlowmo();
          break;
        case 'magnet':
          g.magnetFlashTimer = 1.5;
          addFloatingText(g, 'MAGNET!', { x: p.pos.x, y: p.pos.y - 40 }, '#9ca3af');
          spawnParticles(g, p.pos, 10, '#9ca3af', 90);
          sfxMagnet();
          // Instantly collect all currently parachuting power-ups
          for (const pu2 of g.powerUps) {
            if (pu2 !== pu && pu2.active && pu2.parachuting) {
              pu2.pos.x = p.pos.x;
              pu2.pos.y = p.pos.y;
              pu2.parachuting = false;
              pu2.fallSpeed = 0;
            }
          }
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
              g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
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
        case 'extinguisher': {
          // Extinguish all fire pools + 8s immunity
          addFloatingText(g, 'EXTINGUISHER!', { x: p.pos.x, y: p.pos.y - 40 }, '#f97316');
          spawnParticles(g, p.pos, 10, '#f97316', 90);
          p.extinguisherTimer = 8;
          // Clear all active fire pools
          g.firePools.length = 0;
          break;
        }
        // gasmask removed — now purchased via card only
        case 'water': {
          const heal = 20;
          p.health = Math.min(p.maxHealth, p.health + heal);
          addFloatingText(g, `+${heal} HP`, { x: p.pos.x, y: p.pos.y - 40 }, '#38bdf8');
          spawnParticles(g, p.pos, 8, '#38bdf8', 80);
          break;
        }
      }
    }
  }

  // Magnet attraction removed — magnet now works instantly

  // === Cargo Drone ===
  if (g.elapsed >= 120 && g.wavePhase === 'active') {
    g.cargoTimer -= dt;
    if (g.cargoTimer <= 0) {
      g.cargoTimer = 60 + Math.random() * 30;
      spawnCargoDrone(g);
    }
  }

  // === Incendiary Drones — Recipe-based ===
  const recipeForDrones = getWaveRecipe(g.waveNumber, g);
  if (recipeForDrones.hasIncendiary && g.wavePhase === 'active') {
    g.incendiaryTimer -= dt;
    if (g.incendiaryTimer <= 0) {
      g.incendiaryTimer = 25 + Math.random() * 15;
      spawnIncendiaryDrone(g);
    }
  }

  // === Chemical Drones — Recipe-based ===
  if (recipeForDrones.hasChemical && g.wavePhase === 'active') {
    g.chemicalTimer -= dt;
    if (g.chemicalTimer <= 0) {
      g.chemicalTimer = 30 + Math.random() * 20;
      spawnChemicalDrone(g);
    }
  }

  // === Player protection timers ===
  // Gas mask stays active as long as gasMaskOwned AND chemical threat exists
  if (g.gasMaskOwned) {
    p.gasMaskTimer = 1; // Keep active
    const hasChemThreat = g.gasClouds.length > 0 || g.drones.some(d => d.active && d.tier === 'chemical');
    if (!hasChemThreat) {
      g.gasMaskOwned = false;
      p.gasMaskTimer = 0;
    }
  } else if (p.gasMaskTimer > 0) {
    p.gasMaskTimer -= dt;
  }
  if (p.extinguisherTimer > 0) p.extinguisherTimer -= dt;

  // === Update Fire Pools ===
  for (let i = g.firePools.length - 1; i >= 0; i--) {
    const fp = g.firePools[i];
    fp.life -= dt;
    if (fp.life <= 0) { g.firePools.splice(i, 1); continue; }
    // Auto-extinguish when player approaches with extinguisher active
    if (p.extinguisherTimer > 0 && dist(p.pos, fp.pos) < fp.size + p.size + 30) {
      // Steam effect
      spawnParticles(g, fp.pos, 8, '#e2e8f0', 60, false);
      addFloatingText(g, '💨', { x: fp.pos.x, y: fp.pos.y - 20 }, '#94a3b8');
      g.firePools.splice(i, 1);
      g.score += 5;
      continue;
    }
    // Damage player if standing in fire (unless extinguisher active)
    if (p.extinguisherTimer <= 0 && dist(p.pos, fp.pos) < fp.size + p.size) {
      const fireDmg = fp.damagePerSec * dt;
      p.health = Math.max(0, p.health - fireDmg);
      if (Math.random() < 0.2) addFloatingText(g, '🔥', { x: p.pos.x, y: p.pos.y - 30 }, '#f97316');
      if (p.health <= 0 && g.deathPhase === 'alive') {
        g.deathPhase = 'dying';
        g.deathTimer = 1.5;
        g.slowMoFactor = 0.15;
        g.hitStopTimer = Math.max(g.hitStopTimer, 0.15);
      }
    }
  }

  // === Update Gas Clouds ===
  for (let i = g.gasClouds.length - 1; i >= 0; i--) {
    const gc = g.gasClouds[i];
    gc.life -= dt;
    if (gc.life <= 0) { g.gasClouds.splice(i, 1); continue; }
    // Damage + slow player if in gas (unless gas mask active)
    if (p.gasMaskTimer <= 0 && dist(p.pos, gc.pos) < gc.size + p.size) {
      const gasDmg = gc.damagePerSec * dt;
      p.health = Math.max(0, p.health - gasDmg);
      // Slow movement by 50%
      p.velocity.x *= (1 - 0.5 * dt * 5); // smooth slow
      if (Math.random() < 0.15) addFloatingText(g, '☣', { x: p.pos.x, y: p.pos.y - 30 }, '#16a34a');
      if (p.health <= 0 && g.deathPhase === 'alive') {
        g.deathPhase = 'dying';
        g.deathTimer = 1.5;
        g.slowMoFactor = 0.15;
        g.hitStopTimer = Math.max(g.hitStopTimer, 0.15);
      }
    }
  }

  // === Drones — Recipe-based ===
  if (recipeForDrones.droneInterval > 0 && g.wavePhase === 'active') {
    g.droneTimer -= dt;
    if (g.droneTimer <= 0) {
      g.droneTimer = recipeForDrones.droneInterval + Math.random() * 4;
      if (recipeForDrones.droneTiers.length > 0) {
        const tier = recipeForDrones.droneTiers[Math.floor(Math.random() * recipeForDrones.droneTiers.length)];
        spawnDrone(g, tier);
      }
    }
  }

  for (const d of g.drones) {
    if (!d.active) continue;
    d.wobble += dt;

    // === Cargo drone: passive fly-through ===
    if (d.tier === 'cargo') {
      d.pos.x += d.vel.x * dt;
      d.pos.y += Math.sin(d.wobble * 1.5) * 5 * dt; // gentle bob
      // Remove when off-screen
      if ((d.vel.x > 0 && d.pos.x > g.width + 80) || (d.vel.x < 0 && d.pos.x < -80)) {
        d.active = false;
      }
      continue;
    }

    // === Incendiary drone: track player and drop fire ===
    if (d.tier === 'incendiary') {
      if (d.state === 'entering') {
        const dx = d.entryTarget.x - d.pos.x;
        const dy = d.entryTarget.y - d.pos.y;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 5) { d.state = 'tracking'; d.hoverTimer = d.aggroDelay; }
        else { d.pos.x += (dx / dd) * d.speed * 2 * dt; d.pos.y += (dy / dd) * d.speed * 2 * dt; }
      } else {
        if (d.hoverTimer > 0) {
          d.hoverTimer -= dt;
          d.pos.x += Math.sin(d.wobble * 1.5) * 20 * dt;
          d.pos.y += Math.cos(d.wobble * 1.2) * 8 * dt;
        } else {
          // Track player
          const dx = p.pos.x - d.pos.x;
          const targetY = p.pos.y - 70;
          const dy = targetY - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            d.vel.x += (dx / dd) * 80 * d.trackingAccuracy * dt;
            d.vel.y += (dy / dd) * 80 * d.trackingAccuracy * dt;
            const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
            if (vLen > d.speed) { d.vel.x = (d.vel.x / vLen) * d.speed; d.vel.y = (d.vel.y / vLen) * d.speed; }
          }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
          d.pos.y = Math.max(g.height * 0.08, Math.min(g.height * 0.5, d.pos.y));
          d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

          // Drop firebomb when above player
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 50) {
            d.bombTimer = 0;
            const groundY = g.height * GROUND_RATIO;
            const fireX = d.pos.x + (Math.random() - 0.5) * 20;
            g.firePools.push({
              pos: { x: fireX, y: groundY - 2 },
              size: 40 + Math.random() * 20,
              life: 4 + Math.random() * 2,
              maxLife: 6,
              damagePerSec: 3,
            });
            addFloatingText(g, '🔥', { x: d.pos.x, y: d.pos.y + 15 }, '#f97316');
            spawnParticles(g, { x: fireX, y: groundY }, 8, '#f97316', 100);
            addExplosion(g, { x: fireX, y: groundY }, 15);
          }
        }
        // Collision with player (kamikaze)
        if (dist(d.pos, p.pos) < d.size + p.size) {
          damagePlayer(g, 10, d.pos);
          spawnParticles(g, d.pos, 12, '#f97316', 120);
          addExplosion(g, d.pos, 20);
          d.active = false;
        }
      }
      continue;
    }

    // === Chemical drone: track player and drop gas ===
    if (d.tier === 'chemical') {
      if (d.state === 'entering') {
        const dx = d.entryTarget.x - d.pos.x;
        const dy = d.entryTarget.y - d.pos.y;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 5) { d.state = 'tracking'; d.hoverTimer = d.aggroDelay; }
        else { d.pos.x += (dx / dd) * d.speed * 2 * dt; d.pos.y += (dy / dd) * d.speed * 2 * dt; }
      } else {
        if (d.hoverTimer > 0) {
          d.hoverTimer -= dt;
          d.pos.x += Math.sin(d.wobble * 1.2) * 15 * dt;
          d.pos.y += Math.cos(d.wobble * 0.9) * 6 * dt;
        } else {
          const dx = p.pos.x - d.pos.x;
          const targetY = p.pos.y - 80;
          const dy = targetY - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            d.vel.x += (dx / dd) * 60 * d.trackingAccuracy * dt;
            d.vel.y += (dy / dd) * 60 * d.trackingAccuracy * dt;
            const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
            if (vLen > d.speed) { d.vel.x = (d.vel.x / vLen) * d.speed; d.vel.y = (d.vel.y / vLen) * d.speed; }
          }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
          d.pos.y = Math.max(g.height * 0.08, Math.min(g.height * 0.5, d.pos.y));
          d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

          // Drop gas canister
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 60) {
            d.bombTimer = 0;
            const groundY = g.height * GROUND_RATIO;
            const gasX = d.pos.x + (Math.random() - 0.5) * 30;
            g.gasClouds.push({
              pos: { x: gasX, y: groundY - 2 },
              size: 50 + Math.random() * 20,
              life: 5 + Math.random() * 3,
              maxLife: 8,
              damagePerSec: 2,
            });
            addFloatingText(g, '☣', { x: d.pos.x, y: d.pos.y + 15 }, '#16a34a');
            spawnParticles(g, { x: gasX, y: groundY }, 6, '#16a34a', 80);
          }
        }
        if (dist(d.pos, p.pos) < d.size + p.size) {
          damagePlayer(g, 8, d.pos);
          spawnParticles(g, d.pos, 12, '#16a34a', 120);
          addExplosion(g, d.pos, 20);
          d.active = false;
        }
      }
      continue;
    }

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
      } else if (d.tier === 'tracker') {
        // TRACKER: Orbital movement with dive attacks + projectile fire
        d.bombTimer += dt;
        const orbitRadius = 120;
        const orbitSpeed = 2.0;
        const isDiving = d.bombTimer >= d.bombCooldown;
        
        if (isDiving) {
          // Fire a projectile toward the player at dive start
          if (d.bombTimer - dt < d.bombCooldown) {
            // First frame of dive — spawn projectile
            const projDx = p.pos.x - d.pos.x;
            const projDy = p.pos.y - d.pos.y;
            const projDd = Math.sqrt(projDx * projDx + projDy * projDy);
            if (projDd > 0) {
              const proj = getFromPool<Hazard>(g.hazards, () => ({
                active: false, type: 'shrapnel', pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
                speed: 0, size: 0, damage: 0, warningTimer: 0, warningDuration: 0, falling: false,
                rotation: 0, trailTimer: 0
              }));
              proj.type = 'shrapnel';
              proj.pos = { x: d.pos.x, y: d.pos.y + d.size * 0.5 };
              proj.targetPos = { x: p.pos.x, y: g.height * GROUND_RATIO };
              proj.speed = 250;
              proj.size = 6;
              proj.damage = 10;
              proj.warningDuration = 0;
              proj.warningTimer = 0;
              proj.falling = true;
              proj.splitDone = false;
              proj.isClusterBomb = false;
              proj.rotation = 0;
              proj.trailTimer = 0;
              g.activeHazardCount++;
              sfxWarning();
              addFloatingText(g, '⚡', { x: d.pos.x, y: d.pos.y + 15 }, '#fbbf24');
            }
          }

          // Dive movement toward player
          const dx = p.pos.x - d.pos.x;
          const dy = (p.pos.y - 60) - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            d.vel.x = (dx / dd) * d.speed * 2.2;
            d.vel.y = (dy / dd) * d.speed * 2.2;
          }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
          
          // Reset after reaching safe distance above player
          if (d.pos.y > p.pos.y - 60) {
            d.bombTimer = 0;
            d.vel.y = -d.speed * 1.5;
            d.vel.x = (d.pos.x < p.pos.x ? -1 : 1) * d.speed * 0.8;
          }
        } else {
          // Orbit around player at safe altitude
          const orbitAngle = d.wobble * orbitSpeed;
          const targetX = p.pos.x + Math.cos(orbitAngle) * orbitRadius;
          const targetY = (p.pos.y - 160 - d.altitudeOffset * 0.5) + Math.sin(orbitAngle * 0.7) * 20;
          const dx = targetX - d.pos.x;
          const dy = targetY - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            const steerForce = 150 * d.trackingAccuracy;
            d.vel.x += (dx / dd) * steerForce * dt;
            d.vel.y += (dy / dd) * steerForce * dt;
          }

          // === Separation force for trackers ===
          for (const other of g.drones) {
            if (!other.active || other === d) continue;
            const sx = d.pos.x - other.pos.x;
            const sy = d.pos.y - other.pos.y;
            const sd = Math.sqrt(sx * sx + sy * sy);
            const minSep = d.size + other.size + 40;
            if (sd < minSep && sd > 0) {
              const force = (minSep - sd) * 4;
              d.vel.x += (sx / sd) * force * dt;
              d.vel.y += (sy / sd) * force * dt;
            }
          }

          const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
          if (vLen > d.speed) {
            d.vel.x = (d.vel.x / vLen) * d.speed;
            d.vel.y = (d.vel.y / vLen) * d.speed;
          }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
        }

        // Keep in bounds — higher altitude
        const minY = g.height * 0.08;
        const maxY = g.height * 0.42;
        d.pos.y = Math.max(minY, Math.min(maxY, d.pos.y));
        d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));
      } else {
        // Active tracking for scout/bomber
        const dx = p.pos.x - d.pos.x;
        const targetY = d.tier === 'bomber' ? p.pos.y - 150 - d.altitudeOffset * 0.5 : p.pos.y - 120 - d.altitudeOffset * 0.5;
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
        const maxY = g.height * 0.42;
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
            bomb.type = 'shrapnel';
            bomb.pos = { x: d.pos.x, y: d.pos.y + d.size };
            bomb.targetPos = { x: d.pos.x + (Math.random() - 0.5) * 30, y: g.height * GROUND_RATIO };
            bomb.speed = 220 + Math.random() * 60;
            bomb.size = 10;
            bomb.damage = 18;
            bomb.warningDuration = 0;
            bomb.warningTimer = 0;
            bomb.falling = true;
            bomb.splitDone = false;
            bomb.isClusterBomb = false;
            bomb.rotation = 0;
            bomb.trailTimer = 0;
            g.activeHazardCount++;
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
        g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        sfxExplosion();
        addExplosion(g, h.pos, h.size * 2);
        spawnParticles(g, h.pos, 8, '#f97316', 150);
        // Impact flash — white burst
        spawnParticles(g, b.pos, 3, '#ffffff', 80, false);
        incrementCombo(g);
        const distToPlayer = dist(h.pos, p.pos);
        const proximity = Math.max(0, 1 - distToPlayer / 200);
        const bonus = comboScore(g, Math.floor(20 + proximity * 80));
        g.score += bonus;
        g.hitStopTimer = Math.max(g.hitStopTimer, 0.05);
        g.microSlowTimer = 0.2;
        const comboText = g.comboMultiplier > 1 ? ` ×${g.comboMultiplier}` : '';
        addFloatingText(g, `Shot! +${bonus}${comboText}`, h.pos, '#a855f7');
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
        // Knockback — push drone in bullet direction
        const kbX = b.vel.x > 0 ? 3 : b.vel.x < 0 ? -3 : 0;
        const kbY = b.vel.y > 0 ? 2 : -2;
        d.pos.x += kbX;
        d.pos.y += kbY;
        spawnParticles(g, b.pos, 6, '#f97316', 100);
        // Impact flash
        spawnParticles(g, b.pos, 2, '#ffffff', 60, false);
        addExplosion(g, b.pos, 8); // small hit flash
        if (d.health <= 0) {
          d.active = false;
          addExplosion(g, d.pos, 20);
          sfxExplosion();
          spawnParticles(g, d.pos, 15, '#f97316', 180);
          spawnParticles(g, d.pos, 8, '#555', 100);
          incrementCombo(g);
          // Cargo drone drops its payload
          if (d.tier === 'cargo' && d.cargoType) {
            const pu = getFromPool<PowerUp>(g.powerUps, () => ({
              active: false, type: 'medkit', pos: { x: 0, y: 0 }, size: 0,
              parachuting: false, fallSpeed: 0, bobTimer: 0, groundTimer: 0
            }), 20);
            pu.type = d.cargoType;
            pu.pos = { x: d.pos.x, y: d.pos.y };
            pu.size = 14;
            pu.parachuting = true;
            pu.fallSpeed = 30;
            pu.bobTimer = 0;
            pu.groundTimer = 0;
            addFloatingText(g, `CARGO DROP!`, d.pos, '#fbbf24');
          }
          const base = d.tier === 'cargo' ? 60 : d.tier === 'bomber' ? 80 : d.tier === 'tracker' ? 50 : 30;
          const bonus = comboScore(g, base);
          const comboText = g.comboMultiplier > 1 ? ` ×${g.comboMultiplier}` : '';
          addFloatingText(g, `Shot Down! +${bonus}${comboText}`, d.pos, '#a855f7');
          g.score += bonus;
          g.stats.dronesDestroyed++;
          g.hitStopTimer = Math.max(g.hitStopTimer, 0.08);
          g.microSlowTimer = 0.2;
        } else {
          // Damaged but not destroyed — visual feedback
          addFloatingText(g, `HIT!`, b.pos, '#ff6b35');
          g.hitStopTimer = Math.max(g.hitStopTimer, 0.03);
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


  // === Boss ===
  g.bossTimer -= dt;
  if (g.bossTimer <= 0 && !g.boss && g.bossCount > 0) {
    spawnBoss(g);
    g.bossTimer = 240 + g.bossCount * 30;
  }
  if (g.boss && !g.boss.defeated) {
    updateBoss(g, dt);
  }
}

// ========== BOSS SYSTEM ==========

function spawnBoss(g: GameData, showWarning = true) {
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
  if (showWarning) {
    g.cinematicWarning = { text: '⚠ تحذير: طائرة حربية!', subText: '', color: '#dc2626', timer: 1.5, duration: 1.5, type: 'warning' };
    g.slowMoFactor = 0.1;
  }
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
    const phaseText = newPhase === 2 ? '⚡ المرحلة الثانية!' : '⚡ المرحلة الأخيرة!';
    g.cinematicWarning = { text: phaseText, subText: '', color: '#fbbf24', timer: 1.0, duration: 1.0, type: 'warning' };
    g.slowMoFactor = 0.1;
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
