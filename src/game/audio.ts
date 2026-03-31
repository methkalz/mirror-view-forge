import { fetchAudioConfig, type AudioConfigEntry, type AudioFileEntry, type PlayMode } from './config';

let audioCtx: AudioContext | null = null;
let ambientNode: AudioBufferSourceNode | null = null;
let ambientGainNode: GainNode | null = null;

// ─── Remote audio settings cache ───
interface SoundSetting {
  volume: number;
  enabled: boolean;
  audioUrl: string | null;
  playMode: PlayMode;
  intervalSeconds: number | null;
  maxConcurrent: number;
  allowOverlap: boolean;
  files: AudioFileEntry[];
}
let audioSettings: Map<string, SoundSetting> = new Map();
let settingsLoaded = false;
// ─── Preloaded audio buffers cache (key = url) ───
const audioBufferCache: Map<string, AudioBuffer> = new Map();
// ─── Sequential playback index per sound key ───
const sequentialIndex: Map<string, number> = new Map();
// ─── Periodic ambient timers ───
const periodicTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
// ─── Active sources for overlap control ───
const activeSources: Map<string, { source: AudioBufferSourceNode; gain: GainNode }[]> = new Map();

export async function loadAudioSettings(onProgress?: (pct: number) => void) {
  try {
    const entries = await fetchAudioConfig();
    audioSettings.clear();
    for (const e of entries) {
      audioSettings.set(e.soundKey, {
        volume: e.volume,
        enabled: e.enabled,
        audioUrl: e.audioUrl,
        playMode: e.playMode,
        intervalSeconds: e.intervalSeconds,
        maxConcurrent: e.maxConcurrent,
        files: e.files,
      });
    }
    settingsLoaded = true;
    await preloadAllAudio(onProgress);
  } catch {
    settingsLoaded = false;
  }
}

// Reload settings from DB without re-downloading audio files
export async function reloadAudioSettings() {
  try {
    const entries = await fetchAudioConfig();
    audioSettings.clear();
    for (const e of entries) {
      audioSettings.set(e.soundKey, {
        volume: e.volume,
        enabled: e.enabled,
        audioUrl: e.audioUrl,
        playMode: e.playMode,
        intervalSeconds: e.intervalSeconds,
        maxConcurrent: e.maxConcurrent,
        files: e.files,
      });
    }
    settingsLoaded = true;
    // Update active ambient gain immediately
    if (ambientGainNode && audioCtx) {
      const newVol = getSoundVolume('ambient', ambientNode ? 0.5 : 0.15);
      ambientGainNode.gain.setTargetAtTime(newVol, audioCtx.currentTime, 0.1);
    }
    // Update active menu music gain immediately
    if (menuMusicGain && audioCtx) {
      const newVol = getSoundVolume('menuMusic', 0.4);
      menuMusicGain.gain.setTargetAtTime(newVol, audioCtx.currentTime, 0.1);
    }
    // Restart periodic ambient timers with updated settings
    if (periodicTimers.size > 0) {
      stopPeriodicAmbient();
      startPeriodicAmbient();
    }
  } catch {
    // silently fail
  }
}

async function preloadAllAudio(onProgress?: (pct: number) => void) {
  const ctx = getCtx();
  const urlsToLoad = new Set<string>();

  for (const [, s] of audioSettings) {
    if (s.audioUrl) urlsToLoad.add(s.audioUrl);
    for (const f of s.files) urlsToLoad.add(f.fileUrl);
  }

  const urls = Array.from(urlsToLoad);
  const total = urls.length;
  let loaded = 0;

  await Promise.allSettled(
    urls.map(async url => {
      if (audioBufferCache.has(url)) {
        loaded++;
        onProgress?.(loaded / Math.max(total, 1));
        return;
      }
      try {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        audioBufferCache.set(url, decoded);
      } catch { /* skip */ }
      loaded++;
      onProgress?.(loaded / Math.max(total, 1));
    })
  );
}

function pickFileUrl(key: string): string | null {
  const s = audioSettings.get(key);
  if (!s) return null;

  // If multi-file
  if (s.files.length > 0) {
    const mode = s.playMode;
    if (mode === 'random') {
      return s.files[Math.floor(Math.random() * s.files.length)].fileUrl;
    } else if (mode === 'sequential') {
      const idx = (sequentialIndex.get(key) || 0) % s.files.length;
      sequentialIndex.set(key, idx + 1);
      return s.files[idx].fileUrl;
    } else {
      // single or loop: use first file
      return s.files[0].fileUrl;
    }
  }

  // Fallback to legacy single audioUrl
  return s.audioUrl || null;
}

function playCustomAudio(key: string): boolean {
  const s = audioSettings.get(key);
  if (!s) return false;

  const url = pickFileUrl(key);
  if (!url) return false;

  const buffer = audioBufferCache.get(url);
  if (!buffer) return false;

  const ctx = getCtx();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = s.volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
  return true;
}

function getSoundVolume(key: string, baseVol: number): number {
  const s = audioSettings.get(key);
  if (!s) return baseVol;
  if (!s.enabled) return 0;
  // Exponential scaling for perceptible slider response
  const v = s.volume;
  return baseVol * (v * v);
}

