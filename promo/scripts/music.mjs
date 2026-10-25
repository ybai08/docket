// Composes Docket's background track from scratch: every sound is synthesized here (no samples, no
// third-party audio), so the track is royalty-free by construction. Writes a 44.1 kHz stereo WAV;
// scripts/music.sh masters it to public/music.mp3.
//
// Arrangement, timed to the video at 100 bpm (one bar = 2.4 s):
//   bars 0-2    intro      pad swell + electric piano plays the motif (the hook)
//   bars 3-18   groove A   keys, bass, soft kick and hats come in as the app appears
//   bars 19-37  groove B   + bell melody and a light clap, the pad opens up
//   bars 38-41  breakdown  drums drop out under the nationwide / privacy beats
//   bars 42-43  lift       everything back for the end card
//   bars 44+    outro      one resolving chord rings out to the end
// Usage: node scripts/music.mjs <seconds> <out.wav>
import { writeFileSync } from 'node:fs';

const SECONDS = Number(process.argv[2] ?? 112.5);
const OUT = process.argv[3] ?? 'out/music-raw.wav';
const SR = 44100;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.ceil(SECONDS * SR);
const TAU = Math.PI * 2;

// Dry stereo bus, a reverb send, and a pad bus that gets filtered and ducked before mixing.
const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);
const padL = new Float32Array(N);
const padR = new Float32Array(N);
const kickTimes = [];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** Writes fn(t) into the given buses with equal-power pan and an optional reverb send. */
function voice(start, len, pan, send, fn, busL = dryL, busR = dryR) {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = Math.cos(a);
  const gr = Math.sin(a);
  const s0 = Math.max(0, Math.round(start * SR));
  const s1 = Math.min(N, s0 + Math.round(len * SR));
  for (let i = s0; i < s1; i++) {
    // A 30 ms fade at the end of every note so nothing is cut off with a click.
    const v = fn((i - s0) / SR) * Math.min(1, (s1 - i) / (0.03 * SR));
    busL[i] += v * gl;
    busR[i] += v * gr;
    if (send) {
      sendL[i] += v * gl * send;
      sendR[i] += v * gr * send;
    }
  }
}

// ---------- Instruments ----------

/** Electric piano: two-operator FM with a bright attack that mellows, plus a soft tine. */
function keys(start, midi, vel, len = 1.6, pan = 0) {
  const f = hz(midi);
  voice(start, len + 1.2, pan, 0.35, (t) => {
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 1.1) * (t > len ? Math.exp(-(t - len) / 0.18) : 1);
    const index = 1.1 * Math.exp(-t / 0.22) + 0.25;
    const body = Math.sin(TAU * f * t + index * Math.sin(TAU * f * t));
    const tine = 0.06 * Math.exp(-t / 0.035) * Math.sin(TAU * f * 7 * t);
    const trem = 1 + 0.06 * Math.sin(TAU * 4.5 * t);
    return vel * env * (body + tine) * trem;
  });
}

/** Bell / glockenspiel: inharmonic FM (ratio 3.5) that rings. */
function bell(start, midi, vel, pan = 0.25) {
  const f = hz(midi);
  voice(start, 3.2, pan, 0.55, (t) => {
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 1.15);
    const index = 2.2 * Math.exp(-t / 0.35);
    return vel * env * Math.sin(TAU * f * t + index * Math.sin(TAU * f * 3.5 * t));
  });
}

/** Warm pad: three detuned band-limited saws per note, swelling in; filtered later. */
function pad(start, len, midi, vel) {
  const f = hz(midi);
  const detune = [-0.004, 0, 0.0045];
  const pans = [-0.55, 0, 0.55];
  detune.forEach((d, k) => {
    const ff = f * (1 + d);
    const phase = k * 1.7;
    voice(
      start,
      len + 1.5,
      pans[k],
      0.5,
      (t) => {
        const env = Math.min(1, t / 1.1) * (t > len ? Math.max(0, 1 - (t - len) / 1.5) : 1);
        let saw = 0;
        for (let h = 1; h <= 7; h++) saw += Math.sin(TAU * ff * h * t + phase * h) / h;
        return (vel * env * saw) / 3;
      },
      padL,
      padR,
    );
  });
}

