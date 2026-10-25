// Composes Docket's background track from scratch (no samples, no third-party audio), so it is
// royalty-free by construction. Writes a 44.1 kHz stereo WAV; scripts/music.sh polishes it to MP3.
// Usage: node scripts/music.mjs <seconds> <out.wav>
import { writeFileSync } from 'node:fs';

const SECONDS = Number(process.argv[2] ?? 124);
const OUT = process.argv[3] ?? 'out/music-raw.wav';
const SR = 44100;
const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.ceil(SECONDS * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Cmaj7, Am7, Fmaj7, G6: warm and unresolved, so it loops without a seam.
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 71] },
  { root: 45, tones: [57, 60, 64, 67] },
  { root: 41, tones: [57, 60, 65, 69] },
  { root: 43, tones: [59, 62, 67, 69] },
];

function add(buf, start, len, fn) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, s0 + Math.floor(len * SR));
  for (let i = s0; i < s1; i++) buf[i] += fn((i - s0) / SR);
}

function both(start, len, pan, fn) {
  // pan -1..1, equal-power.
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a);
  const gr = Math.sin(a);
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, s0 + Math.floor(len * SR));
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}

/** Soft pad: two slightly detuned sines per tone with a slow swell. */
function pad(start, len, midi, amp) {
  const f = hz(midi);
  const attack = 0.9;
  const release = 1.2;
  both(start, len + release, 0, (t) => {
    const env = Math.min(1, t / attack) * (t > len ? Math.max(0, 1 - (t - len) / release) : 1);
    const w = Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * (f * 1.003) * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t);
    return (amp * env * w) / 2.25;
  });
}

/** Plucked note: bright attack that mellows as it decays. */
function pluck(start, midi, amp, pan) {
  const f = hz(midi);
  both(start, 1.4, pan, (t) => {
    const env = Math.exp(-t / 0.32) * Math.min(1, t / 0.004);
    const bright = Math.exp(-t / 0.08);
    return amp * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * bright * Math.sin(2 * Math.PI * 2 * f * t) + 0.12 * bright * Math.sin(2 * Math.PI * 3 * f * t));
  });
}

function bass(start, midi, amp) {
  const f = hz(midi);
  both(start, 1.6, 0, (t) => amp * Math.exp(-t / 0.55) * Math.min(1, t / 0.01) * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * 2 * f * t)));
}

/** A whisper of shaker: short filtered noise. */
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function shaker(start, amp, pan) {
  let lp = 0;
  both(start, 0.09, pan, (t) => {
    lp += (rand() - lp) * 0.35;
    return amp * Math.exp(-t / 0.025) * (rand() - lp);
  });
}

const bars = Math.ceil(SECONDS / BAR);
// Arpeggio pattern over the chord's four tones, an octave up, in eighths.
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
for (let b = 0; b < bars; b++) {
  const c = CHORDS[b % 4];
  const t0 = b * BAR;
  const last = b === bars - 1;
  for (const m of c.tones) pad(t0, BAR, m, 0.05);
  if (b >= 2) {
    // Bass on beats 1 and 3 once the hook is over.
    bass(t0, c.root, 0.16);
    bass(t0 + 2 * BEAT, c.root, 0.11);
  }
  if (b >= 2 && !last) {
    ARP.forEach((k, i) => {
      const note = c.tones[k] + 12;
      // A little humanized timing and velocity.
      const jitter = ((i * 37 + b * 11) % 7) * 0.002;
      pluck(t0 + i * (BEAT / 2) + jitter, note, i % 2 ? 0.045 : 0.06, i % 2 ? 0.35 : -0.35);
    });
  }
  if (b >= 4 && !last) {
    for (let i = 0; i < 8; i++) shaker(t0 + i * (BEAT / 2), i % 2 ? 0.05 : 0.025, 0.5);
  }
}

// Fade in over 2 s and out over the last 4 s.
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = Math.min(1, t / 2) * Math.min(1, (SECONDS - t) / 4);
  L[i] *= g;
  R[i] *= g;
}

// 16-bit WAV.
const data = Buffer.alloc(N * 4);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = peak > 0 ? 0.89 / peak : 1;
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`${OUT}: ${SECONDS}s, ${bars} bars at ${BPM} bpm`);
