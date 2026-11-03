# VYSEL Prototype — AuraFit Style Lab

A browser-based prototype that reads skin depth and undertone from a photo, then generates a **Style DNA** report, a live virtual makeup preview, and a wardrobe/makeup palette — all computed client-side.

Built with Next.js 15 (App Router), React 18 and TypeScript, with MediaPipe for face landmarks and OpenCV.js for image processing.

## Features

- **Capture** — use the webcam with a face-alignment guide, or upload a photo and drag/zoom it into place.
- **Style DNA report** — samples forehead and cheek pixels, isolates the dominant skin tone with k-means clustering, converts it to CIELAB, and classifies:
  - **Depth** via the Individual Typology Angle (ITA°): Very Light → Deep
  - **Undertone** from the a\*/b\* balance: Warm, Cool or Neutral
  - A match-confidence score based on cluster spread
- **Virtual makeup preview** — lip, blush and eyeshadow shades generated from your tone, composited live on your photo with a before/after toggle and intensity slider. Placement follows MediaPipe face landmarks, falling back to the guide oval if no face is detected.
- **Recommendations** — a wardrobe palette (analogous, complementary, jewel-contrast, neutral) and a makeup palette, built by rotating your hue in HSL space and weighted by undertone.
- **Sample scan** — a stylized demo portrait runs through the same pipeline on load, so the report is populated before you use your own photo.

## How it works

```
photo / webcam frame (480×480 canvas)
  → MediaPipe Face Landmarker   → face zones (lips, cheeks, eyes, forehead)
  → OpenCV.js                   → lightness histogram equalization
  → sample forehead + cheeks    → k-means (k=2) + merge nearby clusters
  → sRGB → XYZ → CIELAB         → ITA° depth + undertone
  → HSL hue rotation            → clothing + makeup palettes
```

Your photo is never uploaded. The MediaPipe model and WASM files are downloaded from Google Storage and jsDelivr the first time you capture.

## Getting started

Requires **Node.js 18.18+** (developed on Node 22).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The Style Lab is at `/lab`.

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Start the dev server             |
| `npm run build` | Create a production build        |
| `npm start`     | Serve the production build       |

> Camera access needs `localhost` or HTTPS. If the camera is unavailable or blocked, use **Upload photo**.

## Project structure

```
app/
  layout.tsx            Root layout, fonts, nav and footer
  page.tsx              Landing page
  lab/page.tsx          Style Lab route
  globals.css           Global styles and design tokens
components/
  StyleLab.tsx          Capture → report → preview → recommendations flow
  SampleTeaser.tsx      Homepage card running the pipeline on the demo portrait
  SiteNav.tsx, SiteFooter.tsx
  *.module.css          Component styles
lib/
  styleDna.ts           Color science, k-means, ITA, palette generation (no framework code)
  faceVision.ts         MediaPipe face landmarks + OpenCV.js normalization (loaded on demand)
  makeupOverlay.ts      Soft-ellipse makeup compositing on canvas
```

## Limitations

- This is a prototype, not a medical or cosmetic diagnostic tool. Results depend heavily on lighting and camera white balance.
- Histogram equalization runs before tone sampling, which can shift the measured depth for very light or very dark photos.
- Face landmarks need a network connection the first time they load. Without it, the app falls back to the fixed guide regions.
