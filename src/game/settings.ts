/**
 * Client-side user settings, persisted in localStorage.
 * These are independent from the Supabase remote config — they
 * control user preferences (volume, quality, haptics).
 */

export interface UserSettings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  haptics: boolean;
  /** Graphics quality preset. Low disables bloom for weak devices. */
  quality: 'low' | 'medium' | 'high';
  /** Reduce particle counts and effects for battery saving. */
  reducedMotion: boolean;
}

const KEY = 'skyfall_settings_v1';

const DEFAULTS: UserSettings = {
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 0.8,
  haptics: true,
  quality: 'high',
  reducedMotion: false,
};

let current: UserSettings = load();

function load(): UserSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): UserSettings {
  return { ...current };
}

export function updateSettings(patch: Partial<UserSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore quota errors */
  }
  // Notify subscribers
  for (const cb of subscribers) cb(current);
}

// ─── pub/sub for live updates ───
type Listener = (s: UserSettings) => void;
const subscribers = new Set<Listener>();

export function subscribeSettings(cb: Listener) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// Convenience accessors used by the audio/graphics systems.
export function getMasterGain() {
  return current.masterVolume;
}
export function getSfxGain() {
  return current.masterVolume * current.sfxVolume;
}
export function getMusicGain() {
  return current.masterVolume * current.musicVolume;
}
export function hapticsEnabled() {
  return current.haptics;
}
export function getQuality() {
  return current.quality;
}
export function isReducedMotion() {
  return current.reducedMotion;
}