/** Round bass: sine with a touch of second harmonic and soft saturation. */
function bass(start, midi, vel, len) {
  const f = hz(midi);
  voice(start, len + 0.12, 0, 0, (t) => {
    const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.9) * (t > len ? Math.exp(-(t - len) / 0.04) : 1);
    return vel * Math.tanh(1.6 * env * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)));
  });
}

/** Soft kick: a pitch-swept sine. */
function kick(start, vel) {
  kickTimes.push(start);
  let phase = 0;
  voice(start, 0.45, 0, 0, (t) => {
    const f = 46 + 90 * Math.exp(-t / 0.035);
    phase += (TAU * f) / SR;
    return vel * Math.exp(-t / 0.2) * Math.sin(phase);
  });
}

/** Light clap: a few quick noise bursts through a band-pass, with room. */
function clap(start, vel) {
  let lp1 = 0;
  let lp2 = 0;
  voice(start, 0.35, 0.05, 0.6, (t) => {
    const n = rand();
    lp1 += (n - lp1) * 0.5;
    lp2 += (lp1 - lp2) * 0.08;
    const band = lp1 - lp2;
    const bursts = t < 0.03 ? 0.6 + 0.4 * Math.sin(TAU * 90 * t) : 1;
    return vel * bursts * Math.exp(-t / 0.07) * band;
  });
}

/** Closed hat: high-passed noise, very short. */
function hat(start, vel, pan) {
  let lp = 0;
  voice(start, 0.08, pan, 0.08, (t) => {
    const n = rand();
    lp += (n - lp) * 0.3;
    return vel * Math.exp(-t / 0.018) * (n - lp);
  });
}

// ---------- Harmony and melody ----------

// IV - V - iii - vi in C: Fmaj9, G6, Em9, Am9. Bright but unresolved, so it loops cleanly.
const CHORDS = [
  { bass: 41, keys: [57, 60, 64, 67], pad: [53, 60, 64, 69] },
  { bass: 43, keys: [59, 62, 64, 67], pad: [55, 59, 64, 71] },
  { bass: 40, keys: [55, 59, 62, 66], pad: [52, 59, 62, 67] },
  { bass: 45, keys: [55, 59, 60, 64], pad: [57, 60, 64, 67] },
];
const FINAL = { bass: 36, keys: [52, 55, 59, 62], pad: [48, 55, 59, 64] }; // Cmaj9 to close.

// The motif: one phrase per chord, [beat, midi, beats long].
const MOTIF = [
  [[0, 81, 1], [1, 84, 1], [2, 88, 2]],
  [[0, 86, 1], [1, 83, 1], [2, 79, 2]],
  [[0, 79, 1], [1, 83, 1], [2, 88, 1], [3, 86, 1]],
  [[0, 84, 2.5], [3, 81, 1]],
];

const swing = (eighth) => (eighth % 2 ? BEAT * 0.06 : 0); // a little lilt on the off-beats
const human = (i) => ((i * 7919) % 13) * 0.0012; // tiny timing drift so it doesn't sound robotic

