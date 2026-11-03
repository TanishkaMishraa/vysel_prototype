/**
 * Style DNA pipeline — pure, framework-free logic shared by the Style Lab.
 *
 * Everything here runs on RGB pixel data already read off a <canvas>, so it
 * has no DOM dependencies of its own (aside from the `CanvasRenderingContext2D`
 * type used for `getImageData`) and can be unit tested directly with `node`/`vitest`.
 *
 * Pipeline: sample skin pixels from a few anatomical zones -> cluster them
 * with k-means to reject outliers (shadows, stray hair, specular highlights)
 * -> convert the dominant cluster to CIELAB -> compute the Individual
 * Typology Angle (ITA-degrees), the metric dermatology/cosmetics science uses
 * to classify skin depth -> derive undertone from the a-star / b-star balance
 * -> generate clothing + makeup palettes by rotating that hue through HSL math.
 */

export const CAPTURE_SIZE = 480;

export interface OvalGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface Zone {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export const OVAL: OvalGeometry = { cx: 0.5, cy: 0.45, rx: 0.3, ry: 0.4 };

export const ZONES = {
  forehead: { cx: OVAL.cx, cy: OVAL.cy - OVAL.ry * 0.55, hw: OVAL.rx * 0.4, hh: OVAL.ry * 0.12 },
  cheekL: { cx: OVAL.cx - OVAL.rx * 0.55, cy: OVAL.cy + OVAL.ry * 0.08, hw: OVAL.rx * 0.22, hh: OVAL.ry * 0.16 },
  cheekR: { cx: OVAL.cx + OVAL.rx * 0.55, cy: OVAL.cy + OVAL.ry * 0.08, hw: OVAL.rx * 0.22, hh: OVAL.ry * 0.16 },
  lips: { cx: OVAL.cx, cy: OVAL.cy + OVAL.ry * 0.62, hw: OVAL.rx * 0.3, hh: OVAL.ry * 0.09 },
  eyeL: { cx: OVAL.cx - OVAL.rx * 0.38, cy: OVAL.cy - OVAL.ry * 0.06, hw: OVAL.rx * 0.2, hh: OVAL.ry * 0.08 },
  eyeR: { cx: OVAL.cx + OVAL.rx * 0.38, cy: OVAL.cy - OVAL.ry * 0.06, hw: OVAL.rx * 0.2, hh: OVAL.ry * 0.08 },
} as const satisfies Record<string, Zone>;

export type ZoneKey = keyof typeof ZONES;

export function zonePx(z: Zone, size: number = CAPTURE_SIZE) {
  return { x: (z.cx - z.hw) * size, y: (z.cy - z.hh) * size, w: z.hw * 2 * size, h: z.hh * 2 * size };
}

/* ------------------------------------------------------------------ *
 * Color science: sRGB -> linear -> XYZ -> CIELAB, ITA angle,
 * depth + undertone classification. Standard D65 formulas.
 * ------------------------------------------------------------------ */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToXyz(r: number, g: number, b: number) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
    y: (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100,
    z: (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100,
  };
}

export function xyzToLab(x: number, y: number, z: number): Lab {
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / refX);
  const fy = f(y / refY);
  const fz = f(z / refZ);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

/** Individual Typology Angle (Chardon et al.) — real dermatological metric for skin depth. */
export function computeITA(L: number, b: number): number {
  return Math.atan2(L - 50, b) * (180 / Math.PI);
}

export type DepthCategory = "Very Light" | "Light" | "Intermediate" | "Tan" | "Brown" | "Deep";

export function classifyDepth(ita: number): DepthCategory {
  if (ita > 55) return "Very Light";
  if (ita > 41) return "Light";
  if (ita > 28) return "Intermediate";
  if (ita > 10) return "Tan";
  if (ita > -30) return "Brown";
  return "Deep";
}

export type Undertone = "Warm" | "Cool" | "Neutral";

export function classifyUndertone(a: number, b: number): Undertone {
  const total = Math.abs(a) + Math.abs(b);
  if (total < 1) return "Neutral";
  const r = b / total;
  if (r > 0.58) return "Warm";
  if (r < 0.42) return "Cool";
  return "Neutral";
}

/* ------------------------------------------------------------------ *
 * k-means over sampled RGB pixels, with post-merge of nearby centroids
 * so one true population isn't fragmented, then the largest resulting
 * group is taken as the dominant skin tone.
 * ------------------------------------------------------------------ */

export interface Cluster {
  centroid: RGB;
  count: number;
  avgDist: number;
}

export function kMeans(samples: RGB[], k: number, iterations: number): Cluster[] {
  if (samples.length === 0) return [];
  k = Math.min(k, samples.length);
  const centroids: RGB[] = [];
  const used = new Set<number>();
  let tries = 0;
  while (centroids.length < k && tries < samples.length * 4) {
    tries++;
    const idx = Math.floor(Math.random() * samples.length);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push({ ...samples[idx] });
  }
  let assignments = new Array(samples.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dr = samples[i].r - centroids[c].r;
        const dg = samples[i].g - centroids[c].g;
        const db = samples[i].b - centroids[c].b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let j = 0; j < samples.length; j++) {
      const a = assignments[j];
      sums[a].r += samples[j].r;
      sums[a].g += samples[j].g;
      sums[a].b += samples[j].b;
      sums[a].n++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n > 0) {
        centroids[c] = { r: sums[c].r / sums[c].n, g: sums[c].g / sums[c].n, b: sums[c].b / sums[c].n };
      }
    }
  }
  const clusters: Cluster[] = centroids.map((c, idx) => {
    const members = samples.filter((_, i) => assignments[i] === idx);
    let avgDist = 0;
    members.forEach((m) => {
      const dr = m.r - c.r;
      const dg = m.g - c.g;
      const db = m.b - c.b;
      avgDist += Math.sqrt(dr * dr + dg * dg + db * db);
    });
    avgDist = members.length ? avgDist / members.length : 0;
    return { centroid: c, count: members.length, avgDist };
  });
  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}

