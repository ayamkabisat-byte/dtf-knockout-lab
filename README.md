# DTF Knockout Lab

An original, browser-based DTF/DTG artwork-preparation tool focused on **edge-aware background cleanup, garment-color knockout, binary halftone transparency, procedural distress, white underbase, and print preflight**.

The project is inspired by general print-preparation techniques. It does not copy proprietary source files, texture assets, or commercial algorithms.

## Current development version: v0.4

### Core knockout
- PNG / JPG / WEBP input
- Edge-connected background cleanup
- Automatic edge background sampling
- Independent internal knockout color and tolerance
- OKLab perceptual matching
- Chroma protection for dark saturated colors
- Shadow recovery

### Halftone
- Binary final alpha: 0 or 255
- 15–55 LPI
- 0–90° angle
- Circle / Ellipse / Diamond / Square / Line
- Screen smoothing
- Transition gamma
- 150–600 DPI calculation basis
- DPI metadata embedded in exported PNG

### Texture / distress
- Original procedural Fine Grain
- Coarse Speckle
- Scratches
- Vintage Mix
- Amount / scale / deterministic seed controls
- Distress is applied to coverage before final halftone rasterization

### White underbase
- Separate underbase preview and PNG export
- 0–3 px choke
- Choke is applied before halftone rasterization so small dots survive

### Print preflight
- Final binary-alpha PASS/CHECK
- Source semi-transparent pixel warning
- Current print coverage
- Estimated ink-area reduction
- Halftone physical pitch
- Physical print size at selected DPI

### Preview / export
- Original
- Garment
- Transparency
- Background mask
- Internal knockout mask
- Final mask
- Texture mask
- Underbase
- Color PNG export
- Underbase PNG export
- Processing remains client-side

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Import this GitHub repository as a Vite project. No environment variables are required.

## Architecture

- `src/engine.js` — knockout, halftone, distress and preflight image-processing logic
- `src/underbase.js` — pre-halftone white-underbase choke and rasterization
- `src/png.js` — PNG DPI metadata injection
- `src/app.js` — UI state, preview and export
- `src/styles.css` — interface styling

The engine remains separate so it can later move to Web Worker / OffscreenCanvas / WebGL/WASM or be reused by a Photoshop companion.

## Next candidates

- Print-size input with safe resize before halftone
- Quick print presets
- Custom user texture upload
- Before/after split preview
- Save/load project settings
- Multi-garment variant export
- Batch processing / gang-sheet handoff
- Web Worker full-resolution processing

## License

No license is included yet. Add one before public distribution if you want to define reuse rights explicitly.