function isSoundEnabled(key: string): boolean {
  const s = audioSettings.get(key);
  if (!s) return true;
  return s.enabled;
}

/* ── iOS Silent-Mode bypass ── */
let iosUnmuted = false;
let iosUnlockAudio: HTMLAudioElement | null = null;
// Minimal valid MP3 (~150 bytes of silence)
const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPnOyAAAAAAD/+1DEAAAHAAGf9AAAIAAAMH/EAABEASBAAAACQAAAAAAAP//////////////4gIAhQAAABP/7UsQBgAeAAaX9IAAg8AA0v6QAAAAAAaQ0P/+sRBCP/X/rGBw5fWMOh0f///xjBRPqOv///5coKJ9R1////+XKCifUd';

function unmuteIOS() {
  if (iosUnmuted) return;
  iosUnmuted = true;
  try {
    iosUnlockAudio = document.createElement('audio');
    iosUnlockAudio.setAttribute('x-webkit-airplay', 'deny');
    iosUnlockAudio.preload = 'auto';
    iosUnlockAudio.setAttribute('playsinline', 'true');
    iosUnlockAudio.loop = true;
    iosUnlockAudio.volume = 0.001;
    iosUnlockAudio.src = SILENT_MP3;
    iosUnlockAudio.play().catch(() => {});
  } catch {}
}

// Auto-trigger on first interaction
if (typeof document !== 'undefined') {
  const trigger = () => {
    unmuteIOS();
    document.removeEventListener('touchstart', trigger);
    document.removeEventListener('click', trigger);
  };
  document.addEventListener('touchstart', trigger, { passive: true });
  document.addEventListener('click', trigger, { passive: true });
}
/* ── end iOS bypass ── */

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function resumeAudio() {
  unmuteIOS();
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  if (!settingsLoaded) loadAudioSettings();
  startAmbient();
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.12) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, vol = 0.08, filter?: { type: BiquadFilterType; freq: number }) {
  const ctx = getCtx();
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  if (filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type;
    bq.frequency.value = filter.freq;
    src.connect(bq).connect(gain).connect(ctx.destination);
  } else {
    src.connect(gain).connect(ctx.destination);
  }
  src.start();
}

function startAmbient() {
  if (ambientNode) return;
  if (!isSoundEnabled('ambient')) return;

  // Try custom multi-file ambient (looped)
  const url = pickFileUrl('ambient');
  const customBuf = url ? audioBufferCache.get(url) : null;
  if (customBuf) {
    const ctx = getCtx();
    ambientNode = ctx.createBufferSource();
    ambientNode.buffer = customBuf;
    ambientNode.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = getSoundVolume('ambient', 0.5);
    ambientNode.connect(gain).connect(ctx.destination);
    ambientNode.start();
    ambientGainNode = gain;
    return;
  }

  // Fallback: synthesized wind
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  ambientNode = ctx.createBufferSource();
  ambientNode.buffer = buffer;
  ambientNode.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = getSoundVolume('ambient', 0.15);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 400;
  ambientNode.connect(bq).connect(gain).connect(ctx.destination);
  ambientNode.start();
  ambientGainNode = gain;
}

export function sfxExplosion() {
  if (!isSoundEnabled('explosion')) return;
  if (playCustomAudio('explosion')) return;
  const v = getSoundVolume('explosion', 1);
  playTone(40, 0.15, 'sine', 0.15 * v);
  playNoise(0.12, 0.12 * v, { type: 'lowpass', freq: 250 });
}

export function sfxImpactLight() {
  if (!isSoundEnabled('impactLight')) return;
  if (playCustomAudio('impactLight')) return;
  const v = getSoundVolume('impactLight', 1);
  playNoise(0.05, 0.2 * v, { type: 'lowpass', freq: 250 + Math.random() * 300 });
  playTone(120 + Math.random() * 80, 0.04, 'sine', 0.15 * v);
}

export function sfxImpactHeavy() {
  if (!isSoundEnabled('impactHeavy')) return;
  if (playCustomAudio('impactHeavy')) return;
  const v = getSoundVolume('impactHeavy', 1);
  playTone(45, 0.18, 'sine', 0.25 * v);
  playNoise(0.14, 0.2 * v, { type: 'lowpass', freq: 200 });
}

export function sfxPickup() {
  if (!isSoundEnabled('pickup')) return;
  if (playCustomAudio('pickup')) return;
  const v = getSoundVolume('pickup', 1);
  playTone(500, 0.06, 'sine', 0.08 * v);
  setTimeout(() => playTone(700, 0.06, 'sine', 0.08 * v), 50);
  setTimeout(() => playTone(900, 0.05, 'sine', 0.06 * v), 100);
  setTimeout(() => playTone(1100, 0.04, 'sine', 0.05 * v), 150);
}

export function sfxDamage() {
  if (!isSoundEnabled('damage')) return;
  if (playCustomAudio('damage')) return;
  const v = getSoundVolume('damage', 1);
  playTone(120, 0.2, 'sawtooth', 0.12 * v);
  playNoise(0.15, 0.08 * v, { type: 'lowpass', freq: 1500 });
}

