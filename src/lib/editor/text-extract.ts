"use client";

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * Muestrea el color de fondo (mediana del borde exterior del rectángulo) y el color del texto
 * (promedio de los píxeles más distintos al fondo dentro del rectángulo). `scale` = px de canvas por pt.
 */
export function sampleColors(canvas: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }, scale: number) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const fallback = { background: "#ffffff", text: "#000000" };
  if (!ctx) return fallback;
  const pad = 2;
  const x = Math.max(0, Math.floor(rect.x * scale) - pad);
  const y = Math.max(0, Math.floor(rect.y * scale) - pad);
  const w = Math.min(canvas.width - x, Math.ceil(rect.w * scale) + pad * 2);
  const h = Math.min(canvas.height - y, Math.ceil(rect.h * scale) + pad * 2);
  if (w <= 2 || h <= 2) return fallback;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return fallback;
  }
  const px = (i: number, j: number) => {
    const k = (j * w + i) * 4;
    return [data[k], data[k + 1], data[k + 2]] as const;
  };

  const border: (readonly [number, number, number])[] = [];
  for (let i = 0; i < w; i++) border.push(px(i, 0), px(i, h - 1));
  for (let j = 0; j < h; j++) border.push(px(0, j), px(w - 1, j));
  const median = (k: 0 | 1 | 2) => {
    const v = border.map((p) => p[k]).sort((m, n) => m - n);
    return v[Math.floor(v.length / 2)];
  };
  const bg = [median(0), median(1), median(2)] as const;

  const inner: { d: number; p: readonly [number, number, number] }[] = [];
  for (let j = pad; j < h - pad; j++)
    for (let i = pad; i < w - pad; i++) {
      const p = px(i, j);
      inner.push({ d: Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]), p });
    }
  inner.sort((m, n) => n.d - m.d);
  const top = inner.slice(0, Math.max(1, Math.floor(inner.length * 0.03))).filter((t) => t.d > 60);
  const text = top.length
    ? hex(...([0, 1, 2].map((k) => top.reduce((s, t) => s + t.p[k], 0) / top.length) as [number, number, number]))
    : fallback.text;
  return { background: hex(...bg), text };
}
