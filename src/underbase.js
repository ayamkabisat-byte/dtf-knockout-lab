import { rasterizeCoverageMask } from './engine.js';

function binarySupport(coverage) {
  const support = new Uint8Array(coverage.length);
  // Ignore negligible floating-point/edge coverage when defining the support
  // perimeter. The actual tonal coverage is preserved after the choke.
  for (let p = 0; p < coverage.length; p++) support[p] = coverage[p] >= 2 ? 1 : 0;
  return support;
}

function erodeHorizontal(input, width, height, radius) {
  if (radius <= 0) return input;
  const output = new Uint8Array(input.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = radius; x < width - radius; x++) {
      let keep = 1;
      for (let dx = -radius; dx <= radius; dx++) {
        if (!input[row + x + dx]) { keep = 0; break; }
      }
      output[row + x] = keep;
    }
  }
  return output;
}

function erodeVertical(input, width, height, radius) {
  if (radius <= 0) return input;
  const output = new Uint8Array(input.length);
  for (let y = radius; y < height - radius; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dy = -radius; dy <= radius; dy++) {
        if (!input[(y + dy) * width + x]) { keep = 0; break; }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
}

export function createUnderbaseImageData(coverage, width, height, chokePx = 0, rasterSettings = {}) {
  const radius = Math.max(0, Math.round(chokePx));
  const support = binarySupport(coverage);
  const chokedSupport = radius > 0
    ? erodeVertical(erodeHorizontal(support, width, height, radius), width, height, radius)
    : support;

  // Important v0.3 change: choke the continuous support BEFORE halftoning.
  // This preserves small halftone dots inside the artwork instead of eroding
  // every final dot independently as v0.2 did.
  const chokedCoverage = new Uint8Array(coverage.length);
  for (let p = 0; p < coverage.length; p++) {
    if (chokedSupport[p]) chokedCoverage[p] = coverage[p];
  }

  return rasterizeCoverageMask(chokedCoverage, width, height, rasterSettings);
}
