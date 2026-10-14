// Render de páginas PDF a píxeles con pdf.js en Node (para pruebas de fidelidad).
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));

export type Raster = { width: number; height: number; data: Uint8ClampedArray; scale: number };

export async function renderPage(bytes: Uint8Array, pageNumber = 1, dpi = 200): Promise<Raster> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`,
    cMapUrl: `${pdfjsRoot}/cmaps/`,
    cMapPacked: true,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-expect-error: el canvas de @napi-rs es compatible con la API que usa pdf.js
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  await task.destroy();
  return { width: img.width, height: img.height, data: img.data, scale };
}

/** Rectángulo en puntos PDF del marco de pantalla (origen arriba-izquierda). */
export type PtRect = { x: number; y: number; w: number; h: number };

/**
 * Cuenta píxeles distintos entre dos renders (diferencia por canal > `tolerance`).
 * `exclude`: zonas (pt) que no se comparan; `only`: si se indica, solo se comparan esas zonas.
 */
export function diffPixels(a: Raster, b: Raster, opts: { exclude?: PtRect[]; only?: PtRect[]; tolerance?: number } = {}) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Tamaños distintos");
  const tol = opts.tolerance ?? 8;
  const inRects = (x: number, y: number, rects: PtRect[]) =>
    rects.some((r) => x >= r.x * a.scale && x < (r.x + r.w) * a.scale && y >= r.y * a.scale && y < (r.y + r.h) * a.scale);
  let diff = 0;
  let compared = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (opts.exclude && inRects(x, y, opts.exclude)) continue;
      if (opts.only && !inRects(x, y, opts.only)) continue;
      compared++;
      const k = (y * a.width + x) * 4;
      if (Math.abs(a.data[k] - b.data[k]) > tol || Math.abs(a.data[k + 1] - b.data[k + 1]) > tol || Math.abs(a.data[k + 2] - b.data[k + 2]) > tol) diff++;
    }
  }
  return { diff, compared, ratio: compared ? diff / compared : 0 };
}

/** Caja (pt) que ocupa la "tinta" no blanca dentro de una zona. */
export function inkBox(r: Raster, zone: PtRect, threshold = 160) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const x0 = Math.floor(zone.x * r.scale), x1 = Math.ceil((zone.x + zone.w) * r.scale);
  const y0 = Math.floor(zone.y * r.scale), y1 = Math.ceil((zone.y + zone.h) * r.scale);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = (y * r.width + x) * 4;
      if (r.data[k] < threshold || r.data[k + 1] < threshold || r.data[k + 2] < threshold) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  if (minX === Infinity) return null;
  return { x: minX / r.scale, y: minY / r.scale, w: (maxX - minX + 1) / r.scale, h: (maxY - minY + 1) / r.scale };
}

export async function toPng(r: Raster, file: string) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const c = createCanvas(r.width, r.height);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(r.width, r.height);
  img.data.set(r.data);
  ctx.putImageData(img, 0, 0);
  (await import("node:fs")).writeFileSync(file, c.toBuffer("image/png"));
}