export function sfxDash() {
  if (!isSoundEnabled('dash')) return;
  if (playCustomAudio('dash')) return;
  const v = getSoundVolume('dash', 1);
  playTone(300, 0.08, 'triangle', 0.06 * v);
  playNoise(0.1, 0.04 * v, { type: 'highpass', freq: 3000 });
}

export function sfxInterceptor() {
  if (!isSoundEnabled('interceptor')) return;
  if (playCustomAudio('interceptor')) return;
  const v = getSoundVolume('interceptor', 1);
  playTone(1200, 0.05, 'square', 0.06 * v);
  setTimeout(() => playTone(800, 0.1, 'square', 0.05 * v), 40);
  setTimeout(() => sfxExplosion(), 100);
}

export function sfxFootstep() {
  if (!isSoundEnabled('footstep')) return;
  if (playCustomAudio('footstep')) return;
  const v = getSoundVolume('footstep', 1);
  playNoise(0.04, 0.02 * v, { type: 'lowpass', freq: 600 });
}

export function sfxWarning() {
  if (!isSoundEnabled('warning')) return;
  if (playCustomAudio('warning')) return;
  const v = getSoundVolume('warning', 1);
  playTone(800, 0.08, 'sine', 0.12 * v);
  setTimeout(() => playTone(1000, 0.06, 'sine', 0.1 * v), 80);
}

// ─── Threat-specific Warning Sounds ───

export function sfxWarningShrapnel() {
  if (!isSoundEnabled('warningShrapnel')) return;
  if (playCustomAudio('warningShrapnel')) return;
  const v = getSoundVolume('warningShrapnel', 1);
  playTone(1200, 0.06, 'square', 0.12 * v);
  setTimeout(() => playTone(900, 0.06, 'square', 0.1 * v), 70);
  setTimeout(() => playNoise(0.08, 0.08 * v, { type: 'highpass', freq: 4000 }), 120);
}

export function sfxWarningMissile() {
  if (!isSoundEnabled('warningMissile')) return;
  if (playCustomAudio('warningMissile')) return;
  const v = getSoundVolume('warningMissile', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.3);
  osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.15 * v, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.7);
}

export function sfxWarningCluster() {
  if (!isSoundEnabled('warningCluster')) return;
  if (playCustomAudio('warningCluster')) return;
  const v = getSoundVolume('warningCluster', 1);
  for (let i = 0; i < 4; i++) {
    setTimeout(() => playTone(700 + i * 100, 0.04, 'square', 0.12 * v), i * 60);
  }
}

export function sfxWarningDrone() {
  if (!isSoundEnabled('warningDrone')) return;
  if (playCustomAudio('warningDrone')) return;
  const v = getSoundVolume('warningDrone', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.3);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.12 * v, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.7);
}

export function sfxWarningBoss() {
  if (!isSoundEnabled('warningBoss')) return;
  if (playCustomAudio('warningBoss')) return;
  const v = getSoundVolume('warningBoss', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.2 * v, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15 * v, ctx.currentTime + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 400;
  osc.connect(bq).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.0);
  playNoise(0.6, 0.1 * v, { type: 'lowpass', freq: 200 });
}

export function sfxWarningHazard() {
  if (!isSoundEnabled('warningHazard')) return;
  if (playCustomAudio('warningHazard')) return;
  const v = getSoundVolume('warningHazard', 1);
  playTone(300, 0.1, 'triangle', 0.12 * v);
  setTimeout(() => playTone(350, 0.08, 'triangle', 0.1 * v), 100);
  setTimeout(() => playNoise(0.15, 0.08 * v, { type: 'bandpass', freq: 800 }), 150);
}

export function sfxWarningBomber() {
  if (!isSoundEnabled('warningBomber')) return;
  if (playCustomAudio('warningBomber')) return;
  const v = getSoundVolume('warningBomber', 1);
  playTone(80, 0.3, 'sawtooth', 0.15 * v);
  playNoise(0.2, 0.1 * v, { type: 'lowpass', freq: 300 });
  setTimeout(() => playTone(600, 0.08, 'square', 0.12 * v), 200);
  setTimeout(() => playTone(500, 0.08, 'square', 0.1 * v), 300);
}

export function sfxSlideTransition() {
  if (!isSoundEnabled('slideTransition')) return;
  if (playCustomAudio('slideTransition')) return;
  const v = getSoundVolume('slideTransition', 1);
  const ctx = getCtx();
  // Soft whoosh: filtered noise sweep high→low
  const duration = 0.15;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bq = ctx.createBiquadFilter();
  bq.type = 'bandpass';
  bq.frequency.setValueAtTime(3000, ctx.currentTime);
  bq.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + duration);
  bq.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08 * v, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.connect(bq).connect(gain).connect(ctx.destination);
  src.start();
  // Subtle tonal accent
  playTone(600, 0.06, 'sine', 0.03 * v);
}

