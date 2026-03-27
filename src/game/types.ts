export interface Vec2 {
  x: number;
  y: number;
}

export type GameState = 'start' | 'playing' | 'gameover';

export type HazardType = 'shrapnel' | 'missile' | 'cluster';
export type PowerUpType = 'medkit' | 'shield' | 'interceptor';
export type DroneState = 'entering' | 'tracking';

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
}

export interface PowerUp {
  active: boolean;
  type: PowerUpType;
  pos: Vec2;
  size: number;
  parachuting: boolean;
  fallSpeed: number;
  bobTimer: number;
}

export interface Particle {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Crater {
  pos: Vec2;
  size: number;
  life: number;
  maxLife: number;
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
}

export interface GameData {
  state: GameState;
  player: Player;
  hazards: Hazard[];
  powerUps: PowerUp[];
  particles: Particle[];
  craters: Crater[];
  floatingTexts: FloatingText[];
  drones: Drone[];
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
}

export interface InputState {
  moveDir: Vec2;
  dash: boolean;
  keys: Set<string>;
  touchJoystick: { active: boolean; origin: Vec2; current: Vec2 };
  touchDash: boolean;
}
