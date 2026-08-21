import './styles.css';
import {
  processImageData,
  processForExport,
  processCoverageForExport,
  rgbToHex,
  sampleEdgeBackgroundColor,
} from './engine.js';
import { injectPngDpi } from './png.js';
import { createUnderbaseImageData } from './underbase.js';

const $ = (id) => document.getElementById(id);
const els = {
  fileInput: $('fileInput'), dropZone: $('dropZone'), fileMeta: $('fileMeta'),
  garmentColor: $('garmentColor'), garmentHex: $('garmentHex'),
  backgroundCleanup: $('backgroundCleanup'), autoEdgeSample: $('autoEdgeSample'),
  backgroundColor: $('backgroundColor'), backgroundHex: $('backgroundHex'),
  backgroundTolerance: $('backgroundTolerance'), backgroundToleranceOut: $('backgroundToleranceOut'),
  knockoutColor: $('knockoutColor'), knockoutHex: $('knockoutHex'), eyedropperBtn: $('eyedropperBtn'),
  internalTolerance: $('internalTolerance'), internalToleranceOut: $('internalToleranceOut'),
  strength: $('strength'), strengthOut: $('strengthOut'),
  chromaProtection: $('chromaProtection'), chromaOut: $('chromaOut'),
  shadowRecovery: $('shadowRecovery'), shadowRecoveryOut: $('shadowRecoveryOut'),
  lpi: $('lpi'), lpiOut: $('lpiOut'), angle: $('angle'), angleOut: $('angleOut'),
  shape: $('shape'), screenSmooth: $('screenSmooth'), screenSmoothOut: $('screenSmoothOut'),
  transitionGamma: $('transitionGamma'), gammaOut: $('gammaOut'),
  dpi: $('dpi'), dpiOut: $('dpiOut'),
  choke: $('choke'), chokeOut: $('chokeOut'),
  resetBtn: $('resetBtn'), exportBtn: $('exportBtn'), exportUnderbaseBtn: $('exportUnderbaseBtn'),
  canvasStage: $('canvasStage'), previewCanvas: $('previewCanvas'), emptyState: $('emptyState'), status: $('status'),
};

const state = {
  image: null,
  sourceCanvas: document.createElement('canvas'),
  sourceData: null,
  result: null,
  underbase: null,
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
    backgroundCleanup: els.backgroundCleanup.checked,
    backgroundColor: els.backgroundColor.value,
    backgroundTolerance: Number(els.backgroundTolerance.value),
    knockoutColor: els.knockoutColor.value,
    internalTolerance: Number(els.internalTolerance.value),
    strength: Number(els.strength.value),
    chromaProtection: Number(els.chromaProtection.value),
    shadowRecovery: Number(els.shadowRecovery.value),
    mode: state.mode,
    lpi: Number(els.lpi.value),
    angle: Number(els.angle.value),
    shape: els.shape.value,
    screenSmooth: Number(els.screenSmooth.value) / 10,
    transitionGamma: Number(els.transitionGamma.value) / 100,
    dpi: preview ? outputDpi * state.previewScale : outputDpi,
  };
}

function updateFileMeta() {
  if (!state.image) return;
  const dpi = Math.max(1, Number(els.dpi.value));
  const widthCm = (state.image.naturalWidth / dpi) * 2.54;
  const heightCm = (state.image.naturalHeight / dpi) * 2.54;
  const previewNote = state.previewScale < 1
    ? ` · preview ${state.sourceCanvas.width}×${state.sourceCanvas.height}px`
    : '';
  els.fileMeta.textContent = `${state.displayFilename} · ${state.image.naturalWidth}×${state.image.naturalHeight}px · ${widthCm.toFixed(1)}×${heightCm.toFixed(1)} cm @ ${dpi} DPI${previewNote}`;
}

function updateLabels() {
  els.garmentHex.textContent = els.garmentColor.value.toUpperCase();
  els.backgroundHex.textContent = els.backgroundColor.value.toUpperCase();
  els.backgroundToleranceOut.textContent = els.backgroundTolerance.value;
  els.knockoutHex.textContent = els.knockoutColor.value.toUpperCase();
  els.internalToleranceOut.textContent = els.internalTolerance.value;
  els.strengthOut.textContent = `${els.strength.value}%`;
  els.chromaOut.textContent = `${els.chromaProtection.value}%`;
  els.shadowRecoveryOut.textContent = `${els.shadowRecovery.value}%`;
  els.lpiOut.textContent = els.lpi.value;
  els.angleOut.textContent = `${els.angle.value}°`;
  els.screenSmoothOut.textContent = `${(Number(els.screenSmooth.value) / 10).toFixed(1)}px`;
  els.gammaOut.textContent = (Number(els.transitionGamma.value) / 100).toFixed(2);
  els.dpiOut.textContent = els.dpi.value;
  els.chokeOut.textContent = `${els.choke.value}px`;
  updateFileMeta();
}

