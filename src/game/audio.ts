import { fetchAudioConfig, type AudioConfigEntry } from './config';

let audioCtx: AudioContext | null = null;
let ambientNode: AudioBufferSourceNode | null = null;

// ─── Remote audio settings cache ───
let audioSettings: Map<string, { volume: number; enabled: boolean }> = new Map();
let settingsLoaded = false;

export async function loadAudioSettings() {
  try {
    const entries = await fetchAudioConfig();
    audioSettings.clear();
    for (const e of entries) {
      audioSettings.set(e.soundKey, { volume: e.volume, enabled: e.enabled });
    }
    settingsLoaded = true;
  } catch {
    settingsLoaded = false;
  }
}

function getSoundVolume(key: string, baseVol: number): number {
  const s = audioSettings.get(key);
  if (!s) return baseVol;
  if (!s.enabled) return 0;
  return baseVol * s.volume;
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
  gain.gain.value = getSoundVolume('ambient', 0.03);
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 400;
  ambientNode.connect(bq).connect(gain).connect(ctx.destination);
  ambientNode.start();
}

export function sfxExplosion() {
  if (!isSoundEnabled('explosion')) return;
  const v = getSoundVolume('explosion', 1);
  playTone(40, 0.15, 'sine', 0.03 * v);
  playNoise(0.12, 0.025 * v, { type: 'lowpass', freq: 250 });
}

export function sfxImpactLight() {
  if (!isSoundEnabled('impactLight')) return;
  const v = getSoundVolume('impactLight', 1);
  playNoise(0.05, 0.12 * v, { type: 'lowpass', freq: 250 + Math.random() * 300 });
  playTone(120 + Math.random() * 80, 0.04, 'sine', 0.08 * v);
}

export function sfxImpactHeavy() {
  if (!isSoundEnabled('impactHeavy')) return;
  const v = getSoundVolume('impactHeavy', 1);
  playTone(45, 0.18, 'sine', 0.18 * v);
  playNoise(0.14, 0.13 * v, { type: 'lowpass', freq: 200 });
}

export function sfxPickup() {
  if (!isSoundEnabled('pickup')) return;
  const v = getSoundVolume('pickup', 1);
  playTone(500, 0.06, 'sine', 0.08 * v);
  setTimeout(() => playTone(700, 0.06, 'sine', 0.08 * v), 50);
  setTimeout(() => playTone(900, 0.05, 'sine', 0.06 * v), 100);
  setTimeout(() => playTone(1100, 0.04, 'sine', 0.05 * v), 150);
}

export function sfxDamage() {
  if (!isSoundEnabled('damage')) return;
  const v = getSoundVolume('damage', 1);
  playTone(120, 0.2, 'sawtooth', 0.12 * v);
  playNoise(0.15, 0.08 * v, { type: 'lowpass', freq: 1500 });
}

export function sfxDash() {
  if (!isSoundEnabled('dash')) return;
  const v = getSoundVolume('dash', 1);
  playTone(300, 0.08, 'triangle', 0.06 * v);
  playNoise(0.1, 0.04 * v, { type: 'highpass', freq: 3000 });
}

export function sfxInterceptor() {
  if (!isSoundEnabled('interceptor')) return;
  const v = getSoundVolume('interceptor', 1);
  playTone(1200, 0.05, 'square', 0.06 * v);
  setTimeout(() => playTone(800, 0.1, 'square', 0.05 * v), 40);
  setTimeout(() => sfxExplosion(), 100);
}

export function sfxFootstep() {
  if (!isSoundEnabled('footstep')) return;
  const v = getSoundVolume('footstep', 1);
  playNoise(0.04, 0.02 * v, { type: 'lowpass', freq: 600 });
}

export function sfxWarning() {
  if (!isSoundEnabled('warning')) return;
  const v = getSoundVolume('warning', 1);
  playTone(800, 0.08, 'sine', 0.03 * v);
  setTimeout(() => playTone(1000, 0.06, 'sine', 0.02 * v), 80);
}

