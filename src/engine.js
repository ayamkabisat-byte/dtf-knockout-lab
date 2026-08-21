const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / Math.max(1e-8, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function srgbToLinear(v) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function rgbToOklab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { L, a, b: bb, C: Math.hypot(a, bb) };
}

function colorDistance(a, b) {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

function patternThreshold(x, y, period, angleDeg, shape) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const xr = x * cos + y * sin;
  const yr = -x * sin + y * cos;
  const fx = ((xr / period) % 1 + 1) % 1 - 0.5;
  const fy = ((yr / period) % 1 + 1) % 1 - 0.5;
  const ax = Math.abs(fx) * 2, ay = Math.abs(fy) * 2;
  switch (shape) {
    case 'square': return clamp(Math.max(ax, ay));
    case 'diamond': return clamp((ax + ay) * 0.72);
    case 'ellipse': return clamp(Math.sqrt((fx * 1.55) ** 2 + (fy * 0.72) ** 2) * 1.65);
    case 'line': return clamp(ax);
    case 'circle':
    default: return clamp(Math.hypot(fx, fy) * 1.42);
  }
}

function makeProcessor(settings) {
  const {
    knockoutColor = '#000000', tolerance = 30, strength = 100,
    chromaProtection = 70, mode = 'halftone', lpi = 35,
    angle = 22.5, shape = 'circle', dpi = 300,
  } = settings;

  const targetRgb = hexToRgb(knockoutColor);
  const targetLab = rgbToOklab(targetRgb.r, targetRgb.g, targetRgb.b);
  const radius = 0.008 + Math.pow(tolerance / 100, 1.35) * 0.34;
  const featherStart = radius * 0.28;
  const strengthN = strength / 100;
  const chromaN = chromaProtection / 100;
  // Preview rendering may use an effective DPI below the output DPI after
  // downsampling. Allow periods down to one preview pixel so its physical dot
  // spacing remains proportional to the full-resolution export.
  const period = Math.max(1, dpi / Math.max(1, lpi));
  const targetNeutrality = 1 - clamp(targetLab.C / 0.14);

  return (r, g, b, sourceAlpha, x, y) => {
    if (sourceAlpha === 0) return { alpha: 0, match: 1 };
    const lab = rgbToOklab(r, g, b);
    const distance = colorDistance(lab, targetLab);
    let match = 1 - smoothstep(featherStart, radius, distance);
    const excessChroma = clamp((lab.C - targetLab.C - 0.012) / 0.16);
    match *= 1 - excessChroma * targetNeutrality * chromaN;
    match = clamp(match * strengthN);

    const printCoverage = 1 - match;
    let printed;
    if (mode === 'hard') printed = printCoverage >= 0.5;
    else if (printCoverage <= 0.002) printed = false;
    else if (printCoverage >= 0.998) printed = true;
    else printed = printCoverage >= patternThreshold(x, y, period, angle, shape);

    return { alpha: printed && sourceAlpha >= 128 ? 255 : 0, match };
  };
}

export function processImageData(source, width, height, settings) {
  const processPixel = makeProcessor(settings);
  const processed = new Uint8ClampedArray(source.data.length);
  const mask = new Uint8ClampedArray(source.data.length);
  const knockoutMap = new Uint8ClampedArray(source.data.length);
  const original = new Uint8ClampedArray(source.data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2], sourceAlpha = source.data[i + 3];
      const { alpha, match } = processPixel(r, g, b, sourceAlpha, x, y);
      processed[i] = r; processed[i + 1] = g; processed[i + 2] = b; processed[i + 3] = alpha;
      mask[i] = alpha; mask[i + 1] = alpha; mask[i + 2] = alpha; mask[i + 3] = 255;
      const k = Math.round(match * 255);
      knockoutMap[i] = k; knockoutMap[i + 1] = k; knockoutMap[i + 2] = k; knockoutMap[i + 3] = 255;
    }
  }
  return {
    processed: new ImageData(processed, width, height),
    mask: new ImageData(mask, width, height),
    knockoutMap: new ImageData(knockoutMap, width, height),
    original: new ImageData(original, width, height),
  };
}

// Memory-lean version used for full-resolution export.
export function processForExport(source, width, height, settings) {
  const processPixel = makeProcessor(settings);
  const processed = new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2], sourceAlpha = source.data[i + 3];
      const { alpha } = processPixel(r, g, b, sourceAlpha, x, y);
      processed[i] = r; processed[i + 1] = g; processed[i + 2] = b; processed[i + 3] = alpha;
    }
  }
  return new ImageData(processed, width, height);
}
