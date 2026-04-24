export interface Vec2 {
  x: number;
  y: number;
}

export type GameState = 'start' | 'intro' | 'playing' | 'gameover';
export type IntroPhase = 'bikeEnter' | 'bikeStop' | 'playerDismount' | 'bikeLeave' | 'done';

export type HazardType = 'shrapnel' | 'missile' | 'cluster' | 'meteor' | 'mine';

export type WaveEventType = 'surge' | 'calm' | 'swarm' | 'volley' | 'minefield' | 'airstrike_flyby';

export interface WaveEventSpec {
  type: WaveEventType;
  triggerAt: number;
  duration: number;
}
export type PowerUpType = 'medkit' | 'shield' | 'interceptor' | 'ammo' | 'slowmo' | 'magnet' | 'airstrike' | 'extinguisher' | 'water' | 'gasmask' | 'firesuit' | 'minesweeper';
export type DroneState = 'entering' | 'tracking' | 'bombing';
export type DroneTier = 'scout' | 'tracker' | 'bomber' | 'cargo' | 'incendiary' | 'chemical' | 'laser';
export type PlayerAnim = 'idle' | 'walk' | 'roll' | 'hit';
export type WavePhase = 'active' | 'clearing' | 'announce' | 'cards' | 'bike';

export interface Player {
  pos: Vec2;
  size: number;
  speed: number;
  health: number;
  maxHealth: number;
  shielded: boolean;
  shieldTimer: number;
  dashCooldown: number;
  dashTimer: number;
  isDashing: boolean;
  dashDir: Vec2;
  velocity: Vec2;
  facingRight: boolean;
  anim: PlayerAnim;
  animFrame: number;
  animTimer: number;
  hitTimer: number;
  groundY: number;
  ammo: number;
  shootTimer: number;
  gasMaskTimer: number;
  /** Donning animation timer (counts down from 0.6s when the mask is first
   *  acquired). While > 0 the renderer fades the mask in. */
  gasMaskDonTimer: number;
  /** Doffing animation timer (counts down from 0.4s when the mask expires).
   *  While > 0 the renderer fades the mask out. */
  gasMaskDoffTimer: number;
  extinguisherTimer: number;
  /** Full-wave fire suit protection. Works like gasMaskTimer but guards
   *  against fire pools and incendiary drone collision damage. */
  fireSuitTimer: number;
  fireSuitDonTimer: number;
  fireSuitDoffTimer: number;
  /** Mine sweeper tool. While > 0 the player can defuse armed mines by
   *  standing within range for 3 seconds. Shown as a metal detector in-hand. */
  minesweeperTimer: number;
  minesweeperDonTimer: number;
  minesweeperDoffTimer: number;
  // Upgrade-enhanced stats
  maxAmmo: number;
  speedMultiplier: number;
  slowMoDuration: number;
  shieldDuration: number;
  pickupRange: number;
  bulletDamage: number;
  dashCooldownBase: number;
}

export interface Hazard {
  active: boolean;
  type: HazardType;
  pos: Vec2;
  targetPos: Vec2;
  speed: number;
  size: number;
  damage: number;
  warningTimer: number;
  warningDuration: number;
  falling: boolean;
  splitDone?: boolean;
  isClusterBomb?: boolean;
  /** Marks a projectile as an incendiary payload — on landing it spawns
   *  a fire pool instead of a crater. Rendered as a glowing fireball. */
  isFireBomb?: boolean;
  /** Marks a projectile as a chemical payload — on landing it spawns
   *  a gas cloud. Rendered as a green bioluminescent canister. */
  isGasBomb?: boolean;
  /** Visual variant for shrapnel pieces (0..3). Determines shape
   *  (rebar / jagged chunk / sheet metal / twisted wire). */
  shrapnelVariant?: number;
  /** Angular velocity in radians/sec — each shrapnel tumbles at its
   *  own rate depending on mass and variant. */
  spinSpeed?: number;
  rotation: number;
  trailTimer: number;
  clusterPhase?: 'flying' | 'opening' | 'releasing' | 'done';
  clusterTimer?: number;
  clusterVelX?: number;
  clusterVelY?: number;
  clusterStartSpeed?: number;
  /** Mine state machine: arming (1s yellow pulse) → armed (passive) → triggered (0.5s red flash) → explode */
  mineState?: 'arming' | 'armed' | 'triggered';
  mineTimer?: number;
  mineLife?: number;
  /** Defuse progress 0..3s when player with minesweeper is within range. */
  mineDefuseProgress?: number;
}

