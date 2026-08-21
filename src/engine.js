const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / Math.max(1e-8, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function toleranceRadius(tolerance, background = false) {
  const t = clamp(Number(tolerance) / 100);
  return background
    ? 0.010 + Math.pow(t, 1.2) * 0.42
    : 0.008 + Math.pow(t, 1.35) * 0.34;
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;
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
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
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
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xr = x * cos + y * sin;
  const yr = -x * sin + y * cos;
  const fx = ((xr / period) % 1 + 1) % 1 - 0.5;
  const fy = ((yr / period) % 1 + 1) % 1 - 0.5;
  const ax = Math.abs(fx) * 2;
  const ay = Math.abs(fy) * 2;

  switch (shape) {
    case 'square': return clamp(Math.max(ax, ay));
    case 'diamond': return clamp((ax + ay) * 0.72);
    case 'ellipse': return clamp(Math.sqrt((fx * 1.55) ** 2 + (fy * 0.72) ** 2) * 1.65);
    case 'line': return clamp(ax);
    case 'circle':
    default: return clamp(Math.hypot(fx, fy) * 1.42);
  }
}

function makeRasterizer(settings) {
  const {
    mode = 'halftone', lpi = 35, angle = 22.5,
    shape = 'circle', dpi = 300,
  } = settings;
  const period = Math.max(1, dpi / Math.max(1, lpi));

  return (coverage, x, y) => {
    if (mode === 'hard') return coverage >= 0.5;
    if (coverage <= 0.002) return false;
    if (coverage >= 0.998) return true;
    return coverage >= patternThreshold(x, y, period, angle, shape);
  };
}

function makeInternalProcessor(settings) {
  const {
    knockoutColor = '#000000', internalTolerance = 34,
    strength = 100, chromaProtection = 80,
  } = settings;

  const targetRgb = hexToRgb(knockoutColor);
  const targetLab = rgbToOklab(targetRgb.r, targetRgb.g, targetRgb.b);
  const radius = toleranceRadius(internalTolerance, false);
  const featherStart = radius * 0.28;
  const strengthN = clamp(strength / 100);
  const chromaN = clamp(chromaProtection / 100);
  const targetNeutrality = 1 - clamp(targetLab.C / 0.14);

  return (r, g, b, sourceAlpha) => {
    if (sourceAlpha === 0) return { coverage: 0, match: 1 };

    const lab = rgbToOklab(r, g, b);
    const distance = colorDistance(lab, targetLab);
    let match = 1 - smoothstep(featherStart, radius, distance);

    // Protect strongly chromatic dark colors (navy, burgundy, dark green, etc.)
    // when the selected knockout target is neutral/near-black.
    const excessChroma = clamp((lab.C - targetLab.C - 0.012) / 0.16);
    match *= 1 - excessChroma * targetNeutrality * chromaN;
    match = clamp(match * strengthN);

    // Preserve source alpha as continuous coverage, then convert to binary only
    // at the final rasterization stage.
    const sourceOpacity = sourceAlpha / 255;
    const coverage = clamp((1 - match) * sourceOpacity);
    return { coverage, match };
  };
}

export function sampleEdgeBackgroundColor(source, width, height) {
  const data = source.data;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.012));
  const counts = new Uint32Array(4096);
  const sumR = new Float64Array(4096);
  const sumG = new Float64Array(4096);
  const sumB = new Float64Array(4096);

  const addPixel = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] <= 8) return;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    counts[key]++;
    sumR[key] += r;
    sumG[key] += g;
    sumB[key] += b;
  };

  for (let y = 0; y < band; y++) {
    for (let x = 0; x < width; x++) {
      addPixel(x, y);
      if (height - 1 - y !== y) addPixel(x, height - 1 - y);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = band; y < height - band; y++) {
      addPixel(x, y);
      if (width - 1 - x !== x) addPixel(width - 1 - x, y);
    }
  }

  let winner = -1;
  let bestCount = 0;
  for (let key = 0; key < counts.length; key++) {
    if (counts[key] > bestCount) {
      bestCount = counts[key];
      winner = key;
    }
  }

  if (winner < 0 || bestCount === 0) return '#000000';
  return rgbToHex({
    r: sumR[winner] / bestCount,
    g: sumG[winner] / bestCount,
    b: sumB[winner] / bestCount,
  });
}

function candidateSupport(states, width, height, index) {
  const x = index % width;
  const y = Math.floor(index / width);
  let count = 0;

  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    const row = yy * width;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      // 1 = candidate, 2 = connected background, 3 = rejected thin bridge.
      // All non-zero values were originally background-color candidates.
      if (states[row + xx] !== 0) count++;
    }
  }
  return count;
}