export function sfxSlowmo() {
  if (!isSoundEnabled('slowmo')) return;
  if (playCustomAudio('slowmo')) return;
  const v = getSoundVolume('slowmo', 1);
  playTone(150, 0.6, 'sine', 0.1 * v);
  playTone(100, 0.8, 'sine', 0.06 * v);
}

export function sfxMagnet() {
  if (!isSoundEnabled('magnet')) return;
  if (playCustomAudio('magnet')) return;
  const v = getSoundVolume('magnet', 1);
  playTone(400, 0.15, 'sawtooth', 0.06 * v);
  setTimeout(() => playTone(500, 0.12, 'sawtooth', 0.05 * v), 60);
  setTimeout(() => playTone(600, 0.1, 'sawtooth', 0.04 * v), 120);
}

export function sfxAirstrike() {
  if (!isSoundEnabled('airstrike')) return;
  if (playCustomAudio('airstrike')) return;
  const v = getSoundVolume('airstrike', 1);
  playTone(1200, 0.1, 'sine', 0.08 * v);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.06 * v), 100);
  setTimeout(() => sfxExplosion(), 200);
  setTimeout(() => sfxExplosion(), 350);
  setTimeout(() => sfxExplosion(), 500);
}

export function sfxThunder() {
  if (!isSoundEnabled('thunder')) return;
  if (playCustomAudio('thunder')) return;
  const v = getSoundVolume('thunder', 1);
  playNoise(0.8, 0.15 * v, { type: 'lowpass', freq: 200 });
  playTone(30, 0.6, 'sine', 0.1 * v);
  setTimeout(() => playNoise(0.5, 0.08 * v, { type: 'lowpass', freq: 150 }), 200);
}

export function sfxBossSiren() {
  if (!isSoundEnabled('bossSiren')) return;
  if (playCustomAudio('bossSiren')) return;
  const v = getSoundVolume('bossSiren', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
  osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 1.5);
  gain.gain.setValueAtTime(0.2 * v, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
}

export function sfxBossExplosion() {
  if (!isSoundEnabled('bossExplosion')) return;
  if (playCustomAudio('bossExplosion')) return;
  const v = getSoundVolume('bossExplosion', 1);
  playTone(30, 0.8, 'sawtooth', 0.25 * v);
  playTone(50, 0.6, 'sine', 0.2 * v);
  playNoise(0.8, 0.2 * v, { type: 'lowpass', freq: 500 });
  setTimeout(() => { playNoise(0.5, 0.15 * v, { type: 'lowpass', freq: 300 }); playTone(25, 0.5, 'sine', 0.12 * v); }, 200);
  setTimeout(() => playNoise(0.4, 0.1 * v, { type: 'bandpass', freq: 1000 }), 400);
}

export function sfxShoot1() {
  if (!isSoundEnabled('shoot1')) return;
  if (playCustomAudio('shoot1')) return;
  const v = getSoundVolume('shoot1', 1);
  playNoise(0.08, 0.15 * v, { type: 'highpass', freq: 3000 });
  playTone(150, 0.1, 'sine', 0.12 * v);
  playTone(80, 0.08, 'sine', 0.06 * v);
}

export function sfxShoot2() {
  if (!isSoundEnabled('shoot2')) return;
  if (playCustomAudio('shoot2')) return;
  const v = getSoundVolume('shoot2', 1);
  playNoise(0.09, 0.18 * v, { type: 'highpass', freq: 2800 });
  playTone(120, 0.12, 'sine', 0.14 * v);
  playTone(70, 0.1, 'sine', 0.08 * v);
  setTimeout(() => {
    playNoise(0.07, 0.14 * v, { type: 'highpass', freq: 3200 });
    playTone(130, 0.1, 'sine', 0.1 * v);
  }, 60);
}

export function sfxShoot3() {
  if (!isSoundEnabled('shoot3')) return;
  if (playCustomAudio('shoot3')) return;
  const v = getSoundVolume('shoot3', 1);
  playNoise(0.1, 0.2 * v, { type: 'highpass', freq: 2500 });
  playTone(100, 0.15, 'sine', 0.16 * v);
  playTone(60, 0.12, 'sine', 0.1 * v);
  setTimeout(() => {
    playNoise(0.08, 0.16 * v, { type: 'highpass', freq: 3000 });
    playTone(110, 0.1, 'sine', 0.12 * v);
  }, 50);
  setTimeout(() => {
    playNoise(0.07, 0.14 * v, { type: 'highpass', freq: 3400 });
    playTone(90, 0.08, 'sine', 0.1 * v);
  }, 100);
}

export function sfxCombo(level: number) {
  if (!isSoundEnabled('combo')) return;
  if (playCustomAudio('combo')) return;
  const v = getSoundVolume('combo', 1);
  const baseFreq = 600 + level * 100;
  playTone(baseFreq, 0.06, 'sine', 0.06 * v);
  setTimeout(() => playTone(baseFreq + 200, 0.05, 'sine', 0.05 * v), 40);
}

export function sfxCloseCall() {
  if (!isSoundEnabled('closeCall')) return;
  if (playCustomAudio('closeCall')) return;
  const v = getSoundVolume('closeCall', 1);
  playTone(1000, 0.04, 'sine', 0.04 * v);
  setTimeout(() => playTone(1200, 0.03, 'sine', 0.03 * v), 30);
}

// ─── Motorcycle Sounds ───

export function sfxBikeEngine() {
  if (!isSoundEnabled('bikeEngine')) return;
  if (playCustomAudio('bikeEngine')) return;
  const v = getSoundVolume('bikeEngine', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.3);
  osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.8);
  gain.gain.setValueAtTime(0.06 * v, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.1 * v, ctx.currentTime + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 300;
  osc.connect(bq).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.2);
  // Add rumble
  playNoise(0.8, 0.04 * v, { type: 'lowpass', freq: 150 });
}

