import './styles.css';
import { processImageData, processForExport, rgbToHex } from './engine.js';
import { injectPngDpi } from './png.js';

const $ = (id) => document.getElementById(id);
const els = {
  fileInput: $('fileInput'), dropZone: $('dropZone'), fileMeta: $('fileMeta'),
  garmentColor: $('garmentColor'), garmentHex: $('garmentHex'),
  knockoutColor: $('knockoutColor'), knockoutHex: $('knockoutHex'), eyedropperBtn: $('eyedropperBtn'),
  tolerance: $('tolerance'), toleranceOut: $('toleranceOut'),
  strength: $('strength'), strengthOut: $('strengthOut'),
  chromaProtection: $('chromaProtection'), chromaOut: $('chromaOut'),
  lpi: $('lpi'), lpiOut: $('lpiOut'), angle: $('angle'), angleOut: $('angleOut'),
  shape: $('shape'), dpi: $('dpi'), dpiOut: $('dpiOut'),
  resetBtn: $('resetBtn'), exportBtn: $('exportBtn'),
  canvasStage: $('canvasStage'), previewCanvas: $('previewCanvas'), emptyState: $('emptyState'), status: $('status'),
};

const state = {
  image: null,
  sourceCanvas: document.createElement('canvas'),
  sourceData: null,
  result: null,
  view: 'garment',
  mode: 'halftone',
  picking: false,
  filename: 'artwork',
  displayFilename: '',
  previewScale: 1,
  renderToken: 0,
};

function settings({ preview = false } = {}) {
  const outputDpi = Number(els.dpi.value);
  return {
    knockoutColor: els.knockoutColor.value,
    tolerance: Number(els.tolerance.value),
    strength: Number(els.strength.value),
    chromaProtection: Number(els.chromaProtection.value),
    mode: state.mode,
    lpi: Number(els.lpi.value),
    angle: Number(els.angle.value),
    shape: els.shape.value,
    // Preview pixels are downsampled from the original. Scale the effective DPI
    // by the same factor so the on-screen halftone period matches export.
    dpi: preview ? outputDpi * state.previewScale : outputDpi,
  };
}

function updateFileMeta() {
  if (!state.image) return;
  const dpi = Math.max(1, Number(els.dpi.value));
  const widthIn = state.image.naturalWidth / dpi;
  const heightIn = state.image.naturalHeight / dpi;
  const widthCm = widthIn * 2.54;
  const heightCm = heightIn * 2.54;
  const previewNote = state.previewScale < 1
    ? ` · preview ${state.sourceCanvas.width}×${state.sourceCanvas.height}px`
    : '';
  els.fileMeta.textContent = `${state.displayFilename} · ${state.image.naturalWidth}×${state.image.naturalHeight}px · ${widthCm.toFixed(1)}×${heightCm.toFixed(1)} cm @ ${dpi} DPI${previewNote}`;
}

function updateLabels() {
  els.garmentHex.textContent = els.garmentColor.value.toUpperCase();
  els.knockoutHex.textContent = els.knockoutColor.value.toUpperCase();
  els.toleranceOut.textContent = els.tolerance.value;
  els.strengthOut.textContent = `${els.strength.value}%`;
  els.chromaOut.textContent = `${els.chromaProtection.value}%`;
  els.lpiOut.textContent = els.lpi.value;
  els.angleOut.textContent = `${els.angle.value}°`;
  els.dpiOut.textContent = els.dpi.value;
  updateFileMeta();
}

function fitProcessingSize(img) {
  // Keep interactive preview responsive while preserving physical dot size.
  // Full-resolution export is rendered independently up to 6000px max side.
  const maxSide = 2600;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  return {
    width: Math.max(1, Math.round(img.naturalWidth * scale)),
    height: Math.max(1, Math.round(img.naturalHeight * scale)),
    scale,
  };
}

async function loadFile(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    els.status.textContent = 'Unsupported file. Use PNG, JPG, or WEBP.';
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const { width, height, scale } = fitProcessingSize(img);
    state.image = img;
    state.filename = file.name.replace(/\.[^.]+$/, '') || 'artwork';
    state.displayFilename = file.name;
    state.previewScale = scale;
    state.sourceCanvas.width = width;
    state.sourceCanvas.height = height;
    const ctx = state.sourceCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    state.sourceData = ctx.getImageData(0, 0, width, height);
    updateFileMeta();
    els.fileMeta.classList.remove('hidden');
    els.previewCanvas.classList.remove('hidden');
    els.emptyState.classList.add('hidden');
    els.exportBtn.disabled = false;
    render();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    els.status.textContent = 'Could not decode image.';
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function render() {
  updateLabels();
  if (!state.sourceData) {
    updateStage();
    return;
  }
  const token = ++state.renderToken;
  els.status.textContent = 'Processing…';
  requestAnimationFrame(() => {
    if (token !== state.renderToken) return;
    const t0 = performance.now();
    state.result = processImageData(
      state.sourceData,
      state.sourceCanvas.width,
      state.sourceCanvas.height,
      settings({ preview: true }),
    );
    drawCurrentView();
    const ms = Math.round(performance.now() - t0);
    els.status.textContent = `${state.sourceCanvas.width}×${state.sourceCanvas.height}px · ${ms} ms · preview matched to export scale`;
  });
}

function updateStage() {
  const garment = state.view === 'garment';
  els.canvasStage.classList.toggle('garment-stage', garment);
  els.canvasStage.style.backgroundColor = garment ? els.garmentColor.value : '';
}

function drawCurrentView() {
  if (!state.result) return;
  const canvas = els.previewCanvas;
  canvas.width = state.sourceCanvas.width;
  canvas.height = state.sourceCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.view === 'original') ctx.putImageData(state.result.original, 0, 0);
  else if (state.view === 'mask') ctx.putImageData(state.result.mask, 0, 0);
  else ctx.putImageData(state.result.processed, 0, 0);
  updateStage();
}