export function sfxSlowmo() {
  if (!isSoundEnabled('slowmo')) return;
  const v = getSoundVolume('slowmo', 1);
  playTone(150, 0.6, 'sine', 0.1 * v);
  playTone(100, 0.8, 'sine', 0.06 * v);
}

export function sfxMagnet() {
  if (!isSoundEnabled('magnet')) return;
  const v = getSoundVolume('magnet', 1);
  playTone(400, 0.15, 'sawtooth', 0.06 * v);
  setTimeout(() => playTone(500, 0.12, 'sawtooth', 0.05 * v), 60);
  setTimeout(() => playTone(600, 0.1, 'sawtooth', 0.04 * v), 120);
}

export function sfxAirstrike() {
  if (!isSoundEnabled('airstrike')) return;
  const v = getSoundVolume('airstrike', 1);
  playTone(1200, 0.1, 'sine', 0.08 * v);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.06 * v), 100);
  setTimeout(() => sfxExplosion(), 200);
  setTimeout(() => sfxExplosion(), 350);
  setTimeout(() => sfxExplosion(), 500);
}

export function sfxThunder() {
  if (!isSoundEnabled('thunder')) return;
  const v = getSoundVolume('thunder', 1);
  playNoise(0.8, 0.15 * v, { type: 'lowpass', freq: 200 });
  playTone(30, 0.6, 'sine', 0.1 * v);
  setTimeout(() => playNoise(0.5, 0.08 * v, { type: 'lowpass', freq: 150 }), 200);
}

export function sfxBossSiren() {
  if (!isSoundEnabled('bossSiren')) return;
  const v = getSoundVolume('bossSiren', 1);
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
  osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 1.5);
  gain.gain.setValueAtTime(0.08 * v, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
}

export function sfxBossExplosion() {
  if (!isSoundEnabled('bossExplosion')) return;
  const v = getSoundVolume('bossExplosion', 1);
  playTone(30, 0.8, 'sawtooth', 0.15 * v);
  playTone(50, 0.6, 'sine', 0.12 * v);
  playNoise(0.8, 0.15 * v, { type: 'lowpass', freq: 500 });
  setTimeout(() => { playNoise(0.5, 0.1 * v, { type: 'lowpass', freq: 300 }); playTone(25, 0.5, 'sine', 0.08 * v); }, 200);
  setTimeout(() => playNoise(0.4, 0.06 * v, { type: 'bandpass', freq: 1000 }), 400);
}

export function sfxShoot1() {
  if (!isSoundEnabled('shoot1')) return;
  const v = getSoundVolume('shoot1', 1);
  playNoise(0.08, 0.15 * v, { type: 'highpass', freq: 3000 });
  playTone(150, 0.1, 'sine', 0.12 * v);
  playTone(80, 0.08, 'sine', 0.06 * v);
}

export function sfxShoot2() {
  if (!isSoundEnabled('shoot2')) return;
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
  const v = getSoundVolume('combo', 1);
  const baseFreq = 600 + level * 100;
  playTone(baseFreq, 0.06, 'sine', 0.06 * v);
  setTimeout(() => playTone(baseFreq + 200, 0.05, 'sine', 0.05 * v), 40);
}

export function sfxCloseCall() {
  if (!isSoundEnabled('closeCall')) return;
  const v = getSoundVolume('closeCall', 1);
  playTone(1000, 0.04, 'sine', 0.04 * v);
  setTimeout(() => playTone(1200, 0.03, 'sine', 0.03 * v), 30);
}

// ─── Motorcycle Sounds ───

export function sfxBikeEngine() {
  if (!isSoundEnabled('bikeEngine')) return;
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
  const v = getSoundVolume('warningAlert', 1);
  playTone(600, 0.12, 'square', 0.06 * v);
  setTimeout(() => playTone(500, 0.12, 'square', 0.05 * v), 150);
  setTimeout(() => playTone(600, 0.1, 'square', 0.06 * v), 300);
}

