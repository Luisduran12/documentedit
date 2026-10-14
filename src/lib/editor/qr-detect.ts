"use client";

import jsQR from "jsqr";

export type DetectedQr = { box: { x: number; y: number; w: number; h: number }; data: string };

/**
 * Busca códigos QR (imagen o vectoriales) en el render de la página. `scale` = píxeles de canvas por pt.
 * Tras cada hallazgo se tapa esa zona en una copia para buscar el siguiente (máx. 6).
 */
export function detectQrs(canvas: HTMLCanvasElement, scale: number): DetectedQr[] {
  const maxPx = 2_500_000;
  const k = Math.min(1, Math.sqrt(maxPx / (canvas.width * canvas.height)));
  const w = Math.max(1, Math.floor(canvas.width * k));
  const h = Math.max(1, Math.floor(canvas.height * k));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(canvas, 0, 0, w, h);
  const found: DetectedQr[] = [];
  // Búsqueda en toda la página y, si no aparece, por ventanas solapadas (QR pequeños o pegados a bordes).
  const scan = () => {
    const full = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    if (full) return full;
    const win = Math.round(Math.min(w, h) * 0.4);
    const step = Math.round(win / 2);
    for (let y = 0; y + win <= h + step; y += step)
      for (let x = 0; x + win <= w + step; x += step) {
        const ww = Math.min(win, w - x), hh = Math.min(win, h - y);
        if (ww < 40 || hh < 40) continue;
        const r = jsQR(ctx.getImageData(x, y, ww, hh).data, ww, hh, { inversionAttempts: "dontInvert" });
        if (r) {
          for (const k of ["topLeftCorner", "topRightCorner", "bottomLeftCorner", "bottomRightCorner"] as const) {
            r.location[k].x += x;
            r.location[k].y += y;
          }
          return r;
        }
      }
    return null;
  };
  for (let i = 0; i < 6; i++) {
    const r = scan();
    if (!r) break;
    const pts = [r.location.topLeftCorner, r.location.topRightCorner, r.location.bottomLeftCorner, r.location.bottomRightCorner];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // Las esquinas son los bordes del código; se amplía un módulo para cubrir el antialias (no la zona de silencio).
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const modulePx = (x1 - x0) / Math.max(1, r.version * 4 + 17);
    const m = modulePx;
    const box = { x: (x0 - m) / k / scale, y: (y0 - m) / k / scale, w: (x1 - x0 + 2 * m) / k / scale, h: (y1 - y0 + 2 * m) / k / scale };
    found.push({ box, data: r.data });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m);
  }
  return found;
}
