#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const HOUSE_VOICE = "4uJbyDJGijiDphW2T3vP";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const BOOLEAN = new Set(["--raw", "--no-stt", "--room"]);
const scriptPath = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !BOOLEAN.has(args[i - 1])));
const out = flag("out", "vo");

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || "").slice(-2000)}`);
  return r;
}

async function generate() {
  if (!scriptPath) {
    console.error("usage: node voice.mjs script.txt [--out vo] [--voice id] [--stability 0|0.5|1] [--speed 1.0] [--pitch 0] [--raw]\n       node voice.mjs --from take.raw.mp3 --timings take.raw.timestamps.json [--out vo]");
    process.exit(1);
  }
  const text = readFileSync(scriptPath, "utf8").trim();
  const voice = flag("voice", process.env.KTV_VOICE_ID || HOUSE_VOICE);
  const model = flag("model", "eleven_v3");
  const res = await fetch(`${process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io"}/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY || "proxy-injected", "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      language_code: flag("lang", "ar"),
      voice_settings: {
        stability: Number(flag("stability", "0.5")),
        similarity_boost: Number(flag("similarity", "0.75")),
        style: Number(flag("style", "0.35")),
        use_speaker_boost: true,
        speed: Number(flag("speed", "1.0")),
      },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.audio_base64) {
    console.error(`ElevenLabs ${res.status}: ${JSON.stringify(data.detail ?? data).slice(0, 400)}`);
    process.exit(1);
  }
  const rawAudio = `${out}.raw.mp3`;
  const rawTimings = `${out}.raw.timestamps.json`;
  writeFileSync(rawAudio, Buffer.from(data.audio_base64, "base64"));
  writeFileSync(rawTimings, JSON.stringify({ alignment: data.normalized_alignment ?? data.alignment }));
  return { rawAudio, rawTimings };
}

const rand = (n) => {
  const x = Math.sin(n * 91.7 + 13.3) * 43758.5453;
  return x - Math.floor(x);
};

function silences(file) {
  const r = run("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.14", "-f", "null", "-"]);
  const list = [];
  let start = null;
  for (const line of r.stderr.split("\n")) {
    const s = /silence_start: ([\d.]+)/.exec(line);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (s) start = Number(s[1]);
    if (e && start !== null) {
      list.push([start, Number(e[1])]);
      start = null;
    }
  }
  return list;
}

function duration(file) {
  return Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.trim());
}

function shapePauses(file) {
  const total = duration(file);
  const gaps = silences(file);
  const inner = gaps.filter(([s, e]) => s > 0.05 && e < total - 0.05);
  const ranked = [...inner].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const breathCount = Math.round(inner.length * 0.3);
  const breaths = new Set(ranked.slice(0, breathCount));
  const cuts = [];
  const lead = gaps.find(([s]) => s <= 0.05);
  if (lead && lead[1] > 0.12) cuts.push([0, lead[1] - 0.1]);
  inner.forEach((gap, i) => {
    const [s, e] = gap;
    const len = e - s;
    const target = breaths.has(gap)
      ? Math.min(len, Math.max(0.3, Math.min(0.72, len * (0.75 + rand(i) * 0.3))))
      : Math.min(len, 0.07 + rand(i + 50) * 0.13);
    if (len - target < 0.03) return;
    const mid = s + len / 2;
    cuts.push([mid - (len - target) / 2, mid + (len - target) / 2]);
  });
  const tail = gaps.find(([, e]) => e >= total - 0.05);
  if (tail && tail[1] - tail[0] > 0.5) cuts.push([tail[0] + 0.45, total]);
  cuts.sort((a, b) => a[0] - b[0]);
  const keep = [];
  let cursor = 0;
  for (const [a, b] of cuts) {
    if (a > cursor) keep.push([cursor, a]);
    cursor = b;
  }
  if (cursor < total) keep.push([cursor, total]);
  const map = (t) => {
    let removed = 0;
    for (const [a, b] of cuts) {
      if (t >= b) removed += b - a;
      else if (t > a) return a - removed;
    }
    return t - removed;
  };
  return { keep, map, cut: cuts.reduce((n, [a, b]) => n + b - a, 0), pauses: inner.length, breaths: breathCount };
}

