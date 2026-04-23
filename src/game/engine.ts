import {
  GameData, InputState, Hazard, PowerUp, Particle, Vec2, Crater, FloatingText, Drone, Bullet,
  HazardType, PowerUpType, Explosion, SmokeTrail, Cloud, AmbientParticle, WaveWarning, Boss, DroneTier,
  FirePool, GasCloud, UpgradeCard, DeliveryBike, IntroPhase
} from './types';
import type { DifficultyProfile, RemoteWaveConfig } from './config';
import { getFromPool, releaseAll } from './pool';
import { addTrauma, updateCameraShake, resetTrauma } from './cameraShake';
import { sfxExplosion, sfxImpactLight, sfxImpactHeavy, sfxPickup, sfxDamage, sfxDash, sfxInterceptor, sfxFootstep, sfxWarning, sfxSlowmo, sfxMagnet, sfxAirstrike, sfxBossSiren, sfxBossExplosion, sfxThunder, sfxShoot1, sfxShoot2, sfxShoot3, sfxCombo, sfxCloseCall, sfxBikeEngine, sfxBikeBrake, sfxBikeIdle, sfxBikeDepart, sfxWarningAlert, sfxUpgradeAlert, sfxWaveComplete, sfxLevelUp, sfxGameOver, sfxGameOverVoice, sfxGameStart, sfxUpgradeSelect, sfxScoreTick, sfxSlideTransition, startPeriodicAmbient, stopPeriodicAmbient, sfxWarningShrapnel, sfxWarningMissile, sfxWarningCluster, sfxWarningDrone, sfxWarningBoss, sfxWarningHazard, sfxWarningBomber, playCustomAudio } from './audio';

let onSceneSwap: ((sceneIndex: number) => void) | null = null;
export function setOnSceneSwap(cb: ((sceneIndex: number) => void) | null) { onSceneSwap = cb; }

const DASH_SPEED = 520;
const DASH_DURATION = 0.25;
const DASH_COOLDOWN = 0.8;
const CLOSE_CALL_DIST = 45;
const PLAYER_RADIUS = 22;
const GROUND_RATIO = 0.78; // Ground plane at 78% of screen height
// Movement feel tuning.
// Terminal velocity = ACCEL / FRICTION = 1600 / 8 = 200 px/s base,
// scaled by player.speedMultiplier (up to 1.6x via upgrade).
// Previous values (1200/8 = 150) felt sluggish on larger viewports.
const PLAYER_ACCEL = 1600;
const PLAYER_FRICTION = 8;
const PLAYER_MAX_SPEED = 340; // hard cap to prevent dash chaining exploits

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
      gasMaskDonTimer: 0,
      gasMaskDoffTimer: 0,
      extinguisherTimer: 0,
      fireSuitTimer: 0,
      fireSuitDonTimer: 0,
      fireSuitDoffTimer: 0,
      minesweeperTimer: 0,
      minesweeperDonTimer: 0,
      minesweeperDoffTimer: 0,
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
    firstAmmoPickedUp: false,
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
    gasMaskDropScheduled: false,
    gasMaskDropTime: 0,
    fireSuitOffer: null,
    fireSuitOwned: false,
    fireSuitOfferDelay: 0,
    fireSuitDropScheduled: false,
    fireSuitDropTime: 0,
    fireSuitOfferPending: false,
    minesweeperOffer: null,
    minesweeperOwned: false,
    minesweeperOfferDelay: 0,
    minePlanterArrivalTime: 0,
    minePlanterScheduled: false,
    minePlanter: null,
    scoreCountdown: null,
    waveEvents: [],
    waveEventsFired: [],
    volleyQueue: null,
    surgeFlashTimer: 0,
    currentSceneIndex: 0,
    sceneChangeWaveInterval: 6,
    scenes: [],
    allBgPhases: [],
    sceneTransition: null,
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
  g.player.gasMaskDonTimer = 0;
  g.player.gasMaskDoffTimer = 0;
  g.player.extinguisherTimer = 0;
  g.player.fireSuitTimer = 0;
  g.player.fireSuitDonTimer = 0;
  g.player.fireSuitDoffTimer = 0;
  g.player.minesweeperTimer = 0;
  g.player.minesweeperDonTimer = 0;
  g.player.minesweeperDoffTimer = 0;
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
  resetTrauma();
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
  g.firstAmmoPickedUp = false;
  g.cargoTimer = 120;
  g.firePools = [];
  g.gasClouds = [];
  g.incendiaryTimer = 160; // will be overridden below by wave1 recipe
  g.chemicalTimer = 200; // will be overridden below by wave1 recipe
  g.gasMaskOffer = null;
  g.gasMaskOwned = false;
  g.gasMaskOfferDelay = 0;
  g.gasMaskDropScheduled = false;
  g.gasMaskDropTime = 0;
  g.fireSuitOffer = null;
  g.fireSuitOwned = false;
  g.fireSuitOfferDelay = 0;
  g.fireSuitDropScheduled = false;
  g.fireSuitDropTime = 0;
  g.fireSuitOfferPending = false;
  g.minesweeperOffer = null;
  g.minesweeperOwned = false;
  g.minesweeperOfferDelay = 0;
  g.minePlanterArrivalTime = 0;
  g.minePlanterScheduled = false;
  g.minePlanter = null;
  g.scoreCountdown = null;
  g.waveEvents = [];
  g.waveEventsFired = [];
  g.volleyQueue = null;
  g.surgeFlashTimer = 0;
  // Wave system reset
  g.waveNumber = 1;
  g.wavePhase = 'active';
  g.levelNumber = 1;
  // Apply wave 1 recipe from overrides/profile instead of hardcoded 60
  const wave1Recipe = getWaveRecipe(1, g);
  g.waveTimer = wave1Recipe.duration || 60;
  g.bulletLevel = wave1Recipe.bulletLevel;
  g.waveEvents = (wave1Recipe.events ?? []).map(e => ({ type: e.type, triggerAt: e.triggerAt, duration: e.duration }));
  g.waveEventsFired = g.waveEvents.map(() => false);
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
    speed: 480,
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

  // Suspension + lean physics for intro bike too
  updateBikePhysics(bike, dt);

  const centerX = g.width / 2;

  switch (g.introPhase) {
    case 'bikeEnter': {
      // Play bike engine sound at start
      if (g.introTimer < dt * 2) sfxBikeEngine();
      // Bike enters from left with a long, smooth deceleration using a
      // cubic ease-out curve. Much more natural than linear speed falloff.
      const distToCenter = centerX - bike.pos.x;
      const decelZone = 140;
      if (distToCenter < decelZone) {
        // Cubic ease-out: preserves high speed until the last third then
        // dives smoothly to ~25 as the bike nears its stop point.
        const t = 1 - Math.max(0, distToCenter) / decelZone; // 0..1
        const ease = 1 - Math.pow(1 - t, 3);
        bike.speed = 480 * (1 - ease) + 22;
      }
      bike.pos.x += bike.speed * dt;
      // Player rides with bike
      g.player.pos.x = bike.pos.x;

      // Camera follows bike with a small forward-bias (looks more cinematic)
      g.cameraFocusX = bike.pos.x + 15;

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

      // Phase timings must match the renderer (see renderIntroBike).
      const dismountDuration = 1.8;
      const dp = Math.min(1, g.introTimer / dismountDuration);

      if (dp < 0.12) {
        g.introPlayerOffset = -6 - (dp / 0.12) * 2;
        g.introPlayerJumpY = 0;
      } else if (dp < 0.38) {
        const t = (dp - 0.12) / 0.26;
        const swing = t * t * (3 - 2 * t);
        g.introPlayerOffset = -8 - swing * 10;
        g.introPlayerJumpY = -swing * 4 - Math.sin(t * Math.PI) * 2;
      } else if (dp < 0.72) {
        const t = (dp - 0.38) / 0.34;
        const hEase = t * t * (3 - 2 * t);
        g.introPlayerOffset = -18 - hEase * 14;
        const v0 = 4.5, gAcc = 11;
        g.introPlayerJumpY = -(v0 * t - 0.5 * gAcc * t * t) * 3.2;
      } else {
        const t = (dp - 0.72) / 0.28;
        g.introPlayerOffset = -32 - (t * t * (3 - 2 * t)) * 3;
        g.introPlayerJumpY = 0;
      }
      g.player.pos.x = bike.pos.x + g.introPlayerOffset;
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
  events?: import('./types').WaveEventSpec[];
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
    events: (r.events ?? []).map(e => ({
      type: e.type as import('./types').WaveEventType,
      triggerAt: e.triggerAt,
      duration: e.duration,
    })),
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

  // 3. Fallback to hardcoded recipes — themed progression
  const D = 60; const S = 1;
  // W1 — First Blood: shrapnel tutorial
  if (wave <= 1) return { threats: ['shrapnel'], maxConcurrent: 3, spawnInterval: 2.4, droneInterval: 0, droneTiers: [], clusterSplits: 0, bulletLevel: 1, phaseInDelay: 0, duration: D, surgeMultiplier: S };
  // W2 — First Hunter: missile + first scout, bullet upgrade
  if (wave === 2) return { threats: ['shrapnel', 'missile'], maxConcurrent: 4, spawnInterval: 2.0, droneInterval: 28, droneTiers: ['scout'], clusterSplits: 0, bulletLevel: 2, phaseInDelay: 8, duration: D, surgeMultiplier: S };
  // W3 — Cluster Intro with mid-wave calm
  if (wave === 3) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 5, spawnInterval: 1.8, droneInterval: 24, droneTiers: ['scout'], clusterSplits: 2, bulletLevel: 2, phaseInDelay: 10, duration: D, surgeMultiplier: S, events: [{ type: 'calm', triggerAt: 25, duration: 10 }] };
  // W4 — Tracker Swarm: tracker appears, bullet upgrade
  if (wave === 4) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.7, droneInterval: 20, droneTiers: ['scout', 'tracker'], clusterSplits: 2, bulletLevel: 3, phaseInDelay: 10, duration: D, surgeMultiplier: S };
  // W5 — Fire Warning with mid-wave scout swarm
  if (wave === 5) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 6, spawnInterval: 1.6, droneInterval: 18, droneTiers: ['scout', 'tracker'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 12, hasIncendiary: true, duration: D, surgeMultiplier: S, events: [{ type: 'swarm', triggerAt: 30, duration: 8 }] };
  // W6 — Mini-Boss wave (meteor debut)
  if (wave === 6) return { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 7, spawnInterval: 1.5, droneInterval: 18, droneTiers: ['scout', 'tracker'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 0, hasIncendiary: true, duration: D, surgeMultiplier: S };
  // W7 — Chemical Rain with volley + late surge + minefield debut
  if (wave === 7) return { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 7, spawnInterval: 1.4, droneInterval: 16, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 3, bulletLevel: 3, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, duration: D, surgeMultiplier: S, events: [{ type: 'minefield', triggerAt: 15, duration: 1 }, { type: 'volley', triggerAt: 30, duration: 3 }, { type: 'surge', triggerAt: 45, duration: 15 }] };
  // W8 — Surge wave: laser debuts, entire wave is a surge
  if (wave === 8) return { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 8, spawnInterval: 1.2, droneInterval: 14, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 4, bulletLevel: 4, phaseInDelay: 6, hasChemical: true, hasIncendiary: true, duration: 45, surgeMultiplier: 1.3, events: [{ type: 'surge', triggerAt: 0, duration: 45 }] };
  // W9 — Calm: the entire wave is a calm
  if (wave === 9) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 5, spawnInterval: 1.8, droneInterval: 22, droneTiers: ['scout'], clusterSplits: 3, bulletLevel: 4, phaseInDelay: 0, duration: D, surgeMultiplier: S, events: [{ type: 'calm', triggerAt: 0, duration: 60 }] };
  // W10 — Combined: volley + swarm during wave
  if (wave === 10) return { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 9, spawnInterval: 1.1, droneInterval: 13, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 4, bulletLevel: 4, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, duration: D, surgeMultiplier: S, events: [{ type: 'volley', triggerAt: 20, duration: 3 }, { type: 'swarm', triggerAt: 40, duration: 8 }] };
  // W11 — Pre-Boss: extra bombers + minefield, tense
  if (wave === 11) return { threats: ['shrapnel', 'missile', 'cluster', 'meteor'], maxConcurrent: 10, spawnInterval: 1.0, droneInterval: 11, droneTiers: ['scout', 'tracker', 'bomber', 'laser'], clusterSplits: 5, bulletLevel: 4, phaseInDelay: 10, hasChemical: true, hasIncendiary: true, duration: D, surgeMultiplier: S, events: [{ type: 'minefield', triggerAt: 25, duration: 1 }, { type: 'surge', triggerAt: 48, duration: 12 }] };
  // W12 — BOSS
  if (wave === 12) return { threats: ['shrapnel', 'missile', 'cluster'], maxConcurrent: 10, spawnInterval: 1.0, droneInterval: 12, droneTiers: ['scout', 'tracker', 'bomber'], clusterSplits: 5, bulletLevel: 4, phaseInDelay: 12, hasBoss: true, hasChemical: true, hasIncendiary: true, duration: D, surgeMultiplier: S };
  const extra = wave - 12;
  return {
    threats: ['shrapnel', 'missile', 'cluster'],
    maxConcurrent: Math.min(13, 10 + Math.floor(extra / 2)),
    spawnInterval: Math.max(0.55, 0.95 - extra * 0.03),
    droneInterval: Math.max(7, 11 - extra * 0.5),
    droneTiers: ['scout', 'tracker', 'bomber', 'laser'] as DroneTier[],
    clusterSplits: Math.min(6, 5 + Math.floor(extra / 3)),
    bulletLevel: 4,
    phaseInDelay: 0,
    hasBoss: extra % 4 === 0,
    hasChemical: true,
    hasIncendiary: true,
    duration: D,
    surgeMultiplier: S,
  };
}

