const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0, false);
}

function makeChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(chunk, 8 + data.length, crc32(crcInput));
  return chunk;
}

function isPng(bytes) {
  return bytes.length >= 24 && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export async function injectPngDpi(blob, dpi) {
  if (!blob || !Number.isFinite(dpi) || dpi <= 0) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isPng(bytes)) return blob;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstLength = view.getUint32(8, false);
  const firstType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (firstType !== 'IHDR') return blob;
  const insertAt = 8 + 12 + firstLength;
  if (insertAt > bytes.length) return blob;

  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
  const phys = new Uint8Array(9);
  writeUint32(phys, 0, pixelsPerMeter);
  writeUint32(phys, 4, pixelsPerMeter);
  phys[8] = 1;
  const chunk = makeChunk('pHYs', phys);

  const output = new Uint8Array(bytes.length + chunk.length);
  output.set(bytes.subarray(0, insertAt), 0);
  output.set(chunk, insertAt);
  output.set(bytes.subarray(insertAt), insertAt + chunk.length);
  return new Blob([output], { type: 'image/png' });
}
