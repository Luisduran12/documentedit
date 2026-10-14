"use client";

import QRCode from "qrcode";

// Negro sobre blanco con zona de silencio de 4 módulos (estándar) y corrección M:
// nítido en pantalla e impreso.
const OPTS = { errorCorrectionLevel: "M" as const, margin: 4, color: { dark: "#000000", light: "#ffffff" } };

/** PNG de alta resolución (por defecto 1024 px por lado; nunca menos de 600). */
export function qrPngDataUrl(text: string, size = 1024) {
  return QRCode.toDataURL(text, { ...OPTS, width: Math.max(600, size), type: "image/png" });
}

export function qrSvg(text: string) {
  return QRCode.toString(text, { ...OPTS, type: "svg" });
}

export async function qrPngBytes(text: string, size = 1024) {
  const dataUrl = await qrPngDataUrl(text, size);
  return Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
