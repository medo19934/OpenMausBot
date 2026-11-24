#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [specPath, transcriptPath, outPath = specPath] = process.argv.slice(2);
if (!specPath || !transcriptPath) {
  console.error("usage: node align.mjs spec.json transcript.json [out.json]");
  process.exit(1);
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const raw = JSON.parse(readFileSync(transcriptPath, "utf8"));

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
    characters.forEach((c, i) => {
      if (/\s/.test(c)) {
        if (cur) words.push(cur);
        cur = null;
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

const norm = (s) =>
  s
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

const words = transcriptWords(raw).map((w) => ({ ...w, key: norm(w.text) }));
const LOOKAHEAD = 14;
let cursor = 0;
const misses = [];
let matched = 0;
let total = 0;

const lead = spec.audio?.voiceOffset ?? 0;

function find(key) {
  for (let j = cursor; j < Math.min(words.length, cursor + LOOKAHEAD); j++) {
    if (similar(words[j].key, key)) return j;
  }
  return -1;
}

function matchPhrase(text) {
  const keys = text.split(/\s+/).filter(Boolean).map((w) => norm(w.replace(/\*/g, "")));
  total += keys.length;
  let first = null;
  for (const key of keys) {
    const j = find(key);
    if (j === -1) {
      misses.push(key);
      continue;
    }
    matched++;
    if (first === null) first = +(words[j].start + lead).toFixed(3);
    cursor = j + 1;
  }
  return first;
}
for (const scene of spec.scenes ?? []) {
  for (const item of scene.items ?? []) {
    if (item.type === "checklist") {
      for (const row of item.items) {
        if (typeof row.at === "string" || typeof row.at === "number") continue;
        const t = matchPhrase(row.text);
        if (t !== null) row.at = t;
      }
      if (typeof item.at !== "string" && item.items[0]?.at !== undefined) item.at = item.items[0].at;
      continue;
    }
    if ((item.type ?? "text") !== "text" || item.times || typeof item.at === "string") continue;
    const tokens = item.text.split(/\s+/).filter(Boolean).map((w) => w.replace(/\*/g, ""));
    const times = [];
    tokens.forEach((tok) => {
      total++;
      const key = norm(tok);
      const found = find(key);
      if (found === -1) {
        times.push(null);
        misses.push(tok);
        return;
      }
      matched++;
      times.push(+(words[found].start + lead).toFixed(3));
      cursor = found + 1;
    });
    for (let i = 0; i < times.length; i++) {
      if (times[i] !== null) continue;
      const prev = times.slice(0, i).reverse().find((x) => x !== null);
      const next = times.slice(i + 1).find((x) => x !== null);
      times[i] = +(prev !== undefined && next !== undefined ? (prev + next) / 2 : prev !== undefined ? prev + 0.25 : (next ?? 0) - 0.25).toFixed(3);
    }
    if (times.length) {
      item.times = times;
      item.at = times[0];
    }
  }
}

writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
const last = words[words.length - 1];
console.log(`aligned ${matched}/${total} on-screen words · voice ends at ${(last.end + lead).toFixed(2)}s`);
if (misses.length) console.log(`interpolated (not heard in the voice): ${misses.join(" · ")}`);
