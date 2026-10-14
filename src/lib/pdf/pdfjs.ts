"use client";

import type * as PdfJs from "pdfjs-dist";

let loading: Promise<typeof PdfJs> | undefined;

/** Carga pdf.js bajo demanda (solo en el navegador) con su worker local. */
export function loadPdfJs() {
  loading ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return loading;
}

/** Devuelve la tarea de carga (su `destroy()` libera el worker y la memoria). */
export async function openPdfTask(data: ArrayBuffer | Uint8Array | string) {
  const pdfjs = await loadPdfJs();
  const common = {
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    // Conserva el nombre real de las fuentes (necesario para el mapeo del editor).
    fontExtraProperties: true,
    iccUrl: "/pdfjs/iccs/",
  };
  return pdfjs.getDocument(typeof data === "string" ? { url: data, ...common } : { data, ...common });
}

/** Número de páginas leyendo el archivo localmente (no bloquea la subida si falla). */
export async function countPages(file: File): Promise<number | null> {
  try {
    const task = await openPdfTask(await file.arrayBuffer());
    const n = (await task.promise).numPages;
    await task.destroy();
    return n;
  } catch {
    return null;
  }
}
