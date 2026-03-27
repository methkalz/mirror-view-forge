let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function resumeAudio() {
  if (audioCtx?.state === 'suspended') audioCtx.resume();
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.15) {
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

function playNoise(duration: number, vol = 0.1) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export function sfxExplosion() {
  playNoise(0.3, 0.12);
  playTone(80, 0.2, 'sawtooth', 0.1);
}

export function sfxPickup() {
  playTone(600, 0.08, 'square', 0.1);
  setTimeout(() => playTone(800, 0.08, 'square', 0.1), 60);
  setTimeout(() => playTone(1000, 0.06, 'square', 0.08), 120);
}

export function sfxDamage() {
  playTone(150, 0.15, 'sawtooth', 0.15);
  playNoise(0.1, 0.08);
}

export function sfxDash() {
  playTone(400, 0.1, 'triangle', 0.08);
}

export function sfxInterceptor() {
  playTone(1200, 0.05, 'square', 0.08);
  setTimeout(() => playTone(900, 0.1, 'square', 0.06), 50);
}
