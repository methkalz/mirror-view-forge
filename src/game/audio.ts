let audioCtx: AudioContext | null = null;
let ambientNode: AudioBufferSourceNode | null = null;

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
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown noise for wind
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
  gain.gain.value = 0.03;
  const bq = ctx.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = 400;
  ambientNode.connect(bq).connect(gain).connect(ctx.destination);
  ambientNode.start();
}

export function sfxExplosion() {
  // Cluster bomb — softer, less harsh
  playTone(50, 0.15, 'sine', 0.05);
  playNoise(0.2, 0.04, { type: 'lowpass', freq: 400 });
}

export function sfxImpactLight() {
  playNoise(0.05, 0.09, { type: 'lowpass', freq: 250 + Math.random() * 300 });
  playTone(120 + Math.random() * 80, 0.04, 'sine', 0.06);
}

export function sfxImpactHeavy() {
  playTone(45, 0.18, 'sine', 0.14);
  playNoise(0.14, 0.10, { type: 'lowpass', freq: 200 });
}

export function sfxPickup() {
  playTone(500, 0.06, 'sine', 0.08);
  setTimeout(() => playTone(700, 0.06, 'sine', 0.08), 50);
  setTimeout(() => playTone(900, 0.05, 'sine', 0.06), 100);
  setTimeout(() => playTone(1100, 0.04, 'sine', 0.05), 150);
}

export function sfxDamage() {
  playTone(120, 0.2, 'sawtooth', 0.12);
  playNoise(0.15, 0.08, { type: 'lowpass', freq: 1500 });
}

export function sfxDash() {
  playTone(300, 0.08, 'triangle', 0.06);
  playNoise(0.1, 0.04, { type: 'highpass', freq: 3000 });
}

export function sfxInterceptor() {
  playTone(1200, 0.05, 'square', 0.06);
  setTimeout(() => playTone(800, 0.1, 'square', 0.05), 40);
  setTimeout(() => sfxExplosion(), 100);
}

export function sfxFootstep() {
  playNoise(0.04, 0.02, { type: 'lowpass', freq: 600 });
}

export function sfxWarning() {
  playTone(800, 0.08, 'sine', 0.03);
  setTimeout(() => playTone(1000, 0.06, 'sine', 0.02), 80);
}

export function sfxSlowmo() {
  playTone(150, 0.6, 'sine', 0.1);
  playTone(100, 0.8, 'sine', 0.06);
}

export function sfxMagnet() {
  playTone(400, 0.15, 'sawtooth', 0.06);
  setTimeout(() => playTone(500, 0.12, 'sawtooth', 0.05), 60);
  setTimeout(() => playTone(600, 0.1, 'sawtooth', 0.04), 120);
}

export function sfxAirstrike() {
  playTone(1200, 0.1, 'sine', 0.08);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.06), 100);
  setTimeout(() => sfxExplosion(), 200);
  setTimeout(() => sfxExplosion(), 350);
  setTimeout(() => sfxExplosion(), 500);
}

export function sfxThunder() {
  playNoise(0.8, 0.15, { type: 'lowpass', freq: 200 });
  playTone(30, 0.6, 'sine', 0.1);
  setTimeout(() => playNoise(0.5, 0.08, { type: 'lowpass', freq: 150 }), 200);
}

export function sfxBossSiren() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
  osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 1.5);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
}

export function sfxBossExplosion() {
  playTone(30, 0.8, 'sawtooth', 0.15);
  playTone(50, 0.6, 'sine', 0.12);
  playNoise(0.8, 0.15, { type: 'lowpass', freq: 500 });
  setTimeout(() => { playNoise(0.5, 0.1, { type: 'lowpass', freq: 300 }); playTone(25, 0.5, 'sine', 0.08); }, 200);
  setTimeout(() => playNoise(0.4, 0.06, { type: 'bandpass', freq: 1000 }), 400);
}

