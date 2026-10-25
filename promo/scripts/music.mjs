// Composes Docket's background track from scratch: every sound is synthesized here (no samples, no
// third-party audio), so the track is royalty-free by construction. Writes a 44.1 kHz stereo WAV;
// scripts/music.sh masters it to public/music.mp3.
//
// 120 bpm, one bar = 2 s = 60 video frames. src/timeline.ts sizes every scene to whole bars, so each
// scene change lands on a bar line below:
//   bar  0  hook        filtered chords, the question on screen
//   bar  2  logo lands  impact, then a riser and snare roll build for two bars
//   bar  4  Today       DROP 1: four-on-the-floor, offbeat bass, pumping chords (to bar 24)
//   bar 24  Friends     DROP 2: fuller, adds a simple lead hook (to bar 47)
//   bar 47  nationwide  breakdown: drums out, pad and sub, an impact on the count
//   bar 50  privacy     build: half-time kick, riser, snare roll, a beat of silence
//   bar 54  end card    FINAL DROP for two bars, then the last chord rings out to bar 58
// Smaller transitions (bars 7, 13, 19, 32, 37, 42) get a crash and a one-bar fill before them.
// Usage: node scripts/music.mjs <seconds> <out.wav>
import { writeFileSync } from 'node:fs';

const SECONDS = Number(process.argv[2] ?? 116);
const OUT = process.argv[3] ?? 'out/music-raw.wav';
const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.ceil(SECONDS * SR);
const TAU = Math.PI * 2;

const DROP1 = 4;
const DROP2 = 24;
const BREAK = 47;
const BUILD = 50;
const FINAL = 54;
const END = 58;
const CUTS = [7, 13, 19, 32, 37, 42];

// Buses. Chords and pad are filtered and pumped together; everything else is mixed dry, with sends to
// a reverb and (lead only) a ping-pong delay.
const mk = () => [new Float32Array(N), new Float32Array(N)];
const dry = mk();
const synth = mk();
const verb = mk();
const echo = mk();
const kicks = [];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 2024;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** Writes fn(t) into a bus with equal-power pan, a click-free tail, and optional sends. */
function voice(bus, start, len, pan, fn, sends = {}) {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = Math.cos(a);
  const gr = Math.sin(a);
  const s0 = Math.max(0, Math.round(start * SR));
  const s1 = Math.min(N, s0 + Math.round(len * SR));
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR) * Math.min(1, (s1 - i) / (0.02 * SR));
    const l = v * gl;
    const r = v * gr;
    bus[0][i] += l;
    bus[1][i] += r;
    if (sends.verb) {
      verb[0][i] += l * sends.verb;
      verb[1][i] += r * sends.verb;
    }
    if (sends.echo) {
      echo[0][i] += l * sends.echo;
      echo[1][i] += r * sends.echo;
    }
  }
}

/** Band-limited sawtooth via polyBLEP, so detuned stacks stay clean. */
function sawOsc(freq) {
  let ph = Math.random();
  const dt = freq / SR;
  return () => {
    ph += dt;
    if (ph >= 1) ph -= 1;
    let v = 2 * ph - 1;
    if (ph < dt) {
      const x = ph / dt;
      v -= x + x - x * x - 1;
    } else if (ph > 1 - dt) {
      const x = (ph - 1) / dt;
      v -= x * x + x + x + 1;
    }
    return v;
  };
}

// ---------- Instruments ----------

/** Supersaw chord: five detuned saws per note, into the synth bus (filtered and pumped later). */
function chord(start, len, notes, vel, attack = 0.01, release = 0.25) {
  for (const m of notes) {
    [-0.011, -0.005, 0, 0.005, 0.011].forEach((d, k) => {
      const osc = sawOsc(hz(m) * (1 + d));
      const pan = (k - 2) * 0.32;
      voice(synth, start, len + release, pan, (t) => {
        const env = Math.min(1, t / attack) * (t > len ? Math.max(0, 1 - (t - len) / release) : 1);
        return (vel * env * osc()) / 5;
      }, { verb: 0.25 });
    });
  }
}

