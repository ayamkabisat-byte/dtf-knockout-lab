# DTF Knockout Lab

An original, browser-based DTF/DTG artwork preparation experiment focused on **garment-color knockout + binary halftone transparency**.

This project is inspired by general print-preparation techniques, not by copying proprietary source files or algorithms from any commercial product.

## v0.1 MVP

- Upload PNG / JPG / WEBP
- Select garment preview color
- Select custom knockout color
- Eyedropper sampling from artwork
- Perceptual color matching in OKLab
- Knockout tolerance and strength
- Chroma protection to help preserve dark saturated colors during neutral-color knockout
- Binary halftone transition (alpha = 0 or 255)
- LPI 15–55
- Angle 0–90°
- Circle / Ellipse / Diamond / Square / Line patterns
- 150–600 DPI calculation basis
- Original / Garment / Transparency / Mask views
- Transparent PNG export
- Processing happens client-side in the browser

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. In Vercel choose **Add New → Project**.
3. Import the GitHub repository.
4. Vercel should detect **Vite** automatically.
5. Deploy. No environment variables are required for v0.1.

## Architecture

- `src/engine.js` — pure image processing / knockout / halftone logic
- `src/app.js` — UI state, file handling, preview and export
- `src/styles.css` — UI

Keeping the engine separate is intentional so it can later move into a Web Worker, WebGL/WASM implementation, or be reused by a Photoshop companion/plugin.

## Known v0.1 limitations

- Interactive preview is capped to 2600 px on the longest side for responsiveness. Export re-renders from the original image up to 6000 px on the longest side; v0.2 should move this work to a Web Worker/OffscreenCanvas for smoother large-image export.
- PNG metadata does not currently embed a physical DPI chunk; DPI is currently the halftone calculation basis.
- No white-underbase generation/choke yet.
- No project save/load yet.
- No batch processing yet.

## Proposed v0.2

- Full-resolution export in Web Worker / OffscreenCanvas
- White-underbase mask + choke
- Shadow recovery / highlight protection
- More robust chroma/hue protection
- Before/after split slider
- Presets for black, white and colored garments
- Saved `.dtfk` project settings
- Ink coverage estimate

## License

No license is included yet. Add one before public distribution if you want to define reuse rights explicitly.
