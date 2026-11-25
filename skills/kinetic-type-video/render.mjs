#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fontCss, launch } from "./browser.mjs";
import { ensureSfx } from "./sfx.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["safe", "keep", "fast"].includes(args[i - 1].slice(2))));

const specPath = resolve(positional[0] ?? "spec.json");
const out = resolve(positional[1] ?? "out.mp4");
const specDir = dirname(specPath);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
if (spec.audio?.voice) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", resolve(specDir, spec.audio.voice)], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`Cannot read voice file ${spec.audio.voice}`);
  spec.voiceLength = Number(probe.stdout.trim()) + (spec.audio.voiceOffset ?? 0);
}
const W = spec.width ?? 1080;
const H = spec.height ?? 1920;
const FPS = spec.fps ?? 30;
if (spec.captions) {
  const src = resolve(specDir, spec.captions.transcript ?? "vo.stt.json");
  const data = JSON.parse(readFileSync(src, "utf8"));
  const raw = Array.isArray(data.words)
    ? data.words.filter((w) => (w.type ?? "word") === "word").map((w) => ({ text: (w.text ?? w.word).trim(), start: w.start, end: w.end }))
    : (data.segments ?? []).flatMap((seg) => (seg.words ?? []).map((w) => ({ text: (w.word ?? w.text).trim(), start: w.start, end: w.end })));
  if (!raw.length) throw new Error(`No word timings in ${spec.captions.transcript ?? "vo.stt.json"}`);
  const offset = spec.audio?.voiceOffset ?? 0;
  spec.captionWords = raw.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
}
const scale = Number(flag("scale", "1"));
const stills = flag("stills");
const range = flag("range");
const workers = Math.max(1, Number(flag("workers", String(Math.min(4, Math.max(1, cpus().length - 1))))));

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || "").slice(-3000)}`);
  return r;
}

function stageHtml() {
  const engine = readFileSync(join(HERE, "stage.js"), "utf8");
  const base = pathToFileURL(specDir + "/").href;
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">
<style>${fontCss(spec.fonts, specDir)}
html,body{margin:0;padding:0;background:${spec.footage ? "transparent" : "#000"};overflow:hidden}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal}
.ktv-safe{position:absolute;inset:0;pointer-events:none;z-index:9999}
</style></head><body>
<script>window.KTV_SPEC=${JSON.stringify(spec).replace(/</g, "\\u003c")};</script>
<script>${engine}</script>
</body></html>`;
}

async function openStage(browser, stagePath) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(stagePath).href);
  if (errors.length) throw new Error(errors.join("\n"));
  const info = await page.evaluate(() => window.KTV.ready());
  return { page, info };
}

async function frame(page, t) {
  await page.evaluate((tt) => window.KTV.seek(tt), t);
  return page.screenshot({ type: "png", omitBackground: Boolean(spec.footage), clip: { x: 0, y: 0, width: W, height: H }, animations: "disabled", caret: "hide" });
}

