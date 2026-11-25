import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SR = 48000;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const len = (dur) => Math.round(SR * dur);
const arr = (n, f) => Float64Array.from({ length: n }, (_, i) => f(i));
const add = (...xs) => arr(Math.max(...xs.map((x) => x.length)), (i) => xs.reduce((a, x) => a + (x[i] ?? 0), 0));
const mul = (x, y) => arr(x.length, (i) => x[i] * (typeof y === "number" ? y : y[i] ?? 0));
const peakNorm = (x) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return mul(x, 1 / (m || 1));
};

function white(n, r) {
  return arr(n, () => {
    const u = Math.max(r(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  });
}

function pink(n, r) {
  const w = white(n, r);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return peakNorm(arr(n, (i) => {
    const x = w[i];
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    return y;
  }));
}

function bandsweep(x, f0, f1, q = 1.6) {
  let low = 0;
  let band = 0;
  const damp = 1 / q;
  return peakNorm(arr(x.length, (i) => {
    const fc = f0 * Math.pow(f1 / f0, i / Math.max(1, x.length - 1));
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
    const high = x[i] - low - damp * band;
    band += f * high;
    low += f * band;
    return band;
  }));
}

function lowpass(x, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let acc = 0;
  return arr(x.length, (i) => (acc = (1 - a) * x[i] + a * acc));
}

const highpass = (x, fc) => {
  const l = lowpass(x, fc);
  return arr(x.length, (i) => x[i] - l[i]);
};

const decay = (n, tau) => arr(n, (i) => Math.exp(-i / (SR * tau)));

function env(n, attack, release, curve = 3) {
  const a = len(attack);
  const r = len(release);
  return arr(n, (i) => (i < a ? (i / a) ** 2 : 1) * (i >= n - r ? ((n - i) / r) ** curve : 1));
}

function sweep(dur, f0, f1) {
  const n = len(dur);
  let phase = 0;
  return arr(n, (i) => {
    phase += (2 * Math.PI * f0 * Math.pow(f1 / f0, i / Math.max(1, n - 1))) / SR;
    return Math.sin(phase);
  });
}

const tone = (dur, f, ph = 0) => arr(len(dur), (i) => Math.sin((2 * Math.PI * f * i) / SR + ph));
const ramp = (n, p = 1) => arr(n, (i) => (i / Math.max(1, n - 1)) ** p);

function stereo(mono, panFrom = 0, panTo = 0, width = 0) {
  const n = mono.length;
  const d = Math.max(1, Math.round(SR * 0.0007));
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = panFrom + ((panTo - panFrom) * i) / Math.max(1, n - 1);
    L[i] = mono[i] * Math.cos(((p + 1) * Math.PI) / 4);
    R[i] = mono[i] * Math.sin(((p + 1) * Math.PI) / 4);
  }
  if (width) for (let i = n - 1; i >= 0; i--) R[i] = (1 - width) * R[i] + width * (i >= d ? R[i - d] : 0);
  return [L, R];
}

function wav([L, R], peakDb = -1) {
  const n = L.length;
  const tail = len(0.004);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, peakDb / 20) / (m || 1);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const fade = i >= n - tail ? (n - i) / tail : 1;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * fade)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * fade)) * 32767), 46 + i * 4);
  }
  return buf;
}

function whoosh(r, dur, f0, f1, pan = [-0.7, 0.7], peakAt = 0.55) {
  const n = len(dur);
  const k = Math.floor(n * peakAt);
  const shape = arr(n, (i) => (i < k ? (i / k) ** 2.4 : ((n - i) / (n - k)) ** 1.6));
  const body = mul(bandsweep(pink(n, r), f0, f1, 2.2), shape);
  const air = mul(mul(highpass(pink(n, r), 4000), 0.12), shape);
  return stereo(add(body, air), pan[0], pan[1], 0.4);
}