export function sfxBikeBrake() {
  if (!isSoundEnabled('bikeBrake')) return;
  if (playCustomAudio('bikeBrake')) return;
  const v = getSoundVolume('bikeBrake', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.08 * v, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 250;
  osc.connect(bq).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
  // Tire screech
  playNoise(0.3, 0.06 * v, { type: 'highpass', freq: 2000 });
}

export function sfxBikeIdle() {
  if (!isSoundEnabled('bikeIdle')) return;
  if (playCustomAudio('bikeIdle')) return;
  const v = getSoundVolume('bikeIdle', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 55;
  gain.gain.setValueAtTime(0.04 * v, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 200;
  osc.connect(bq).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
}

export function sfxBikeDepart() {
  if (!isSoundEnabled('bikeDepart')) return;
  if (playCustomAudio('bikeDepart')) return;
  const v = getSoundVolume('bikeDepart', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(60, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.8);
  osc.frequency.linearRampToValueAtTime(350, ctx.currentTime + 1.5);
  gain.gain.setValueAtTime(0.07 * v, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.12 * v, ctx.currentTime + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 400;
  osc.connect(bq).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
  playNoise(1.5, 0.05 * v, { type: 'lowpass', freq: 200 });
}

// ─── Wave & Game State Sounds ───

export function sfxWarningAlert() {
  if (!isSoundEnabled('warningAlert')) return;
  if (playCustomAudio('warningAlert')) return;
  const v = getSoundVolume('warningAlert', 1);
  playTone(600, 0.12, 'square', 0.06 * v);
  setTimeout(() => playTone(500, 0.12, 'square', 0.05 * v), 150);
  setTimeout(() => playTone(600, 0.1, 'square', 0.06 * v), 300);
}

export function sfxUpgradeAlert() {
  if (!isSoundEnabled('upgradeAlert')) return;
  if (playCustomAudio('upgradeAlert')) return;
  const v = getSoundVolume('upgradeAlert', 1);
  playTone(500, 0.08, 'sine', 0.06 * v);
  setTimeout(() => playTone(700, 0.08, 'sine', 0.06 * v), 80);
  setTimeout(() => playTone(900, 0.08, 'sine', 0.06 * v), 160);
  setTimeout(() => playTone(1100, 0.06, 'sine', 0.05 * v), 240);
}

export function sfxWaveComplete() {
  if (!isSoundEnabled('waveComplete')) return;
  if (playCustomAudio('waveComplete')) return;
  const v = getSoundVolume('waveComplete', 1);
  playTone(400, 0.15, 'sine', 0.08 * v);
  setTimeout(() => playTone(500, 0.12, 'sine', 0.07 * v), 100);
  setTimeout(() => playTone(600, 0.12, 'sine', 0.07 * v), 200);
  setTimeout(() => playTone(800, 0.2, 'sine', 0.09 * v), 300);
}

export function sfxLevelUp() {
  if (!isSoundEnabled('levelUp')) return;
  if (playCustomAudio('levelUp')) return;
  const v = getSoundVolume('levelUp', 1);
  playTone(400, 0.1, 'sine', 0.08 * v);
  setTimeout(() => playTone(600, 0.1, 'sine', 0.08 * v), 100);
  setTimeout(() => playTone(800, 0.1, 'sine', 0.08 * v), 200);
  setTimeout(() => playTone(1000, 0.15, 'sine', 0.1 * v), 300);
  setTimeout(() => playTone(1200, 0.2, 'sine', 0.08 * v), 400);
}

export function sfxGameOver() {
  if (!isSoundEnabled('gameOver')) return;
  if (playCustomAudio('gameOver')) return;
  const v = getSoundVolume('gameOver', 1);
  playTone(400, 0.3, 'sawtooth', 0.1 * v);
  setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.08 * v), 200);
  setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.06 * v), 400);
  setTimeout(() => playTone(100, 0.6, 'sine', 0.05 * v), 600);
}

export function sfxGameStart() {
  if (!isSoundEnabled('gameStart')) return;
  if (playCustomAudio('gameStart')) return;
  const v = getSoundVolume('gameStart', 1);
  playTone(300, 0.1, 'sine', 0.06 * v);
  setTimeout(() => playTone(500, 0.1, 'sine', 0.07 * v), 80);
  setTimeout(() => playTone(700, 0.15, 'sine', 0.08 * v), 160);
}

export function sfxUpgradeSelect() {
  if (!isSoundEnabled('upgradeSelect')) return;
  if (playCustomAudio('upgradeSelect')) return;
  const v = getSoundVolume('upgradeSelect', 1);
  playTone(800, 0.06, 'sine', 0.06 * v);
  setTimeout(() => playTone(1000, 0.08, 'sine', 0.07 * v), 50);
}

// ─── Dynamic Periodic Ambient System ───

export function startPeriodicAmbient() {
  stopPeriodicAmbient();

  // Start periodic timers for sounds with intervalSeconds set
  for (const [key, s] of audioSettings) {
    if (s.intervalSeconds && s.intervalSeconds > 0 && s.enabled) {
      const ms = s.intervalSeconds * 1000;
      const timer = setInterval(() => {
        if (!isSoundEnabled(key)) return;
        // Try custom audio first
        if (!playCustomAudio(key)) {
          // Fallback to synthesized
          const sfxFn = periodicFallbacks[key];
          if (sfxFn) sfxFn();
        }
      }, ms + Math.random() * ms * 0.5);
      periodicTimers.set(key, timer);
    }
  }

  // Legacy fallback: if no ambient-category sounds have periodic timers, add default random ambient
  const ambientKeys = ['distantExplosion', 'windGust', 'distantSiren', 'thunder'];
  const hasAmbientPeriodic = ambientKeys.some(k => periodicTimers.has(k));
  if (!hasAmbientPeriodic) {
    const timer = setInterval(() => {
      const r = Math.random();
      if (r < 0.3) sfxDistantExplosion();
      else if (r < 0.5) sfxWindGust();
      else if (r < 0.7) sfxDistantSiren();
    }, 8000 + Math.random() * 12000);
    periodicTimers.set('_legacy', timer);
  }
}

export function stopPeriodicAmbient() {
  for (const [key, timer] of periodicTimers) {
    clearInterval(timer);
  }
  periodicTimers.clear();
}

// Register periodic fallbacks after functions are defined (populated below)
const periodicFallbacks: Record<string, (() => void)> = {
  distantExplosion: () => { sfxDistantExplosion(); },
  windGust: () => { sfxWindGust(); },
  distantSiren: () => { sfxDistantSiren(); },
};

export function sfxDistantExplosion() {
  if (!isSoundEnabled('distantExplosion')) return;
  if (playCustomAudio('distantExplosion')) return;
  const v = getSoundVolume('distantExplosion', 1);
  playNoise(0.4, 0.03 * v, { type: 'lowpass', freq: 150 });
  playTone(25, 0.5, 'sine', 0.02 * v);
}

export function sfxWindGust() {
  if (!isSoundEnabled('windGust')) return;
  if (playCustomAudio('windGust')) return;
  const v = getSoundVolume('windGust', 1);
  const ctx = getCtx();
  const bufferSize = Math.floor(ctx.sampleRate * 1.5);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 4;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.04 * v, ctx.currentTime + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
  const bq = ctx.createBiquadFilter();
  bq.type = 'bandpass';
  bq.frequency.value = 600;
  src.connect(bq).connect(gain).connect(ctx.destination);
  src.start();
}

export function sfxDistantSiren() {
  if (!isSoundEnabled('distantSiren')) return;
  if (playCustomAudio('distantSiren')) return;
  const v = getSoundVolume('distantSiren', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 1);
  osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 2);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.015 * v, ctx.currentTime + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
}