function buildFootage(tmp) {
  const clips = spec.footage.clips ?? [spec.footage];
  const files = clips.map((clip, i) => {
    const file = join(tmp, `clip${i}.mp4`);
    const src = resolve(specDir, clip.src);
    const seek = clip.from ? ["-ss", String(clip.from)] : [];
    const until = clip.to !== undefined ? ["-t", String(clip.to - (clip.from ?? 0))] : [];
    const len = clip.to !== undefined ? clip.to - (clip.from ?? 0) : Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).stdout) - (clip.from ?? 0);
    const [z0, z1] = clip.zoom ?? spec.footage.zoom ?? [1, 1.06];
    const grade = clip.grade ?? spec.footage.grade ?? "eq=contrast=1.04:saturation=1.06";
    run("ffmpeg", ["-v", "error", "-y", ...seek, ...until, "-i", src, "-an", "-vf",
      `scale=${W}:${H}:force_original_aspect_ratio=increase,scale=w='trunc(iw*(${z0}+(${z1 - z0})*t/${Math.max(0.1, len).toFixed(3)})/2)*2':h=-2:eval=frame,crop=${W}:${H},setsar=1,fps=${FPS},${grade},format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", file]);
    return file;
  });
  const list = join(tmp, "clips.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const out = join(tmp, "footage.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  return { file: out, length: Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).stdout) };
}

let footage = null;

function safeOverlay(page) {
  return page.evaluate(([w, h]) => {
    const o = document.createElement("div");
    o.className = "ktv-safe";
    o.innerHTML = `<div style="position:absolute;left:0;right:0;bottom:0;height:${h * 0.2}px;background:rgba(255,0,80,.22)"></div>
      <div style="position:absolute;top:${h * 0.35}px;bottom:${h * 0.2}px;right:0;width:${w * 0.14}px;background:rgba(255,0,80,.22)"></div>
      <div style="position:absolute;left:0;right:0;top:0;height:${h * 0.07}px;background:rgba(255,0,80,.15)"></div>`;
    document.body.appendChild(o);
  }, [W, H]);
}

async function renderSegment(browser, stagePath, f0, f1, file) {
  const { page } = await openStage(browser, stagePath);
  const ow = Math.round(W * scale);
  const oh = Math.round(H * scale);
  const grain = spec.grain ?? 0.06;
  const texture = grain > 0 ? `,noise=c0s=${Math.round(grain * 160)}:c0f=t+u:all_seed=${7 + f0}` : "";
  const size = `scale=${ow - (ow % 2)}:${oh - (oh % 2)}:flags=lanczos,format=yuv420p${texture}`;
  const inputs = footage
    ? ["-ss", (f0 / FPS).toFixed(4), "-t", ((f1 - f0) / FPS).toFixed(4), "-i", footage.file, "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-filter_complex", `[0:v]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3600[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0:shortest=1,${size}`]
    : ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", size];
  const ff = spawn("ffmpeg", [
    "-v", "error", "-y", ...inputs,
    "-c:v", "libx264", "-preset", has("fast") ? "veryfast" : "slow", "-crf", has("fast") ? "22" : grain > 0 ? "20" : "16", "-maxrate", "12M", "-bufsize", "24M",
    "-tune", "animation", "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", String(FPS * 2), "-r", String(FPS), file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, bad) => ff.on("close", (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg exited ${c}`)))));
  for (let f = f0; f < f1; f++) {
    const buf = await frame(page, f / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f0 === 0 && f % FPS === 0) process.stdout.write(`\r  ${((f / f1) * 100).toFixed(0)}% `);
  }
  ff.stdin.end();
  await done;
  await page.close();
}


const SFX_RULES = {
  slam: (e) => [{ name: "impact", at: e.at, gain: -13 }],
  drop: (e) => [{ name: "pop", at: e.at + 0.12, gain: -16 }],
  kick: (e) => [{ name: e.size >= 0.1 ? "boom" : "impact", at: e.at - 0.02, gain: e.size >= 0.1 ? -13 : -12 }],
  pop: (e) => [{ name: "pop", at: e.at, gain: -15 }],
  pill: (e) => [{ name: "pop", at: e.at, gain: -16 }],
  badge: (e) => [{ name: "pop", at: e.at, gain: -16 }],
  counter: (e) => Array.from({ length: Math.max(3, Math.round((e.dur ?? 0.9) / 0.07)) }, (_, i) => ({ name: "tick", at: e.at + i * 0.07 * (1 + i * 0.04), gain: -24 - i * 0.6, minor: true })),
  sparkle: (e) => [{ name: "sparkle", at: e.at, gain: -17 }],
  tick: (e) => [{ name: "tick", at: e.at, gain: -17, minor: true }],
  card: (e) => [{ name: "card", at: e.at, gain: -16, minor: true }],
  strike: (e) => [{ name: "strike", at: e.at, gain: -12 }],
  select: (e) => [{ name: "click", at: e.at, gain: -16, minor: true }],
  annotate: (e) => [
    e.shape === "cross" ? { name: "strike", at: e.at, gain: -11 }
      : e.shape === "arrow" ? { name: "pop", at: e.at, gain: -15 }
      : { name: e.shape === "underline" ? "pen" : "scribble", at: e.at, gain: -14 },
  ],
  scroll: (e) => [{ name: "whoosh-soft", at: e.at, gain: -18, minor: true }],
  click: (e) => [{ name: "click", at: e.at, gain: -9 }],
  custom: (e) => [{ name: e.name, at: e.at, gain: e.gain ?? -12 }],
};

