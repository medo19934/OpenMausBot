#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const scale = Number(flag("scale", "1"));
const stills = flag("stills");
const range = flag("range");
const workers = Math.max(1, Number(flag("workers", String(Math.min(4, Math.max(1, cpus().length - 1))))));

const load = (name) => {
  for (const from of [specDir, process.cwd(), HERE]) {
    try {
      return createRequire(join(from, "noop.js"))(name);
    } catch {}
  }
  throw new Error(`Cannot find ${name}. Run: npm install ${name} (in ${specDir})`);
};

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || "").slice(-3000)}`);
  return r;
}

function slug(family) {
  return family.toLowerCase().replace(/\s+/g, "-");
}

function fontCss() {
  const fonts = {
    text: { family: "IBM Plex Sans Arabic", weights: [500, 600, 700] },
    display: { family: "Baloo Bhaijaan 2", weights: [700, 800] },
    ...(spec.fonts ?? {}),
  };
  let css = "";
  for (const f of Object.values(fonts)) {
    if (f.files) {
      for (const [weight, file] of Object.entries(f.files)) {
        css += `@font-face{font-family:"${f.family}";font-weight:${weight};font-display:block;src:url("${pathToFileURL(resolve(specDir, file)).href}")}\n`;
      }
      continue;
    }
    const pkg = `@fontsource/${slug(f.family)}`;
    let pkgDir = null;
    for (const from of [specDir, process.cwd(), HERE]) {
      try {
        pkgDir = dirname(createRequire(join(from, "noop.js")).resolve(`${pkg}/package.json`));
        break;
      } catch {}
    }
    if (!pkgDir) throw new Error(`Font "${f.family}" not found. Run: npm install ${pkg}  (or give fonts.<role>.files)`);
    for (const w of f.weights ?? [400, 700]) {
      const file = join(pkgDir, `${w}.css`);
      if (!existsSync(file)) throw new Error(`${pkg} has no weight ${w}`);
      css += readFileSync(file, "utf8").replace(/url\(\.\/files\//g, `url(${pathToFileURL(join(pkgDir, "files")).href}/`).replace(/font-display:\s*swap/g, "font-display: block");
    }
  }
  return css;
}

function stageHtml() {
  const engine = readFileSync(join(HERE, "stage.js"), "utf8");
  const base = pathToFileURL(specDir + "/").href;
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">
<style>${fontCss()}
html,body{margin:0;padding:0;background:#000;overflow:hidden}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal}
.ktv-safe{position:absolute;inset:0;pointer-events:none;z-index:9999}
</style></head><body>
<script>window.KTV_SPEC=${JSON.stringify(spec).replace(/</g, "\\u003c")};</script>
<script>${engine}</script>
</body></html>`;
}

async function launch() {
  const { chromium } = load("playwright");
  const tries = [
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : null,
    {},
    { channel: "chrome" },
    { channel: "msedge" },
    existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : null,
  ].filter(Boolean);
  let last;
  for (const opt of tries) {
    try {
      return await chromium.launch({ ...opt, args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`No Chromium found. Run: npx playwright install chromium\n${last?.message ?? ""}`);
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

async function frame(page, t, type = "png") {
  await page.evaluate((tt) => window.KTV.seek(tt), t);
  return page.screenshot({ type, quality: type === "jpeg" ? 92 : undefined, clip: { x: 0, y: 0, width: W, height: H }, animations: "disabled", caret: "hide" });
}

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
  const ff = spawn("ffmpeg", [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", `scale=${ow - (ow % 2)}:${oh - (oh % 2)}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", has("fast") ? "veryfast" : "slow", "-crf", has("fast") ? "22" : "16",
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

function sfxFiles(tmp, info) {
  const auto = spec.audio?.autoSfx ?? true;
  if (!auto) return [];
  const list = [];
  const whoosh = join(tmp, "whoosh.wav");
  const tick = join(tmp, "tick.wav");
  const click = join(tmp, "click.wav");
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.55:amplitude=0.9:seed=7",
    "-af", "highpass=f=350,lowpass=f=5200,afade=t=in:st=0:d=0.24:curve=exp,afade=t=out:st=0.24:d=0.31:curve=exp,aecho=0.6:0.4:22:0.25,pan=stereo|c0=c0|c1=c0,volume=0.55", "-ar", "48000", whoosh]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=1650:duration=0.07",
    "-af", "afade=t=out:st=0:d=0.07:curve=exp,pan=stereo|c0=c0|c1=c0,volume=0.35", "-ar", "48000", tick]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=color=white:duration=0.03:amplitude=1:seed=3",
    "-af", "highpass=f=1800,afade=t=out:st=0:d=0.03,pan=stereo|c0=c0|c1=c0,volume=0.6", "-ar", "48000", click]);
  info.cues.forEach((c) => {
    if (c.enter.startsWith("push")) list.push({ src: whoosh, at: c.start - 0.2, gain: -14 });
    if (c.exit === "zoom") list.push({ src: whoosh, at: c.end - 0.42, gain: -16 });
  });
  info.events.forEach((e) => {
    if (e.type === "pill" || e.type === "badge") list.push({ src: tick, at: e.at, gain: -20 });
    if (e.type === "cta" && e.click !== undefined) list.push({ src: click, at: e.click, gain: -12 });
  });
  return list;
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
    filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay},highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,asplit=2[v][vkey]`);
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
  [...sfxFiles(tmp, info), ...(a.sfx ?? []).map((s) => ({ ...s, src: resolve(specDir, s.src) }))].forEach((s, n) => {
    if (s.at < 0) return;
    const i = add(s.src);
    const d = Math.round(s.at * 1000);
    filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gain ?? -12}dB,adelay=${d}|${d}[s${n}]`);
    labels.push(`[s${n}]`);
  });
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
  const stagePath = join(tmp, "stage.html");
  writeFileSync(stagePath, stageHtml());
  const browser = await launch();
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