// ─── UI Sounds ───

export function sfxButtonClick() {
  if (!isSoundEnabled('buttonClick')) return;
  if (playCustomAudio('buttonClick')) return;
  const v = getSoundVolume('buttonClick', 1);
  playTone(800, 0.03, 'sine', 0.04 * v);
}

export function sfxScoreSubmit() {
  if (!isSoundEnabled('scoreSubmit')) return;
  if (playCustomAudio('scoreSubmit')) return;
  const v = getSoundVolume('scoreSubmit', 1);
  playTone(600, 0.08, 'sine', 0.06 * v);
  setTimeout(() => playTone(800, 0.06, 'sine', 0.05 * v), 60);
  setTimeout(() => playTone(1000, 0.08, 'sine', 0.06 * v), 120);
}

// ─── Synthesized Sound Preview Map (for Admin panel) ───
// Maps sound_key → function that plays the synthesized fallback regardless of settings
export function playSynthesizedPreview(key: string) {
  // Ensure AudioContext is ready
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const map: Record<string, () => void> = {
    explosion: () => { playTone(40, 0.15, 'sine', 0.03); playNoise(0.12, 0.025, { type: 'lowpass', freq: 250 }); },
    impactLight: () => { playNoise(0.05, 0.12, { type: 'lowpass', freq: 400 }); playTone(150, 0.04, 'sine', 0.08); },
    impactHeavy: () => { playTone(45, 0.18, 'sine', 0.18); playNoise(0.14, 0.13, { type: 'lowpass', freq: 200 }); },
    pickup: () => { playTone(500, 0.06, 'sine', 0.08); setTimeout(() => playTone(700, 0.06, 'sine', 0.08), 50); setTimeout(() => playTone(900, 0.05, 'sine', 0.06), 100); },
    damage: () => { playTone(120, 0.2, 'sawtooth', 0.12); playNoise(0.15, 0.08, { type: 'lowpass', freq: 1500 }); },
    dash: () => { playTone(300, 0.08, 'triangle', 0.06); playNoise(0.1, 0.04, { type: 'highpass', freq: 3000 }); },
    interceptor: () => { playTone(1200, 0.05, 'square', 0.06); setTimeout(() => playTone(800, 0.1, 'square', 0.05), 40); },
    footstep: () => { playNoise(0.04, 0.02, { type: 'lowpass', freq: 600 }); },
    warning: () => { playTone(800, 0.08, 'sine', 0.03); setTimeout(() => playTone(1000, 0.06, 'sine', 0.02), 80); },
    warningShrapnel: () => { playTone(1200, 0.06, 'square', 0.04); setTimeout(() => playTone(900, 0.06, 'square', 0.03), 70); },
    warningMissile: () => { const c = getCtx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, c.currentTime); o.frequency.linearRampToValueAtTime(500, c.currentTime + 0.3); o.frequency.linearRampToValueAtTime(200, c.currentTime + 0.6); g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.7); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.7); },
    warningCluster: () => { for (let i = 0; i < 4; i++) setTimeout(() => playTone(700 + i * 100, 0.04, 'square', 0.04), i * 60); },
    warningDrone: () => { const c = getCtx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(400, c.currentTime); o.frequency.exponentialRampToValueAtTime(1600, c.currentTime + 0.3); o.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.6); g.gain.setValueAtTime(0.04, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.7); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.7); },
    warningBoss: () => { playTone(100, 1.0, 'sawtooth', 0.08); playNoise(0.6, 0.04, { type: 'lowpass', freq: 200 }); },
    warningHazard: () => { playTone(300, 0.1, 'triangle', 0.04); setTimeout(() => playTone(350, 0.08, 'triangle', 0.03), 100); },
    warningBomber: () => { playTone(80, 0.3, 'sawtooth', 0.05); playNoise(0.2, 0.04, { type: 'lowpass', freq: 300 }); setTimeout(() => playTone(600, 0.08, 'square', 0.04), 200); },
    slowmo: () => { playTone(150, 0.6, 'sine', 0.1); playTone(100, 0.8, 'sine', 0.06); },
    magnet: () => { playTone(400, 0.15, 'sawtooth', 0.06); setTimeout(() => playTone(500, 0.12, 'sawtooth', 0.05), 60); },
    airstrike: () => { playTone(1200, 0.1, 'sine', 0.08); setTimeout(() => playTone(800, 0.15, 'sine', 0.06), 100); },
    thunder: () => { playNoise(0.8, 0.15, { type: 'lowpass', freq: 200 }); playTone(30, 0.6, 'sine', 0.1); },
    bossSiren: () => { const c = getCtx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime); o.frequency.linearRampToValueAtTime(800, c.currentTime + 0.5); o.frequency.linearRampToValueAtTime(400, c.currentTime + 1.0); g.gain.setValueAtTime(0.08, c.currentTime); g.gain.linearRampToValueAtTime(0.001, c.currentTime + 2); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 2); },
    bossExplosion: () => { playTone(30, 0.8, 'sawtooth', 0.15); playTone(50, 0.6, 'sine', 0.12); playNoise(0.8, 0.15, { type: 'lowpass', freq: 500 }); },
    shoot1: () => { playNoise(0.08, 0.15, { type: 'highpass', freq: 3000 }); playTone(150, 0.1, 'sine', 0.12); },
    shoot2: () => { playNoise(0.09, 0.18, { type: 'highpass', freq: 2800 }); playTone(120, 0.12, 'sine', 0.14); },
    shoot3: () => { playNoise(0.1, 0.2, { type: 'highpass', freq: 2500 }); playTone(100, 0.15, 'sine', 0.16); },
    combo: () => { playTone(600, 0.06, 'sine', 0.06); setTimeout(() => playTone(800, 0.05, 'sine', 0.05), 40); },
    closeCall: () => { playTone(1000, 0.04, 'sine', 0.04); setTimeout(() => playTone(1200, 0.03, 'sine', 0.03), 30); },
    bikeEngine: () => { playTone(80, 1.0, 'sawtooth', 0.06); playNoise(0.8, 0.04, { type: 'lowpass', freq: 150 }); },
    bikeBrake: () => { playNoise(0.3, 0.06, { type: 'highpass', freq: 2000 }); },
    bikeIdle: () => { playTone(55, 1.0, 'triangle', 0.04); },
    bikeDepart: () => { playTone(60, 1.5, 'sawtooth', 0.07); playNoise(1.5, 0.05, { type: 'lowpass', freq: 200 }); },
    warningAlert: () => { playTone(600, 0.12, 'square', 0.06); setTimeout(() => playTone(500, 0.12, 'square', 0.05), 150); setTimeout(() => playTone(600, 0.1, 'square', 0.06), 300); },
    upgradeAlert: () => { playTone(500, 0.08, 'sine', 0.06); setTimeout(() => playTone(700, 0.08, 'sine', 0.06), 80); setTimeout(() => playTone(900, 0.08, 'sine', 0.06), 160); },
    waveComplete: () => { playTone(400, 0.15, 'sine', 0.08); setTimeout(() => playTone(500, 0.12, 'sine', 0.07), 100); setTimeout(() => playTone(800, 0.2, 'sine', 0.09), 300); },
    levelUp: () => { playTone(400, 0.1, 'sine', 0.08); setTimeout(() => playTone(600, 0.1, 'sine', 0.08), 100); setTimeout(() => playTone(1000, 0.15, 'sine', 0.1), 300); },
    gameOver: () => { playTone(400, 0.3, 'sawtooth', 0.1); setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.08), 200); setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.06), 400); },
    gameStart: () => { playTone(300, 0.1, 'sine', 0.06); setTimeout(() => playTone(500, 0.1, 'sine', 0.07), 80); setTimeout(() => playTone(700, 0.15, 'sine', 0.08), 160); },
    upgradeSelect: () => { playTone(800, 0.06, 'sine', 0.06); setTimeout(() => playTone(1000, 0.08, 'sine', 0.07), 50); },
    distantExplosion: () => { playNoise(0.4, 0.03, { type: 'lowpass', freq: 150 }); playTone(25, 0.5, 'sine', 0.02); },
    windGust: () => { playNoise(0.5, 0.04, { type: 'bandpass', freq: 600 }); },
    distantSiren: () => { const c = getCtx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300, c.currentTime); o.frequency.linearRampToValueAtTime(500, c.currentTime + 1); o.frequency.linearRampToValueAtTime(300, c.currentTime + 2); g.gain.setValueAtTime(0.001, c.currentTime); g.gain.linearRampToValueAtTime(0.015, c.currentTime + 0.5); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 2); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 2); },
    buttonClick: () => { playTone(800, 0.03, 'sine', 0.04); },
    scoreSubmit: () => { playTone(600, 0.08, 'sine', 0.06); setTimeout(() => playTone(800, 0.06, 'sine', 0.05), 60); },
  };

  const fn = map[key];
  if (fn) fn();
}