/** k-means (k=2) + merge-nearby-centroids so a single skin population isn't split in two. */
export function dominantSkinColor(samples: RGB[]): Cluster {
  const clusters = kMeans(samples, 2, 12);
  const merged: Cluster[] = [];
  clusters.forEach((c) => {
    const target = merged.find((m) => {
      const dr = m.centroid.r - c.centroid.r;
      const dg = m.centroid.g - c.centroid.g;
      const db = m.centroid.b - c.centroid.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < 18;
    });
    if (target) {
      const totalN = target.count + c.count;
      target.centroid = {
        r: (target.centroid.r * target.count + c.centroid.r * c.count) / totalN,
        g: (target.centroid.g * target.count + c.centroid.g * c.count) / totalN,
        b: (target.centroid.b * target.count + c.centroid.b * c.count) / totalN,
      };
      target.avgDist = (target.avgDist * target.count + c.avgDist * c.count) / totalN;
      target.count = totalN;
    } else {
      merged.push({ centroid: { ...c.centroid }, count: c.count, avgDist: c.avgDist });
    }
  });
  merged.sort((a, b) => b.count - a.count);
  return merged[0] ?? { centroid: { r: 200, g: 160, b: 135 }, count: 0, avgDist: 0 };
}

/* ------------------------------------------------------------------ *
 * HSL helpers + palette generation via hue rotation.
 * ------------------------------------------------------------------ */

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  s /= 100;
  l /= 100;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function rgbStr(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export interface Swatch {
  label: string;
  hex: string;
  css: string;
  r: number;
  g: number;
  b: number;
}

function toSwatch(rgb: RGB, label: string): Swatch {
  return { label, hex: toHex(rgb.r, rgb.g, rgb.b), css: rgbStr(rgb.r, rgb.g, rgb.b), r: rgb.r, g: rgb.g, b: rgb.b };
}

export function generateClothingPalette(rgb: RGB, undertone: Undertone): Swatch[] {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const bias = undertone === "Warm" ? -8 : undertone === "Cool" ? 8 : 0;
  const specs = [
    { label: "Analogous Warm", dh: 28 + bias, s: 55, l: 42 },
    { label: "Analogous Cool", dh: -28 + bias, s: 50, l: 38 },
    { label: "Complementary Accent", dh: 180 + bias, s: 48, l: 40 },
    { label: "Jewel Contrast", dh: 210 + bias, s: 60, l: 26 },
    { label: "Neutral Anchor", dh: 0, s: 14, l: 20 },
    { label: "Soft Highlight", dh: 28 + bias, s: 32, l: 74 },
  ];
  return specs.map((sp) => toSwatch(hslToRgb(hsl.h + sp.dh, sp.s, sp.l), sp.label));
}

export interface MakeupPalette {
  lipstick: Swatch[];
  blush: Swatch[];
  eyeshadow: Swatch[];
}

export function generateMakeupPalette(rgb: RGB, undertone: Undertone, depth: DepthCategory): MakeupPalette {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const bias = undertone === "Warm" ? 6 : undertone === "Cool" ? -6 : 0;
  const deep = depth === "Brown" || depth === "Deep";
  const mk = (h: number, s: number, l: number, label: string) => toSwatch(hslToRgb(h, s, l), label);
  return {
    lipstick: [
      mk(hsl.h + bias, 40, deep ? 40 : 52, "Your Nude"),
      mk(358 + bias, 66, deep ? 38 : 46, "Signature Red"),
      mk(336 + bias, 58, deep ? 26 : 32, "Deep Berry"),
    ],
    blush: [mk(8 + bias, 46, 70, "Warm Flush"), mk(350 + bias, 34, 74, "Soft Rose")],
    eyeshadow: [mk(hsl.h + 16, 34, 34, "Matte Bronze"), mk(hsl.h + 165 + bias, 22, 40, "Soft Contrast")],
  };
}

/* ------------------------------------------------------------------ *
 * Pixel sampling from a canvas zone + the full analysis pipeline.
 * ------------------------------------------------------------------ */

export function sampleZone(
  ctx: CanvasRenderingContext2D,
  zoneKey: ZoneKey,
  grid = 8,
  zones: Partial<Record<ZoneKey, Zone>> = ZONES
): RGB[] {
  const z = zonePx(zones[zoneKey] ?? ZONES[zoneKey]);
  const out: RGB[] = [];
  let data: ImageData;
  try {
    data = ctx.getImageData(Math.max(0, z.x), Math.max(0, z.y), Math.max(1, z.w), Math.max(1, z.h));
  } catch {
    return out;
  }
  const w = data.width;
  const h = data.height;
  const px = data.data;
  const stepX = Math.max(1, Math.floor(w / grid));
  const stepY = Math.max(1, Math.floor(h / grid));
  for (let yy = 0; yy < h; yy += stepY) {
    for (let xx = 0; xx < w; xx += stepX) {
      const idx = (yy * w + xx) * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      const al = px[idx + 3];
      if (al < 200) continue;
      const lum = (r + g + b) / 3;
      if (lum < 25 || lum > 250) continue; // reject near-black shadow / near-white blowout
      out.push({ r, g, b });
    }
  }
  return out;
}

export interface StyleDnaResult {
  rgb: RGB;
  hex: string;
  lab: Lab;
  ita: number;
  depth: DepthCategory;
  undertone: Undertone;
  confidence: number;
  sampleCount: number;
  clothing: Swatch[];
  makeup: MakeupPalette;
}

export function analyzeCanvas(canvas: HTMLCanvasElement, zones: Partial<Record<ZoneKey, Zone>> = {}): StyleDnaResult {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  let samples: RGB[] = [
    ...sampleZone(ctx, "forehead", 9, zones),
    ...sampleZone(ctx, "cheekL", 8, zones),
    ...sampleZone(ctx, "cheekR", 8, zones),
  ];
  if (samples.length < 6) {
    samples = [
      ...sampleZone(ctx, "forehead", 14, zones),
      ...sampleZone(ctx, "cheekL", 12, zones),
      ...sampleZone(ctx, "cheekR", 12, zones),
    ];
  }
  const dom = dominantSkinColor(samples.length ? samples : [{ r: 205, g: 165, b: 140 }]);
  const rgb = dom.centroid;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  const ita = computeITA(lab.L, lab.b);
  const depth = classifyDepth(ita);
  const undertone = classifyUndertone(lab.a, lab.b);
  const confidence = Math.max(52, Math.min(97, Math.round(100 - dom.avgDist * 1.9)));
  return {
    rgb,
    hex: toHex(rgb.r, rgb.g, rgb.b),
    lab,
    ita,
    depth,
    undertone,
    confidence,
    sampleCount: samples.length,
    clothing: generateClothingPalette(rgb, undertone),
    makeup: generateMakeupPalette(rgb, undertone, depth),
  };
}

/**
 * Draws a stylized, clearly-illustrative demo bust so the pipeline can run
 * on real pixel data before a visitor grants camera access or uploads
 * anything — used for the homepage teaser and the Lab's initial "sample scan".
 */
export function drawDemoPortrait(canvas: HTMLCanvasElement, size: number = CAPTURE_SIZE): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const bgGrad = ctx.createLinearGradient(0, 0, 0, size);
  bgGrad.addColorStop(0, "#20171b");
  bgGrad.addColorStop(1, "#120e11");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#2c2126";
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 1.02, size * 0.46, size * 0.3, 0, Math.PI, 2 * Math.PI);
  ctx.fill();

  const ovalPx = { cx: OVAL.cx * size, cy: OVAL.cy * size, rx: OVAL.rx * size, ry: OVAL.ry * size };
  const faceGrad = ctx.createRadialGradient(
    ovalPx.cx - ovalPx.rx * 0.3,
    ovalPx.cy - ovalPx.ry * 0.4,
    10,
    ovalPx.cx,
    ovalPx.cy,
    ovalPx.rx * 1.5
  );
  faceGrad.addColorStop(0, "#d8a780");
  faceGrad.addColorStop(0.55, "#c8946c");
  faceGrad.addColorStop(1, "#a8734f");
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(ovalPx.cx, ovalPx.cy, ovalPx.rx, ovalPx.ry, 0, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = "rgba(196,110,90,0.18)";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(ovalPx.cx + side * ovalPx.rx * 0.5, ovalPx.cy + ovalPx.ry * 0.12, ovalPx.rx * 0.24, ovalPx.ry * 0.16, 0, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.fillStyle = "#15100f";
  ctx.beginPath();
  ctx.ellipse(ovalPx.cx, ovalPx.cy - ovalPx.ry * 0.62, ovalPx.rx * 1.12, ovalPx.ry * 0.62, 0, Math.PI, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = "#241812";
  (["eyeL", "eyeR"] as const).forEach((key) => {
    const z = ZONES[key];
    ctx.beginPath();
    ctx.ellipse(z.cx * size, z.cy * size, z.hw * size * 0.5, z.hh * size * 0.42, 0, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.fillStyle = "#8a4a42";
  const lz = ZONES.lips;
  ctx.beginPath();
  ctx.ellipse(lz.cx * size, lz.cy * size, lz.hw * size * 0.65, lz.hh * size * 0.7, 0, 0, 2 * Math.PI);
  ctx.fill();
}
