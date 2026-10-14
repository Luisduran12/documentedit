// Nombres y empaquetado de las exportaciones (compartido navegador / pruebas).
import { zipSync } from "fflate";

/** El PDF se descarga con EXACTAMENTE el nombre del archivo subido (si no termina en .pdf, se añade). */
export function pdfFileName(original: string) {
  const name = original.trim() || "documento.pdf";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

export function baseName(original: string) {
  return pdfFileName(original).replace(/\.pdf$/i, "");
}

/** Una página → «nombre.png»; varias → ZIP «nombre.zip» con «nombre-p1.png», «nombre-p2.png»… */
export function pngExportNames(original: string, pageNumbers: number[]) {
  const base = baseName(original);
  if (pageNumbers.length === 1) return { single: `${base}.png`, zip: null, entries: [`${base}.png`] };
  return { single: null, zip: `${base}.zip`, entries: pageNumbers.map((n) => `${base}-p${n}.png`) };
}

/** ZIP sin recompresión (los PNG ya están comprimidos). */
export function buildZip(files: { name: string; data: Uint8Array }[]) {
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.data, { level: 0 }]])));
}

export type CanvasLike = {
  width: number;
  height: number;
  getContext(type: "2d"): { fillStyle: string | CanvasGradient | CanvasPattern; fillRect(x: number, y: number, w: number, h: number): void } | null;
};

type PdfPageLike = {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvas: unknown; canvasContext?: unknown; viewport: unknown }): { promise: Promise<void> };
};

/**
 * Renderiza páginas de un PDF (ya exportado, con todas las ediciones) a PNG con fondo blanco.
 * `makeCanvas` y `toPng` permiten usar el canvas del navegador o el de Node en las pruebas.
 */
export async function renderPagesToPng<C extends CanvasLike>(
  getPage: (n: number) => Promise<PdfPageLike>,
  pageNumbers: number[],
  dpi: number,
  makeCanvas: (w: number, h: number) => C,
  toPng: (c: C) => Promise<Uint8Array>,
) {
  const out: Uint8Array[] = [];
  for (const n of pageNumbers) {
    const page = await getPage(n);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push(await toPng(canvas));
  }
  return out;
}