function sfxFiles(info, tmp) {
  const SFX_DIR = ensureSfx(join(tmp, "sfx"));
  const a = spec.audio ?? {};
  const level = a.sfxLevel ?? (a.autoSfx === false ? "off" : "full");
  if (level === "off") return [];
  const list = [];
  info.cues.forEach((c) => {
    if (c.enter === "push-right") list.push({ name: "whoosh", at: c.start - 0.12, gain: -12 });
    if (c.enter === "push-left") list.push({ name: "whoosh-left", at: c.start - 0.12, gain: -12 });
    if (c.enter === "iris") list.push({ name: "whoosh-soft", at: c.start - 0.08, gain: -13 });
    if (c.enter === "up") list.push({ name: "whoosh", at: c.start - 0.12, gain: -12 });
    if (c.enter === "zoom") list.push({ name: "whoosh-soft", at: c.start - 0.15, gain: -12 }, { name: "impact", at: c.start + 0.05, gain: -17 });
    if (c.enter === "flash") list.push({ name: "glitch", at: c.start, gain: -16 }, { name: "impact", at: c.start, gain: -15 });
    if (c.exit === "blur") list.push({ name: "whoosh-soft", at: c.end - 0.45, gain: -17 });
    if (c.exit === "zoom") list.push({ name: "riser", at: c.end - 0.9, gain: -15 }, { name: "impact", at: c.end, gain: -13 });
  });
  info.events.forEach((e) => list.push(...(SFX_RULES[e.type]?.(e) ?? [])));
  const kept = [];
  list.sort((x, y) => x.at - y.at).forEach((s) => {
    if (s.at < 0 || (level === "subtle" && s.minor)) return;
    const clash = kept.find((k) => k.name === s.name && Math.abs(k.at - s.at) < 0.07);
    if (clash) return;
    kept.push(s);
  });
  return kept.map((s) => {
    const file = existsSync(join(SFX_DIR, `${s.name}.wav`)) ? join(SFX_DIR, `${s.name}.wav`) : resolve(specDir, s.name);
    if (!existsSync(file)) throw new Error(`Unknown sound effect "${s.name}". Built in: ${readdirSync(SFX_DIR).map((f) => f.replace(".wav", "")).join(", ")}`);
    return { src: file, at: s.at, gain: s.gain + (level === "subtle" ? -5 : 0) + (a.sfxGain ?? 0) };
  });
}