/** Soft pad: sines with slow swell, also on the synth bus. */
function pad(start, len, notes, vel) {
  for (const m of notes) {
    const f = hz(m);
    voice(synth, start, len + 1.5, 0, (t) => {
      const env = Math.min(1, t / 1.2) * (t > len ? Math.max(0, 1 - (t - len) / 1.5) : 1);
      return vel * env * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.004 * t) + 0.2 * Math.sin(TAU * 2 * f * t));
    }, { verb: 0.4 });
  }
}

/** Sub bass: sine plus a little second harmonic, short and round so it bounces off the kick. */
function bass(start, midi, vel, len) {
  const f = hz(midi);
  voice(dry, start, len + 0.06, 0, (t) => {
    const env = Math.min(1, t / 0.006) * (t > len ? Math.exp(-(t - len) / 0.03) : 1) * (0.75 + 0.25 * Math.exp(-t / 0.15));
    return vel * Math.tanh(1.4 * env * (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)));
  });
}

/** Punchy kick: pitch sweep 150 to 48 Hz, a click on top, soft clipped. */
function kick(start, vel) {
  kicks.push(start);
  let ph = 0;
  voice(dry, start, 0.5, 0, (t) => {
    const f = 48 + 102 * Math.exp(-t / 0.03);
    ph += (TAU * f) / SR;
    const click = 0.25 * Math.exp(-t / 0.002) * rand();
    return vel * Math.tanh(2.2 * Math.exp(-t / 0.22) * Math.sin(ph) + click);
  });
}

/** Clap and snare layered: band-passed noise bursts plus a 190 Hz body. */
function clap(start, vel) {
  let a = 0;
  let b = 0;
  voice(dry, start, 0.4, 0.04, (t) => {
    const n = rand();
    a += (n - a) * 0.55;
    b += (a - b) * 0.09;
    const burst = t < 0.024 ? 0.55 + 0.45 * Math.cos(TAU * 125 * t) : 1;
    const noise = burst * Math.exp(-t / 0.085) * (a - b) * 1.6;
    const body = 0.45 * Math.exp(-t / 0.045) * Math.sin(TAU * 190 * t);
    return vel * (noise + body);
  }, { verb: 0.35 });
}

function snareHit(start, vel) {
  let a = 0;
  voice(dry, start, 0.16, 0.08, (t) => {
    const n = rand();
    a += (n - a) * 0.6;
    return vel * (Math.exp(-t / 0.05) * (n - a) * 1.4 + 0.4 * Math.exp(-t / 0.03) * Math.sin(TAU * 210 * t));
  }, { verb: 0.25 });
}

/** Hats: high-passed noise; open ones ring longer. */
function hat(start, vel, open, pan) {
  let lp = 0;
  voice(dry, start, open ? 0.3 : 0.07, pan, (t) => {
    const n = rand();
    lp += (n - lp) * 0.22;
    return vel * Math.exp(-t / (open ? 0.11 : 0.016)) * (n - lp);
  }, { verb: 0.08 });
}

/** Crash: long bright noise with shimmer, for scene changes. */
function crash(start, vel) {
  let lp = 0;
  voice(dry, start, 2.6, 0.2, (t) => {
    const n = rand();
    lp += (n - lp) * 0.12;
    return vel * Math.exp(-t / 0.75) * (n - lp) * (1 + 0.3 * Math.sin(TAU * 7 * t));
  }, { verb: 0.5 });
}

/** Impact: a deep boom with a noise hit, for the logo, the breakdown and the final drop. */
function impact(start, vel) {
  let ph = 0;
  voice(dry, start, 3, 0, (t) => {
    const f = 32 + 70 * Math.exp(-t / 0.12);
    ph += (TAU * f) / SR;
    return vel * (Math.tanh(1.8 * Math.exp(-t / 0.9) * Math.sin(ph)) + 0.35 * Math.exp(-t / 0.12) * rand());
  }, { verb: 0.6 });
}