// Warning messages for new threats introduced in each wave
export const WAVE_WARNINGS: Record<number, { id: string; text: string; sub: string; color: string; type: 'warning' | 'upgrade' }[]> = {
  1: [{ id: 'w1_shrapnel', text: 'تحذير: شظايا متساقطة!', sub: '', color: '#ef4444', type: 'warning' }],
  2: [
    { id: 'w2_missile', text: 'تحذير: صواريخ + طائرات استطلاع!', sub: '', color: '#dc2626', type: 'warning' },
    { id: 'w2_bullet2', text: 'تطوير: طلقة مزدوجة', sub: '', color: '#22c55e', type: 'upgrade' },
  ],
  3: [{ id: 'w3_cluster', text: 'تحذير: صواريخ متشظية!', sub: '', color: '#f43f5e', type: 'warning' }],
  4: [
    { id: 'w4_tracker', text: 'تحذير: طائرات تتبع!', sub: '', color: '#dc2626', type: 'warning' },
    { id: 'w4_bullet3', text: 'تطوير: طلقة ثلاثية', sub: '', color: '#22c55e', type: 'upgrade' },
  ],
  5: [
    { id: 'w5_extinguisher', text: 'إمدادات: طفاية حريق!', sub: '', color: '#f97316', type: 'upgrade' },
    { id: 'w5_incendiary', text: 'تحذير: طائرات حارقة!', sub: '', color: '#ea580c', type: 'warning' },
  ],
  6: [{ id: 'w6_minibos', text: '⚠ قائد معركة قادم!', sub: '', color: '#f59e0b', type: 'warning' }],
  7: [
    { id: 'w7_gasmask', text: 'إمدادات: كمامة غاز!', sub: '', color: '#16a34a', type: 'upgrade' },
    { id: 'w7_chemical', text: 'تحذير: طائرات كيميائية!', sub: '', color: '#15803d', type: 'warning' },
    { id: 'w7_bomber', text: 'تحذير: قاذفات قنابل!', sub: '', color: '#ef4444', type: 'warning' },
  ],
  8: [
    { id: 'w8_surge', text: '⚠ موجة عاصفة!', sub: '', color: '#dc2626', type: 'warning' },
    { id: 'w8_bullet4', text: 'تطوير: طلقة رباعية', sub: '', color: '#22c55e', type: 'upgrade' },
  ],
  9: [{ id: 'w9_calm', text: 'هدوء قبل العاصفة', sub: '', color: '#60a5fa', type: 'warning' }],
  10: [{ id: 'w10_combined', text: 'تحذير: جميع التهديدات!', sub: '', color: '#991b1b', type: 'warning' }],
  11: [{ id: 'w11_preboss', text: '⚠ قاذفات إضافية قادمة!', sub: '', color: '#dc2626', type: 'warning' }],
  12: [
    { id: 'w12_boss', text: 'تحذير: طائرة حربية!', sub: '', color: '#dc2626', type: 'warning' },
    { id: 'w12_cluster5', text: 'تحذير: تشظي خماسي!', sub: '', color: '#991b1b', type: 'warning' },
  ],
};

/** Factory for default Hazard pool entries. */
function createHazardDefault(): Hazard {
  return {
    active: false, type: 'shrapnel',
    pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
    speed: 0, size: 0, damage: 0,
    warningTimer: 0, warningDuration: 0,
    falling: false, rotation: 0, trailTimer: 0,
    isFireBomb: false, isGasBomb: false, isClusterBomb: false,
    mineState: undefined, mineTimer: 0, mineLife: 0,
  };
}

/** Factory for default PowerUp pool entries. */
function createPowerUpDefault(): PowerUp {
  return {
    active: false, type: 'medkit',
    pos: { x: 0, y: 0 }, size: 0,
    parachuting: false, fallSpeed: 0,
    bobTimer: 0, groundTimer: 0,
  };
}

function getTargetedRatio(waveNumber: number): number {
  if (waveNumber <= 2) return 0;
  return Math.min(0.6, (waveNumber - 2) * 0.1);
}