const totalBars = Math.ceil(SECONDS / BAR);
for (let b = 0; b < totalBars; b++) {
  const t0 = b * BAR;
  const intro = b <= 2;
  const grooveA = b >= 3 && b <= 18;
  const grooveB = b >= 19 && b <= 37;
  const breakdown = b >= 38 && b <= 41;
  const lift = b >= 42 && b <= 43;
  const outro = b >= 44;
  if (outro) continue;
  const c = CHORDS[b % 4];

  // Pad under everything; it opens up in B.
  for (const m of c.pad) pad(t0, BAR, m, grooveB || lift ? 0.05 : 0.04);

  // Electric piano: the motif in the intro, then syncopated chord stabs.
  if (intro) {
    for (const [beat, m, len] of MOTIF[b % 4]) keys(t0 + beat * BEAT, m - 12, 0.22, len * BEAT, 0.1);
  } else {
    const stabs = breakdown ? [[0, 3.5]] : [[0, 1.4], [1.5, 0.9], [3, 0.8]];
    stabs.forEach(([beat, len], k) => {
      c.keys.forEach((m, j) => keys(t0 + beat * BEAT + j * 0.008 + human(b * 4 + k), m, (k ? 0.075 : 0.1) * (breakdown ? 0.9 : 1), len * BEAT, (j - 1.5) * 0.15));
    });
  }

  // Bass: root on 1, a push on the "and" of 2, and the fifth on 4.
  if (grooveA || grooveB || lift) {
    bass(t0, c.bass, 0.32, BEAT * 1.4);
    bass(t0 + 1.5 * BEAT, c.bass, 0.22, BEAT * 0.45);
    bass(t0 + 3 * BEAT, c.bass + 7, 0.2, BEAT * 0.8);
  } else if (breakdown) {
    bass(t0, c.bass, 0.24, BAR * 0.9);
  }

  // Drums.
  if (grooveA || grooveB || lift) {
    kick(t0, 0.5);
    kick(t0 + 2 * BEAT, 0.42);
    if (grooveB) kick(t0 + 2.5 * BEAT, 0.22);
    for (let e = 0; e < 8; e++) hat(t0 + e * (BEAT / 2) + swing(e) + human(b * 8 + e), e % 2 ? 0.07 : 0.04, 0.4);
  }
  if (grooveB || lift) {
    clap(t0 + BEAT, 0.18);
    clap(t0 + 3 * BEAT, 0.18);
  }

  // Bell melody: the motif an octave up, in B, the breakdown and the lift.
  if (grooveB || breakdown || lift) {
    for (const [beat, m] of MOTIF[b % 4]) bell(t0 + beat * BEAT + human(b * 3 + beat), m, 0.11);
  }
}

// Outro: resolve to Cmaj9 and let it ring, with the motif's first notes on bell.
{
  const t0 = 44 * BAR;
  for (const m of FINAL.pad) pad(t0, SECONDS - t0 - 1.5, m, 0.05);
  FINAL.keys.forEach((m, j) => keys(t0 + j * 0.03, m, 0.1, 4, (j - 1.5) * 0.2));
  bass(t0, FINAL.bass, 0.28, 3.5);
  [[0, 79], [0.75, 84], [1.5, 88], [3, 91]].forEach(([beat, m]) => bell(t0 + beat * BEAT, m, 0.1));
}

// ---------- Pad filter and sidechain ----------

// A one-pole low-pass that slowly breathes, then a gentle duck on each kick.
{
  let yl = 0;
  let yr = 0;
  let k = 0;
  const kicks = kickTimes.map((t) => Math.round(t * SR)).sort((a, b) => a - b);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const bar = t / BAR;
    const open = bar >= 19 && bar < 38 ? 1 : bar >= 42 ? 0.85 : 0.55;
    const cutoff = 650 + 1500 * open + 300 * Math.sin(TAU * t * 0.06);
    const a = 1 - Math.exp((-TAU * cutoff) / SR);
    yl += (padL[i] - yl) * a;
    yr += (padR[i] - yr) * a;
    while (k + 1 < kicks.length && kicks[k + 1] <= i) k++;
    const since = kicks.length && kicks[k] <= i ? (i - kicks[k]) / SR : 9;
    const duck = 1 - 0.35 * Math.exp(-since / 0.14);
    dryL[i] += yl * duck;
    dryR[i] += yr * duck;
  }
}

// ---------- Reverb (Schroeder: parallel damped combs into series all-passes) ----------

function reverb(input, offset) {
  const out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  for (let n = 0; n < N; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.72 + c.lp * 0.28;
      c.buf[c.i] = input[n] + c.lp * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    let x = acc / combs.length;
    for (const a of aps) {
      const y = a.buf[a.i];
      const v = x + y * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      x = y - v * 0.5;
    }
    out[n] = x;
  }
  return out;
}
const wetL = reverb(sendL, 0);
const wetR = reverb(sendR, 23);

// ---------- Mix, fades and export ----------

const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 1.5) * Math.min(1, Math.max(0, SECONDS - t) / 5);
  L[i] = (dryL[i] + wetL[i] * 0.9) * fade;
  R[i] = (dryR[i] + wetR[i] * 0.9) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = peak > 0 ? 0.89 / peak : 1;
const data = Buffer.alloc(N * 4);
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
console.log(`${OUT}: ${SECONDS}s, ${totalBars} bars at ${BPM} bpm`);
