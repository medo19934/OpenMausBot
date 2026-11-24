#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const HOUSE_VOICE = "mUrAdOukT8TtEOpp0uKv";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const scriptPath = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!scriptPath) {
  console.error("usage: node voice.mjs script.txt [--out vo] [--voice id] [--model eleven_v3] [--speed 1.0]");
  process.exit(1);
}

const text = readFileSync(scriptPath, "utf8").trim();
const out = flag("out", "vo");
const voice = flag("voice", process.env.KTV_VOICE_ID || HOUSE_VOICE);
const model = flag("model", "eleven_v3");
const key = process.env.ELEVENLABS_API_KEY || "proxy-injected";
const base = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const body = {
  text,
  model_id: model,
  language_code: flag("lang", "ar"),
  voice_settings: {
    stability: Number(flag("stability", model === "eleven_v3" ? "0.5" : "0.42")),
    similarity_boost: 0.8,
    style: Number(flag("style", "0.2")),
    use_speaker_boost: true,
    speed: Number(flag("speed", "1.0")),
  },
};

const res = await fetch(`${base}/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const data = await res.json();
if (!res.ok || !data.audio_base64) {
  console.error(`ElevenLabs ${res.status}: ${JSON.stringify(data.detail ?? data).slice(0, 400)}`);
  process.exit(1);
}
writeFileSync(`${out}.mp3`, Buffer.from(data.audio_base64, "base64"));
writeFileSync(`${out}.timestamps.json`, JSON.stringify({ alignment: data.normalized_alignment ?? data.alignment }, null, 1));
const ends = (data.normalized_alignment ?? data.alignment).character_end_times_seconds;
console.log(`voice → ${out}.mp3 (${ends[ends.length - 1].toFixed(2)}s) · timings → ${out}.timestamps.json`);