function spawnHazard(g: GameData, type: HazardType) {
  const recipe = getWaveRecipe(g.waveNumber, g);

  const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
  const groundY = g.height * GROUND_RATIO;
  const targetedRatio = getTargetedRatio(g.waveNumber);
  const isTargeted = Math.random() < targetedRatio;
  const rawTx = isTargeted
    ? g.player.pos.x + (Math.random() - 0.5) * 40
    : 30 + Math.random() * (g.width - 60);
  const tx = Math.max(30, Math.min(g.width - 30, rawTx));
  const ty = groundY - 5 + Math.random() * 10;
  h.type = type;
  h.targetPos = { x: tx, y: ty };
  h.pos = { x: tx + (Math.random() - 0.5) * 80, y: -40 };
  h.falling = false;
  h.splitDone = false;
  h.isFireBomb = false;
  h.isGasBomb = false;
  h.isClusterBomb = false;
  h.mineState = undefined;
  h.mineTimer = 0;
  h.mineLife = 0;
  h.rotation = Math.random() * Math.PI * 2;
  h.trailTimer = 0;

  switch (type) {
    case 'shrapnel': {
      // Pick one of 4 shapes — heavier pieces fall faster and tumble slower.
      //   0: rebar (long rectangle) — heaviest, fastest fall, slow spin
      //   1: jagged chunk          — medium, standard spin
      //   2: bent sheet metal      — light, slower fall, wobbly
      //   3: twisted wire          — lightest, slowest fall, fastest spin
      const variant = Math.floor(Math.random() * 4);
      h.shrapnelVariant = variant;
      const baseSpeed = 280 + g.difficulty * 20 + Math.random() * 140;
      const weightMul = [1.15, 1.0, 0.8, 0.65][variant];
      h.speed = Math.min(baseSpeed * weightMul, MAX_MISSILE_SPEED * 0.85);
      // Spin rate varies inversely with weight
      h.spinSpeed = [2.5, 6, 4.5, 9][variant] + Math.random() * 2;
      h.size = [10, 8, 9, 7][variant];
      h.damage = [12, 10, 9, 7][variant];
      h.warningDuration = 0.7;
      break;
    }
    case 'missile':
      h.speed = Math.min(160 + g.difficulty * 15 + Math.random() * 100, MAX_MISSILE_SPEED);
      h.size = 12;
      h.damage = 22;
      h.warningDuration = 1.2;
      break;
    case 'meteor': {
      // Meteor: slow, heavy, large blast radius. Long warning so skilled players can clear the zone.
      h.speed = 180 + g.difficulty * 10 + Math.random() * 40;
      h.size = 30;
      h.damage = 35;
      h.warningDuration = 3.0;
      break;
    }
    case 'mine': {
      // Mines are placed directly on the ground — no falling, no warning circle.
      h.pos = { x: tx, y: groundY };
      h.targetPos = { x: tx, y: groundY };
      h.speed = 0;
      h.size = 10;
      h.damage = 25;
      h.warningDuration = 0;
      h.warningTimer = 0;
      h.falling = true;  // bypass warning → update loop
      h.mineState = 'arming';
      h.mineTimer = 1.0;  // 1s to arm
      h.mineLife = 5.0;   // despawn if not triggered
      break;
    }
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
  const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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

  if (tier === 'laser') {
    d.speed = 25;             // hovers, doesn't track player
    d.size = 26;
    d.health = 3;
    d.maxHealth = 3;
    d.aggroDelay = 1.2 + Math.random() * 0.6;  // used as initial idle hover
    d.trackingAccuracy = 0;
    d.bombTimer = 1.5;        // telegraph duration
    d.bombCooldown = 3.0;     // between cycles
    d.colorHue = 330;         // magenta/red
    d.laserPhase = 'idle';
    d.laserTargetX = 0;
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

/**
 * Factory for a default Drone object used by every spawn function.
 * Kept near its consumers so refactors stay local and type-checked.
 */
function createDroneDefault(): Drone {
  return {
    active: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    speed: 0, size: 0, health: 0, maxHealth: 0,
    state: 'entering', entryTarget: { x: 0, y: 0 },
    tier: 'scout', bombTimer: 0, bombCooldown: 0, hoverTimer: 0,
    aggroDelay: 0, trackingAccuracy: 0, wobble: 0,
    altitudeOffset: 0, colorHue: 0,
    laserPhase: undefined, laserTargetX: 0,
  };
}

function spawnDrone(g: GameData, forcedTier?: DroneTier) {
  const d = getFromPool<Drone>(g.drones, createDroneDefault, 10);
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

  // Cap laser drones to 1 at a time — they're high-impact, not swarm enemies
  if (selectedTier === 'laser') {
    const activeLasers = g.drones.filter(dr => dr.active && dr.tier === 'laser').length;
    if (activeLasers >= 1) {
      configureDroneByTier(d, 'scout', g.elapsed);
      return;
    }
  }

  configureDroneByTier(d, selectedTier, g.elapsed);
}

function spawnCargoDrone(g: GameData) {
  const d = getFromPool<Drone>(g.drones, createDroneDefault, 10);
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
  const d = getFromPool<Drone>(g.drones, createDroneDefault, 10);
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
  const d = getFromPool<Drone>(g.drones, createDroneDefault, 10);
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
  event: { id: string; text: string; sub: string; color: string; duration: number; type: 'warning' | 'upgrade'; soundKey?: string | null }
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
  // Play sound — prioritize custom soundKey from admin panel
  if (event.soundKey && playCustomAudio(event.soundKey)) {
    // Custom sound played successfully
  } else if (event.type === 'warning') {
    // Play threat-specific warning sound based on event id
    const id = event.id;
    if (id.includes('shrapnel')) sfxWarningShrapnel();
    else if (id.includes('missile')) sfxWarningMissile();
    else if (id.includes('cluster')) sfxWarningCluster();
    else if (id.includes('drone') || id.includes('tracker') || id.includes('chemical') || id.includes('incendiary')) sfxWarningDrone();
    else if (id.includes('boss') || id.includes('minibos')) sfxWarningBoss();
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

  // Mini-Boss (check BEFORE main boss since 'minibos' contains 'bos')
  if (id.includes('minibos')) {
    if (!g.boss) {
      spawnBoss(g, false, true);
    }
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
    const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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
    addTrauma(0.2); // light shake when shield absorbs
    return;
  }
  p.health = Math.max(0, p.health - dmg);
  p.hitTimer = 0.3;
  p.anim = 'hit';
  g.damageFlash = 0.35;
  g.hitStopTimer = Math.max(g.hitStopTimer, 0.06);
  // Trauma scaled by damage taken — bigger hits = bigger shake
  addTrauma(Math.min(0.75, 0.3 + dmg / 40));
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
    addTrauma(1.0); // critical shake on death
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
// ─── Upgrade tuning ────────────────────────────────────────────────────────
// Values are intentionally conservative so stacking upgrades over a long
// run stays within a "thoughtful, balanced" power curve. Guideline:
//   * health/ammo: small steady increments, not doubled
//   * speed: capped at +30% total (not +60%) so the player still has to dodge
//   * cooldowns: shaved by 0.15 per card, floor at 0.45s (not 0.3)
//   * bullet damage: +1 per card, capped at 3 (not 4)
const ALL_UPGRADES: Omit<UpgradeCard, 'applied'>[] = [
  { id: 'ammo_cap', name: 'Ammo Capacity+', nameAr: 'سعة ذخيرة+', description: 'Max ammo +5', icon: '🔫', color: '#a855f7' },
  { id: 'max_health', name: 'Reinforced', nameAr: 'صحة محسّنة', description: 'Max HP +15', icon: '❤', color: '#22c55e' },
  { id: 'speed_up', name: 'Speed Boost', nameAr: 'سرعة حركة+', description: 'Move speed +10%', icon: '🏃', color: '#06b6d4' },
  { id: 'slowmo_ext', name: 'Time Warp', nameAr: 'تباطؤ مطوّل', description: 'Slow-Mo +1s', icon: '⏳', color: '#8b5cf6' },
  { id: 'dash_fast', name: 'Quick Roll', nameAr: 'دحرجة سريعة', description: 'Dash CD -0.15s', icon: '💨', color: '#f59e0b' },
  { id: 'shield_ext', name: 'Fortified', nameAr: 'درع ممتد', description: 'Shield +2s', icon: '🛡', color: '#3b82f6' },
  { id: 'pickup_range', name: 'Magnetism', nameAr: 'جذب مغناطيسي', description: 'Pickup range +25%', icon: '🧲', color: '#94a3b8' },
  { id: 'bullet_dmg', name: 'Heavy Rounds', nameAr: 'ضربة قوية', description: 'Bullet damage +1', icon: '💥', color: '#ef4444' },
];

// Hard caps — upgrades stop appearing in the card pool once they max out.
const UPGRADE_CAPS = {
  ammoCap:      50,   // 30 → 35 → 40 → 45 → 50 (4 picks)
  maxHealth:    160,  // 100 → 115 → 130 → 145 → 160 (4 picks)
  speedMul:     1.30, // 1.00 → 1.10 → 1.20 → 1.30 (3 picks)
  slowMoDur:    9,    // 5 → 6 → 7 → 8 → 9 (4 picks)
  dashCDMin:    0.45, // 0.80 → 0.65 → 0.50 → 0.45 (3 picks, clamped)
  shieldDur:    14,   // 8 → 10 → 12 → 14 (3 picks)
  pickupRange:  10,   // 5 → 6.25 → 7.5 → 8.75 → 10 (4 picks)
  bulletDmg:    3,    // 1 → 2 → 3 (2 picks)
};

function generateUpgradeCards(g: GameData): UpgradeCard[] {
  // Shuffle and pick 3
  const pool = ALL_UPGRADES.filter(u => {
    // Don't offer already-maxed upgrades
    if (u.id === 'ammo_cap' && g.player.maxAmmo >= UPGRADE_CAPS.ammoCap) return false;
    if (u.id === 'max_health' && g.player.maxHealth >= UPGRADE_CAPS.maxHealth) return false;
    if (u.id === 'speed_up' && g.player.speedMultiplier >= UPGRADE_CAPS.speedMul) return false;
    if (u.id === 'slowmo_ext' && g.player.slowMoDuration >= UPGRADE_CAPS.slowMoDur) return false;
    if (u.id === 'dash_fast' && g.player.dashCooldownBase <= UPGRADE_CAPS.dashCDMin) return false;
    if (u.id === 'shield_ext' && g.player.shieldDuration >= UPGRADE_CAPS.shieldDur) return false;
    if (u.id === 'pickup_range' && g.player.pickupRange >= UPGRADE_CAPS.pickupRange) return false;
    if (u.id === 'bullet_dmg' && g.player.bulletDamage >= UPGRADE_CAPS.bulletDmg) return false;
    return true;
  });
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(u => ({ ...u, applied: false }));
}

export function applyUpgrade(g: GameData, cardId: string) {
  const p = g.player;
  switch (cardId) {
    case 'ammo_cap':
      p.maxAmmo = Math.min(UPGRADE_CAPS.ammoCap, p.maxAmmo + 5);
      break;
    case 'max_health': {
      // Small bump + small heal (half of the bump) — not a full restore
      const inc = 15;
      p.maxHealth = Math.min(UPGRADE_CAPS.maxHealth, p.maxHealth + inc);
      p.health = Math.min(p.maxHealth, p.health + Math.round(inc * 0.5));
      break;
    }
    case 'speed_up':
      p.speedMultiplier = Math.min(UPGRADE_CAPS.speedMul, p.speedMultiplier + 0.1);
      break;
    case 'slowmo_ext':
      p.slowMoDuration = Math.min(UPGRADE_CAPS.slowMoDur, p.slowMoDuration + 1);
      break;
    case 'dash_fast':
      p.dashCooldownBase = Math.max(UPGRADE_CAPS.dashCDMin, p.dashCooldownBase - 0.15);
      break;
    case 'shield_ext':
      p.shieldDuration = Math.min(UPGRADE_CAPS.shieldDur, p.shieldDuration + 2);
      break;
    case 'pickup_range':
      p.pickupRange = Math.min(UPGRADE_CAPS.pickupRange, p.pickupRange + 1.25);
      break;
    case 'bullet_dmg':
      p.bulletDamage = Math.min(UPGRADE_CAPS.bulletDmg, p.bulletDamage + 1);
      break;
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
  sfxBikeEngine();
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
      sfxBikeBrake();
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
      const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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
    sfxBikeIdle();
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
      sfxBikeDepart();
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

  // ── Spring-based suspension + body lean (realistic weight transfer) ──
  updateBikePhysics(bike, dt);
}

/**
 * Integrates a critically-damped spring for the bike's suspension and
 * derives a visual lean angle from the rate of speed change.
 * This lives in engine (not renderer) because it is gameplay state that
 * other systems — and the renderer — read.
 */
function updateBikePhysics(bike: DeliveryBike, dt: number) {
  // Initialise transient fields on first use
  if (bike.suspCompress === undefined) bike.suspCompress = 0;
  if (bike.suspVelocity === undefined) bike.suspVelocity = 0;
  if (bike.leanAngle === undefined) bike.leanAngle = 0;
  if (bike.prevSpeed === undefined) bike.prevSpeed = bike.speed;
  if (bike.rpmPhase === undefined) bike.rpmPhase = 0;

  // Instantaneous acceleration from speed delta
  const dv = bike.speed - bike.prevSpeed;
  const accelX = dv / Math.max(dt, 1e-4);
  bike.prevSpeed = bike.speed;

  // Target suspension compression: nose-dive on braking, squat on acceleration
  // Positive accelX (toward positive X) pushes weight rearward → front lifts.
  // Braking (accelX opposite to speed) pushes weight forward → front dips.
  const isBraking = bike.phase === 'slowing' || (bike.phase === 'idle' && Math.abs(bike.speed) < 50);
  const targetCompress = isBraking
    ? -2.4 // nose dives
    : bike.phase === 'leaving'
      ? 0.6 // rear squats slightly on launch
      : 0;

  // Critically damped spring: F = -k*x - c*v
  const stiffness = 90;
  const damping = 14;
  const displacement = bike.suspCompress - targetCompress;
  const springForce = -stiffness * displacement - damping * bike.suspVelocity;
  bike.suspVelocity += springForce * dt;
  bike.suspCompress += bike.suspVelocity * dt;

  // Body lean: derive from horizontal acceleration relative to speed direction
  // Clamp so it's purely visual and never feels floaty.
  const signedAccel = accelX * (bike.facingRight ? 1 : -1);
  const targetLean = Math.max(-0.08, Math.min(0.06, -signedAccel * 0.00018));
  // Smooth toward target so lean animates naturally
  bike.leanAngle += (targetLean - bike.leanAngle) * Math.min(1, dt * 8);

  // Engine RPM phase advances faster as the bike moves harder
  const rpmRate = 18 + Math.min(28, Math.abs(bike.speed) * 0.15);
  bike.rpmPhase += rpmRate * dt;
}

const SCENE_ZOOM_IN_DUR = 1.0;
const SCENE_BLACKOUT_DUR = 0.4;
const SCENE_ZOOM_OUT_DUR = 1.2;

export function updateSceneTransition(g: GameData, dt: number) {
  const st = g.sceneTransition;
  if (!st || !st.active) return;

  st.timer += dt;

  switch (st.phase) {
    case 'zoomIn':
      g.cameraZoomTarget = 1.0 + (1.2 * Math.min(1, st.timer / SCENE_ZOOM_IN_DUR));
      g.cameraFocusX = g.player.pos.x;
      g.cameraFocusY = g.player.pos.y;
      if (st.timer >= SCENE_ZOOM_IN_DUR) {
        st.phase = 'blackout';
        st.timer = 0;
      }
      break;
    case 'blackout':
      if (st.timer >= SCENE_BLACKOUT_DUR) {
        st.phase = 'swap';
        st.timer = 0;
      }
      break;
    case 'swap':
      g.currentSceneIndex = st.nextSceneIndex;
      if (onSceneSwap) onSceneSwap(g.currentSceneIndex);
      st.phase = 'zoomOut';
      st.timer = 0;
      break;
    case 'zoomOut':
      g.cameraZoomTarget = 2.2 - (1.2 * Math.min(1, st.timer / SCENE_ZOOM_OUT_DUR));
      if (st.timer >= SCENE_ZOOM_OUT_DUR) {
        g.cameraZoomTarget = 1.0;
        g.sceneTransition = null;
      }
      break;
  }
}

export function getSceneBlackout(g: GameData): number {
  const st = g.sceneTransition;
  if (!st || !st.active) return 0;
  switch (st.phase) {
    case 'zoomIn': return Math.min(1, st.timer / SCENE_ZOOM_IN_DUR);
    case 'blackout': return 1;
    case 'swap': return 1;
    case 'zoomOut': return 1 - Math.min(1, st.timer / SCENE_ZOOM_OUT_DUR);
    default: return 0;
  }
}

// ========== MID-WAVE DYNAMIC EVENTS ==========

/** Returns true if a specific event type is currently active. */
function isWaveEventActive(g: GameData, type: import('./types').WaveEventType): boolean {
  for (let i = 0; i < g.waveEvents.length; i++) {
    if (!g.waveEventsFired[i]) continue;
    const e = g.waveEvents[i];
    if (e.type !== type) continue;
    if (g.waveElapsed < e.triggerAt + e.duration) return true;
  }
  return false;
}

/** Spawns a coordinated scout swarm (formation) of count drones. */
function spawnSwarm(g: GameData, count: number) {
  for (let i = 0; i < count; i++) {
    spawnDrone(g, 'scout');
  }
  addTrauma(0.35);
  g.cinematicWarning = { text: '⚠ سرب طائرات!', subText: '', color: '#ef4444', timer: 1.0, duration: 1.0, type: 'warning' };
}

/** Drops 5 mines across the ground at evenly-spaced positions. */
/** Schedules a mine-planter soldier to arrive. Creates the entity with a plant
 *  plan (3 spots spread across the ground). */
function spawnMinePlanter(g: GameData) {
  const fromRight = Math.random() < 0.5;
  const groundY = g.height * GROUND_RATIO;
  const margin = 80;
  // Three plant spots spread across the play area
  const usable = g.width - margin * 2;
  const spots: number[] = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    spots.push(margin + t * usable + (Math.random() - 0.5) * 50);
  }
  // Sort spots by walk direction so the soldier moves monotonically
  if (fromRight) spots.sort((a, b) => b - a); else spots.sort((a, b) => a - b);

  g.minePlanter = {
    active: true,
    pos: { x: fromRight ? g.width + 30 : -30, y: groundY },
    facingRight: !fromRight,
    phase: 'entering',
    phaseTimer: 0,
    plantSpots: spots,
    currentSpot: 0,
    minesPlanted: 0,
    walkAnim: 0,
  };
  g.cinematicWarning = { text: '⚠ عسكري يزرع ألغام!', subText: '', color: '#f59e0b', timer: 1.2, duration: 1.2, type: 'warning' };
  sfxWarningAlert();
}

/** Plants a single mine at a specific ground X. */
function plantMineAt(g: GameData, x: number) {
  const groundY = g.height * GROUND_RATIO;
  const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
  const cx = Math.max(30, Math.min(g.width - 30, x));
  h.type = 'mine';
  h.pos = { x: cx, y: groundY };
  h.targetPos = { x: cx, y: groundY };
  h.speed = 0;
  h.size = 10;
  h.damage = 25;
  h.warningDuration = 0;
  h.warningTimer = 0;
  h.falling = true;
  h.mineState = 'arming';
  h.mineTimer = 1.0;
  h.mineLife = 60.0;  // long life — stays until end of wave
  h.mineDefuseProgress = 0;
  h.rotation = 0;
  h.trailTimer = 0;
  h.isFireBomb = false;
  h.isGasBomb = false;
  h.isClusterBomb = false;
  h.splitDone = false;
  g.activeHazardCount++;
  spawnParticles(g, { x: cx, y: groundY }, 4, '#6b6b6b', 30, false);
}

/** Drives the mine-planter soldier through its state machine. */
function updateMinePlanter(g: GameData, dt: number) {
  const m = g.minePlanter;
  if (!m || !m.active) return;
  const walkSpeed = 70;
  const dir = m.facingRight ? 1 : -1;
  m.walkAnim += Math.abs(walkSpeed) * dt * 0.05;
  m.phaseTimer += dt;

  if (m.phase === 'entering' || m.phase === 'walkingToSpot') {
    // Walk toward current plant spot
    const target = m.plantSpots[m.currentSpot];
    if (target === undefined) {
      m.phase = 'leaving';
      m.phaseTimer = 0;
      return;
    }
    const dx = target - m.pos.x;
    if (Math.abs(dx) < 4) {
      m.phase = 'planting';
      m.phaseTimer = 0;
    } else {
      m.pos.x += Math.sign(dx) * walkSpeed * dt;
    }
  } else if (m.phase === 'planting') {
    // 1 second crouch-and-plant animation
    if (m.phaseTimer >= 1.0) {
      plantMineAt(g, m.pos.x);
      m.minesPlanted++;
      m.currentSpot++;
      if (m.currentSpot >= m.plantSpots.length) {
        m.phase = 'leaving';
      } else {
        m.phase = 'walkingToSpot';
      }
      m.phaseTimer = 0;
    }
  } else if (m.phase === 'leaving') {
    // Walk off screen
    m.pos.x += dir * walkSpeed * dt;
    if (m.pos.x < -60 || m.pos.x > g.width + 60) {
      m.active = false;
      g.minePlanter = null;
    }
  }
}

/** Starts a missile volley: 5 missiles from the same X, 0.4s apart. */
function startVolley(g: GameData) {
  const x = 60 + Math.random() * (g.width - 120);
  g.volleyQueue = { remaining: 5, nextTimer: 0, x };
  g.cinematicWarning = { text: '⚠ وابل صواريخ!', subText: '', color: '#dc2626', timer: 0.8, duration: 0.8, type: 'warning' };
}

/** Drives the scheduled wave events forward, firing them when the elapsed time matches. */
function updateWaveEvents(g: GameData, dt: number) {
  // Only active during the playable wave phase
  if (g.wavePhase !== 'active') return;

  for (let i = 0; i < g.waveEvents.length; i++) {
    if (g.waveEventsFired[i]) continue;
    const e = g.waveEvents[i];
    if (g.waveElapsed < e.triggerAt) continue;
    g.waveEventsFired[i] = true;
    if (e.type === 'swarm') {
      spawnSwarm(g, 4 + Math.floor(Math.random() * 3));
    } else if (e.type === 'volley') {
      startVolley(g);
    } else if (e.type === 'minefield') {
      // Dispatch a mine-planting soldier (no more instant 5-mine drops)
      if (!g.minePlanter) spawnMinePlanter(g);
    } else if (e.type === 'surge') {
      g.surgeFlashTimer = 1.0;
    }
    // 'calm' just becomes active; isWaveEventActive handles it
  }

  // Drive volley queue
  if (g.volleyQueue) {
    g.volleyQueue.nextTimer -= dt;
    if (g.volleyQueue.nextTimer <= 0) {
      const q = g.volleyQueue;
      const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
      const groundY = g.height * GROUND_RATIO;
      h.type = 'missile';
      h.targetPos = { x: q.x + (Math.random() - 0.5) * 20, y: groundY };
      h.pos = { x: q.x + (Math.random() - 0.5) * 40, y: -40 };
      h.speed = Math.min(220 + g.difficulty * 15 + Math.random() * 60, MAX_MISSILE_SPEED);
      h.size = 12;
      h.damage = 22;
      h.warningDuration = 0.9;
      h.warningTimer = 0.9;
      h.falling = false;
      h.splitDone = false;
      h.isFireBomb = false;
      h.isGasBomb = false;
      h.isClusterBomb = false;
      h.mineState = undefined;
      h.rotation = 0;
      h.trailTimer = 0;
      g.activeHazardCount++;
      q.remaining--;
      q.nextTimer = 0.4;
      if (q.remaining <= 0) g.volleyQueue = null;
    }
  }

  if (g.surgeFlashTimer > 0) g.surgeFlashTimer = Math.max(0, g.surgeFlashTimer - dt);
}

function startNextWave(g: GameData) {
  g.waveNumber++;
  g.levelNumber = Math.floor((g.waveNumber - 1) / 3) + 1;
  g.waveElapsed = 0;
  g.waveFinale = false;
  g.wavePhase = 'active';

  // Trigger scene change at wave boundaries
  if (g.scenes.length > 1 && g.waveNumber > 1) {
    const interval = g.sceneChangeWaveInterval || 6;
    if (g.waveNumber % interval === 0) {
      g.sceneTransition = {
        active: true,
        phase: 'zoomIn',
        timer: 0,
        nextSceneIndex: (g.currentSceneIndex + 1) % g.scenes.length,
      };
    }
  }

  // Apply recipe settings for this wave
  const recipe = getWaveRecipe(g.waveNumber, g);
  g.waveTimer = recipe.duration || 60;
  g.bulletLevel = Math.max(g.bulletLevel, recipe.bulletLevel);

  // Load mid-wave events for this wave
  g.waveEvents = (recipe.events ?? []).map(e => ({ type: e.type, triggerAt: e.triggerAt, duration: e.duration }));
  g.waveEventsFired = g.waveEvents.map(() => false);
  g.volleyQueue = null;
  g.surgeFlashTimer = 0;

  // Reset threat timers based on recipe so admin settings apply per-wave
  if (recipe.droneInterval > 0) g.droneTimer = Math.min(g.droneTimer, recipe.droneInterval * 0.3);
  if (recipe.hasIncendiary) g.incendiaryTimer = Math.min(g.incendiaryTimer, 8 + Math.random() * 8);
  if (recipe.hasChemical) g.chemicalTimer = Math.min(g.chemicalTimer, 10 + Math.random() * 8);

  // Queue wave warnings — recipe custom warnings take priority over hardcoded
  if (recipe.warningText) {
    const customId = `custom_w${g.waveNumber}`;
    if (!g.waveTriggered.has(customId)) {
      const delay = recipe.phaseInDelay || 0;
      if (delay <= 0) {
        queueWaveEvent(g, { id: customId, text: recipe.warningText, sub: '', color: recipe.warningColor || '#ef4444', type: (recipe.warningType as 'warning' | 'upgrade') || 'warning', duration: 2.0, soundKey: recipe.warningSoundKey });
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

  // ── Gas mask + fire suit offers: at most one card on screen at a time ──
  // If both threats are present in the wave, the gas mask offer is shown
  // first and the fire suit offer waits in a pending state until the
  // previous card closes (purchased, refused or timed out).
  const needsGas = !!recipe.hasChemical && g.player.gasMaskTimer <= 0;
  const needsFire = !!recipe.hasIncendiary && g.player.fireSuitTimer <= 0;

  if (needsGas) {
    g.gasMaskOfferDelay = 2.5;
    g.gasMaskDropScheduled = true;
    g.gasMaskDropTime = g.elapsed + g.waveTimer * (0.25 + Math.random() * 0.35);
  } else {
    g.gasMaskDropScheduled = false;
  }

  if (needsFire) {
    // Mark the fire suit as "pending" so updateWaveSystem can start its
    // delay once the gas mask card is resolved.
    g.fireSuitOfferPending = needsGas;
    g.fireSuitOfferDelay = needsGas ? 0 : 2.5;
    g.fireSuitDropScheduled = true;
    g.fireSuitDropTime = g.elapsed + g.waveTimer * (0.25 + Math.random() * 0.35);
  } else {
    g.fireSuitOfferPending = false;
    g.fireSuitDropScheduled = false;
  }

  // ── Minesweeper offer — triggered if this wave has a minefield event ──
  const hasMinefield = !!recipe.events?.some(e => e.type === 'minefield');
  const needsSweeper = hasMinefield && g.player.minesweeperTimer <= 0;
  if (needsSweeper) {
    // Show offer a few seconds before the planter arrives. Offer starts after
    // any gas/fire offers have had time to resolve.
    const extraDelay = (needsGas || needsFire) ? 4.0 : 2.5;
    g.minesweeperOfferDelay = extraDelay;
    g.minePlanterScheduled = true;
    // Find the first minefield event time and plan to arrive ~6s later so the
    // offer has time to appear before mines are actually planted.
    const ev = recipe.events?.find(e => e.type === 'minefield');
    g.minePlanterArrivalTime = g.waveElapsed + (ev?.triggerAt ?? 15);
  } else {
    g.minePlanterScheduled = false;
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
      // Handle purchase via cardClick. Click detection must mirror the
      // renderer exactly — same responsive size AND same slide-in offset —
      // otherwise taps during the animation land outside the hit zone.
      if (input.cardClick && g.gasMaskOffer) {
        const { x, y } = input.cardClick;
        const offerDuration = 8;
        const slideIn = Math.min(1, (offerDuration - g.gasMaskOffer.timer) * 4);
        const slideY = (1 - slideIn) * 80;
        const cardW = Math.min(200, g.width - 40);
        const cardH = Math.min(270, g.height * 0.55);
        const cardX = (g.width - cardW) / 2;
        const cardY = g.height * 0.5 - cardH / 2 + slideY;
        // Refuse pill sits right under the card
        const refuseW = Math.min(150, cardW);
        const refuseH = 34;
        const refuseX = (g.width - refuseW) / 2;
        const refuseY = cardY + cardH + 12;

        // 1) Refuse pill first (it's outside the card)
        if (x >= refuseX && x <= refuseX + refuseW && y >= refuseY && y <= refuseY + refuseH) {
          input.cardClick = null;
          g.gasMaskOffer = null;
          g.slowMoFactor = 1;
          sfxSlideTransition();
        }
        // 2) Otherwise: any click on the card itself = buy
        else if (x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH) {
          input.cardClick = null;
          if (g.score >= g.gasMaskOffer.cost) {
            const cost = g.gasMaskOffer.cost;
            g.scoreCountdown = { remaining: cost, tickTimer: 0, totalCost: cost };
            g.gasMaskOwned = true;
            g.player.gasMaskTimer = Math.max(15, g.waveTimer + 5);
            // Trigger the donning animation
            g.player.gasMaskDonTimer = 0.6;
            g.gasMaskDropScheduled = false;
            g.gasMaskOffer = null;
            g.slowMoFactor = 0.5;
            sfxUpgradeSelect();
            addFloatingText(g, 'كمامة! 🛡️', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#16a34a');
            spawnParticles(g, g.player.pos, 10, '#16a34a', 90);
          } else {
            addFloatingText(g, 'نقاط غير كافية!', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#ef4444');
          }
        }
      }
    }

    // ── Fire suit offer delay + purchase logic (mirror of gas mask) ──
    // If the offer was pending waiting for the gas mask card to close, kick
    // off its real delay countdown now that the gas mask card is resolved.
    if (g.fireSuitOfferPending && !g.gasMaskOffer && g.gasMaskOfferDelay <= 0) {
      g.fireSuitOfferPending = false;
      g.fireSuitOfferDelay = 1.2; // short gap so cards don't overlap visually
    }
    if (g.fireSuitOfferDelay > 0) {
      g.fireSuitOfferDelay -= dt;
      if (g.fireSuitOfferDelay <= 0) {
        g.fireSuitOfferDelay = 0;
        const cost = Math.max(10, Math.ceil(g.score * 0.1));
        g.fireSuitOffer = { active: true, timer: 8, cost };
        g.slowMoFactor = 0.1;
        sfxUpgradeAlert();
      }
    }

    if (g.fireSuitOffer && g.fireSuitOffer.active) {
      g.fireSuitOffer.timer -= dt;
      if (g.fireSuitOffer.timer <= 0) {
        g.fireSuitOffer = null;
        g.slowMoFactor = 1;
      }
      if (input.cardClick && g.fireSuitOffer) {
        const { x, y } = input.cardClick;
        const offerDuration = 8;
        const slideIn = Math.min(1, (offerDuration - g.fireSuitOffer.timer) * 4);
        const slideY = (1 - slideIn) * 80;
        const cardW = Math.min(200, g.width - 40);
        const cardH = Math.min(270, g.height * 0.55);
        const cardX = (g.width - cardW) / 2;
        const cardY = g.height * 0.5 - cardH / 2 + slideY;
        const refuseW = Math.min(150, cardW);
        const refuseH = 34;
        const refuseX = (g.width - refuseW) / 2;
        const refuseY = cardY + cardH + 12;

        // 1) Refuse pill
        if (x >= refuseX && x <= refuseX + refuseW && y >= refuseY && y <= refuseY + refuseH) {
          input.cardClick = null;
          g.fireSuitOffer = null;
          g.slowMoFactor = 1;
          sfxSlideTransition();
        }
        // 2) Whole card = buy
        else if (x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH) {
          input.cardClick = null;
          if (g.score >= g.fireSuitOffer.cost) {
            const cost = g.fireSuitOffer.cost;
            g.scoreCountdown = { remaining: cost, tickTimer: 0, totalCost: cost };
            g.fireSuitOwned = true;
            g.player.fireSuitTimer = Math.max(15, g.waveTimer + 5);
            g.player.fireSuitDonTimer = 0.6;
            g.fireSuitDropScheduled = false;
            g.fireSuitOffer = null;
            g.slowMoFactor = 0.5;
            sfxUpgradeSelect();
            addFloatingText(g, 'بدلة نار! 🔥', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#f97316');
            spawnParticles(g, g.player.pos, 10, '#f97316', 90);
          } else {
            addFloatingText(g, 'نقاط غير كافية!', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#ef4444');
          }
        }
      }
    }

    // ── Minesweeper offer (dynamic 1% price, fires before the planter arrives) ──
    if (g.minesweeperOfferDelay > 0) {
      // Don't start countdown while another offer card is open
      if (!g.gasMaskOffer && !g.fireSuitOffer) {
        g.minesweeperOfferDelay -= dt;
        if (g.minesweeperOfferDelay <= 0) {
          g.minesweeperOfferDelay = 0;
          // 1% of current score, min 10
          const cost = Math.max(10, Math.ceil(g.score * 0.01));
          g.minesweeperOffer = { active: true, timer: 8, cost };
          g.slowMoFactor = 0.1;
          sfxUpgradeAlert();
        }
      }
    }

    if (g.minesweeperOffer && g.minesweeperOffer.active) {
      g.minesweeperOffer.timer -= dt;
      if (g.minesweeperOffer.timer <= 0) {
        g.minesweeperOffer = null;
        g.slowMoFactor = 1;
      }
      if (input.cardClick && g.minesweeperOffer) {
        const { x, y } = input.cardClick;
        const offerDuration = 8;
        const slideIn = Math.min(1, (offerDuration - g.minesweeperOffer.timer) * 4);
        const slideY = (1 - slideIn) * 80;
        const cardW = Math.min(200, g.width - 40);
        const cardH = Math.min(270, g.height * 0.55);
        const cardX = (g.width - cardW) / 2;
        const cardY = g.height * 0.5 - cardH / 2 + slideY;
        const refuseW = Math.min(150, cardW);
        const refuseH = 34;
        const refuseX = (g.width - refuseW) / 2;
        const refuseY = cardY + cardH + 12;

        if (x >= refuseX && x <= refuseX + refuseW && y >= refuseY && y <= refuseY + refuseH) {
          input.cardClick = null;
          g.minesweeperOffer = null;
          g.slowMoFactor = 1;
          sfxSlideTransition();
        } else if (x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH) {
          input.cardClick = null;
          if (g.score >= g.minesweeperOffer.cost) {
            const cost = g.minesweeperOffer.cost;
            g.scoreCountdown = { remaining: cost, tickTimer: 0, totalCost: cost };
            g.minesweeperOwned = true;
            g.player.minesweeperTimer = Math.max(20, g.waveTimer + 10);
            g.player.minesweeperDonTimer = 0.6;
            g.minesweeperOffer = null;
            g.slowMoFactor = 0.5;
            sfxUpgradeSelect();
            addFloatingText(g, 'كاشف ألغام! 🔍', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#fbbf24');
            spawnParticles(g, g.player.pos, 10, '#fbbf24', 90);
          } else {
            addFloatingText(g, 'نقاط غير كافية!', { x: g.player.pos.x, y: g.player.pos.y - 40 }, '#ef4444');
          }
        }
      }
    }

    // ── Pity parachute drops: if the offer was refused, the player still
    //    gets one chance to grab the item at a random moment during the wave. ──
    if (g.gasMaskDropScheduled && g.elapsed >= g.gasMaskDropTime && !g.gasMaskOffer) {
      g.gasMaskDropScheduled = false;
      const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
      pu.type = 'gasmask';
      pu.pos = { x: 60 + Math.random() * (g.width - 120), y: -20 };
      pu.size = 14;
      pu.parachuting = true;
      pu.fallSpeed = 30 + Math.random() * 10;
      pu.bobTimer = 0;
      pu.groundTimer = 0;
    }
    if (g.fireSuitDropScheduled && g.elapsed >= g.fireSuitDropTime && !g.fireSuitOffer) {
      g.fireSuitDropScheduled = false;
      const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
      pu.type = 'firesuit';
      pu.pos = { x: 60 + Math.random() * (g.width - 120), y: -20 };
      pu.size = 14;
      pu.parachuting = true;
      pu.fallSpeed = 30 + Math.random() * 10;
      pu.bobTimer = 0;
      pu.groundTimer = 0;
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

    // Handle card selection via input — must mirror the renderer's responsive
    // sizing so hit tests line up with what the player actually sees.
    if (input.cardClick && g.upgradeCards.length > 0) {
      const { x, y } = input.cardClick;
      input.cardClick = null;
      const cardCount = g.upgradeCards.length;
      const gap = Math.max(8, Math.min(14, g.width * 0.02));
      const horizMargin = Math.max(16, g.width * 0.05);
      const maxTotalW = g.width - horizMargin * 2;
      const idealCardW = 130;
      const totalIdeal = cardCount * idealCardW + (cardCount - 1) * gap;
      const scale = totalIdeal > maxTotalW ? maxTotalW / totalIdeal : 1;
      const cardW = Math.floor(idealCardW * scale);
      const cardH = Math.floor(185 * scale);
      const totalW = cardCount * cardW + (cardCount - 1) * gap;
      const startX = (g.width - totalW) / 2;
      const cardY = g.height * 0.30;
      for (let i = 0; i < cardCount; i++) {
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


/**
 * Classic boids separation force: pushes a drone away from any other active
 * drone that is closer than `minDist`. Writes directly into d.vel.
 * Used by incendiary/chemical/etc. tiers so they no longer clump around the player.
 */
function applyDroneSeparation(d: Drone, drones: Drone[], dt: number, minDist: number) {
  const minSep = minDist;
  for (const other of drones) {
    if (!other.active || other === d) continue;
    const sx = d.pos.x - other.pos.x;
    const sy = d.pos.y - other.pos.y;
    const sd = Math.sqrt(sx * sx + sy * sy);
    const totalMin = minSep + d.size + other.size;
    if (sd < totalMin && sd > 0) {
      const force = (totalMin - sd) * 4.5;
      d.vel.x += (sx / sd) * force * dt;
      d.vel.y += (sy / sd) * force * dt;
    }
  }
}

/**
 * Returns true when a modal card is currently on screen: upgrade cards,
 * the gas-mask purchase offer or the fire-suit purchase offer. The game
 * loop skips the full physics update while any of these is visible —
 * only the card timer and the input are advanced — so hazards do not
 * slide forward into the player while they are reading a card.
 */
export function hasModalCard(g: GameData): boolean {
  return (
    g.wavePhase === 'cards' ||
    !!(g.gasMaskOffer && g.gasMaskOffer.active) ||
    !!(g.fireSuitOffer && g.fireSuitOffer.active) ||
    !!(g.minesweeperOffer && g.minesweeperOffer.active)
  );
}

/**
 * Minimal per-frame update used while a modal card is visible.
 * Advances ONLY:
 *  - Card selection timers (cardsShownTimer, offer.timer, offer.delay)
 *  - Purchase input handling
 *  - A small amount of ambient animation state (elapsed, windOffset)
 *    so the HUD clocks keep ticking but no entity physics advances.
 */
export function updateCardsOnly(g: GameData, input: InputState, dt: number) {
  if (g.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  g.elapsed += dt;
  g.windOffset = Math.sin(g.elapsed * 0.3) * 0.5;
  g.slowMoFactor = 0; // hard freeze — renderer still shows the frozen scene

  // Drive the wave system so card timers and purchase input are processed.
  // updateWaveSystem early-returns from most branches when wavePhase is not
  // 'active', so this is safe and scope-limited.
  updateWaveSystem(g, input, dt);

  // Keep score countdown animation ticking for the purchase visual.
  if (g.scoreCountdown) {
    g.scoreCountdown.tickTimer -= dt;
    if (g.scoreCountdown.tickTimer <= 0) {
      const chunk = Math.max(1, Math.ceil(g.scoreCountdown.remaining / 10));
      const deduct = Math.min(chunk, g.scoreCountdown.remaining);
      g.score -= deduct;
      g.scoreCountdown.remaining -= deduct;
      g.scoreCountdown.tickTimer = 0.04;
      sfxScoreTick();
      if (g.scoreCountdown.remaining <= 0) {
        g.scoreCountdown = null;
      }
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
      sfxGameOverVoice();
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

  // === Scene Transition ===
  updateSceneTransition(g, dt);

  // === Mid-wave Events ===
  updateWaveEvents(g, dt);

  // === Mine Planter Soldier ===
  updateMinePlanter(g, dt);

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
  // NOTE: when a protection-item purchase card is on screen (gas mask or
  // fire suit), the player is vulnerable to hazards while reading the
  // offer. Force extreme slow-mo so nothing hits them mid-purchase.
  const offerOpen =
    (!!g.gasMaskOffer && g.gasMaskOffer.active) ||
    (!!g.fireSuitOffer && g.fireSuitOffer.active);
  if (offerOpen) {
    g.slowMoFactor = 0.05; // near-freeze during purchase window
  } else if (!g.cinematicWarning && g.waveEndSlowMo <= 0 && g.slowMoTimer > 0) {
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
    // Dash defuses ground mines on contact
    for (const h of g.hazards) {
      if (!h.active || h.type !== 'mine') continue;
      if (Math.abs(p.pos.x - h.pos.x) < 30 + p.size) {
        h.active = false;
        g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        addExplosion(g, h.pos, h.size * 1.5);
        spawnParticles(g, h.pos, 8, '#fbbf24', 120);
        addFloatingText(g, 'Defused! +50', h.pos, '#22c55e');
        g.score += 50;
      }
    }
    if (p.dashTimer <= 0) {
      p.isDashing = false;
      p.anim = 'idle';
    }
  } else if (p.anim !== 'hit') {
    // Apply acceleration with friction. speedMultiplier comes from upgrades.
    const accel = PLAYER_ACCEL * p.speedMultiplier;
    p.velocity.x += moveX * accel * dt;
    p.velocity.x -= p.velocity.x * PLAYER_FRICTION * dt;
    // Enforce terminal velocity cap (scaled by upgrades)
    const maxV = PLAYER_MAX_SPEED * p.speedMultiplier;
    if (p.velocity.x > maxV) p.velocity.x = maxV;
    else if (p.velocity.x < -maxV) p.velocity.x = -maxV;

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
        // Meteor: very rare (10% weight relative to shrapnel) since blast is huge
        if (t === 'meteor') {
          if (Math.random() < 0.1) types.push(t as HazardType);
          continue;
        }
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
        // Mid-wave event modifiers
        if (isWaveEventActive(g, 'surge')) interval *= 0.6;   // +67% faster spawn
        else if (isWaveEventActive(g, 'calm')) interval *= 2.0; // 50% slower spawn
        const bossMultiplier = g.boss && !g.boss.defeated ? 2.5 : 1;
        g.spawnTimer = interval * bossMultiplier;
      }
    }
  }

  // === Update hazards ===
  for (const h of g.hazards) {
    if (!h.active) continue;

    // === Mine state machine (ground-placed, no falling) ===
    if (h.type === 'mine') {
      const p = g.player;
      h.mineTimer = (h.mineTimer ?? 0) - dt * g.slowMoFactor;
      h.mineLife = (h.mineLife ?? 0) - dt * g.slowMoFactor;
      if (h.mineState === 'arming') {
        if (h.mineTimer <= 0) {
          h.mineState = 'armed';
          h.mineTimer = 0;
        }
      } else if (h.mineState === 'armed') {
        const dp = dist(h.pos, p.pos);
        const DEFUSE_RANGE = 45;
        const TRIGGER_RANGE = 60;
        const hasSweeper = p.minesweeperTimer > 0;
        if (hasSweeper && dp < DEFUSE_RANGE + p.size) {
          // Player is defusing — progress fills over 3 seconds
          h.mineDefuseProgress = (h.mineDefuseProgress ?? 0) + dt;
          if ((h.mineDefuseProgress ?? 0) >= 3.0) {
            // Safely defused
            h.active = false;
            g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
            spawnParticles(g, h.pos, 10, '#22c55e', 140);
            addFloatingText(g, 'Defused! +75', h.pos, '#22c55e');
            g.score += 75;
            sfxPickup();
          }
        } else {
          // Out of defuse range — reset progress
          if ((h.mineDefuseProgress ?? 0) > 0) h.mineDefuseProgress = 0;
          // Normal trigger check (only if player has no sweeper or is out of defuse range)
          if (!hasSweeper && dp < TRIGGER_RANGE + p.size) {
            h.mineState = 'triggered';
            h.mineTimer = 0.5;
          }
        }
        if ((h.mineLife ?? 0) <= 0) {
          h.active = false;
          g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
          continue;
        }
      } else if (h.mineState === 'triggered') {
        if (h.mineTimer <= 0) {
          // Detonate
          addExplosion(g, h.pos, h.size * 4);
          spawnParticles(g, h.pos, 14, '#fbbf24', 220);
          spawnParticles(g, h.pos, 10, '#ef4444', 160);
          sfxExplosion();
          addTrauma(0.45);
          g.craters.push({ pos: { ...h.pos }, size: h.size * 3, life: 6, maxLife: 6 });
          const dp = dist(h.pos, p.pos);
          if (dp < 80 + p.size) {
            const falloff = 1 - Math.min(1, dp / 80);
            damagePlayer(g, Math.floor(15 + falloff * 10), h.pos);
          }
          h.active = false;
          g.activeHazardCount = Math.max(0, g.activeHazardCount - 1);
        }
      }
      continue;
    }

    // Each shrapnel piece tumbles at its own variant-specific rate.
    // Missiles and clusters use the legacy constant.
    if (h.type === 'shrapnel') {
      h.rotation += dt * (h.spinSpeed ?? 8);
    } else {
      h.rotation += dt * 2;
    }

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
        const splitCount = Math.max(2, recipe.clusterSplits);

        for (let i = 0; i < splitCount; i++) {
          const spreadX = (i - (splitCount - 1) / 2) * 35 + (Math.random() - 0.5) * 20;
          const sh = getFromPool<Hazard>(g.hazards, createHazardDefault);
          sh.type = 'shrapnel';
          sh.isClusterBomb = true;
          sh.isFireBomb = false;
          sh.isGasBomb = false;
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
        if (h.isFireBomb) {
          sfxExplosion();
        } else if (h.isGasBomb) {
          sfxImpactLight();
        } else if (h.type === 'shrapnel') sfxImpactLight();
        else if (h.type === 'missile') sfxImpactHeavy();
        else sfxExplosion();

        // Firebombs spawn a fire pool + hot explosion instead of a crater
        if (h.isFireBomb) {
          addExplosion(g, h.targetPos, h.size * 2.2);
          spawnParticles(g, h.targetPos, 14, '#fbbf24', 180);
          spawnParticles(g, h.targetPos, 10, '#f97316', 140);
          g.firePools.push({
            pos: { x: h.targetPos.x, y: h.targetPos.y },
            size: 42 + Math.random() * 18,
            life: 4 + Math.random() * 2,
            maxLife: 6,
            damagePerSec: 3,
          });
          addTrauma(0.35);
          const distToPlayer = dist(h.targetPos, p.pos);
          if (distToPlayer < h.size * 1.6 + p.size && p.fireSuitTimer <= 0 && p.extinguisherTimer <= 0) {
            damagePlayer(g, h.damage, h.targetPos);
          }
          continue;
        }
        // Gas bombs spawn a gas cloud instead
        if (h.isGasBomb) {
          addExplosion(g, h.targetPos, h.size * 1.4);
          spawnParticles(g, h.targetPos, 12, '#16a34a', 120);
          g.gasClouds.push({
            pos: { x: h.targetPos.x, y: h.targetPos.y },
            size: 52 + Math.random() * 16,
            life: 5 + Math.random() * 3,
            maxLife: 8,
            damagePerSec: 2,
          });
          addTrauma(0.2);
          const distToPlayer = dist(h.targetPos, p.pos);
          if (distToPlayer < h.size * 1.4 + p.size && p.gasMaskTimer <= 0) {
            damagePlayer(g, h.damage, h.targetPos);
          }
          continue;
        }

        const isMeteor = h.type === 'meteor';
        addExplosion(g, h.targetPos, isMeteor ? h.size * 4 : (h.type === 'missile' ? h.size * 3 : h.size * 2));

        const colors = ['#ef4444', '#f97316', '#fbbf24', '#6b7280', '#4b5563'];
        for (const c of colors.slice(0, 3)) {
          spawnParticles(g, h.targetPos, isMeteor ? 12 : (h.type === 'missile' ? 6 : 3), c, isMeteor ? 340 : (h.type === 'missile' ? 250 : 150));
        }
        if (isMeteor) {
          spawnParticles(g, h.targetPos, 20, '#fbbf24', 260);
          sfxExplosion();
        }

        g.craters.push({ pos: { ...h.targetPos }, size: isMeteor ? h.size * 4 : h.size * 2.5, life: 8, maxLife: 8 });

        // Trauma-based screen shake — missiles feel heavier than shrapnel; meteors shake the world
        addTrauma(isMeteor ? 0.85 : (h.type === 'missile' ? 0.55 : 0.3));

        const distToPlayer = dist(h.targetPos, p.pos);
        // Meteor: large blast radius with falloff (direct 35, edge ~20)
        const meteorBlast = 120;
        if (isMeteor && distToPlayer < meteorBlast + p.size) {
          const falloff = 1 - Math.min(1, distToPlayer / meteorBlast);
          const dmg = Math.floor(20 + falloff * 15);
          damagePlayer(g, dmg, h.targetPos);
        } else if (distToPlayer < h.size * 1.5 + p.size) {
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
              addFloatingText(g, `مَزَطنا! +${bonus}`, { x: p.pos.x, y: p.pos.y - 40 }, '#fbbf24');
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
    // Calm event → power-ups drop more frequently (breather)
    const puBase = isWaveEventActive(g, 'calm') ? 4 : 8;
    const puVar = isWaveEventActive(g, 'calm') ? 3 : 5;
    g.powerUpTimer = puBase + Math.random() * puVar;
    if (!g.firstAmmoDropped && g.elapsed >= 10) {
      // Force first drop to be ammo
      g.firstAmmoDropped = true;
      const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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
          if (!g.firstAmmoPickedUp) {
            g.firstAmmoPickedUp = true;
          }
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
        case 'gasmask': {
          // Full-wave protection against gas — picked up via parachute.
          addFloatingText(g, 'كمامة! 🛡️', { x: p.pos.x, y: p.pos.y - 40 }, '#16a34a');
          spawnParticles(g, p.pos, 10, '#16a34a', 90);
          p.gasMaskTimer = Math.max(15, g.waveTimer + 5);
          p.gasMaskDonTimer = 0.6;
          g.gasMaskOwned = true;
          g.gasMaskOffer = null;
          g.gasMaskDropScheduled = false;
          break;
        }
        case 'firesuit': {
          addFloatingText(g, 'بدلة نار! 🔥', { x: p.pos.x, y: p.pos.y - 40 }, '#f97316');
          spawnParticles(g, p.pos, 10, '#f97316', 90);
          p.fireSuitTimer = Math.max(15, g.waveTimer + 5);
          p.fireSuitDonTimer = 0.6;
          g.fireSuitOwned = true;
          g.fireSuitOffer = null;
          g.fireSuitDropScheduled = false;
          break;
        }
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
  // Gas mask + fire suit are simple countdown timers. Duration is assigned
  // when purchased or picked up (enough to cover the full wave).
  if (p.gasMaskTimer > 0) {
    p.gasMaskTimer -= dt;
    if (p.gasMaskTimer <= 0) {
      p.gasMaskTimer = 0;
      g.gasMaskOwned = false;
      // Kick off the doffing animation so the mask lifts away visually
      p.gasMaskDoffTimer = 0.45;
    }
  }
  if (p.fireSuitTimer > 0) {
    p.fireSuitTimer -= dt;
    if (p.fireSuitTimer <= 0) {
      p.fireSuitTimer = 0;
      g.fireSuitOwned = false;
      p.fireSuitDoffTimer = 0.5;
    }
  }
  if (p.minesweeperTimer > 0) {
    p.minesweeperTimer -= dt;
    if (p.minesweeperTimer <= 0) {
      p.minesweeperTimer = 0;
      g.minesweeperOwned = false;
      p.minesweeperDoffTimer = 0.4;
    }
  }
  // Decay the don/doff animation timers
  if (p.gasMaskDonTimer > 0) p.gasMaskDonTimer = Math.max(0, p.gasMaskDonTimer - dt);
  if (p.gasMaskDoffTimer > 0) p.gasMaskDoffTimer = Math.max(0, p.gasMaskDoffTimer - dt);
  if (p.fireSuitDonTimer > 0) p.fireSuitDonTimer = Math.max(0, p.fireSuitDonTimer - dt);
  if (p.fireSuitDoffTimer > 0) p.fireSuitDoffTimer = Math.max(0, p.fireSuitDoffTimer - dt);
  if (p.minesweeperDonTimer > 0) p.minesweeperDonTimer = Math.max(0, p.minesweeperDonTimer - dt);
  if (p.minesweeperDoffTimer > 0) p.minesweeperDoffTimer = Math.max(0, p.minesweeperDoffTimer - dt);
  if (p.extinguisherTimer > 0) p.extinguisherTimer -= dt;

  // === Cap concurrent fire pools / gas clouds to avoid frame stalls ===
  // Oldest entries get evicted so the player always sees the most recent
  // threats. 8 is plenty for dense incendiary waves without over-drawing.
  const MAX_FIRE_POOLS = 8;
  const MAX_GAS_CLOUDS = 8;
  while (g.firePools.length > MAX_FIRE_POOLS) g.firePools.shift();
  while (g.gasClouds.length > MAX_GAS_CLOUDS) g.gasClouds.shift();

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
    // Damage player if standing in fire (unless extinguisher or fire suit active)
    const fireImmune = p.extinguisherTimer > 0 || p.fireSuitTimer > 0;
    if (!fireImmune && dist(p.pos, fp.pos) < fp.size + p.size) {
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

    // Smooth facing (prevents instant-flip when velocity changes sign).
    // Each drone uses its own turn rate derived from its initial wobble
    // phase so they don't all rotate in lock-step. Additionally, a tiny
    // direction-hysteresis window prevents jittering near velocity=0.
    const wobbleHash = Math.abs(Math.sin(d.wobble * 17.3));
    const personalRate = 1.6 + wobbleHash * 2.4; // 1.6..4.0
    const currentFacing = d.facingLerp ?? (d.vel.x >= 0 ? 1 : -1);
    // Hysteresis: only flip the target once vel.x crosses a threshold
    const HYST = 18;
    let targetFacing = currentFacing > 0 ? 1 : -1;
    if (d.vel.x > HYST) targetFacing = 1;
    else if (d.vel.x < -HYST) targetFacing = -1;
    if (d.facingLerp === undefined) d.facingLerp = targetFacing;
    d.facingLerp += (targetFacing - d.facingLerp) * Math.min(1, dt * personalRate);

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
          // Track player — but stay in this drone's own altitude band
          const dx = p.pos.x - d.pos.x;
          const altitudeBand = g.height * (0.12 + 0.08 * (Math.abs(d.altitudeOffset) % 3));
          const targetY = Math.max(g.height * 0.1, p.pos.y - 120 - altitudeBand);
          const dy = targetY - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            d.vel.x += (dx / dd) * 80 * d.trackingAccuracy * dt;
            d.vel.y += (dy / dd) * 80 * d.trackingAccuracy * dt;
          }

          // Separation from other drones (prevents clumping)
          applyDroneSeparation(d, g.drones, dt, 55);

          const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
          if (vLen > d.speed) { d.vel.x = (d.vel.x / vLen) * d.speed; d.vel.y = (d.vel.y / vLen) * d.speed; }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
          d.pos.y = Math.max(g.height * 0.08, Math.min(g.height * 0.45, d.pos.y));
          d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

          // Drop a visible falling fireball that leaves a fire pool on impact
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 50) {
            d.bombTimer = 0;
            const groundY = g.height * GROUND_RATIO;
            const fireX = d.pos.x + (Math.random() - 0.5) * 20;
            const bomb = getFromPool<Hazard>(g.hazards, createHazardDefault);
            bomb.type = 'shrapnel';
            bomb.isFireBomb = true;
            bomb.isGasBomb = false;
            bomb.pos = { x: d.pos.x, y: d.pos.y + d.size * 0.5 };
            bomb.targetPos = { x: fireX, y: groundY - 5 };
            bomb.speed = 190 + Math.random() * 50;
            bomb.size = 9;
            bomb.damage = 8;
            bomb.warningDuration = 0;
            bomb.warningTimer = 0;
            bomb.falling = true;
            bomb.splitDone = false;
            bomb.isClusterBomb = false;
            bomb.rotation = Math.random() * Math.PI * 2;
            bomb.trailTimer = 0;
            g.activeHazardCount++;
            addFloatingText(g, '🔥', { x: d.pos.x, y: d.pos.y + 15 }, '#f97316');
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
          // Track player — each chemical drone flies at its own altitude band
          const dx = p.pos.x - d.pos.x;
          const bandIdx = Math.floor(Math.abs(d.altitudeOffset) / 35) % 3;
          const targetY = Math.max(g.height * 0.09, p.pos.y - 100 - bandIdx * 55);
          const dy = targetY - d.pos.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > 0) {
            d.vel.x += (dx / dd) * 60 * d.trackingAccuracy * dt;
            d.vel.y += (dy / dd) * 60 * d.trackingAccuracy * dt;
          }

          // Separation from other drones — strong push so they don't clump
          applyDroneSeparation(d, g.drones, dt, 65);

          const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
          if (vLen > d.speed) { d.vel.x = (d.vel.x / vLen) * d.speed; d.vel.y = (d.vel.y / vLen) * d.speed; }
          d.pos.x += d.vel.x * g.slowMoFactor * dt;
          d.pos.y += d.vel.y * g.slowMoFactor * dt;
          d.pos.y = Math.max(g.height * 0.08, Math.min(g.height * 0.48, d.pos.y));
          d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

          // Drop a visible falling gas canister
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 60) {
            d.bombTimer = 0;
            const groundY = g.height * GROUND_RATIO;
            const gasX = d.pos.x + (Math.random() - 0.5) * 30;
            const bomb = getFromPool<Hazard>(g.hazards, createHazardDefault);
            bomb.type = 'shrapnel';
            bomb.isFireBomb = false;
            bomb.isGasBomb = true;
            bomb.pos = { x: d.pos.x, y: d.pos.y + d.size * 0.5 };
            bomb.targetPos = { x: gasX, y: groundY - 5 };
            bomb.speed = 160 + Math.random() * 40;
            bomb.size = 9;
            bomb.damage = 6;
            bomb.warningDuration = 0;
            bomb.warningTimer = 0;
            bomb.falling = true;
            bomb.splitDone = false;
            bomb.isClusterBomb = false;
            bomb.rotation = 0;
            bomb.trailTimer = 0;
            g.activeHazardCount++;
            addFloatingText(g, '☣', { x: d.pos.x, y: d.pos.y + 15 }, '#16a34a');
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
      } else if (d.tier === 'laser') {
        // LASER: stationary hover, cycles through telegraph → firing → cooldown
        if (!d.laserPhase) d.laserPhase = 'idle';
        d.bombTimer -= dt;
        // Gentle hover movement
        d.pos.x += Math.sin(d.wobble + g.elapsed * 0.8) * 8 * dt;
        d.pos.y += Math.cos(d.wobble + g.elapsed * 1.1) * 4 * dt;
        if (d.laserPhase === 'idle') {
          if (d.bombTimer <= 0) {
            d.laserPhase = 'telegraph';
            d.laserTargetX = Math.max(40, Math.min(g.width - 40, p.pos.x));
            d.bombTimer = 1.5;
            sfxWarning();
          }
        } else if (d.laserPhase === 'telegraph') {
          if (d.bombTimer <= 0) {
            d.laserPhase = 'firing';
            d.bombTimer = 0.5;
            addTrauma(0.2);
            // Deal laser damage ONCE at the moment of firing (not every frame)
            const targetX = d.laserTargetX ?? d.pos.x;
            const playerInBeam = Math.abs(p.pos.x - targetX) < 18 + p.size;
            if (playerInBeam) {
              damagePlayer(g, 25, { x: targetX, y: p.pos.y });
            }
          }
        } else if (d.laserPhase === 'firing') {
          if (d.bombTimer <= 0) {
            d.laserPhase = 'cooldown';
            d.bombTimer = 3.0;
          }
        } else if (d.laserPhase === 'cooldown') {
          if (d.bombTimer <= 0) {
            d.laserPhase = 'idle';
            d.bombTimer = 0.8;
          }
        }
        const minY = g.height * 0.12;
        const maxY = g.height * 0.25;
        d.pos.y = Math.max(minY, Math.min(maxY, d.pos.y));
        d.pos.x = Math.max(40, Math.min(g.width - 40, d.pos.x));
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
              const proj = getFromPool<Hazard>(g.hazards, createHazardDefault);
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
              proj.isFireBomb = false;
              proj.isGasBomb = false;
              proj.isClusterBomb = false;
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
        // Active tracking for scout/bomber — each tier gets its own altitude
        // and steering feel so they look physically distinct.
        const isBomber = d.tier === 'bomber';
        const dx = p.pos.x - d.pos.x;
        // Bomber floats much higher and lazily; scout hovers medium and jitters.
        const baseAlt = isBomber ? 190 : 120;
        const bandJitter = d.altitudeOffset * 0.35;
        const targetY = p.pos.y - baseAlt - bandJitter;
        const dy = targetY - d.pos.y;
        const dd = Math.sqrt(dx * dx + dy * dy);

        if (dd > 0) {
          // Bomber has HEAVY inertia — small steer force and no jitter.
          const steerForce = (isBomber ? 45 : 100) * d.trackingAccuracy;
          d.vel.x += (dx / dd) * steerForce * dt;
          d.vel.y += (dy / dd) * steerForce * dt;

          if (d.tier === 'scout') {
            d.vel.x += (Math.random() - 0.5) * 60 * dt;
            d.vel.y += (Math.random() - 0.5) * 30 * dt;
          }

          // Per-tier separation distance. The bomber is huge — give it a lot
          // of breathing room so no two bombers can ever stick together.
          const sepDist = isBomber ? 95 : 30;
          applyDroneSeparation(d, g.drones, dt, sepDist);

          // Extra damping for bomber so it doesn't accelerate like a fighter
          if (isBomber) {
            d.vel.x *= 1 - 0.9 * dt;
            d.vel.y *= 1 - 0.9 * dt;
          }

          const vLen = Math.sqrt(d.vel.x * d.vel.x + d.vel.y * d.vel.y);
          // Cap bomber speed significantly below the rest
          const cap = isBomber ? d.speed * 0.65 : d.speed;
          if (vLen > cap) {
            d.vel.x = (d.vel.x / vLen) * cap;
            d.vel.y = (d.vel.y / vLen) * cap;
          }
        }
        d.pos.x += d.vel.x * g.slowMoFactor * dt;
        d.pos.y += d.vel.y * g.slowMoFactor * dt;

        // Keep drones in upper portion — bomber gets its own (higher) band
        const minY = g.height * (isBomber ? 0.05 : 0.08);
        const maxY = g.height * (isBomber ? 0.30 : 0.42);
        d.pos.y = Math.max(minY, Math.min(maxY, d.pos.y));
        d.pos.x = Math.max(-10, Math.min(g.width + 10, d.pos.x));

        // Bomber: drop bombs when above player
        if (d.tier === 'bomber') {
          d.bombTimer += dt;
          if (d.bombTimer >= d.bombCooldown && Math.abs(d.pos.x - p.pos.x) < 40) {
            d.bombTimer = 0;
            // Spawn a hazard directly below drone
            const bomb = getFromPool<Hazard>(g.hazards, createHazardDefault);
            bomb.type = 'shrapnel';
            bomb.pos = { x: d.pos.x, y: d.pos.y + d.size };
            bomb.targetPos = { x: d.pos.x + (Math.random() - 0.5) * 30, y: g.height * GROUND_RATIO };
            bomb.speed = 220 + Math.random() * 60;
            bomb.size = 10;
            bomb.damage = 18;
            bomb.warningDuration = 0;
            bomb.warningTimer = 0;
            bomb.falling = true;
            bomb.isFireBomb = false;
            bomb.isGasBomb = false;
            bomb.isClusterBomb = false;
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
            const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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

  // === Screen shake (trauma-based) ===
  updateCameraShake(g, dt);

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

function spawnBoss(g: GameData, showWarning = true, isMini = false) {
  const count = g.bossCount;
  const baseHP = isMini ? 5 : (count === 0 ? 10 : 15 + count * 5);
  const size = isMini ? 55 : 80;
  const side = Math.random() < 0.5 ? -80 : g.width + 80;
  const cooldown = isMini ? 2.8 : (count === 0 ? 4.5 : Math.max(1.5, 3 - count * 0.3));
  g.boss = {
    pos: { x: side, y: g.height * (isMini ? 0.15 : 0.12) },
    vel: { x: 0, y: 0 },
    health: baseHP,
    maxHealth: baseHP,
    size,
    phase: 1,
    attackTimer: cooldown,
    attackCooldown: cooldown,
    attackPattern: 'missiles',
    entered: false,
    defeated: false,
    entryTarget: { x: g.width * 0.5, y: g.height * (isMini ? 0.15 : 0.12) },
    carpetX: 0,
    carpetDir: 1,
    spawnedDrones: 0,
    damageFlash: 0,
    isMini,
  };
  sfxBossSiren();
  if (showWarning) {
    g.cinematicWarning = {
      text: isMini ? '⚠ قائد معركة!' : '⚠ تحذير: طائرة حربية!',
      subText: '',
      color: isMini ? '#f59e0b' : '#dc2626',
      timer: 1.5, duration: 1.5, type: 'warning',
    };
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
  // Mini-boss stays in phase 1 only (missile barrage), no carpet/escort phases
  const hpRatio = boss.health / boss.maxHealth;
  const newPhase = (boss.isMini ? 1 : (hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3)) as typeof boss.phase;
  if (newPhase !== boss.phase) {
    boss.phase = newPhase;
    // Phase transition: 2s cooldown + warning + power-up drop
    boss.attackTimer = 2.0;
    const phaseText = newPhase === 2 ? '⚡ انتبه' : '🔥 ولّعت عنجد';
    g.cinematicWarning = { text: phaseText, subText: '', color: '#fbbf24', timer: 1.0, duration: 1.0, type: 'warning' };
    g.slowMoFactor = 0.1;
    // Drop a random power-up as mid-fight reward
    const rewardTypes: PowerUpType[] = ['medkit', 'ammo', 'shield'];
    const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
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
          const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
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
          h.isFireBomb = false;
          h.isGasBomb = false;
          h.isClusterBomb = false;
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
          const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
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
          h.isFireBomb = false;
          h.isGasBomb = false;
          h.isClusterBomb = false;
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
        const h = getFromPool<Hazard>(g.hazards, createHazardDefault);
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
        h.isFireBomb = false;
        h.isGasBomb = false;
        h.isClusterBomb = false;
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
  if (!boss.isMini) {
    g.bossCount++;
    g.stats.bossesDefeated++;
  }

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
    addTrauma(1.0); // Critical shake on boss kill
    g.boss = null;
  }, 1300);

  // Rewards
  const reward = boss.isMini ? 200 : 500;
  g.score += reward;
  addFloatingText(g, boss.isMini ? `MINI-BOSS! +${reward}` : `BOSS DOWN! +${reward}`, boss.pos, '#fbbf24');

  // Guaranteed power-up drop
  const pu = getFromPool<PowerUp>(g.powerUps, createPowerUpDefault, 20);
  const types: PowerUpType[] = ['medkit', 'shield', 'ammo', 'slowmo'];
  pu.type = types[Math.floor(Math.random() * types.length)];
  pu.pos = { x: boss.pos.x, y: boss.pos.y };
  pu.size = 14;
  pu.parachuting = true;
  pu.fallSpeed = 30;
  pu.bobTimer = 0;
  pu.groundTimer = 0;
}