function fitProcessingSize(img) {
  const maxSide = 2600;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  return {
    width: Math.max(1, Math.round(img.naturalWidth * scale)),
    height: Math.max(1, Math.round(img.naturalHeight * scale)),
    scale,
  };
}

function sampleBackgroundFromCurrentImage() {
  if (!state.sourceData || !els.autoEdgeSample.checked) return;
  els.backgroundColor.value = sampleEdgeBackgroundColor(
    state.sourceData,
    state.sourceCanvas.width,
    state.sourceCanvas.height,
  );
  updateLabels();
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

    sampleBackgroundFromCurrentImage();
    updateFileMeta();
    els.fileMeta.classList.remove('hidden');
    els.previewCanvas.classList.remove('hidden');
    els.emptyState.classList.add('hidden');
    els.exportBtn.disabled = false;
    els.exportUnderbaseBtn.disabled = false;
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
  els.status.textContent = 'Refining background cleanup + halftone…';
  requestAnimationFrame(() => {
    if (token !== state.renderToken) return;
    const t0 = performance.now();

    state.result = processImageData(
      state.sourceData,
      state.sourceCanvas.width,
      state.sourceCanvas.height,
      settings({ preview: true }),
    );

    const previewChoke = Number(els.choke.value) * state.previewScale;
    state.underbase = createUnderbaseImageData(
      state.result.coverage,
      state.sourceCanvas.width,
      state.sourceCanvas.height,
      previewChoke,
      settings({ preview: true }),
    );

    drawCurrentView();
    const ms = Math.round(performance.now() - t0);
    els.status.textContent = `${state.sourceCanvas.width}×${state.sourceCanvas.height}px · ${ms} ms · smooth ${(Number(els.screenSmooth.value) / 10).toFixed(1)}px · γ ${(Number(els.transitionGamma.value) / 100).toFixed(2)}`;
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
  else if (state.view === 'background') ctx.putImageData(state.result.backgroundMap, 0, 0);
  else if (state.view === 'knockout') ctx.putImageData(state.result.knockoutMap, 0, 0);
  else if (state.view === 'mask') ctx.putImageData(state.result.mask, 0, 0);
  else if (state.view === 'underbase' && state.underbase) ctx.putImageData(state.underbase, 0, 0);
  else ctx.putImageData(state.result.processed, 0, 0);

  updateStage();
}

function renderExportSource() {
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
  return { canvas, ctx, source, width, height, scale };
}

function setExportBusy(busy, label = 'Rendering…') {
  els.exportBtn.disabled = busy || !state.image;
  els.exportUnderbaseBtn.disabled = busy || !state.image;
  if (busy) {
    els.exportBtn.textContent = label;
    els.exportUnderbaseBtn.textContent = label;
  } else {
    els.exportBtn.textContent = 'Export Color PNG';
    els.exportUnderbaseBtn.textContent = 'Export Underbase';
  }
}

async function downloadCanvasPng(canvas, filename, dpi) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG export failed');

  let finalBlob = blob;
  try {
    finalBlob = await injectPngDpi(blob, dpi);
  } catch (error) {
    console.warn('Could not inject PNG DPI metadata; exporting base PNG instead.', error);
  }

  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function exportPng() {
  if (!state.result || !state.image) return;
  setExportBusy(true);
  els.status.textContent = 'Rendering full-resolution color PNG…';

  requestAnimationFrame(async () => {
    try {
      const { canvas, ctx, source, width, height, scale } = renderExportSource();
      const output = processForExport(source, width, height, settings());
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(output, 0, 0);
      const dpi = Number(els.dpi.value);
      await downloadCanvasPng(canvas, `${state.filename}-dtf-knockout-v031.png`, dpi);
      els.status.textContent = `Exported color ${width}×${height}px @ ${dpi} DPI${scale < 1 ? ' (6000px max side)' : ''}`;
    } catch (error) {
      console.error(error);
      els.status.textContent = 'PNG export failed.';
    } finally {
      setExportBusy(false);
    }
  });
}

function exportUnderbase() {
  if (!state.result || !state.image) return;
  setExportBusy(true);
  els.status.textContent = 'Rendering pre-halftone white underbase…';

  requestAnimationFrame(async () => {
    try {
      const { canvas, ctx, source, width, height, scale } = renderExportSource();
      const coverage = processCoverageForExport(source, width, height, settings());
      const underbase = createUnderbaseImageData(
        coverage,
        width,
        height,
        Number(els.choke.value),
        settings(),
      );
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(underbase, 0, 0);
      const dpi = Number(els.dpi.value);
      await downloadCanvasPng(canvas, `${state.filename}-white-underbase-v031.png`, dpi);
      els.status.textContent = `Exported underbase ${width}×${height}px @ ${dpi} DPI · pre-halftone choke ${els.choke.value}px${scale < 1 ? ' (6000px max side)' : ''}`;
    } catch (error) {
      console.error(error);
      els.status.textContent = 'Underbase export failed.';
    } finally {
      setExportBusy(false);
    }
  });
}

function pickColor(event) {
  if (!state.picking || !state.sourceData) return;
  const rect = els.previewCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (state.sourceCanvas.width / rect.width));
  const y = Math.floor((event.clientY - rect.top) * (state.sourceCanvas.height / rect.height));
  if (x < 0 || y < 0 || x >= state.sourceCanvas.width || y >= state.sourceCanvas.height) return;

  const i = (y * state.sourceCanvas.width + x) * 4;
  const hex = rgbToHex({
    r: state.sourceData.data[i],
    g: state.sourceData.data[i + 1],
    b: state.sourceData.data[i + 2],
  });
  els.knockoutColor.value = hex;
  state.picking = false;
  els.eyedropperBtn.classList.remove('active');
  els.previewCanvas.style.cursor = 'default';
  render();
}

els.fileInput.addEventListener('change', (e) => loadFile(e.target.files?.[0]));
['dragenter', 'dragover'].forEach((name) => els.dropZone.addEventListener(name, (e) => {
  e.preventDefault();
  els.dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((name) => els.dropZone.addEventListener(name, (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('dragover');
}));
els.dropZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files?.[0]));

[
  els.backgroundTolerance,
  els.knockoutColor,
  els.internalTolerance,
  els.strength,
  els.chromaProtection,
  els.shadowRecovery,
  els.lpi,
  els.angle,
  els.shape,
  els.screenSmooth,
  els.transitionGamma,
  els.dpi,
  els.choke,
].forEach((el) => el.addEventListener('input', render));

els.backgroundCleanup.addEventListener('change', render);
els.autoEdgeSample.addEventListener('change', () => {
  if (els.autoEdgeSample.checked) sampleBackgroundFromCurrentImage();
  render();
});
els.backgroundColor.addEventListener('input', () => {
  els.autoEdgeSample.checked = false;
  render();
});

els.garmentColor.addEventListener('input', () => {
  updateLabels();
  updateStage();
});

els.eyedropperBtn.addEventListener('click', () => {
  if (!state.sourceData) return;
  state.picking = !state.picking;
  els.eyedropperBtn.classList.toggle('active', state.picking);
  els.previewCanvas.style.cursor = state.picking ? 'crosshair' : 'default';
  els.status.textContent = state.picking
    ? 'Click the artwork to sample the INTERNAL knockout color'
    : 'Color picker cancelled';
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
els.exportUnderbaseBtn.addEventListener('click', exportUnderbase);
els.resetBtn.addEventListener('click', () => {
  els.garmentColor.value = '#111111';
  els.backgroundCleanup.checked = true;
  els.autoEdgeSample.checked = true;
  els.backgroundColor.value = '#000000';
  els.backgroundTolerance.value = 58;
  els.knockoutColor.value = '#000000';
  els.internalTolerance.value = 34;
  els.strength.value = 100;
  els.chromaProtection.value = 80;
  els.shadowRecovery.value = 18;
  els.lpi.value = 35;
  els.angle.value = 22.5;
  els.shape.value = 'circle';
  els.screenSmooth.value = 10;
  els.transitionGamma.value = 100;
  els.dpi.value = 300;
  els.choke.value = 1;
  state.mode = 'halftone';
  document.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'halftone'));
  sampleBackgroundFromCurrentImage();
  render();
});

updateLabels();
updateStage();