function buildEdgeConnectedBackground(source, width, height, settings) {
  const {
    backgroundCleanup = true,
    backgroundColor = '#000000',
    backgroundTolerance = 58,
  } = settings;

  const total = width * height;
  const states = new Uint8Array(total);
  if (!backgroundCleanup || total === 0) return states;

  const targetRgb = hexToRgb(backgroundColor);
  const targetLab = rgbToOklab(targetRgb.r, targetRgb.g, targetRgb.b);
  const radius = toleranceRadius(backgroundTolerance, true);
  const data = source.data;

  // Pass 1: color candidate map.
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const alpha = data[i + 3];
    if (alpha <= 8) {
      states[p] = 1;
      continue;
    }
    const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
    if (colorDistance(lab, targetLab) <= radius) states[p] = 1;
  }

  // Pass 2: flood only from canvas edges. A 3x3 neighborhood-consensus check
  // blocks many thin dark outlines from becoming bridges into internal artwork.
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueueSeed = (p) => {
    if (states[p] !== 1) return;
    states[p] = 2;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    enqueueSeed(x);
    if (height > 1) enqueueSeed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueSeed(y * width);
    if (width > 1) enqueueSeed(y * width + width - 1);
  }

  const tryExpand = (p) => {
    if (states[p] !== 1) return;
    // Require a local majority of background-color candidates. This still
    // follows broad/soft backgrounds but resists narrow black line art.
    if (candidateSupport(states, width, height, p) < 5) {
      states[p] = 3;
      return;
    }
    states[p] = 2;
    queue[tail++] = p;
  };

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = Math.floor(p / width);
    if (x > 0) tryExpand(p - 1);
    if (x + 1 < width) tryExpand(p + 1);
    if (y > 0) tryExpand(p - width);
    if (y + 1 < height) tryExpand(p + width);
  }

  return states;
}

function processCoverage(source, width, height, settings) {
  const total = width * height;
  const data = source.data;
  const background = buildEdgeConnectedBackground(source, width, height, settings);
  const processInternal = makeInternalProcessor(settings);
  const coverage = new Uint8Array(total);
  const internalMatch = new Uint8Array(total);

  for (let p = 0, i = 0; p < total; p++, i += 4) {
    if (background[p] === 2 || data[i + 3] === 0) {
      coverage[p] = 0;
      internalMatch[p] = 0;
      continue;
    }

    const result = processInternal(data[i], data[i + 1], data[i + 2], data[i + 3]);
    coverage[p] = Math.round(result.coverage * 255);
    internalMatch[p] = Math.round(result.match * 255);
  }

  return { coverage, internalMatch, background };
}

function renderColorFromCoverage(source, coverage, width, height, settings) {
  const rasterize = makeRasterizer(settings);
  const output = new Uint8ClampedArray(source.data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const printed = rasterize(coverage[p] / 255, x, y);
      output[i] = source.data[i];
      output[i + 1] = source.data[i + 1];
      output[i + 2] = source.data[i + 2];
      output[i + 3] = printed ? 255 : 0;
    }
  }

  return new ImageData(output, width, height);
}

export function rasterizeCoverageMask(coverage, width, height, settings) {
  const rasterize = makeRasterizer(settings);
  const output = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!rasterize(coverage[p] / 255, x, y)) continue;
      const i = p * 4;
      output[i] = 255;
      output[i + 1] = 255;
      output[i + 2] = 255;
      output[i + 3] = 255;
    }
  }

  return new ImageData(output, width, height);
}

export function processImageData(source, width, height, settings) {
  const total = width * height;
  const { coverage, internalMatch, background } = processCoverage(source, width, height, settings);
  const processed = renderColorFromCoverage(source, coverage, width, height, settings);
  const mask = new Uint8ClampedArray(total * 4);
  const knockoutMap = new Uint8ClampedArray(total * 4);
  const backgroundMap = new Uint8ClampedArray(total * 4);
  const coverageMap = new Uint8ClampedArray(total * 4);
  const original = new Uint8ClampedArray(source.data);

  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const alpha = processed.data[i + 3];
    mask[i] = alpha;
    mask[i + 1] = alpha;
    mask[i + 2] = alpha;
    mask[i + 3] = 255;

    const internal = background[p] === 2 ? 0 : internalMatch[p];
    knockoutMap[i] = internal;
    knockoutMap[i + 1] = internal;
    knockoutMap[i + 2] = internal;
    knockoutMap[i + 3] = 255;

    const bg = background[p] === 2 ? 255 : 0;
    backgroundMap[i] = bg;
    backgroundMap[i + 1] = bg;
    backgroundMap[i + 2] = bg;
    backgroundMap[i + 3] = 255;

    const cov = coverage[p];
    coverageMap[i] = cov;
    coverageMap[i + 1] = cov;
    coverageMap[i + 2] = cov;
    coverageMap[i + 3] = 255;
  }

  return {
    processed,
    mask: new ImageData(mask, width, height),
    knockoutMap: new ImageData(knockoutMap, width, height),
    backgroundMap: new ImageData(backgroundMap, width, height),
    coverageMap: new ImageData(coverageMap, width, height),
    coverage,
    original: new ImageData(original, width, height),
  };
}

export function processCoverageForExport(source, width, height, settings) {
  return processCoverage(source, width, height, settings).coverage;
}

export function processForExport(source, width, height, settings) {
  const coverage = processCoverageForExport(source, width, height, settings);
  return renderColorFromCoverage(source, coverage, width, height, settings);
}