/** Riser: noise through a rising band plus an upward sine sweep, swelling into the drop. */
function riser(start, len, vel) {
  let lo = 0;
  let hi = 0;
  let ph = 0;
  voice(dry, start, len, 0, (t) => {
    const p = t / len;
    const n = rand();
    const cut = 0.02 + 0.5 * p * p;
    lo += (n - lo) * cut;
    hi += (lo - hi) * 0.02;
    ph += (TAU * (180 + 1400 * p * p)) / SR;
    return vel * p * p * ((lo - hi) * 1.3 + 0.18 * Math.sin(ph));
  }, { verb: 0.4 });
}

/** Reverse cymbal: a swell that cuts off right on the downbeat. */
function swell(end, len, vel) {
  let lp = 0;
  voice(dry, end - len, len, -0.2, (t) => {
    const n = rand();
    lp += (n - lp) * 0.15;
    return vel * (t / len) ** 3 * (n - lp);
  }, { verb: 0.2 });
}

/** Downlifter: a falling noise whoosh after a scene change. */
function whoosh(start, vel) {
  let lp = 0;
  voice(dry, start, 1.2, 0.3, (t) => {
    const n = rand();
    lp += (n - lp) * (0.4 - 0.33 * (t / 1.2));
    return vel * Math.exp(-t / 0.4) * lp;
  }, { verb: 0.3 });
}

/** Lead: a soft square-ish voice with delayed vibrato. Used sparingly, never as an arpeggio. */
function lead(start, midi, len, vel) {
  const f = hz(midi);
  voice(dry, start, len + 0.3, 0.1, (t) => {
    const vib = 1 + 0.004 * Math.min(1, t / 0.35) * Math.sin(TAU * 5.2 * t);
    const x = TAU * f * vib * t;
    const env = Math.min(1, t / 0.02) * (t > len ? Math.exp(-(t - len) / 0.12) : 1) * (0.85 + 0.15 * Math.exp(-t / 0.3));
    return vel * env * (Math.sin(x) + 0.3 * Math.sin(3 * x) + 0.12 * Math.sin(5 * x));
  }, { verb: 0.3, echo: 0.35 });
}

// ---------- Harmony ----------

// vi - IV - I - V in C (Am, F, C, G): lifting and anthemic for the drops.
const PROG = [
  { root: 45, notes: [57, 60, 64, 69] },
  { root: 41, notes: [57, 60, 65, 69] },
  { root: 48, notes: [55, 60, 64, 67] },
  { root: 43, notes: [55, 59, 62, 67] },
];
// Quieter colors for the intro and breakdown: Fmaj7 and Am7.
const SOFT = [
  { root: 41, notes: [53, 57, 60, 64] },
  { root: 45, notes: [52, 57, 60, 67] },
];
// The lead hook: [beat within a 4-bar phrase, midi, beats]. Long notes, call and answer.
const HOOK = [
  [0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 2],
  [4, 72, 1], [5, 74, 1], [6, 77, 2],
  [8, 76, 1.5], [9.5, 74, 0.5], [10, 72, 1.5], [11.5, 69, 0.5],
  [12, 71, 3],
];

// ---------- Arrangement ----------

const at = (bar, beat = 0) => (bar + beat / 4) * BAR;

