export interface Vec2 {
  x: number;
  y: number;
}

export type GameState = 'start' | 'playing' | 'gameover';

export type HazardType = 'shrapnel' | 'missile' | 'cluster';
export type PowerUpType = 'medkit' | 'shield' | 'interceptor' | 'ammo';
export type DroneState = 'entering' | 'tracking' | 'bombing';
export type DroneTier = 'scout' | 'tracker' | 'bomber';
export type PlayerAnim = 'idle' | 'walk' | 'roll' | 'hit';

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
  // New side-view fields
  facingRight: boolean;
  anim: PlayerAnim;
  animFrame: number;
  animTimer: number;
  hitTimer: number;
  groundY: number;
  ammo: number;
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
  rotation: number;
  trailTimer: number;
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
  state: DroneState;
  entryTarget: Vec2;
  tier: DroneTier;
  bombTimer: number;
  bombCooldown: number;
  hoverTimer: number;
  aggroDelay: number; // delay before tracking starts (for gradual difficulty)
  trackingAccuracy: number; // 0-1, how well it tracks player
  wobble: number; // visual wobble for scout drones
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

export interface GameStats {
  closeCalls: number;
  powerUpsCollected: number;
  dronesDestroyed: number;
  timeSurvived: number;
}

export interface Bullet {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  size: number;
  damage: number;
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
}

export interface InputState {
  moveDir: Vec2;
  dash: boolean;
  shoot: boolean;
  keys: Set<string>;
  touchJoystick: { active: boolean; origin: Vec2; current: Vec2 };
  touchDash: boolean;
}
