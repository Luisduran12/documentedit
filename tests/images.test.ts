import { createCanvas, loadImage } from "@napi-rs/canvas";
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/editor/apply";
import type { EditDoc, ImageObject } from "@/lib/editor/types";
import { decodeQr } from "./helpers/qr";
import { diffPixels, inkBox, renderPage } from "./helpers/render";
import { FIXTURE, loaders, pagesOf } from "./helpers/text-edit";

/** PNG de prueba con transparencia y detalles finos. */
function samplePng() {
  const c = createCanvas(120, 60);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(37, 99, 235, 0.6)";
  ctx.fillRect(0, 0, 120, 60);
  ctx.fillStyle = "#dc2626";
  for (let i = 0; i < 120; i += 4) ctx.fillRect(i, 20, 2, 20);
  return new Uint8Array(c.toBuffer("image/png"));
}

async function exportImages(objects: ImageObject[], assets: Record<string, Uint8Array>) {
  const pages = await pagesOf(FIXTURE);
  const doc: EditDoc = { pages, objects };
  return applyEdits(FIXTURE, doc, { ...loaders, loadAsset: async (k) => assets[k] });
}

const img = (patch: Partial<ImageObject>): ImageObject => ({
  type: "image",
  id: "i1",
  pageId: "p1",
  x: 300,
  y: 520,
  w: 120,
  h: 60,
  assetKey: "assets/00000000-0000-0000-0000-000000000001.png",
  mime: "image/png",
  opacity: 1,
  ...patch,
});

describe("imágenes pegadas o soltadas", () => {
  it("aparece en la posición esperada y sin pérdida (mismos píxeles que el PNG original)", async () => {
    const png = samplePng();
    const bytes = await exportImages([img({})], { [img({}).assetKey]: png });
    const after = await renderPage(bytes, 2, 200);
    const ink = inkBox(after, { x: 250, y: 470, w: 250, h: 160 }, 250)!;
    expect(Math.abs(ink.x - 300)).toBeLessThan(1);
    expect(Math.abs(ink.y - 520)).toBeLessThan(1);
    expect(Math.abs(ink.w - 120)).toBeLessThan(1.5);

    // Píxeles incrustados == píxeles del PNG (RGB y alfa)
    const out = await PDFDocument.load(bytes);
    const src = await loadImage(Buffer.from(png));
    const c = createCanvas(src.width, src.height);
    c.getContext("2d").drawImage(src, 0, 0);
    const ref = c.getContext("2d").getImageData(0, 0, src.width, src.height).data;
    let found = false;
    for (const [, obj] of out.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
      if (obj.dict.get(PDFName.of("Width"))?.toString() !== "120" || !obj.dict.get(PDFName.of("SMask"))) continue;
      const rgb = decodePDFRawStream(obj).decode();
      const smask = decodePDFRawStream(out.context.lookup(obj.dict.get(PDFName.of("SMask"))!) as PDFRawStream).decode();
      let mismatch = 0;
      for (let p = 0; p < 120 * 60; p++) {
        const a = ref[p * 4 + 3];
        if (Math.abs(smask[p] - a) > 1) mismatch++;
        // Canvas guarda RGB premultiplicado redondeado: se compara solo donde es opaco.
        if (a === 255 && (Math.abs(rgb[p * 3] - ref[p * 4]) > 1 || Math.abs(rgb[p * 3 + 1] - ref[p * 4 + 1]) > 1 || Math.abs(rgb[p * 3 + 2] - ref[p * 4 + 2]) > 1)) mismatch++;
      }
      expect(mismatch).toBe(0);
      found = true;
    }
    expect(found).toBe(true);
  }, 60000);

  it("un QR pegado se decodifica en el PDF exportado", async () => {
    const qr = new Uint8Array(await QRCode.toBuffer("https://ejemplo.invalid/s/PegadoQR0001", { width: 330, margin: 4 }));
    const bytes = await exportImages([img({ w: 110, h: 110, pixelated: true })], { [img({}).assetKey]: qr });
    const after = await renderPage(bytes, 2, 200);
    expect(decodeQr(after, { x: 290, y: 510, w: 130, h: 130 })).toBe("https://ejemplo.invalid/s/PegadoQR0001");
    // Modo nítido: /Interpolate false
    const out = await PDFDocument.load(bytes);
    const interp = [...out.context.enumerateIndirectObjects()].some(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Interpolate"))?.toString() === "false");
    expect(interp).toBe(true);
  }, 60000);

  it("«Ajustar» y «Rellenar» no se salen del recuadro", async () => {
    const png = samplePng(); // 2:1
    const box = { x: 300, y: 520, w: 100, h: 100 };
    for (const fit of ["contain", "cover"] as const) {
      const bytes = await exportImages([img({ ...box, fit })], { [img({}).assetKey]: png });
      const after = await renderPage(bytes, 2, 200);
      const ink = inkBox(after, { x: 250, y: 470, w: 200, h: 200 }, 250)!;
      expect(ink.x).toBeGreaterThanOrEqual(box.x - 0.6);
      expect(ink.y).toBeGreaterThanOrEqual(box.y - 0.6);
      expect(ink.x + ink.w).toBeLessThanOrEqual(box.x + box.w + 0.6);
      expect(ink.y + ink.h).toBeLessThanOrEqual(box.y + box.h + 0.6);
      if (fit === "contain") expect(ink.h).toBeLessThan(60); // 100 × 50: completa, con franjas
      else expect(ink.h).toBeGreaterThan(95); // cubre todo el alto
    }
  }, 60000);

  it("rotación de 90°: la imagen ancha queda vertical alrededor de su centro", async () => {
    const png = samplePng();
    const bytes = await exportImages([img({ rotation: 90 })], { [img({}).assetKey]: png });
    const after = await renderPage(bytes, 2, 200);
    const ink = inkBox(after, { x: 250, y: 450, w: 220, h: 200 }, 250)!;
    expect(Math.abs(ink.w - 60)).toBeLessThan(1.5);
    expect(Math.abs(ink.h - 120)).toBeLessThan(1.5);
    expect(Math.abs(ink.x + ink.w / 2 - 360)).toBeLessThan(1);
    expect(Math.abs(ink.y + ink.h / 2 - 550)).toBeLessThan(1);
  }, 60000);

  it("añadir una imagen no cambia nada fuera de ella", async () => {
    const before = await renderPage(FIXTURE, 2, 150);
    const bytes = await exportImages([img({})], { [img({}).assetKey]: samplePng() });
    const after = await renderPage(bytes, 2, 150);
    expect(diffPixels(before, after, { exclude: [{ x: 299, y: 519, w: 122, h: 62 }] }).diff).toBe(0);
  }, 60000);
});
