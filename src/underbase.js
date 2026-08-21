function binaryAlpha(processed, width, height) {
  const source = processed.data;
  const alpha = new Uint8Array(width * height);
  for (let p = 0, i = 3; p < alpha.length; p++, i += 4) alpha[p] = source[i] >= 128 ? 1 : 0;
  return alpha;
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

export function createUnderbaseImageData(processed, width, height, chokePx = 0) {
  const radius = Math.max(0, Math.round(chokePx));
  const base = binaryAlpha(processed, width, height);
  const eroded = radius > 0
    ? erodeVertical(erodeHorizontal(base, width, height, radius), width, height, radius)
    : base;

  const output = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < eroded.length; p++, i += 4) {
    if (!eroded[p]) continue;
    output[i] = 255;
    output[i + 1] = 255;
    output[i + 2] = 255;
    output[i + 3] = 255;
  }

  return new ImageData(output, width, height);
}
