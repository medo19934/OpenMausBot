(() => {
  const spec = window.KTV_SPEC;
  const W = spec.width ?? 1080;
  const H = spec.height ?? 1920;
  const U = W / 1080;
  const px = (v) => `${(v * U).toFixed(2)}px`;

  const palette = {
    cream: "#F2E9E0",
    blue: "#253493",
    ink: "#111111",
    periwinkle: "#576DF5",
    pillOnBlue: "#384CD8",
    blueAccent: "#AFC0FF",
    card: "#2E2E2E",
    white: "#FFFFFF",
    ...(spec.palette ?? {}),
  };
  const grounds = {
    cream: { bg: palette.cream, fg: palette.ink, accent: palette.blue, pill: palette.blue, pillText: palette.cream, surface: "#FFFFFF", muted: "rgba(17,17,17,.45)", select: "rgba(37,52,147,.18)" },
    blue: { bg: palette.blue, fg: "#FFFFFF", accent: palette.blueAccent, pill: palette.pillOnBlue, pillText: "#FFFFFF", surface: palette.pillOnBlue, muted: "rgba(255,255,255,.55)", select: "rgba(255,255,255,.22)" },
    ink: { bg: palette.ink, fg: "#FFFFFF", accent: palette.periwinkle, pill: palette.periwinkle, pillText: "#FFFFFF", surface: palette.card, muted: "rgba(255,255,255,.5)", select: "rgba(87,109,245,.35)" },
    ...(spec.grounds ?? {}),
  };

  const SIZES = { xs: 30, s: 46, m: 66, l: 96, xl: 140, xxl: 190 };
  const FONTS = {
    text: spec.fonts?.text?.family ?? "IBM Plex Sans Arabic",
    display: spec.fonts?.display?.family ?? "Baloo Bhaijaan 2",
  };
  const dir = spec.dir ?? "rtl";
  const sign = dir === "rtl" ? -1 : 1;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, t0, d) => (d <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / d));
  const ease = {
    out: (k) => 1 - (1 - k) ** 3,
    outQuint: (k) => 1 - (1 - k) ** 5,
    inOut: (k) => (k < 0.5 ? 16 * k ** 5 : 1 - (-2 * k + 2) ** 5 / 2),
    in: (k) => k ** 3,
    back: (k) => {
      const c = 1.9;
      return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
    },
  };
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const ids = new Map();
  const timeOf = (value, fallback = 0) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return value;
    const m = /^#(\w+)(?:\.(\d+))?(?:\.(end))?\s*([+-]\s*[\d.]+)?$/.exec(String(value).trim());
    if (!m) throw new Error(`Bad time reference: ${value}`);
    const target = ids.get(m[1]);
    if (!target) throw new Error(`Unknown id in time reference: ${value}`);
    let base = target.at;
    if (m[2] !== undefined) {
      const n = Number(m[2]);
      const w = target.words?.[n] ?? (target.items?.[n] && { t: timeOf(target.items[n].at, target.at + n * 0.6) });
      if (!w) throw new Error(`No word or row ${m[2]} in #${m[1]}`);
      base = w.t;
    }
    if (m[3]) base = target.endT ?? target.at;
    return base + (m[4] ? Number(m[4].replace(/\s/g, "")) : 0);
  };

  const el = (tag, cls, parent, css) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (css) Object.assign(node.style, css);
    if (parent) parent.appendChild(node);
    return node;
  };

  const ICONS = {
    "eye-off": '<path d="M3 3l18 18" /><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.6M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />',
    eye: '<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" />',
    alert: '<path d="M12 6v8" /><circle cx="12" cy="18" r=".6" fill="currentColor" />',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none" />',
    check: '<path d="M6 12.5l4 4 8-9" />',
    dot: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />',
    "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6" />',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.7 3.2-5.6 3.9-9.4 2.6 1.6 4.2 4 4.4 6.3.8-.6 1.4-1.6 1.5-2.7 1.9 1.6 3.2 3.6 3.2 5.9 0 3.5-2.6 6-6.5 6z" />',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none" />',
  };
  const icon = (name, size, color, stroke = 2.2) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.dot}</svg>`;

  const CURSOR = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2.5l15 9.2-6.6 1.4 3.9 7.6-3 1.5-3.9-7.6L4 19.3z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  const root = el("div", "ktv-root", document.body, {
    position: "relative", width: `${W}px`, height: `${H}px`, overflow: "hidden", direction: dir,
  });
  const svgNS = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(svgNS, "svg");
  defs.setAttribute("width", "0");
  defs.setAttribute("height", "0");
  defs.style.position = "absolute";
  root.appendChild(defs);
  let filterCount = 0;
  const motionBlur = () => {
    const id = `mb${filterCount++}`;
    const f = document.createElementNS(svgNS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("x", "-20%");
    f.setAttribute("y", "-20%");
    f.setAttribute("width", "140%");
    f.setAttribute("height", "140%");
    f.setAttribute("color-interpolation-filters", "sRGB");
    const g = document.createElementNS(svgNS, "feGaussianBlur");
    g.setAttribute("stdDeviation", "0 0");
    f.appendChild(g);
    defs.appendChild(f);
    return {
      apply(node, sx, sy) {
        if (sx < 0.3 && sy < 0.3) {
          node.style.filter = "";
          return;
        }
        g.setAttribute("stdDeviation", `${sx.toFixed(2)} ${sy.toFixed(2)}`);
        node.style.filter = `url(#${id})`;
      },
    };
  };

  const revealStyle = (node, t, t0, style = "soft", extra = {}) => {
    const d = style === "pop" ? 0.42 : style === "fast" ? 0.16 : 0.26;
    const k = prog(t, t0, d);
    if (k <= 0) {
      node.style.opacity = "0";
      node.style.visibility = "hidden";
      return 0;
    }
    node.style.visibility = "";
    const e = ease.out(k);
    let tf = "";
    let blur = 0;
    if (style === "pop") {
      const b = ease.back(k);
      tf = `translateY(${px((1 - b) * 70)}) rotate(${((1 - e) * -9 * sign).toFixed(2)}deg) scale(${lerp(0.82, 1, b).toFixed(4)})`;
      blur = (1 - e) * 14;
    } else if (style === "scale") {
      const b = ease.back(k);
      tf = `scale(${lerp(0.55, 1, b).toFixed(4)})`;
      blur = (1 - e) * 10;
    } else if (style === "none") {
      tf = "";
    } else {
      tf = `translateY(${px((1 - e) * 26)})`;
      blur = (1 - e) * 12;
    }
    node.style.opacity = String(clamp(k * 1.6));
    node.style.transform = `${extra.base ?? ""} ${tf}`.trim();
    node.style.filter = blur > 0.2 ? `blur(${px(blur)})` : "";
    return k;
  };

  const exitStyle = (node, t, t1, seed = 0) => {
    if (t1 === undefined || t < t1) return false;
    const k = ease.in(prog(t, t1, 0.38));
    const dx = (hash(seed) - 0.5) * 40;
    node.style.opacity = String(1 - k);
    node.style.filter = `blur(${px(k * 18)})`;
    node.style.transform = `translate(${px(dx * k)}, ${px(-12 * k)}) scale(${lerp(1, 1.06, k)})`;
    return true;
  };

  class Grow {
    constructor(node, axis = "y") {
      this.node = node;
      this.axis = axis;
      this.size = 0;
    }
    measure() {
      this.size = this.axis === "y" ? this.node.scrollHeight : this.node.scrollWidth;
    }
    set(k) {
      const v = `${(this.size * k).toFixed(2)}px`;
      if (this.axis === "y") this.node.style.height = v;
      else this.node.style.width = v;
    }
  }

  const parseWords = (text) =>
    text.split("\n").map((line) =>
      line.trim().split(/\s+/).filter(Boolean).map((raw) => {
        const accent = /\*[^*]+\*/.test(raw);
        return { text: raw.replace(/\*/g, ""), accent };
      }),
    );

  const items = [];

  function buildText(item, host, g) {
    const lines = parseWords(item.text);
    const size = (SIZES[item.size] ?? item.size ?? SIZES.m) * U;
    const family = item.font === "display" ? FONTS.display : FONTS.text;
    const weight = item.weight ?? (item.font === "display" ? 800 : 700);
    const box = el("div", "ktv-text", host, {
      fontFamily: `"${family}"`, fontWeight: String(weight), fontSize: `${size}px`,
      lineHeight: String(item.leading ?? (item.font === "display" ? 1.12 : 1.38)), color: item.color ? palette[item.color] ?? item.color : g.fg,
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
    });
    const words = [];
    const rows = [];
    let n = 0;
    lines.forEach((line) => {
      const row = el("div", "ktv-row", box, { display: "flex", justifyContent: "center", whiteSpace: "nowrap", position: "relative", overflow: "visible" });
      const grow = new Grow(row, "y");
      rows.push({ row, grow, first: n });
      line.forEach((w) => {
        const slot = el("span", "ktv-slot", row, { display: "inline-block", overflow: "visible", position: "relative" });
        const inner = el("span", "ktv-word", slot, { display: "inline-block", position: "relative", willChange: "transform, filter, opacity" });
        inner.textContent = w.text;
        if (w.accent) inner.style.color = item.accentColor ? palette[item.accentColor] ?? item.accentColor : g.accent;
        words.push({ ...w, slot, inner, index: n++, row: rows.length - 1, grow: new Grow(slot, "x") });
      });
    });
    const sel = item.select
      ? { rects: rows.map(() => el("div", "ktv-select", box, { position: "absolute", background: g.select, borderRadius: px(6), pointerEvents: "none", zIndex: "-1" })),
          caret: el("div", "ktv-caret", box, { position: "absolute", width: px(4), background: g.bg === palette.cream ? palette.blue : "#FFFFFF", borderRadius: px(2) }) }
      : null;
    const strikes = item.strike
      ? rows.map(() => el("div", "ktv-strike", box, { position: "absolute", height: `${Math.max(4, size * 0.075)}px`, borderRadius: px(99), background: item.strike.color ? palette[item.strike.color] ?? item.strike.color : g.bg === palette.cream ? palette.blue : palette.periwinkle, transformOrigin: dir === "rtl" ? "right center" : "left center", pointerEvents: "none" }))
      : null;
    if (sel || strikes) box.style.position = "relative";
    return { box, words, rows, sel, strikes, gap: 0.27 * size };
  }

  function timeText(item, data) {
    const pace = item.pace ?? spec.pace ?? 0.27;
    data.words.forEach((w, i) => {
      w.t = item.times ? item.times[i] - (spec.lead ?? 0.1) : item.at + i * pace;
    });
    const cadence = item.cadence ?? spec.cadence ?? "eager";
    if (item.times && cadence === "eager" && data.words.length) {
      const step = item.step ?? spec.step ?? 0.13;
      const t0 = data.words[0].t;
      data.words.forEach((w, i) => {
        w.t = Math.min(w.t, t0 + i * step);
      });
    }
    item.words = data.words;
    item.endT = data.words.length ? data.words[data.words.length - 1].t + 0.3 : item.at;
  }

  function drawText(item, data, t) {
    const style = item.reveal ?? "soft";
    const outT = item.out === undefined ? undefined : timeOf(item.out);
    const grown = new Map();
    data.words.forEach((w) => {
      const kw = prog(t, w.t, style === "pop" ? 0.32 : 0.22);
      const k = item.reserve ? 1 : ease.outQuint(kw);
      w.grow.set(k);
      w.slot.style.marginInlineStart = w === data.words[data.rows[w.row].first] ? "0px" : `${(data.gap * k).toFixed(2)}px`;
      if (!exitStyle(w.inner, t, outT === undefined ? undefined : outT + (data.words.length - 1 - w.index) * 0.035, w.index + item.at)) {
        revealStyle(w.inner, t, w.t, style);
        if (data.strikes) {
          const sk = ease.inOut(prog(t, timeOf(item.strike.at) + w.row * 0.08, 0.32));
          if (sk > 0) w.inner.style.opacity = String(Number(w.inner.style.opacity || 1) * lerp(1, 0.42, sk));
        }
      }
      grown.set(w.row, Math.max(grown.get(w.row) ?? 0, k));
    });
    data.rows.forEach((r, i) => r.grow.set(item.reserve ? 1 : ease.outQuint(grown.get(i) ?? 0)));
    if (data.strikes) {
      const t0 = timeOf(item.strike.at);
      const boxRect = data.box.getBoundingClientRect();
      const scale = boxRect.width / data.box.offsetWidth || 1;
      data.strikes.forEach((line, ri) => {
        const k = ease.inOut(prog(t, t0 + ri * 0.08, 0.32));
        const inRow = data.words.filter((w) => w.row === ri);
        if (k <= 0 || !inRow.length) {
          line.style.display = "none";
          return;
        }
        line.style.display = "";
        const rs = inRow.map((w) => w.slot.getBoundingClientRect());
        const left = (Math.min(...rs.map((r) => r.left)) - boxRect.left) / scale;
        const right = (Math.max(...rs.map((r) => r.right)) - boxRect.left) / scale;
        const top = (rs[0].top - boxRect.top) / scale;
        const h = rs[0].height / scale;
        Object.assign(line.style, { left: `${left - 10 * U}px`, width: `${right - left + 20 * U}px`, top: `${top + h * 0.5}px`, transform: `scaleX(${k.toFixed(4)}) rotate(${dir === "rtl" ? 2 : -2}deg)` });
      });
    }
    if (data.sel) {
      const s = item.select;
      const first = s.from ?? 0;
      const last = s.to ?? data.words.length - 1;
      const t0 = timeOf(s.at);
      const k = ease.inOut(prog(t, t0, s.dur ?? 0.45));
      const visible = t >= t0;
      data.sel.caret.style.display = visible ? "" : "none";
      const boxRect = data.box.getBoundingClientRect();
      const scale = boxRect.width / data.box.offsetWidth || 1;
      let caret = null;
      data.sel.rects.forEach((rect, ri) => {
        const inRow = data.words.filter((w) => w.row === ri && w.index >= first && w.index <= last);
        if (!visible || !inRow.length) {
          rect.style.display = "none";
          return;
        }
        rect.style.display = "";
        const rs = inRow.map((w) => w.slot.getBoundingClientRect());
        const left = (Math.min(...rs.map((r) => r.left)) - boxRect.left) / scale;
        const right = (Math.max(...rs.map((r) => r.right)) - boxRect.left) / scale;
        const top = (rs[0].top - boxRect.top) / scale;
        const h = rs[0].height / scale;
        const width = (right - left) * k;
        const x = dir === "rtl" ? right - width : left;
        Object.assign(rect.style, { left: `${x - 6 * U}px`, top: `${top + h * 0.1}px`, width: `${width + 12 * U}px`, height: `${h * 0.84}px` });
        caret = { x: dir === "rtl" ? x - 6 * U : x + width + 6 * U, top, h };
      });
      if (caret) {
        const blink = k < 1 || Math.floor((t - t0) * 2.2) % 2 === 0;
        Object.assign(data.sel.caret.style, { left: `${caret.x}px`, top: `${caret.top + caret.h * 0.06}px`, height: `${caret.h * 0.88}px`, opacity: blink ? "1" : "0" });
      }
    }
  }

  function buildPill(item, host, g) {
    const wrap = el("div", "", host, { display: "flex", justifyContent: "center" });
    const node = el("div", "ktv-pill", wrap, {
      background: g.pill, color: g.pillText, fontFamily: `"${FONTS.text}"`, fontWeight: "700",
      fontSize: px(SIZES[item.size] ?? item.size ?? 60), padding: `${px(4)} ${px(34)} ${px(12)}`, borderRadius: px(999),
      lineHeight: "1.3", whiteSpace: "nowrap",
    });
    node.textContent = item.text;
    return { node, grow: new Grow(wrap, "y") };
  }

  function buildBadge(item, host, g) {
    const d = (item.size ?? 76) * U;
    const wrap = el("div", "", host, { display: "flex", justifyContent: "center" });
    const cell = el("div", "", wrap, { position: "relative", width: `${d}px`, height: `${d}px` });
    const ring = el("div", "", cell, { position: "absolute", inset: "0", borderRadius: "50%", border: `${px(2)} solid ${g.fg}`, opacity: "0" });
    const disc = el("div", "", cell, {
      position: "absolute", inset: "0", borderRadius: "50%", display: "grid", placeItems: "center",
      background: item.fill ? palette[item.fill] ?? item.fill : g.surface,
      boxShadow: g.bg === palette.cream ? `0 ${px(10)} ${px(26)} rgba(60,40,20,.14)` : "none",
    });
    const iconColor = item.iconColor ? palette[item.iconColor] ?? item.iconColor : g.bg === palette.cream ? palette.blue : "#FFFFFF";
    disc.innerHTML = icon(item.icon ?? "dot", d * 0.46, iconColor, 2.4);
    return { node: disc, ring, grow: new Grow(wrap, "y") };
  }

  function buildChecklist(item, host, g) {
    const box = el("div", "", host, { display: "flex", flexDirection: "column", alignItems: "center" });
    const rows = item.items.map((entry) => {
      const row = el("div", "", box, { position: "relative", display: "flex", alignItems: "center", gap: px(16), padding: `${px(6)} ${px(10)} ${px(10)}` });
      const label = el("span", "", row, { fontFamily: `"${FONTS.text}"`, fontWeight: "700", fontSize: px(SIZES[item.size] ?? item.size ?? 52), color: g.fg, whiteSpace: "nowrap" });
      label.textContent = entry.text;
      const tick = el("span", "", row, { width: px(34), height: px(34), borderRadius: "50%", background: g.bg === palette.cream ? palette.blue : g.accent, display: "grid", placeItems: "center", flex: "none" });
      tick.innerHTML = icon("check", 22 * U, g.bg === palette.cream ? "#FFFFFF" : g.bg, 3.2);
      const rule = el("div", "", row, { position: "absolute", bottom: "0", insetInlineStart: "0", height: px(2), background: g.fg, opacity: ".14", width: "0%" });
      return { entry, row, label, tick, rule, grow: new Grow(row, "y") };
    });
    return { box, rows };
  }

  function buildCards(item, host) {
    const layout = item.layout ?? "row";
    const h = (item.h ?? 420) * U;
    const stage = el("div", "ktv-cards", host, { position: "relative", width: "100%", height: `${(item.boxH ?? item.h ?? 420) * U}px`, perspective: px(1800) });
    const cards = item.images.map((img, i) => {
      const bare = img.bare ?? item.bare ?? false;
      const card = el("div", "ktv-card", stage, {
        position: "absolute", left: "50%", top: "50%", borderRadius: bare ? "0" : px(img.radius ?? item.radius ?? 18), overflow: bare ? "visible" : "hidden",
        boxShadow: bare ? "none" : `0 ${px(34)} ${px(60)} ${px(-18)} rgba(0,0,0,.38), 0 ${px(6)} ${px(14)} rgba(0,0,0,.12)`, background: bare ? "transparent" : "#ddd",
        width: `${(img.w ?? item.w ?? h * 0.78 / U) * U}px`, height: `${(img.h ?? item.h ?? 420) * U}px`, willChange: "transform, filter",
      });
      const im = el("img", "", card, { width: "100%", height: "100%", objectFit: bare ? "contain" : "cover", display: "block" });
      im.src = img.src;
      return { img, card, i, bare };
    });
    return { stage, cards, layout, mb: motionBlur() };
  }

  function drawCards(item, data, t) {
    const n = data.cards.length;
    let focus = 0;
    if (data.layout === "carousel") {
      const keys = (item.focus ?? [{ at: item.at, index: Math.floor(n / 2) }]).map((f) => ({ at: timeOf(f.at), index: f.index }));
      focus = keys[0].index;
      for (let i = 1; i < keys.length; i++) focus = lerp(focus, keys[i].index, ease.inOut(prog(t, keys[i].at, 0.5)));
    }
    data.cards.forEach(({ img, card, i, bare }) => {
      const t0 = img.at !== undefined ? timeOf(img.at) : item.at + i * (item.stagger ?? 0.12);
      const k = prog(t, t0, 0.55);
      if (k <= 0) {
        card.style.visibility = "hidden";
        return;
      }
      card.style.visibility = "";
      const e = ease.outQuint(k);
      const bob = item.float === false ? 0 : Math.sin((t + i * 1.7) * 1.3) * 7 * U;
      const sway = item.float === false ? 0 : Math.sin((t + i * 2.3) * 0.9) * 0.9;
      let x = 0;
      let y = 0;
      let rot = img.rot ?? 0;
      let scale = 1;
      let gray = 0;
      let blur = 0;
      let z = 1;
      let fade = 1;
      if (data.layout === "row") {
        const gapW = (item.gap ?? 24) * U;
        const widths = data.cards.map((c) => c.card.offsetWidth);
        const total = widths.reduce((a, b) => a + b, 0) + gapW * (n - 1);
        let acc = -total / 2;
        for (let j = 0; j < i; j++) acc += widths[j] + gapW;
        x = (acc + widths[i] / 2) * -sign;
      } else if (data.layout === "carousel") {
        const d = i - focus;
        const ad = Math.min(Math.abs(d), 1.6);
        x = d * (item.spacing ?? 250) * U * -sign;
        scale = lerp(1, 0.74, Math.min(ad, 1));
        gray = Math.min(ad, 1);
        blur = Math.min(ad, 1) * 2.2;
        fade = lerp(1, 0.75, Math.min(ad, 1));
        z = 100 - Math.round(ad * 10);
      } else {
        x = (img.x ?? 0) * U;
        y = (img.y ?? 0) * U;
        z = img.z ?? i + 1;
      }
      const enterY = (1 - e) * 90 * U;
      const enterScale = lerp(0.86, 1, e);
      const enterRot = (1 - e) * (hash(i + 3) - 0.5) * 16;
      const tilt = img.tilt ?? item.tilt ?? [0, 0];
      card.style.zIndex = String(z);
      card.style.opacity = String(clamp(k * 2.2) * fade);
      card.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${(y + bob + enterY).toFixed(2)}px) rotateX(${tilt[0]}deg) rotateY(${tilt[1]}deg) rotate(${(rot + sway + enterRot).toFixed(2)}deg) scale(${(scale * enterScale).toFixed(4)})`;
      const enterBlur = (1 - e) * 16;
      const f = bare ? [`drop-shadow(0 ${px(26)} ${px(30)} rgba(0,0,0,.28))`] : [];
      if (gray > 0.01) f.push(`grayscale(${gray.toFixed(3)})`);
      if (blur + enterBlur > 0.2) f.push(`blur(${((blur + enterBlur) * U).toFixed(2)}px)`);
      card.style.filter = f.join(" ");
    });
  }

  function buildPhone(item, host) {
    const w = (item.w ?? 430) * U;
    const h = w * 2.06;
    const stage = el("div", "", host, { position: "relative", width: "100%", height: `${h + 40 * U}px`, perspective: px(2200), display: "grid", placeItems: "center" });
    const body = el("div", "", stage, {
      width: `${w}px`, height: `${h}px`, borderRadius: `${w * 0.15}px`, background: "#0b0b0c", padding: `${w * 0.032}px`, boxSizing: "border-box",
      boxShadow: `inset 0 0 0 ${px(3)} #3a3a3c, 0 ${px(50)} ${px(90)} ${px(-20)} rgba(0,0,0,.55)`, transformStyle: "preserve-3d", willChange: "transform, filter",
    });
    const screen = el("div", "", body, { position: "relative", width: "100%", height: "100%", borderRadius: `${w * 0.125}px`, overflow: "hidden", background: "#fff" });
    const im = el("img", "", screen, { width: "100%", display: "block", position: "absolute", top: "0", left: "0" });
    im.src = item.src;
    el("div", "", screen, { position: "absolute", top: `${w * 0.035}px`, left: "50%", width: `${w * 0.3}px`, height: `${w * 0.085}px`, transform: "translateX(-50%)", background: "#000", borderRadius: px(999) });
    return { stage, body, screen, im, mb: motionBlur() };
  }

  function drawPhone(item, data, t) {
    const k = prog(t, item.at, 0.6);
    if (k <= 0) {
      data.body.style.visibility = "hidden";
      return;
    }
    data.body.style.visibility = "";
    const e = ease.outQuint(k);
    const spin = item.spin ?? [-24, 14];
    const life = clamp((t - item.at) / Math.max(0.1, (item.endT ?? item.at + 3) - item.at));
    const ry = lerp(spin[0], spin[1], ease.inOut(life));
    data.body.style.opacity = String(clamp(k * 2));
    data.body.style.transform = `translateY(${((1 - e) * 140 * U).toFixed(2)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${lerp(-6, 3, ease.inOut(life)).toFixed(2)}deg) scale(${lerp(0.8, 1, e).toFixed(4)})`;
    const maxScroll = Math.max(0, data.im.offsetHeight - data.screen.offsetHeight);
    let pos = 0;
    let vel = 0;
    (item.scroll ?? []).forEach((s) => {
      const s0 = timeOf(s.at);
      const dur = s.dur ?? 0.7;
      const kk = prog(t, s0, dur);
      const before = pos;
      pos = lerp(pos, s.to, ease.inOut(kk));
      if (kk > 0 && kk < 1) vel = Math.abs(s.to - before) * maxScroll / dur * 2 * Math.sin(Math.PI * kk);
    });
    data.im.style.transform = `translateY(${(-pos * maxScroll).toFixed(2)}px)`;
    data.mb.apply(data.im, 0, Math.min(30, vel / 120));
  }

  function buildMeter(item, host, g) {
    const wrap = el("div", "", host, { display: "flex", justifyContent: "center" });
    const card = el("div", "", wrap, {
      display: "flex", alignItems: "center", gap: px(18), padding: `${px(18)} ${px(22)}`, borderRadius: px(30),
      background: palette.card, boxShadow: `inset 0 0 0 ${px(2)} rgba(255,255,255,.07), 0 ${px(20)} ${px(40)} rgba(0,0,0,.45)`,
    });
    const track = el("div", "", card, { position: "relative", width: px(item.w ?? 330), height: px(44), borderRadius: px(999), background: "#121212", overflow: "hidden" });
    const fill = el("div", "", track, { position: "absolute", top: "0", bottom: "0", right: "0", borderRadius: px(999), background: `linear-gradient(90deg, ${palette.periwinkle}, #6F83FF)` });
    const ic = el("div", "", card, { width: px(40), height: px(40), display: "grid", placeItems: "center" });
    ic.innerHTML = icon(item.icon ?? "flame", 34 * U, "#FFFFFF", 2);
    return { node: card, fill, track, grow: new Grow(wrap, "y") };
  }

  function drawMeter(item, data, t) {
    const keys = (item.fill ?? [[item.at, 1]]).map(([at, v]) => [timeOf(at), v]);
    let v = keys[0][1];
    let left = 0;
    for (let i = 1; i < keys.length; i++) {
      const kk = ease.inOut(prog(t, keys[i - 1][0], keys[i][0] - keys[i - 1][0]));
      if (t >= keys[i - 1][0]) v = lerp(keys[i - 1][1], keys[i][1], kk);
    }
    if (item.drain === "left") left = 1 - v;
    data.fill.style.width = `${(v * 100).toFixed(3)}%`;
    data.fill.style.right = dir === "rtl" ? `${(left * 100).toFixed(3)}%` : "auto";
    data.fill.style.left = dir === "rtl" ? "auto" : `${(left * 100).toFixed(3)}%`;
  }

  function buildCta(item, host, g) {
    const wrap = el("div", "", host, { display: "flex", justifyContent: "center", position: "relative" });
    const btn = el("div", "", wrap, {
      position: "relative", height: px(item.h ?? 88), borderRadius: px(999), background: palette.blue, color: "#FFFFFF",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
      boxShadow: `0 ${px(16)} ${px(34)} ${px(-10)} rgba(37,52,147,.55)`, fontFamily: `"${FONTS.text}"`, fontWeight: "700", fontSize: px(item.size ?? 44),
    });
    const label = el("span", "", btn, { display: "inline-flex", alignItems: "center", gap: px(16), padding: `0 ${px(36)}` });
    label.innerHTML = `<span>${item.text}</span>${icon("arrow-up", 30 * U, "#FFFFFF", 2.6)}`;
    const ripple = el("div", "", wrap, { position: "absolute", left: "50%", top: "50%", width: px(200), height: px(200), borderRadius: "50%", border: `${px(2)} solid ${g.fg}`, opacity: "0", pointerEvents: "none" });
    const cursor = el("div", "", wrap, { position: "absolute", left: "50%", top: "50%", width: px(64), height: px(64), opacity: "0", zIndex: "5" });
    cursor.innerHTML = CURSOR;
    return { wrap, btn, label, ripple, cursor, grow: new Grow(wrap, "y") };
  }

  const ctaExpand = (item) => (item.expandAt !== undefined ? timeOf(item.expandAt) : item.at + 0.55);
  const ctaClick = (item) => (item.click !== undefined ? timeOf(item.click) : ctaExpand(item) + 0.85);

  function drawCta(item, data, t) {
    const h = (item.h ?? 88) * U;
    const full = data.label.scrollWidth;
    const k = prog(t, item.at, 0.45);
    if (k <= 0) {
      data.btn.style.visibility = "hidden";
      data.cursor.style.opacity = "0";
      return;
    }
    data.btn.style.visibility = "";
    const pop = ease.back(k);
    const expandAt = ctaExpand(item);
    const ke = ease.inOut(prog(t, expandAt, 0.5));
    data.btn.style.width = `${lerp(h, full, ke).toFixed(2)}px`;
    data.label.style.opacity = String(clamp(ke * 1.4 - 0.2));
    const clickAt = ctaClick(item);
    const press = t >= clickAt ? 1 - Math.sin(Math.PI * prog(t, clickAt, 0.22)) * 0.07 : 1;
    data.btn.style.transform = `scale(${(lerp(0.4, 1, pop) * press).toFixed(4)})`;
    data.btn.style.filter = k < 1 ? `blur(${px((1 - ease.out(k)) * 10)})` : "";
    const cIn = prog(t, clickAt - 0.75, 0.7);
    const end = [full * 0.18 * -sign, h * 0.15];
    const start = [end[0] + 260 * U * -sign, end[1] + 420 * U];
    const ce = ease.inOut(cIn);
    const cx = lerp(start[0], end[0], ce);
    const cy = lerp(start[1], end[1], ce);
    const cursorOut = item.cursorOut !== undefined ? timeOf(item.cursorOut) : clickAt + 1.0;
    data.cursor.style.opacity = String(cIn > 0 ? clamp(cIn * 3) * (1 - prog(t, cursorOut, 0.3)) : 0);
    data.cursor.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px) scale(${t >= clickAt ? (1 - Math.sin(Math.PI * prog(t, clickAt, 0.2)) * 0.15).toFixed(3) : 1})`;
    const rk = prog(t, clickAt, 0.6);
    data.ripple.style.opacity = rk > 0 && rk < 1 ? String((1 - rk) * 0.5) : "0";
    data.ripple.style.transform = `translate(calc(-50% + ${cx.toFixed(2)}px), calc(-50% + ${cy.toFixed(2)}px)) scale(${lerp(0.1, 1, ease.out(rk)).toFixed(3)})`;
  }

  function buildImage(item, host) {
    const wrap = el("div", "", host, { display: "flex", justifyContent: "center" });
    const cell = el("div", "", wrap, { position: "relative", width: px(item.w ?? 420) });
    const a = el("img", "", cell, { width: "100%", display: "block" });
    a.src = item.src;
    let b = null;
    if (item.swap) {
      b = el("img", "", cell, { width: "100%", display: "block", position: "absolute", inset: "0", opacity: "0" });
      b.src = item.swap.src;
    }
    return { node: cell, a, b, grow: new Grow(wrap, "y") };
  }

  function buildGap(item, host) {
    const node = el("div", "", host, { height: px(item.h ?? 40), flex: "none" });
    return { node };
  }

  const scenes = (spec.scenes ?? []).map((sc, si) => {
    const g = grounds[sc.bg ?? "cream"];
    if (!g) throw new Error(`Unknown ground ${sc.bg}`);
    const node = el("div", "ktv-scene", root, { position: "absolute", inset: "0", background: g.bg, overflow: "hidden", visibility: "hidden" });
    const cam = el("div", "ktv-cam", node, { position: "absolute", inset: "0", transformOrigin: "50% 45%", willChange: "transform, filter" });
    const anchor = sc.layout ?? "center";
    const stack = el("div", "ktv-stack", cam, {
      position: "absolute", left: px(70), right: px(70),
      top: anchor === "upper" ? `${(sc.top ?? 0.16) * 100}%` : "0", bottom: anchor === "upper" ? "auto" : `${(1 - (sc.centerY ?? 0.46)) * 2 * 100 - 0}%`,
      height: anchor === "upper" ? "auto" : "auto",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: anchor === "upper" ? "flex-start" : "center", gap: px(sc.gap ?? 22),
    });
    if (anchor !== "upper") {
      stack.style.top = "0";
      stack.style.bottom = "0";
      stack.style.transform = `translateY(${((sc.centerY ?? 0.46) - 0.5) * H}px)`;
    }
    let footer = null;
    if (spec.footer && (spec.footer.scenes ?? []).includes(si)) {
      footer = el("div", "ktv-footer", node, {
        position: "absolute", left: "0", right: "0", top: `${(spec.footer.y ?? 0.79) * 100}%`, textAlign: "center",
        fontFamily: `"${FONTS.text}"`, fontWeight: "700", fontSize: px(spec.footer.size ?? 30), lineHeight: "1.25", color: g.fg, whiteSpace: "pre-line",
      });
      footer.textContent = spec.footer.text;
    }
    const scItems = (sc.items ?? []).map((it) => {
      const wrap = el("div", "ktv-item", stack, { position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible" });
      const entry = { spec: it, wrap, g, scene: si };
      if (it.id) {
        if (!/^\w+$/.test(it.id)) throw new Error(`Item id "${it.id}" must be letters, digits or _`);
        ids.set(it.id, it);
      }
      const b = {
        text: buildText, pill: buildPill, badge: buildBadge, checklist: buildChecklist, cards: buildCards,
        phone: buildPhone, meter: buildMeter, cta: buildCta, image: buildImage, gap: buildGap,
      }[it.type ?? "text"];
      if (!b) throw new Error(`Unknown item type ${it.type}`);
      entry.data = b(it, wrap, g);
      items.push(entry);
      return entry;
    });
    return { spec: sc, node, cam, stack, footer, items: scItems, g, mb: motionBlur() };
  });

  function resolveTimes() {
    let last = 0;
    const pending = [];
    scenes.forEach((sc) => {
      sc.items.forEach((entry) => {
        const it = entry.spec;
        pending.push(entry);
        if (typeof it.at !== "string") {
          it.at = it.at ?? last;
          if ((it.type ?? "text") === "text") timeText(it, entry.data);
          last = it.endT ?? it.at;
        }
      });
    });
    for (let pass = 0; pass < 4; pass++) {
      pending.forEach((entry) => {
        const it = entry.spec;
        if (typeof it.at === "string") {
          try {
            it.at = timeOf(it.at);
            if ((it.type ?? "text") === "text") timeText(it, entry.data);
          } catch (err) {
            if (pass === 3) throw err;
          }
        }
      });
    }
    scenes.forEach((sc, i) => {
      const s = sc.spec;
      const firstAt = sc.items.length ? Math.min(...sc.items.map((e) => e.spec.at)) : 0;
      sc.start = s.start !== undefined ? timeOf(s.start) : i === 0 ? 0 : Math.max(0, firstAt - (s.preroll ?? spec.preroll ?? ((s.enter ?? "cut").startsWith("push") ? 0.32 : 0.2)));
    });
    const clicks = items.filter((e) => e.spec.type === "cta").map((e) => ctaClick(e.spec) + 1.8);
    const total = spec.duration ?? Math.max(...items.map((e) => (e.spec.endT ?? e.spec.at) + 1.2), ...clicks, (spec.voiceLength ?? 0) + 0.8);
    scenes.forEach((sc, i) => {
      sc.end = sc.spec.end !== undefined ? timeOf(sc.spec.end) : i < scenes.length - 1 ? scenes[i + 1].start : total;
      sc.items.forEach((e) => {
        if (e.spec.type === "phone" && e.spec.endT === undefined) e.spec.endT = sc.end;
      });
    });
    window.KTV.duration = total;
    window.KTV.cues = scenes.map((sc) => ({ start: sc.start, end: sc.end, enter: sc.spec.enter ?? "cut", exit: sc.spec.exit ?? "none" }));
    window.KTV.events = items.filter((e) => ["pill", "badge", "cta"].includes(e.spec.type)).map((e) => ({ type: e.spec.type, at: e.spec.at, click: e.spec.type === "cta" ? ctaClick(e.spec) : undefined }));
  }

  const PUSH = spec.pushDuration ?? 0.24;

  function drawItem(entry, t) {
    const { spec: it, data, wrap } = entry;
    const type = it.type ?? "text";
    const outT = it.out === undefined ? undefined : timeOf(it.out);
    let k = 1;
    if (type === "text") {
      drawText(it, data, t);
      wrap.style.height = "";
      return;
    }
    if (type === "gap") return;
    if (type === "checklist") {
      data.rows.forEach((r, i) => {
        const t0 = r.entry.at !== undefined ? timeOf(r.entry.at) : it.at + i * 0.6;
        const kk = prog(t, t0, 0.4);
        r.grow.set(ease.outQuint(kk));
        revealStyle(r.label, t, t0 + 0.04, "soft");
        revealStyle(r.tick, t, t0 + 0.14, "scale");
        r.rule.style.width = `${(ease.inOut(prog(t, t0 + 0.1, 0.6)) * 100).toFixed(2)}%`;
      });
      return;
    }
    k = prog(t, it.at, 0.4);
    if (entry.data.grow) entry.data.grow.set(it.reserve ? 1 : ease.outQuint(k));
    if (type === "cards") {
      drawCards(it, data, t);
      return;
    }
    if (type === "phone") {
      drawPhone(it, data, t);
      return;
    }
    if (type === "cta") {
      drawCta(it, data, t);
      return;
    }
    const node = data.node;
    if (exitStyle(node, t, outT, it.at)) return;
    revealStyle(node, t, it.at, type === "pill" || type === "badge" ? "scale" : it.reveal ?? "soft");
    if (type === "badge") {
      const rk = prog(t, it.at + 0.15, 0.9);
      data.ring.style.opacity = rk > 0 && rk < 1 ? String((1 - rk) * 0.6) : "0";
      data.ring.style.transform = `scale(${lerp(1, 2.1, ease.out(rk)).toFixed(3)})`;
    }
    if (type === "meter") drawMeter(it, data, t);
    if (type === "image" && data.b) {
      const sk = ease.inOut(prog(t, timeOf(it.swap.at), 0.45));
      data.b.style.opacity = String(sk);
      data.a.style.opacity = String(1 - sk);
    }
  }

  function camera(sc, t) {
    const s = sc.spec;
    const life = clamp((t - sc.start) / Math.max(0.01, sc.end - sc.start));
    const drift = s.drift ?? 0.035;
    let scale = 1 + drift * life;
    let blur = 0;
    let ty = 0;
    for (const entry of sc.items) {
      if (!entry.spec.kick) continue;
      const t0 = entry.spec.words?.[0]?.t ?? entry.spec.at;
      if (t < t0) continue;
      const k = prog(t, t0, 0.5);
      scale *= 1 + (typeof entry.spec.kick === "number" ? entry.spec.kick : 0.07) * (1 - ease.out(k)) * Math.min(1, k * 12);
    }
    const exit = s.exit ?? "none";
    if (exit === "zoom") {
      const k = ease.in(prog(t, sc.end - 0.42, 0.42));
      scale *= lerp(1, 2.6, k);
      blur = k * 26;
    } else if (exit === "blur") {
      const k = ease.in(prog(t, sc.end - 0.36, 0.36));
      blur = k * 22;
      sc.cam.style.opacity = String(1 - k);
      ty = -k * 30 * U;
    } else {
      sc.cam.style.opacity = "1";
    }
    sc.cam.style.transform = `translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(5)})`;
    sc.cam.style.filter = blur > 0.2 ? `blur(${(blur * U).toFixed(2)}px)` : "";
  }

  function seek(t) {
    scenes.forEach((sc, i) => {
      const next = scenes[i + 1];
      const nextEnter = next?.spec.enter ?? "cut";
      const tail = nextEnter.startsWith("push") ? PUSH : 0;
      const live = t >= sc.start && t < sc.end + tail;
      sc.node.style.visibility = live ? "" : "hidden";
      if (!live) return;
      sc.node.style.zIndex = String(i + 1);
      let x = 0;
      let mbx = 0;
      const enter = sc.spec.enter ?? "cut";
      if (enter.startsWith("push") && t < sc.start + PUSH) {
        const k = prog(t, sc.start, PUSH);
        const from = enter === "push-left" ? 1 : -1;
        x = from * W * (1 - ease.inOut(k));
        mbx = Math.sin(Math.PI * k) * 70;
        sc.node.style.boxShadow = `${from * -60 * U}px 0 ${120 * U}px rgba(0,0,0,.55)`;
      } else {
        sc.node.style.boxShadow = "";
      }
      if (next && nextEnter.startsWith("push") && t >= sc.end) {
        const k = prog(t, sc.end, PUSH);
        const to = nextEnter === "push-left" ? -1 : 1;
        x = to * W * 0.35 * ease.inOut(k);
        mbx = Math.sin(Math.PI * k) * 60;
      }
      sc.node.style.transform = x ? `translateX(${x.toFixed(2)}px)` : "";
      sc.mb.apply(sc.node, mbx * U, 0);
      camera(sc, t);
      sc.items.forEach((entry) => drawItem(entry, t));
      if (sc.footer) {
        const f = spec.footer;
        sc.footer.style.opacity = String(f.until !== undefined && t > timeOf(f.until) ? 0 : 1);
      }
    });
  }

  async function ready() {
    await document.fonts.ready;
    const missing = Object.values(FONTS).filter((family) => ![...document.fonts].some((f) => f.family.replace(/"/g, "") === family && f.status === "loaded"));
    if (missing.length) throw new Error(`Fonts did not load: ${missing.join(", ")}`);
    const imgs = [...document.images];
    const broken = [];
    await Promise.all(imgs.map((im) => im.decode().catch(() => broken.push(im.getAttribute("src")))));
    if (broken.length) throw new Error(`Images failed to load: ${broken.join(", ")}`);
    resolveTimes();
    scenes.forEach((sc) => {
      sc.node.style.visibility = "";
      sc.items.forEach((entry) => {
        const d = entry.data;
        if (d.words) {
          d.words.forEach((w) => {
            w.slot.style.width = "";
            w.grow.measure();
          });
          d.rows.forEach((r) => {
            r.row.style.height = "";
            r.grow.measure();
          });
        }
        if (d.rows && !d.words) d.rows.forEach((r) => r.grow.measure());
        if (d.grow) d.grow.measure();
      });
      sc.node.style.visibility = "hidden";
    });
    return { duration: window.KTV.duration, cues: window.KTV.cues, events: window.KTV.events };
  }

  window.KTV = { seek, ready, duration: 0 };
})();
