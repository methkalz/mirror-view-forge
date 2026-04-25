import type { GameData, HazardType, DroneTier, WaveEventType } from './types';

export interface DebugAPI {
  jumpToWave(wave: number): void;
  spawnHazard(type: HazardType): void;
  spawnDrone(tier: DroneTier): void;
  spawnBoss(mini?: boolean): void;
  triggerEvent(type: WaveEventType): void;
  setHealth(hp: number): void;
  setAmmo(ammo: number): void;
  toggleGodMode(on: boolean): void;
  toggleInfiniteAmmo(on: boolean): void;
  giveProtection(item: 'gasmask' | 'firesuit' | 'minesweeper'): void;
  setGameSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  getState(): { wave: number; health: number; ammo: number; elapsed: number; phase: string; activeHazards: number; activeDrones: number };
}

let godMode = false;
let infiniteAmmo = false;
let gameSpeed = 1.0;
let paused = false;

export function isGodMode(): boolean { return godMode; }
export function isInfiniteAmmo(): boolean { return infiniteAmmo; }
export function getGameSpeed(): number { return paused ? 0 : gameSpeed; }
export function isPaused(): boolean { return paused; }

export function attachDebugAPI(g: GameData, helpers: {
  spawnHazard: (g: GameData, type: HazardType) => void;
  spawnDrone: (g: GameData, tier?: DroneTier) => void;
  spawnBoss: (g: GameData, showWarning?: boolean, isMini?: boolean) => void;
  startNextWave: (g: GameData) => void;
  spawnSwarm: (g: GameData, count: number) => void;
  startVolley: (g: GameData) => void;
  spawnMinePlanter: (g: GameData) => void;
  startAirRaidFlyby: (g: GameData) => void;
}): DebugAPI {
  return {
    jumpToWave(wave: number) {
      g.waveNumber = wave - 1;
      g.hazards.forEach(h => h.active = false);
      g.drones.forEach(d => d.active = false);
      g.activeHazardCount = 0;
      g.boss = null;
      g.minePlanter = null;
      helpers.startNextWave(g);
    },
    spawnHazard(type: HazardType) { helpers.spawnHazard(g, type); },
    spawnDrone(tier: DroneTier) { helpers.spawnDrone(g, tier); },
    spawnBoss(mini = false) {
      if (!g.boss) helpers.spawnBoss(g, true, mini);
    },
    triggerEvent(type: WaveEventType) {
      if (type === 'swarm') helpers.spawnSwarm(g, 5);
      else if (type === 'volley') helpers.startVolley(g);
      else if (type === 'minefield') helpers.spawnMinePlanter(g);
      else if (type === 'airstrike_flyby') helpers.startAirRaidFlyby(g);
      else if (type === 'surge') {
        // Temporarily boost spawn rate for the rest of the wave
        const prev = g.spawnIntervalCurrent ?? g.spawnTimer;
        g.spawnTimer = Math.max(0.4, prev * 0.4);
      }
    },
  return {
    jumpToWave(wave: number) {
      g.waveNumber = wave - 1;
      g.hazards.forEach(h => h.active = false);
      g.drones.forEach(d => d.active = false);
      g.activeHazardCount = 0;
      g.boss = null;
      g.minePlanter = null;
      helpers.startNextWave(g);
    },
    spawnHazard(type: HazardType) { helpers.spawnHazard(g, type); },
    spawnDrone(tier: DroneTier) { helpers.spawnDrone(g, tier); },
    spawnBoss(mini = false) {
      if (!g.boss) helpers.spawnBoss(g, true, mini);
    },
    triggerEvent(type: WaveEventType) {
      if (type === 'swarm') helpers.spawnSwarm(g, 5);
      else if (type === 'volley') helpers.startVolley(g);
      else if (type === 'minefield') helpers.spawnMinePlanter(g);
    },
    setHealth(hp: number) { g.player.health = Math.max(0, Math.min(200, hp)); },
    setAmmo(ammo: number) { g.player.ammo = Math.max(0, Math.min(99, ammo)); },
    toggleGodMode(on: boolean) { godMode = on; },
    toggleInfiniteAmmo(on: boolean) { infiniteAmmo = on; },
    giveProtection(item) {
      if (item === 'gasmask') { g.player.gasMaskTimer = 60; g.player.gasMaskDonTimer = 0.6; g.gasMaskOwned = true; }
      else if (item === 'firesuit') { g.player.fireSuitTimer = 60; g.player.fireSuitDonTimer = 0.6; g.fireSuitOwned = true; }
      else if (item === 'minesweeper') { g.player.minesweeperTimer = 60; g.player.minesweeperDonTimer = 0.6; g.minesweeperOwned = true; }
    },
    setGameSpeed(m: number) { gameSpeed = Math.max(0.1, Math.min(4, m)); },
    pause() { paused = true; },
    resume() { paused = false; },
    getState() {
      return {
        wave: g.waveNumber,
        health: Math.round(g.player.health),
        ammo: g.player.ammo,
        elapsed: Math.round(g.waveElapsed),
        phase: g.wavePhase,
        activeHazards: g.activeHazardCount,
        activeDrones: g.drones.filter(d => d.active).length,
      };
    },
  };
}