export interface PowerUp {
  active: boolean;
  type: PowerUpType;
  pos: Vec2;
  size: number;
  parachuting: boolean;
  fallSpeed: number;
  bobTimer: number;
  groundTimer: number;
}

export interface Particle {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: boolean;
}

export interface Crater {
  pos: Vec2;
  size: number;
  life: number;
  maxLife: number;
}

export interface Explosion {
  pos: Vec2;
  life: number;
  maxLife: number;
  size: number;
  stage: 'flash' | 'fireball' | 'smoke';
}

export interface SmokeTrail {
  pos: Vec2;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
}

export interface FloatingText {
  text: string;
  pos: Vec2;
  life: number;
  maxLife: number;
  color: string;
}

export interface Drone {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  speed: number;
  size: number;
  health: number;
  maxHealth: number;
  state: DroneState;
  entryTarget: Vec2;
  tier: DroneTier;
  bombTimer: number;
  bombCooldown: number;
  hoverTimer: number;
  aggroDelay: number;
  trackingAccuracy: number;
  wobble: number;
  altitudeOffset: number;
  colorHue: number;
  cargoType?: PowerUpType;
  label?: string;
  fireDropTimer?: number;
  gasDropTimer?: number;
  /** Laser drone: 'idle' | 'telegraph' | 'firing' | 'cooldown'. Uses bombTimer as phase timer. */
  laserPhase?: 'idle' | 'telegraph' | 'firing' | 'cooldown';
  laserTargetX?: number;
  /** Smoothed facing value in [-1..1]. Eased toward sign(vel.x) so the
   *  drone banks/turns instead of flipping instantly. */
  facingLerp?: number;
}

export interface FirePool {
  pos: Vec2;
  size: number;
  life: number;
  maxLife: number;
  damagePerSec: number;
}

export interface GasCloud {
  pos: Vec2;
  size: number;
  life: number;
  maxLife: number;
  damagePerSec: number;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  opacity: number;
}

export interface AmbientParticle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  opacity: number;
}

export interface WaveWarning {
  text: string;
  subText: string;
  life: number;
  maxLife: number;
  color: string;
}

export interface GameStats {
  closeCalls: number;
  powerUpsCollected: number;
  dronesDestroyed: number;
  timeSurvived: number;
  bossesDefeated: number;
}

export type BossPhase = 1 | 2 | 3;
export type BossAttack = 'missiles' | 'carpet' | 'drones';

export interface Boss {
  pos: Vec2;
  vel: Vec2;
  health: number;
  maxHealth: number;
  size: number;
  phase: BossPhase;
  attackTimer: number;
  attackCooldown: number;
  attackPattern: BossAttack;
  entered: boolean;
  defeated: boolean;
  entryTarget: Vec2;
  carpetX: number;
  carpetDir: number;
  spawnedDrones: number;
  damageFlash: number;
  isMini?: boolean;
}

export interface Bullet {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  size: number;
  damage: number;
}