export function sfxUpgradeAlert() {
  if (!isSoundEnabled('upgradeAlert')) return;
  const v = getSoundVolume('upgradeAlert', 1);
  playTone(500, 0.08, 'sine', 0.06 * v);
  setTimeout(() => playTone(700, 0.08, 'sine', 0.06 * v), 80);
  setTimeout(() => playTone(900, 0.08, 'sine', 0.06 * v), 160);
  setTimeout(() => playTone(1100, 0.06, 'sine', 0.05 * v), 240);
}

export function sfxWaveComplete() {
  if (!isSoundEnabled('waveComplete')) return;
  const v = getSoundVolume('waveComplete', 1);
  playTone(400, 0.15, 'sine', 0.08 * v);
  setTimeout(() => playTone(500, 0.12, 'sine', 0.07 * v), 100);
  setTimeout(() => playTone(600, 0.12, 'sine', 0.07 * v), 200);
  setTimeout(() => playTone(800, 0.2, 'sine', 0.09 * v), 300);
}

export function sfxLevelUp() {
  if (!isSoundEnabled('levelUp')) return;
  const v = getSoundVolume('levelUp', 1);
  playTone(400, 0.1, 'sine', 0.08 * v);
  setTimeout(() => playTone(600, 0.1, 'sine', 0.08 * v), 100);
  setTimeout(() => playTone(800, 0.1, 'sine', 0.08 * v), 200);
  setTimeout(() => playTone(1000, 0.15, 'sine', 0.1 * v), 300);
  setTimeout(() => playTone(1200, 0.2, 'sine', 0.08 * v), 400);
}

export function sfxGameOver() {
  if (!isSoundEnabled('gameOver')) return;
  const v = getSoundVolume('gameOver', 1);
  playTone(400, 0.3, 'sawtooth', 0.1 * v);
  setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.08 * v), 200);
  setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.06 * v), 400);
  setTimeout(() => playTone(100, 0.6, 'sine', 0.05 * v), 600);
}

export function sfxGameStart() {
  if (!isSoundEnabled('gameStart')) return;
  const v = getSoundVolume('gameStart', 1);
  playTone(300, 0.1, 'sine', 0.06 * v);
  setTimeout(() => playTone(500, 0.1, 'sine', 0.07 * v), 80);
  setTimeout(() => playTone(700, 0.15, 'sine', 0.08 * v), 160);
}

export function sfxUpgradeSelect() {
  if (!isSoundEnabled('upgradeSelect')) return;
  const v = getSoundVolume('upgradeSelect', 1);
  playTone(800, 0.06, 'sine', 0.06 * v);
  setTimeout(() => playTone(1000, 0.08, 'sine', 0.07 * v), 50);
}

// ─── Periodic Ambient Sounds ───

let ambientPeriodicTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicAmbient() {
  if (ambientPeriodicTimer) return;
  ambientPeriodicTimer = setInterval(() => {
    // Random distant effects
    const r = Math.random();
    if (r < 0.3) {
      sfxDistantExplosion();
    } else if (r < 0.5) {
      sfxWindGust();
    } else if (r < 0.7) {
      sfxDistantSiren();
    }
  }, 8000 + Math.random() * 12000);
}

export function stopPeriodicAmbient() {
  if (ambientPeriodicTimer) {
    clearInterval(ambientPeriodicTimer);
    ambientPeriodicTimer = null;
  }
}

export function sfxDistantExplosion() {
  if (!isSoundEnabled('distantExplosion')) return;
  const v = getSoundVolume('distantExplosion', 1);
  playNoise(0.4, 0.03 * v, { type: 'lowpass', freq: 150 });
  playTone(25, 0.5, 'sine', 0.02 * v);
}

export function sfxWindGust() {
  if (!isSoundEnabled('windGust')) return;
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
  const v = getSoundVolume('buttonClick', 1);
  playTone(800, 0.03, 'sine', 0.04 * v);
}

export function sfxScoreSubmit() {
  if (!isSoundEnabled('scoreSubmit')) return;
  const v = getSoundVolume('scoreSubmit', 1);
  playTone(600, 0.08, 'sine', 0.06 * v);
  setTimeout(() => playTone(800, 0.06, 'sine', 0.05 * v), 60);
  setTimeout(() => playTone(1000, 0.08, 'sine', 0.06 * v), 120);
}

