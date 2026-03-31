export interface Vec2 {
  x: number;
  y: number;
}

export type GameState = 'start' | 'intro' | 'playing' | 'gameover';
export type IntroPhase = 'bikeEnter' | 'bikeStop' | 'playerDismount' | 'bikeLeave' | 'done';

export type HazardType = 'shrapnel' | 'missile' | 'cluster';
export type PowerUpType = 'medkit' | 'shield' | 'interceptor' | 'ammo' | 'slowmo' | 'magnet' | 'airstrike' | 'extinguisher' | 'water';
export type DroneState = 'entering' | 'tracking' | 'bombing';
export type DroneTier = 'scout' | 'tracker' | 'bomber' | 'cargo' | 'incendiary' | 'chemical';
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
  extinguisherTimer: number;
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
  rotation: number;
  trailTimer: number;
  clusterPhase?: 'flying' | 'opening' | 'releasing' | 'done';
  clusterTimer?: number;
  clusterVelX?: number;
  clusterVelY?: number;
  clusterStartSpeed?: number;
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
  // Gas mask purchase system
  gasMaskOffer: { active: boolean; timer: number; cost: number } | null;
  gasMaskOwned: boolean;
  gasMaskOfferDelay: number;
}

export interface InputState {
  moveDir: Vec2;
  dash: boolean;
  shoot: boolean;
  keys: Set<string>;
  touchJoystick: { active: boolean; origin: Vec2; current: Vec2 };
  touchDash: boolean;
  cardClick?: { x: number; y: number } | null;
}