export interface DeliveryBike {
  active: boolean;
  pos: Vec2;
  speed: number;
  facingRight: boolean;
  phase: 'entering' | 'slowing' | 'dropping' | 'idle' | 'leaving';
  dropX: number;
  dropped: boolean;
  wheelAnim: number;
  idleTimer: number;
  shakeOffset: Vec2;
  /** Spring-based suspension compression (negative = compressed). */
  suspCompress?: number;
  suspVelocity?: number;
  /** Body lean angle in radians (positive = wheelie, negative = nose-dive). */
  leanAngle?: number;
  /** Previous frame's speed — used to derive acceleration for lean & squat. */
  prevSpeed?: number;
  /** Engine RPM oscillator phase (drives vibration). */
  rpmPhase?: number;
}

/** Enemy soldier that walks across the ground planting mines at scheduled spots.
 *  Cinematic entity — cannot be damaged, only moves through its own state machine. */
export interface MinePlanter {
  active: boolean;
  pos: Vec2;
  facingRight: boolean;
  phase: 'entering' | 'walkingToSpot' | 'planting' | 'leaving';
  phaseTimer: number;
  plantSpots: number[];       // X coordinates where mines will be planted
  currentSpot: number;        // index into plantSpots
  minesPlanted: number;
  walkAnim: number;
}

export interface UpgradeCard {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  icon: string;
  color: string;
  applied: boolean;
}

export interface GameData {
  state: GameState;
  player: Player;
  hazards: Hazard[];
  powerUps: PowerUp[];
  particles: Particle[];
  craters: Crater[];
  explosions: Explosion[];
  smokeTrails: SmokeTrail[];
  floatingTexts: FloatingText[];
  drones: Drone[];
  clouds: Cloud[];
  ambientParticles: AmbientParticle[];
  bullets: Bullet[];
  score: number;
  highScore: number;
  elapsed: number;
  difficulty: number;
  spawnTimer: number;
  powerUpTimer: number;
  droneTimer: number;
  screenShake: Vec2;
  damageFlash: number;
  width: number;
  height: number;
  camera: Vec2;
  stats: GameStats;
  windOffset: number;
  waveWarnings: WaveWarning[];
  waveTriggered: Set<string>;
  bulletLevel: number;
  slowMoTimer: number;
  magnetTimer: number;
  magnetFlashTimer: number;
  slowMoFactor: number;
  boss: Boss | null;
  bossCount: number;
  bossTimer: number;
  rainDrops: { x: number; y: number; speed: number; len: number }[];
  lightningTimer: number;
  lightningFlash: number;
  weatherIntensity: number;
  cinematicWarning: { text: string; subText: string; color: string; timer: number; duration: number; type: 'warning' | 'upgrade' } | null;
  warningLockUntil: number;
  pendingWaveEvents: { id: string; resolveAt: number }[];
  activatedWaveEvents: Set<string>;
  missileStartTime: number;
  // Game feel systems
  hitStopTimer: number;
  comboCount: number;
  comboTimer: number;
  comboMultiplier: number;
  microSlowTimer: number;
  deathTimer: number;
  deathPhase: 'alive' | 'dying' | 'dead';
  firstAmmoDropped: boolean;
  firstAmmoPickedUp: boolean;
  cargoTimer: number;
  clearingTimer: number;
  firePools: FirePool[];
  gasClouds: GasCloud[];
  incendiaryTimer: number;
  chemicalTimer: number;
  // Wave system
  waveNumber: number;
  wavePhase: WavePhase;
  waveTimer: number;
  levelNumber: number;
  deliveryBike: DeliveryBike | null;
  upgradeCards: UpgradeCard[];
  selectedUpgrade: string | null;
  cardsShownTimer: number;
  waveElapsed: number; // time within current wave
  // Camera zoom system
  cameraZoom: number;
  cameraZoomTarget: number;
  cameraFocusX: number;
  cameraFocusY: number;
  bikeZoomTimer: number;
  // Wave recipe system
  waveEndSlowMo: number;
  waveFinale: boolean;
  waveAnnounceTimer: number;
  activeHazardCount: number;
  // Remote wave data
  difficultyProfile: import('@/game/config').DifficultyProfile | null;
  remoteWaveOverrides: import('@/game/config').RemoteWaveConfig[];
  /** Admin-managed dynamic event warnings (swarm/volley/airstrike/minefield). */
  dynamicWarnings: Record<string, import('@/game/config').DynamicWarning>;
  // Intro system
  introPhase: IntroPhase;
  introTimer: number;
  introBike: DeliveryBike | null;
  introPlayerOffset: number; // player's visual offset during dismount
  introPlayerJumpY: number; // vertical jump arc during dismount
  introTransitionTimer: number; // smooth fade between intro character and player
  // Tutorial slides
  tutorialPage: number;
  tutorialFade: number;
  // Gas mask purchase + per-wave parachute drop system
  gasMaskOffer: { active: boolean; timer: number; cost: number } | null;
  gasMaskOwned: boolean;
  gasMaskOfferDelay: number;
  /** True if a gas-mask parachute drop is still scheduled for the current
   *  chemical wave (set on wave start, cleared once the drop spawns). */
  gasMaskDropScheduled: boolean;
  /** Elapsed time at which the scheduled drop should spawn. */
  gasMaskDropTime: number;

