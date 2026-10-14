import jsQR from "jsqr";
import type { PtRect, Raster } from "./render";

/** Intenta decodificar un QR dentro de una zona (pt) de un render. */
export function decodeQr(r: Raster, zone?: PtRect): string | null {
  const x0 = zone ? Math.max(0, Math.floor(zone.x * r.scale)) : 0;
  const y0 = zone ? Math.max(0, Math.floor(zone.y * r.scale)) : 0;
  const w = zone ? Math.min(r.width - x0, Math.ceil(zone.w * r.scale)) : r.width;
  const h = zone ? Math.min(r.height - y0, Math.ceil(zone.h * r.scale)) : r.height;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(r.data.subarray(((y0 + y) * r.width + x0) * 4, ((y0 + y) * r.width + x0 + w) * 4), y * w * 4);
  return jsQR(data, w, h)?.data ?? null;
}
