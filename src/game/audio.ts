let audioCtx: AudioContext | null = null;
let ambientNode: AudioBufferSourceNode | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function resumeAudio() {
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
  // Layered: bass thump + crackle + debris
  playTone(60, 0.25, 'sawtooth', 0.12);
  playTone(40, 0.3, 'sine', 0.08);
  playNoise(0.35, 0.1, { type: 'lowpass', freq: 800 });
  setTimeout(() => playNoise(0.2, 0.05, { type: 'highpass', freq: 2000 }), 50);
  setTimeout(() => playNoise(0.15, 0.03, { type: 'bandpass', freq: 3000 }), 120);
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