for (let b = 0; b < END; b++) {
  const t0 = at(b);
  const c = PROG[b % 4];
  const drop1 = b >= DROP1 && b < DROP2;
  const drop2 = b >= DROP2 && b < BREAK;
  const final = b >= FINAL && b < FINAL + 2;
  const groove = drop1 || drop2 || final;

  if (b < DROP1) {
    // Intro: soft chords, then the build after the logo lands.
    const s = SOFT[b % 2];
    pad(t0, BAR, s.notes, 0.05);
    if (b >= 2) chord(t0, BAR - 0.05, s.notes, 0.07, 0.4);
    if (b >= 2) bass(t0, s.root - 12, 0.22, BAR * 0.95);
  } else if (groove) {
    // Pumping chords: hits on every beat, ducked by the kick bus so they breathe.
    for (let k = 0; k < 4; k++) chord(t0 + k * BEAT, BEAT * 0.9, c.notes, drop2 || final ? 0.1 : 0.068);
    pad(t0, BAR, c.notes.map((m) => m - 12), 0.03);
    // Offbeat bass: the classic house bounce.
    for (let k = 0; k < 4; k++) bass(t0 + k * BEAT + BEAT / 2, c.root - 12, drop1 ? 0.26 : 0.31, BEAT * 0.42);
    // Drums.
    for (let k = 0; k < 4; k++) kick(t0 + k * BEAT, 0.62);
    clap(t0 + BEAT, 0.3);
    clap(t0 + 3 * BEAT, 0.3);
    for (let k = 0; k < 4; k++) {
      hat(t0 + k * BEAT + BEAT / 2, drop1 ? 0.07 : 0.09, true, 0.35);
      if (drop2 || final) hat(t0 + k * BEAT + BEAT / 4, 0.045, false, -0.4);
      if (drop2 || final) hat(t0 + k * BEAT + (3 * BEAT) / 4, 0.045, false, -0.4);
    }
    // Lead hook, only in the second drop, every other phrase so it never nags.
    if (drop2 && Math.floor((b - DROP2) / 4) % 2 === 0 && (b - DROP2) % 4 === 0) {
      for (const [beat, m, len] of HOOK) lead(t0 + beat * BEAT, m, len * BEAT * 0.95, 0.055);
    }
  } else if (b >= BREAK && b < BUILD) {
    // Breakdown: drums out, warm pad and long sub notes.
    const s = SOFT[(b - BREAK) % 2];
    pad(t0, BAR, s.notes, 0.06);
    chord(t0, BAR - 0.05, s.notes, 0.05, 0.6, 0.6);
    bass(t0, s.root - 12, 0.2, BAR * 0.95);
  } else if (b >= BUILD && b < FINAL) {
    // Build: chords on every beat with a filter sweep, half-time kick, then a full kick run.
    for (let k = 0; k < 4; k++) chord(t0 + k * BEAT, BEAT * 0.85, c.notes, 0.075);
    bass(t0, c.root - 12, 0.24, BAR * 0.9);
    kick(t0, 0.5);
    if (b >= FINAL - 2) kick(t0 + 2 * BEAT, 0.5);
  } else if (b >= FINAL + 2) {
    // Outro: one bright C chord rings out.
    if (b === FINAL + 2) {
      chord(t0, BAR * 2.2, [55, 60, 64, 67, 72], 0.08, 0.02, 1.8);
      pad(t0, BAR * 2.5, [48, 55, 64], 0.06);
      bass(t0, 36, 0.28, BAR * 1.6);
      crash(t0, 0.09);
    }
  }
}

// Logo impact and the first build.
impact(at(2), 0.5);
riser(at(2), 2 * BAR, 0.32);
swell(at(DROP1), BEAT * 2, 0.22);
for (let i = 0; i < 16; i++) snareHit(at(3) + i * (BEAT / 4), 0.04 + 0.12 * (i / 15));

// Drops land with a crash and impact.
for (const b of [DROP1, DROP2, FINAL]) {
  crash(at(b), 0.22);
  impact(at(b), b === FINAL ? 0.55 : 0.35);
}

// Smaller scene changes: a one-bar snare fill before, a crash and a whoosh on the cut.
for (const b of CUTS) {
  for (let i = 0; i < 4; i++) snareHit(at(b - 1, 2) + i * (BEAT / 2), 0.05 + 0.03 * i);
  crash(at(b), 0.13);
  whoosh(at(b), 0.12);
}
// Drop 2 gets a bigger fill and a swell.
for (let i = 0; i < 8; i++) snareHit(at(DROP2 - 1, 2) + i * (BEAT / 4), 0.06 + 0.1 * (i / 7));
swell(at(DROP2), BEAT * 2, 0.2);

// Breakdown: an impact on the cut.
impact(at(BREAK), 0.42);
whoosh(at(BREAK), 0.14);