const RECIPES = {
  whoosh: (r) => [whoosh(r, 0.42, 250, 3200)],
  "whoosh-left": (r) => [whoosh(r, 0.42, 250, 3200, [0.7, -0.7])],
  "whoosh-soft": (r) => [whoosh(r, 0.7, 160, 1400, [-0.3, 0.3], 0.6)],
  riser: (r) => {
    const n = len(0.9);
    return [stereo(add(mul(bandsweep(pink(n, r), 300, 6000, 3), ramp(n, 2.5)), mul(mul(sweep(0.9, 180, 1400), ramp(n, 3)), 0.35)), -0.2, 0.2, 0.5)];
  },
  impact: (r) => {
    const n = len(0.65);
    return [stereo(add(mul(sweep(0.65, 95, 42), decay(n, 0.16)), mul(mul(lowpass(white(n, r), 3500), decay(n, 0.008)), 0.5), mul(mul(lowpass(pink(n, r), 600), decay(n, 0.05)), 0.5)), 0, 0, 0.2)];
  },
  boom: (r) => {
    const n = len(1.4);
    return [stereo(add(mul(sweep(1.4, 70, 30), decay(n, 0.45)), mul(mul(lowpass(white(n, r), 5000), decay(n, 0.02)), 0.35), mul(mul(lowpass(pink(n, r), 300), decay(n, 0.5)), 0.4)), 0, 0, 0.5)];
  },
  pop: () => {
    const n = len(0.11);
    return [stereo(mul(mul(sweep(0.11, 1050, 380), decay(n, 0.03)), env(n, 0.002, 0.03)))];
  },
  click: (r) => {
    const n = len(0.05);
    return [stereo(add(mul(tone(0.05, 2300), decay(n, 0.006)), mul(mul(highpass(white(n, r), 2500), decay(n, 0.002)), 0.6))), -3];
  },
  tick: () => {
    const n = len(0.08);
    return [stereo(mul(add(tone(0.08, 1750), mul(tone(0.08, 2950), 0.45), mul(tone(0.08, 4400), 0.2)), decay(n, 0.014))), -3];
  },
  card: (r) => {
    const n = len(0.16);
    return [stereo(mul(bandsweep(pink(n, r), 900, 2600, 2), env(n, 0.01, 0.12)), -0.15, 0.15, 0.3)];
  },
  scribble: (r) => {
    const n = len(0.55);
    const grain = arr(n, (i) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 13 * (i / SR) + 1.5 * Math.sin(2 * Math.PI * 3 * (i / SR))));
    return [stereo(mul(mul(lowpass(highpass(white(n, r), 1800), 7000), grain), env(n, 0.03, 0.12)), 0, 0, 0.2), -4];
  },
  strike: (r) => {
    const n = len(0.3);
    return [stereo(mul(bandsweep(white(n, r), 1500, 4500, 1.2), env(n, 0.02, 0.1)), 0.4, -0.4, 0.2), -3];
  },
  cash: (r) => {
    const n = len(1.3);
    const bell = mul(add(...[[2093, 1], [2637, 0.7], [3136, 0.5], [5274, 0.25], [6640, 0.15]].map(([f, a]) => mul(tone(1.3, f), a))), decay(n, 0.35));
    const drawer = mul(lowpass(white(n, r), 2500), decay(n, 0.03));
    const d = len(0.06);
    return [stereo(add(arr(n, (i) => (i >= d ? bell[i - d] : 0)), mul(drawer, 0.6)), 0, 0, 0.5)];
  },
  ding: () => {
    const n = len(0.6);
    const d = len(0.11);
    const d1 = mul(tone(0.6, 1318.5), decay(n, 0.18));
    const d2 = mul(tone(0.6, 1975.5), decay(n, 0.2));
    return [stereo(arr(n, (i) => d1[i] + 0.8 * (i >= d ? d2[i - d] : 0)), 0, 0, 0.4), -3];
  },
  typing: (r) => {
    const n = len(0.9);
    const keys = new Float64Array(n);
    let at = 0;
    for (let k = 0; k < 12; k++) {
      at += 0.055 + r() * 0.065;
      const s = len(at);
      if (s >= n - 2000) break;
      const hit = mul(mul(highpass(white(1600, r), 1200), decay(1600, 0.004)), 0.6 + r() * 0.4);
      for (let i = 0; i < 1600; i++) keys[s + i] += hit[i];
    }
    return [stereo(keys, 0, 0, 0.3), -4];
  },
  sparkle: (r) => {
    const n = len(1.2);
    const shim = add(...[[3520, 1], [4186, 0.7], [5274, 0.6], [6272, 0.4], [7040, 0.3]].map(([f, a]) => mul(tone(1.2, f, r() * 6), a)));
    const trem = arr(n, (i) => 0.6 + 0.4 * Math.sin(2 * Math.PI * 11 * (i / SR)));
    return [stereo(mul(mul(shim, trem), env(n, 0.05, 0.8)), -0.3, 0.3, 0.6), -6];
  },
  glitch: (r) => {
    const n = len(0.25);
    const seg = Math.ceil(n / 25);
    const freqs = Array.from({ length: 25 }, () => 120 + r() * 780);
    const sq = arr(n, (i) => Math.sign(Math.sin((2 * Math.PI * freqs[Math.floor(i / seg)] * i) / SR)));
    return [stereo(mul(add(sq, mul(highpass(white(n, r), 3000), 0.3)), env(n, 0.005, 0.05)), 0, 0, 0.6), -6];
  },
  pen: (r) => {
    const n = len(0.5);
    const am = arr(n, (i) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * (i / SR)));
    return [stereo(lowpass(mul(mul(highpass(white(n, r), 2500), am), env(n, 0.02, 0.1)), 6000), 0, 0, 0.2), -5];
  },
};

export const SFX_NAMES = Object.keys(RECIPES);

export function ensureSfx(dir) {
  mkdirSync(dir, { recursive: true });
  SFX_NAMES.forEach((name, i) => {
    const file = join(dir, `${name}.wav`);
    if (existsSync(file)) return;
    const [channels, peakDb] = RECIPES[name](rng(7919 * (i + 1)));
    writeFileSync(file, wav(channels, peakDb ?? -1));
  });
  return dir;
}