function mixAudio(tmp, info, duration) {
  const a = spec.audio ?? {};
  const inputs = [];
  const filters = [];
  const labels = [];
  const add = (file, extra = []) => {
    inputs.push(...extra, "-i", file);
    return inputs.filter((x) => x === "-i").length - 1;
  };
  let voiceLabel = null;
  if (a.voice) {
    const i = add(resolve(specDir, a.voice));
    const delay = Math.round((a.voiceOffset ?? 0) * 1000);
    filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay},highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,asplit=3[v][vkey][fxkey]`);
    voiceLabel = "v";
    labels.push("[v]");
  }
  if (a.music) {
    const i = add(resolve(specDir, a.music), ["-stream_loop", "-1"]);
    const g = a.musicGain ?? -24;
    filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${duration},volume=${g}dB,afade=t=out:st=${Math.max(0, duration - 1.2)}:d=1.2[mraw]`);
    if (voiceLabel) {
      filters.push(`[mraw][vkey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=350[m]`);
    } else {
      filters.push(`[mraw]anull[m]`);
    }
    labels.push("[m]");
  } else if (voiceLabel) {
    filters.push(`[vkey]anullsink`);
  }
  const fx = [...sfxFiles(info, tmp), ...(a.sfx ?? []).map((s) => ({ ...s, src: resolve(specDir, s.src) }))].filter((s) => s.at >= 0);
  fx.forEach((s, n) => {
    const i = add(s.src);
    const d = Math.round(s.at * 1000);
    filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gain ?? -12}dB,adelay=${d}|${d},apad=whole_dur=${duration}[s${n}]`);
  });
  if (fx.length) {
    filters.push(`${fx.map((_, n) => `[s${n}]`).join("")}amix=inputs=${fx.length}:normalize=0:dropout_transition=0,atrim=0:${duration}[fxraw]`);
    filters.push(voiceLabel ? `[fxraw][fxkey]sidechaincompress=threshold=0.05:ratio=2.5:attack=5:release=180[fx]` : `[fxraw]anull[fx]`);
    labels.push("[fx]");
  } else if (voiceLabel) {
    filters.push(`[fxkey]anullsink`);
  }
  console.log(`sound: ${fx.length} effects placed`);
  if (!labels.length) return null;
  const mixed = join(tmp, "mix.wav");
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration}[mix]`);
  run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[mix]", "-ar", "48000", mixed]);
  const target = a.lufs ?? -14;
  const probe = run("ffmpeg", ["-hide_banner", "-i", mixed, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=9:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf("{")));
  const final = join(tmp, "final.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", mixed, "-af",
    `loudnorm=I=${target}:TP=-1.5:LRA=9:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, final]);
  return final;
}

async function main() {
  const tmp = join(specDir, ".ktv-render");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  if (spec.footage) {
    footage = buildFootage(tmp);
    spec.footageLength = footage.length;
    console.log(`footage ${footage.length.toFixed(2)}s from ${(spec.footage.clips ?? [spec.footage]).length} clip(s)`);
  }
  const stagePath = join(tmp, "stage.html");
  writeFileSync(stagePath, stageHtml());
  const browser = await launch(specDir);
  try {
    const { page, info } = await openStage(browser, stagePath);
    const duration = Number(flag("duration", "")) || info.duration;
    console.log(`duration ${duration.toFixed(2)}s · ${info.cues.length} scenes · ${W}x${H}@${FPS}`);
    console.log(info.cues.map((c, i) => `  scene ${i}: ${c.start.toFixed(2)}–${c.end.toFixed(2)} ${c.enter}${c.exit !== "none" ? " → " + c.exit : ""}`).join("\n"));

    if (stills) {
      if (has("safe")) await safeOverlay(page);
      const times = stills === "auto"
        ? info.cues.flatMap((c) => [c.start + Math.min(0.9, (c.end - c.start) * 0.4), Math.max(c.start, c.end - 0.15)])
        : stills.split(",").map(Number);
      const dir = resolve(flag("out-dir", join(specDir, "stills")));
      mkdirSync(dir, { recursive: true });
      const files = [];
      for (const t of times) {
        const file = join(dir, `t${t.toFixed(2)}.png`);
        writeFileSync(file, await frame(page, t));
        if (footage) {
          const bg = join(tmp, "still-bg.png");
          run("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.min(t, footage.length - 0.05)), "-i", footage.file, "-frames:v", "1", bg]);
          const layered = join(tmp, "still-layered.png");
          run("ffmpeg", ["-v", "error", "-y", "-i", bg, "-i", file, "-filter_complex", "[0][1]overlay=0:0", layered]);
          writeFileSync(file, readFileSync(layered));
        }
        files.push(file);
      }
      const cols = Math.min(6, files.length);
      const rows = Math.ceil(files.length / cols);
      const sheet = join(dir, "sheet.png");
      run("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex",
        `${files.map((_, i) => `[${i}]scale=270:-1,drawtext=text='${times[i].toFixed(2)}s':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@.6[i${i}]`).join(";")};${files.map((_, i) => `[i${i}]`).join("")}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join("|")}:fill=black`, sheet]);
      console.log(`stills → ${dir}\nsheet  → ${sheet}`);
      return;
    }
    await page.close();

    const [r0, r1] = range ? range.split(":").map(Number) : [0, duration];
    const f0 = Math.round(r0 * FPS);
    const f1 = Math.round(r1 * FPS);
    const n = Math.min(workers, Math.max(1, Math.floor((f1 - f0) / FPS)));
    const per = Math.ceil((f1 - f0) / n);
    const segs = [];
    const t0 = Date.now();
    await Promise.all(Array.from({ length: n }, (_, k) => {
      const a = f0 + k * per;
      const b = Math.min(f1, a + per);
      const file = join(tmp, `seg${k}.mp4`);
      segs[k] = file;
      return renderSegment(browser, stagePath, a, b, file);
    }));
    process.stdout.write(`\r  frames done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    const list = join(tmp, "segs.txt");
    writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n"));
    const video = join(tmp, "video.mp4");
    run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);
    const audio = range ? null : mixAudio(tmp, info, duration);
    const muxArgs = ["-v", "error", "-y", "-i", video];
    if (audio) muxArgs.push("-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
    muxArgs.push("-c:v", "copy", "-movflags", "+faststart", "-t", String(r1 - r0), out);
    run("ffmpeg", muxArgs);
    console.log(`video  → ${out}`);
    if (!has("keep")) rmSync(tmp, { recursive: true, force: true });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
