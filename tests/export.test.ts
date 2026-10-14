import { createCanvas, loadImage } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/editor/apply";
import type { EditDoc, ImageObject } from "@/lib/editor/types";
import { baseName, buildZip, pdfFileName, pngExportNames, renderPagesToPng } from "@/lib/export-files";
import { decodeQr } from "./helpers/qr";
import { FIXTURE, loaders, pagesOf } from "./helpers/text-edit";

async function pdfPngs(bytes: Uint8Array, pages: number[], dpi: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" });
  const doc = await task.promise;
  const out = await renderPagesToPng(
    (n) => doc.getPage(n) as never,
    pages,
    dpi,
    (w, h) => createCanvas(w, h),
    async (c) => new Uint8Array(c.toBuffer("image/png")),
  );
  await task.destroy();
  return out;
}

async function pixels(png: Uint8Array) {
  const img = await loadImage(Buffer.from(png));
  const c = createCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  return { w: img.width, h: img.height, data: c.getContext("2d").getImageData(0, 0, img.width, img.height).data };
}

describe("nombres de exportación", () => {
  const real = "Extracto Contrato2347890352Verificar enFURA (1)-1.pdf";
  it("el PDF conserva exactamente el nombre subido", () => {
    expect(pdfFileName(real)).toBe(real);
    expect(pdfFileName("Cotización final")).toBe("Cotización final.pdf");
    expect(pdfFileName("informe.PDF")).toBe("informe.PDF");
  });
  it("PNG de una página: mismo nombre con .png", () => {
    expect(pngExportNames(real, [1])).toMatchObject({ single: "Extracto Contrato2347890352Verificar enFURA (1)-1.png", zip: null });
  });
  it("varias páginas: ZIP con el nombre original y nombre-p1.png, nombre-p2.png…", () => {
    const n = pngExportNames(real, [1, 2, 3]);
    expect(n.zip).toBe(`${baseName(real)}.zip`);
    expect(n.entries).toEqual([1, 2, 3].map((i) => `${baseName(real)}-p${i}.png`));
  });
  it("el ZIP contiene los archivos esperados", () => {
    const zip = buildZip([
      { name: "a-p1.png", data: Uint8Array.of(1, 2, 3) },
      { name: "a-p2.png", data: Uint8Array.of(4) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["a-p1.png", "a-p2.png"]);
    expect([...files["a-p2.png"]]).toEqual([4]);
  });
});

describe("exportación PNG", () => {
  it("una página sin ediciones coincide con el render del original", async () => {
    const pages = await pagesOf(FIXTURE);
    const exported = await applyEdits(FIXTURE, { pages, objects: [] }, loaders);
    const [a] = await pdfPngs(FIXTURE, [1], 150);
    const [b] = await pdfPngs(exported, [1], 150);
    const pa = await pixels(a);
    const pb = await pixels(b);
    expect([pb.w, pb.h]).toEqual([pa.w, pa.h]);
    let diff = 0;
    for (let k = 0; k < pa.data.length; k += 4) if (Math.abs(pa.data[k] - pb.data[k]) > 8) diff++;
    expect(diff / (pa.w * pa.h)).toBeLessThan(0.0005);
  }, 60000);

  it("fondo blanco y resolución elegida (300 ppp)", async () => {
    const [png] = await pdfPngs(FIXTURE, [2], 300);
    const p = await pixels(png);
    expect(p.w).toBe(Math.ceil((595.28 * 300) / 72));
    expect([p.data[0], p.data[1], p.data[2], p.data[3]]).toEqual([255, 255, 255, 255]);
  }, 60000);

  it("un QR pegado y exportado se decodifica desde el PNG y el PDF tiene las páginas", async () => {
    const pages = await pagesOf(FIXTURE);
    const qr: ImageObject = { type: "image", id: "q", pageId: "p1", x: 300, y: 520, w: 100, h: 100, assetKey: "assets/00000000-0000-0000-0000-000000000002.png", mime: "image/png", opacity: 1, pixelated: true };
    const doc: EditDoc = { pages, objects: [qr] };
    const png = new Uint8Array(await QRCode.toBuffer("https://ejemplo.invalid/s/ExportPNG001", { width: 300, margin: 4 }));
    const exported = await applyEdits(FIXTURE, doc, { ...loaders, loadAsset: async () => png });
    expect((await PDFDocument.load(exported)).getPageCount()).toBe(2);
    const pngs = await pdfPngs(exported, [1, 2], 150);
    const zip = unzipSync(buildZip(pngs.map((data, i) => ({ name: `f-p${i + 1}.png`, data }))));
    const p = await pixels(zip["f-p2.png"]);
    // La página 2 también tiene un QR vectorial: se lee solo la zona del QR pegado.
    const raster = { width: p.w, height: p.h, data: new Uint8ClampedArray(p.data), scale: 150 / 72 };
    expect(decodeQr(raster, { x: 290, y: 510, w: 120, h: 120 })).toBe("https://ejemplo.invalid/s/ExportPNG001");
  }, 60000);
});