function exportPng() {
  if (!state.result || !state.image) return;
  els.exportBtn.disabled = true;
  els.exportBtn.textContent = 'Rendering…';
  els.status.textContent = 'Rendering full-resolution PNG…';
  requestAnimationFrame(() => {
    const maxSide = 6000;
    const scale = Math.min(1, maxSide / Math.max(state.image.naturalWidth, state.image.naturalHeight));
    const width = Math.max(1, Math.round(state.image.naturalWidth * scale));
    const height = Math.max(1, Math.round(state.image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(state.image, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height);
    const output = processForExport(source, width, height, settings());
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(output, 0, 0);
    canvas.toBlob(async (blob) => {
      els.exportBtn.disabled = false;
      els.exportBtn.textContent = 'Export PNG';
      if (!blob) { els.status.textContent = 'PNG export failed.'; return; }

      const dpi = Number(els.dpi.value);
      let finalBlob = blob;
      try {
        finalBlob = await injectPngDpi(blob, dpi);
      } catch (error) {
        console.warn('Could not inject PNG DPI metadata; exporting base PNG instead.', error);
      }

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.filename}-dtf-knockout.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      els.status.textContent = `Exported ${width}×${height}px @ ${dpi} DPI${scale < 1 ? ' (6000px max side)' : ''}`;
    }, 'image/png');
  });
}

function pickColor(event) {
  if (!state.picking || !state.sourceData) return;
  const rect = els.previewCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (state.sourceCanvas.width / rect.width));
  const y = Math.floor((event.clientY - rect.top) * (state.sourceCanvas.height / rect.height));
  if (x < 0 || y < 0 || x >= state.sourceCanvas.width || y >= state.sourceCanvas.height) return;
  const i = (y * state.sourceCanvas.width + x) * 4;
  const hex = rgbToHex({ r: state.sourceData.data[i], g: state.sourceData.data[i + 1], b: state.sourceData.data[i + 2] });
  els.knockoutColor.value = hex;
  state.picking = false;
  els.eyedropperBtn.classList.remove('active');
  els.previewCanvas.style.cursor = 'default';
  render();
}

els.fileInput.addEventListener('change', (e) => loadFile(e.target.files?.[0]));
['dragenter', 'dragover'].forEach((name) => els.dropZone.addEventListener(name, (e) => {
  e.preventDefault(); els.dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((name) => els.dropZone.addEventListener(name, (e) => {
  e.preventDefault(); els.dropZone.classList.remove('dragover');
}));
els.dropZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files?.[0]));

[els.knockoutColor, els.tolerance, els.strength, els.chromaProtection, els.lpi, els.angle, els.shape, els.dpi]
  .forEach((el) => el.addEventListener('input', render));

els.garmentColor.addEventListener('input', () => { updateLabels(); updateStage(); });

els.eyedropperBtn.addEventListener('click', () => {
  if (!state.sourceData) return;
  state.picking = !state.picking;
  els.eyedropperBtn.classList.toggle('active', state.picking);
  els.previewCanvas.style.cursor = state.picking ? 'crosshair' : 'default';
  els.status.textContent = state.picking ? 'Click the artwork to sample a knockout color' : 'Color picker cancelled';
});
els.previewCanvas.addEventListener('click', pickColor);

document.querySelectorAll('.segment').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  state.mode = button.dataset.mode;
  render();
}));

document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  state.view = button.dataset.view;
  drawCurrentView();
}));

els.exportBtn.addEventListener('click', exportPng);
els.resetBtn.addEventListener('click', () => {
  els.garmentColor.value = '#111111';
  els.knockoutColor.value = '#000000';
  els.tolerance.value = 30;
  els.strength.value = 100;
  els.chromaProtection.value = 70;
  els.lpi.value = 35;
  els.angle.value = 22.5;
  els.shape.value = 'circle';
  els.dpi.value = 300;
  state.mode = 'halftone';
  document.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'halftone'));
  render();
});

updateLabels();
updateStage();
