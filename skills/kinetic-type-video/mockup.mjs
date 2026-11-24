#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fontCss, launch } from "./browser.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const [htmlArg, outArg = "img"] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!htmlArg) {
  console.error("usage: node mockup.mjs mockups.html [out-dir] [--scale 2]");
  process.exit(1);
}

const htmlPath = resolve(htmlArg);
const baseDir = dirname(htmlPath);
const outDir = resolve(outArg);
const scale = Number(flag("scale", "2"));

const TOKENS = `:root{--cream:#F2E9E0;--blue:#253493;--ink:#111111;--periwinkle:#576DF5;--pill:#384CD8;--card:#2E2E2E;--line:rgba(17,17,17,.08);
--text:"IBM Plex Sans Arabic";--display:"Baloo Bhaijaan 2"}
html,body{margin:0;background:transparent}
body{font-family:var(--text),system-ui;color:var(--ink);-webkit-font-smoothing:antialiased;padding:60px}
[data-mockup]{display:inline-block;margin:0 60px 60px 0;vertical-align:top}`;

const source = readFileSync(htmlPath, "utf8");
const page = `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(baseDir + "/").href}">
<style>${fontCss(undefined, baseDir)}\n${TOKENS}</style></head><body>${source}</body></html>`;
const tmp = join(baseDir, ".ktv-mockups.html");
writeFileSync(tmp, page);

const browser = await launch(baseDir);
try {
  const tab = await browser.newPage({ viewport: { width: 2400, height: 1600 }, deviceScaleFactor: scale });
  await tab.goto(pathToFileURL(tmp).href);
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((im) => im.decode()));
  });
  const names = await tab.$$eval("[data-mockup]", (els) => els.map((el) => el.dataset.mockup));
  if (!names.length) throw new Error("No elements with data-mockup in the file");
  mkdirSync(outDir, { recursive: true });
  for (const name of names) {
    const el = await tab.$(`[data-mockup="${name}"]`);
    const box = await el.boundingBox();
    const file = join(outDir, `${name}.png`);
    await el.screenshot({ path: file, omitBackground: true });
    console.log(`${name}.png  ${Math.round(box.width)}×${Math.round(box.height)} → use "w": ${Math.round(box.width)}, "h": ${Math.round(box.height)}`);
  }
} finally {
  await browser.close();
}
