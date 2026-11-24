import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_FONTS = {
  text: { family: "IBM Plex Sans Arabic", weights: [400, 500, 600, 700] },
  display: { family: "Baloo Bhaijaan 2", weights: [700, 800] },
};

const searchDirs = (baseDir) => [baseDir, process.cwd(), HERE];

export function loadModule(name, baseDir) {
  for (const from of searchDirs(baseDir)) {
    try {
      return createRequire(join(from, "noop.js"))(name);
    } catch {}
  }
  throw new Error(`Cannot find ${name}. Run: npm install ${name} (in ${baseDir})`);
}

export function fontCss(fonts, baseDir) {
  let css = "";
  for (const f of Object.values({ ...DEFAULT_FONTS, ...(fonts ?? {}) })) {
    if (f.files) {
      for (const [weight, file] of Object.entries(f.files)) {
        css += `@font-face{font-family:"${f.family}";font-weight:${weight};font-display:block;src:url("${pathToFileURL(resolve(baseDir, file)).href}")}\n`;
      }
      continue;
    }
    const pkg = `@fontsource/${f.family.toLowerCase().replace(/\s+/g, "-")}`;
    let pkgDir = null;
    for (const from of searchDirs(baseDir)) {
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

export async function launch(baseDir) {
  const { chromium } = loadModule("playwright", baseDir);
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
