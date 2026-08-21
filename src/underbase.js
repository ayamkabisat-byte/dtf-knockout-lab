export function createUnderbaseImageData(processed, width, height, chokePx = 0) {
  const source = processed.data;
  const output = new Uint8ClampedArray(source.length);
  const radius = Math.max(0, Math.round(chokePx));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (source[i + 3] < 128) continue;

      let keep = true;
      if (radius > 0) {
        for (let dy = -radius; dy <= radius && keep; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) { keep = false; break; }
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) { keep = false; break; }
            const ni = (yy * width + xx) * 4;
            if (source[ni + 3] < 128) { keep = false; break; }
          }
        }
      }

      if (keep) {
        output[i] = 255;
        output[i + 1] = 255;
        output[i + 2] = 255;
        output[i + 3] = 255;
      }
    }
  }

  return new ImageData(output, width, height);
}
