#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const [specPath, transcriptPath, outPath = specPath] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!specPath || !transcriptPath) {
  console.error("usage: node align.mjs spec.json transcript.json [out.json] [--fallback other-transcript.json]");
  process.exit(1);
}

function transcriptWords(data) {
  if (Array.isArray(data.words)) {
    return data.words
      .filter((w) => (w.type ?? "word") === "word")
      .map((w) => ({ text: w.text ?? w.word, start: w.start, end: w.end }));
  }
  if (Array.isArray(data.segments)) {
    return data.segments.flatMap((s) => (s.words ?? []).map((w) => ({ text: w.word ?? w.text, start: w.start, end: w.end })));
  }
  if (data.alignment?.characters) {
    const { characters, character_start_times_seconds: st, character_end_times_seconds: en } = data.alignment;
    const words = [];
    let cur = null;
    let inTag = false;
    characters.forEach((c, i) => {
      if (c === "[") inTag = true;
      if (inTag || /\s/.test(c)) {
        if (cur) words.push(cur);
        cur = null;
        if (c === "]") inTag = false;
        return;
      }
      if (!cur) cur = { text: "", start: st[i], end: en[i] };
      cur.text += c;
      cur.end = en[i];
    });
    if (cur) words.push(cur);
    return words;
  }
  throw new Error("Unrecognised transcript: expected ElevenLabs STT, ElevenLabs TTS with-timestamps, or Whisper verbose_json");
}

const SPOKEN_NUMBERS = { 0: "صفر", 1: "واحد", 2: "اثن", 3: "ثلاث", 4: "اربع", 5: "خمس", 6: "ست", 7: "سبع", 8: "ثمان", 9: "تسع", 10: "عشر" };

const norm = (s) => {
  const digits = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^0-9]/g, "");
  if (digits && SPOKEN_NUMBERS[digits] && /^[^\p{L}]*[0-9٠-٩]+[^\p{L}]*$/u.test(s)) return SPOKEN_NUMBERS[digits];
  return s
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/^ال(?=..)/, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
};

const similar = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return long.startsWith(short);
  if (long.includes(short)) return true;
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n] <= Math.max(1, Math.floor(Math.max(m, n) / 4));
};

const LOOKAHEAD = 14;

function aligner(file) {
  const words = transcriptWords(JSON.parse(readFileSync(file, "utf8"))).map((w) => ({ ...w, key: norm(w.text) }));
  let cursor = 0;
  const near = (key) => {
    for (let j = cursor; j < Math.min(words.length, cursor + LOOKAHEAD); j++) if (similar(words[j].key, key)) return j;
    return -1;
  };
  const phrase = (keys) => {
    let best = -1;
    let bestScore = 0;
    for (let j = cursor; j < words.length; j++) {
      if (!similar(words[j].key, keys[0])) continue;
      let score = 1;
      let k = j + 1;
      for (const key of keys.slice(1, 4)) {
        const hit = words.slice(k, k + 3).findIndex((w) => similar(w.key, key));
        if (hit === -1) continue;
        score++;
        k += hit + 1;
      }
      if (score > bestScore) {
        best = j;
        bestScore = score;
        if (score === Math.min(4, keys.length)) break;
      }
    }
    return keys.length === 1 || bestScore >= 2 ? best : -1;
  };
  return {
    get cursor() {
      return cursor;
    },
    set cursor(v) {
      cursor = v;
    },
    end: words.length ? words[words.length - 1].end : 0,
    times(keys) {
      if (keys.length && near(keys[0]) === -1) {
        for (let i = 0; i < keys.length; i++) {
          const j = phrase(keys.slice(i));
          if (j !== -1) {
            cursor = Math.max(cursor, j - i);
            break;
          }
        }
      }
      return keys.map((key) => {
        const j = near(key);
        if (j === -1) return null;
        cursor = j + 1;
        return words[j].start;
      });
    },
  };
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const primary = aligner(transcriptPath);
const fallback = flag("fallback") ? aligner(flag("fallback")) : null;
const lead = spec.audio?.voiceOffset ?? 0;
const misses = [];
let lastTime = 0;
let matched = 0;
let total = 0;

const keysOf = (text) => text.split(/\s+/).filter(Boolean).map((w) => norm(w.replace(/\*/g, "")));

function resolve(text) {
  const keys = keysOf(text);
  const a = primary.times(keys);
  const b = fallback ? fallback.times(keys) : [];
  const times = keys.map((_, i) => {
    if (a[i] !== null) return a[i];
    if (b[i] === null || b[i] === undefined) return null;
    const inBefore = a.slice(0, i).reverse().find((x) => x !== null);
    const after = a.slice(i + 1).find((x) => x !== null);
    const before = inBefore ?? lastTime;
    const reach = inBefore !== undefined || after !== undefined ? 1.2 : 6;
    const fits = b[i] >= before && b[i] - before < reach + (inBefore === undefined ? 4.8 : 0) && (after === undefined || (b[i] <= after && after - b[i] < 1.2));
    return fits ? b[i] : null;
  });
  total += keys.length;
  times.forEach((t, i) => (t === null ? misses.push(text.split(/\s+/).filter(Boolean)[i]) : matched++));
  for (let i = 0; i < times.length; i++) {
    if (times[i] !== null) continue;
    const prev = times.slice(0, i).reverse().find((x) => x !== null);
    const next = times.slice(i + 1).find((x) => x !== null);
    times[i] = prev !== undefined && next !== undefined ? (prev + next) / 2 : prev !== undefined ? prev + 0.25 : next !== undefined ? next - 0.25 : lastTime + 0.3;
  }
  lastTime = Math.max(lastTime, ...times);
  return times.map((t) => +(t + lead).toFixed(3));
}

const sources = [primary, fallback].filter(Boolean);
for (const scene of spec.scenes ?? []) {
  const base = sources.map((src) => src.cursor);
  const reached = [...base];
  const startItem = () => sources.forEach((src, i) => {
    reached[i] = Math.max(reached[i], src.cursor);
    src.cursor = base[i];
  });
  for (const item of scene.items ?? []) {
    startItem();
    if (item.say && typeof item.at !== "string") {
      item.at = +(resolve(item.say)[0] + (item.sayOffset ?? 0)).toFixed(3);
      continue;
    }
    if (item.type === "checklist") {
      for (const row of item.items) {
        if (row.at !== undefined) continue;
        row.at = resolve(row.text)[0];
      }
      if (typeof item.at !== "string" && item.items[0]?.at !== undefined) item.at = item.items[0].at;
      continue;
    }
    if (!["text", "heading"].includes(item.type ?? "text") || item.times || typeof item.at === "string") continue;
    const times = resolve(item.text);
    if (times.length) {
      item.times = times;
      item.at = times[0];
    }
  }
  startItem();
  sources.forEach((src, i) => {
    src.cursor = reached[i];
  });
}

writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`aligned ${matched}/${total} on-screen words · voice ends at ${(primary.end + lead).toFixed(2)}s`);
if (misses.length) console.log(`interpolated (not heard in the voice): ${misses.join(" · ")}`);