function humanize(rawAudio, rawTimings) {
  const semitones = Number(flag("pitch", "0"));
  const { keep, map, cut, pauses, breaths } = shapePauses(rawAudio);
  const fade = 0.008;
  const parts = keep.map(([a, b], i) => {
    const len = b - a;
    return `[0:a]atrim=${a.toFixed(4)}:${b.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade).toFixed(4)}:d=${fade}[k${i}]`;
  });
  const chain = [
    semitones ? `rubberband=pitch=${Math.pow(2, semitones / 12).toFixed(5)}:formant=preserved` : null,
    "highpass=f=75",
    "equalizer=f=220:t=q:w=1.1:g=1.6",
    "equalizer=f=3200:t=q:w=1.4:g=1.2",
    "deesser=i=0.35",
    "acompressor=threshold=-19dB:ratio=2.6:attack=9:release=160:makeup=2",
    has("room") ? "aecho=0.88:0.55:13|23|37:0.11|0.07|0.04" : null,
  ].filter(Boolean).join(",");
  const graph = [
    ...parts,
    `${keep.map((_, i) => `[k${i}]`).join("")}concat=n=${keep.length}:v=0:a=1,aformat=sample_rates=44100:channel_layouts=mono,${chain}[v]`,
    ...(has("room")
      ? ["anoisesrc=color=brown:amplitude=0.0035:seed=11,lowpass=f=900,highpass=f=60,aformat=sample_rates=44100:channel_layouts=mono[room]",
        "[v][room]amix=inputs=2:duration=first:normalize=0:weights=1 1,pan=stereo|c0=c0|c1=c0[out]"]
      : ["[v]pan=stereo|c0=c0|c1=c0[out]"]),
  ].join(";");
  run("ffmpeg", ["-v", "error", "-y", "-i", rawAudio, "-filter_complex", graph, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", `${out}.mp3`]);
  if (!rawTimings) {
    console.log(`humanized: ${pauses} pauses → ${breaths} kept as breaths, ${cut.toFixed(1)}s of dead air removed, pitch ${semitones} st`);
    return;
  }
  const al = JSON.parse(readFileSync(rawTimings, "utf8")).alignment;
  const shifted = {
    characters: al.characters,
    character_start_times_seconds: al.character_start_times_seconds.map((t) => +map(t).toFixed(3)),
    character_end_times_seconds: al.character_end_times_seconds.map((t) => +map(t).toFixed(3)),
  };
  writeFileSync(`${out}.timestamps.json`, JSON.stringify({ alignment: shifted }));
  console.log(`humanized: ${pauses} pauses → ${breaths} kept as breaths, ${cut.toFixed(1)}s of dead air removed, pitch ${semitones} st${has("room") ? ", room and tone added" : ", clean"}`);
}

async function transcribe(file) {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", flag("lang", "ar") === "ar" ? "ara" : flag("lang"));
  form.append("timestamps_granularity", "word");
  form.append("file", new Blob([readFileSync(file)], { type: "audio/mpeg" }), "voice.mp3");
  const res = await fetch(`${process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io"}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY || "proxy-injected" },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.words)) {
    console.error(`Transcription skipped (${res.status}); align with ${out}.timestamps.json alone.`);
    return;
  }
  writeFileSync(`${out}.stt.json`, JSON.stringify(data));
  console.log(`transcript of the final audio → ${out}.stt.json`);
}

const source = flag("from") ? { rawAudio: flag("from"), rawTimings: flag("timings") } : await generate();
if (has("raw")) {
  run("ffmpeg", ["-v", "error", "-y", "-i", source.rawAudio, "-c:a", "libmp3lame", "-b:a", "192k", `${out}.mp3`]);
  if (source.rawTimings) writeFileSync(`${out}.timestamps.json`, readFileSync(source.rawTimings));
} else {
  humanize(source.rawAudio, source.rawTimings);
}
console.log(`voice → ${out}.mp3 (${duration(`${out}.mp3`).toFixed(2)}s)${source.rawTimings ? ` · timings → ${out}.timestamps.json` : ""}`);
if (!has("no-stt")) await transcribe(`${out}.mp3`);