  // Fire suit purchase + per-wave parachute drop system (mirror of gas mask)
  fireSuitOffer: { active: boolean; timer: number; cost: number } | null;
  fireSuitOwned: boolean;
  fireSuitOfferDelay: number;
  fireSuitDropScheduled: boolean;
  fireSuitDropTime: number;
  /** If true, the fire suit offer is waiting for the gas mask offer to
   *  resolve before it can start its delay countdown. */
  fireSuitOfferPending: boolean;

  // Minesweeper purchase + per-wave mine planter arrival (mirror of gas mask)
  minesweeperOffer: { active: boolean; timer: number; cost: number } | null;
  minesweeperOwned: boolean;
  minesweeperOfferDelay: number;
  /** True once the FIRST offer of each type has been shown in this run.
   *  The first card of each is FREE — displays the price struck-through and
   *  "أول مرة علينا". After this flag is set, future offers are full price. */
  gasMaskEverOffered: boolean;
  fireSuitEverOffered: boolean;
  minesweeperEverOffered: boolean;
  /** Time at which the mine-planter soldier should arrive (wave-clock). */
  minePlanterArrivalTime: number;
  minePlanterScheduled: boolean;
  minePlanter: MinePlanter | null;

  // Score countdown animation
  scoreCountdown: { remaining: number; tickTimer: number; totalCost: number } | null;

  // Mid-wave dynamic events
  waveEvents: WaveEventSpec[];
  waveEventsFired: boolean[];
  volleyQueue: { remaining: number; nextTimer: number; x: number } | null;
  airRaidFlyby: { pos: Vec2; speed: number; dropTimer: number; dropsLeft: number; threatType: HazardType; facingRight: boolean } | null;
  surgeFlashTimer: number;

  // Multi-scene system
  currentSceneIndex: number;
  sceneChangeWaveInterval: number;
  scenes: import('@/game/backgroundConfig').Scene[];
  allBgPhases: import('@/game/backgroundConfig').BackgroundPhase[];
  sceneTransition: {
    active: boolean;
    phase: 'zoomIn' | 'blackout' | 'swap' | 'zoomOut';
    timer: number;
    nextSceneIndex: number;
  } | null;
}

export interface InputState {
  moveDir: Vec2;
  dash: boolean;
  shoot: boolean;
  keys: Set<string>;
  touchJoystick: { active: boolean; origin: Vec2; current: Vec2 };
  touchDash: boolean;
  cardClick?: { x: number; y: number } | null;
  /**
   * Internal pointer tracking for swipe/tap disambiguation and
   * game-over button hit testing. Kept under a nested object so
   * no stray fields leak onto InputState's top level.
   */
  pointer?: {
    lastClickX?: number;
    lastClickY?: number;
    swipeStartX?: number;
    swipeStartY?: number;
  };
}