// ─── Menu Music ───
let menuMusicNode: AudioBufferSourceNode | null = null;
let menuMusicGain: GainNode | null = null;
let menuMusicStarting = false;
let menuMusicAttemptId = 0;

export function cancelMenuMusicStart() {
  menuMusicAttemptId++;
  menuMusicStarting = false;
}

export async function startMenuMusic(): Promise<boolean> {
  if (menuMusicNode) return true; // already playing
  if (menuMusicStarting) return false; // another attempt in progress
  if (!isSoundEnabled('menuMusic')) return false;

  const myAttempt = ++menuMusicAttemptId;
  menuMusicStarting = true;
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // After await: check if cancelled or another call succeeded
    if (myAttempt !== menuMusicAttemptId) return false;
    if (menuMusicNode) return true;

  // Try custom audio
  const url = pickFileUrl('menuMusic');
  const buf = url ? audioBufferCache.get(url) : null;
  if (buf) {
    menuMusicNode = ctx.createBufferSource();
    menuMusicNode.buffer = buf;
    menuMusicNode.loop = true;
    menuMusicGain = ctx.createGain();
    menuMusicGain.gain.value = getSoundVolume('menuMusic', 0.4);
    menuMusicNode.connect(menuMusicGain).connect(ctx.destination);
    menuMusicNode.start();
    return true;
  }

  // Fallback: ambient synth pad
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let phase1 = 0, phase2 = 0, phase3 = 0;
    const f1 = 65.41, f2 = 82.41, f3 = 98;
    for (let i = 0; i < bufferSize; i++) {
      phase1 += (f1 / ctx.sampleRate) * Math.PI * 2;
      phase2 += (f2 / ctx.sampleRate) * Math.PI * 2;
      phase3 += (f3 / ctx.sampleRate) * Math.PI * 2;
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.sin(phase1) * 0.3 + Math.sin(phase2) * 0.25 + Math.sin(phase3) * 0.2) * env * 0.15;
      if (ch === 1) data[i] *= 0.95;
    }
  }
  if (myAttempt !== menuMusicAttemptId) return false; // check again after heavy work
  menuMusicNode = ctx.createBufferSource();
  menuMusicNode.buffer = buffer;
  menuMusicNode.loop = true;
  menuMusicGain = ctx.createGain();
  menuMusicGain.gain.value = getSoundVolume('menuMusic', 0.3);
  menuMusicNode.connect(menuMusicGain).connect(ctx.destination);
  menuMusicNode.start();
  return true;
  } catch (e) {
    console.warn('startMenuMusic error:', e);
    return false;
  } finally {
    menuMusicStarting = false;
  }
}

export function stopMenuMusic() {
  const node = menuMusicNode;
  const gain = menuMusicGain;
  menuMusicNode = null;
  menuMusicGain = null;
  if (node) {
    try {
      if (gain) {
        const ctx = getCtx();
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        setTimeout(() => {
          try { node.stop(); node.disconnect(); } catch {}
        }, 200);
      } else {
        node.stop();
        node.disconnect();
      }
    } catch { /* already stopped */ }
  }
}