// Final build: riser, snare roll speeding up, then one beat of near-silence before the drop.
riser(at(BUILD), 4 * BAR - BEAT, 0.34);
for (let i = 0; i < 8; i++) snareHit(at(BUILD + 2) + i * (BEAT / 2), 0.05 + 0.04 * (i / 7));
for (let i = 0; i < 12; i++) snareHit(at(BUILD + 3) + i * (BEAT / 4), 0.09 + 0.08 * (i / 11));
swell(at(FINAL), BEAT * 1.5, 0.24);
// The "gap": clear out the moment before each drop so it hits. A full beat before the final drop,
// half a beat before the other two.
function gap(bar, beats) {
  const g0 = Math.round((at(bar) - beats * BEAT) * SR);
  const g1 = Math.round(at(bar) * SR);
  for (const bus of [dry, synth]) {
    for (let i = g0; i < g1; i++) {
      const fade = Math.max(0, 1 - (i - g0) / (0.05 * SR));
      bus[0][i] *= fade;
      bus[1][i] *= fade;
    }
  }
}
gap(DROP1, 0.5);
gap(DROP2, 0.5);
gap(FINAL, 1);

// ---------- Synth bus: filter automation and kick sidechain ----------

{
  // TPT state-variable low-pass: closed in the intro and breakdown, sweeping open through builds.
  const st = [
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ];
  const sorted = kicks.map((t) => Math.round(t * SR)).sort((x, y) => x - y);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const bar = t / BAR;
    let cutoff;
    if (bar < 2) cutoff = 500 + 300 * (bar / 2);
    else if (bar < DROP1) cutoff = 800 + 5200 * ((bar - 2) / 2) ** 2;
    else if (bar < BREAK) cutoff = bar < DROP2 ? 4200 : 6000;
    else if (bar < BUILD) cutoff = 700;
    else if (bar < FINAL) cutoff = 700 + 6300 * ((bar - BUILD) / 4) ** 2;
    else if (bar < FINAL + 2) cutoff = 7000;
    else cutoff = 7000 - 5500 * Math.min(1, (bar - FINAL - 2) / 2);
    const g = Math.tan((Math.PI * Math.min(cutoff, 16000)) / SR);
    const q = 0.9;
    const a1 = 1 / (1 + g * (g + q));
    while (k + 1 < sorted.length && sorted[k + 1] <= i) k++;
    const since = sorted.length && sorted[k] <= i ? (i - sorted[k]) / SR : 9;
    const pump = 1 - 0.62 * Math.exp(-since / 0.11);
    for (let ch = 0; ch < 2; ch++) {
      const s = st[ch];
      const v1 = a1 * (s.a + g * (synth[ch][i] - s.b));
      const v2 = s.b + g * v1;
      s.a = 2 * v1 - s.a;
      s.b = 2 * v2 - s.b;
      dry[ch][i] += v2 * pump;
    }
  }
}

// ---------- Effects: ping-pong delay for the lead, Schroeder reverb ----------

{
  const d = Math.round(BEAT * 0.75 * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const outL = bl[j];
    const outR = br[j];
    bl[j] = echo[0][i] + outR * 0.4;
    br[j] = echo[1][i] * 0.0 + outL * 0.4;
    j = (j + 1) % d;
    dry[0][i] += outL * 0.6;
    dry[1][i] += outR * 0.6;
  }
}

function reverb(input, offset) {
  const out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  for (let n = 0; n < N; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = input[n] + c.lp * 0.82;
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
const wetL = reverb(verb[0], 0);
const wetR = reverb(verb[1], 23);

// ---------- Mix and export ----------

const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, SECONDS - t) / 3);
  L[i] = Math.tanh((dry[0][i] + wetL[i] * 0.8) * 1.1) * fade;
  R[i] = Math.tanh((dry[1][i] + wetR[i] * 0.8) * 1.1) * fade;
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
console.log(`${OUT}: ${SECONDS}s at ${BPM} bpm, ${END} bars`);
