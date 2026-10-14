"use client";

import jsQR from "jsqr";

export type PreparedImage = { file: File; mime: "image/png" | "image/jpeg"; px: { w: number; h: number }; isQr: boolean; converted: boolean };

const SUPPORTED = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

export function isSupportedImage(f: File | Blob) {
  return SUPPORTED.test(f.type) || /\.(png|jpe?g|webp|gif|svg)$/i.test((f as File).name ?? "");
}

async function toCanvasPng(source: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(source, 0, 0, w, h);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo convertir la imagen"))), "image/png"));
}

function looksLikeQr(bmp: ImageBitmap) {
  const k = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return Boolean(jsQR(ctx.getImageData(0, 0, w, h).data, w, h));
}

/**
 * Prepara una imagen para incrustarla: PNG y JPG se usan tal cual (sin recomprimir);
 * WEBP/GIF se convierten a PNG sin pérdida; SVG se rasteriza a alta resolución (≥ 2000 px).
 */
export async function prepareImage(input: File | Blob, name = "imagen"): Promise<PreparedImage> {
  const fileName = (input as File).name || name;
  const isSvg = input.type === "image/svg+xml" || /\.svg$/i.test(fileName);
  if (isSvg) {
    const url = URL.createObjectURL(input);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      const base = Math.max(img.naturalWidth || 300, img.naturalHeight || 300);
      const k = Math.max(1, 2000 / base);
      const w = Math.round((img.naturalWidth || 300) * k);
      const h = Math.round((img.naturalHeight || 300) * k);
      const blob = await toCanvasPng(img, w, h);
      const bmp = await createImageBitmap(blob);
      const isQr = looksLikeQr(bmp);
      bmp.close();
      return { file: new File([blob], fileName.replace(/\.svg$/i, ".png"), { type: "image/png" }), mime: "image/png", px: { w, h }, isQr, converted: true };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bmp = await createImageBitmap(input);
  const px = { w: bmp.width, h: bmp.height };
  const isQr = looksLikeQr(bmp);
  try {
    if (input.type === "image/png" || input.type === "image/jpeg") {
      const file = input instanceof File ? input : new File([input], `${name}.${input.type === "image/png" ? "png" : "jpg"}`, { type: input.type });
      return { file, mime: input.type, px, isQr, converted: false };
    }
    const blob = await toCanvasPng(bmp, bmp.width, bmp.height);
    return { file: new File([blob], fileName.replace(/\.\w+$/, "") + ".png", { type: "image/png" }), mime: "image/png", px, isQr, converted: true };
  } finally {
    bmp.close();
  }
}

/** Resolución efectiva (ppp) de una imagen de `pxWidth` píxeles mostrada a `ptWidth` puntos. */
export const effectiveDpi = (pxWidth: number, ptWidth: number) => (ptWidth > 0 ? (pxWidth / ptWidth) * 72 : 0);
export const LOW_DPI = 150;
