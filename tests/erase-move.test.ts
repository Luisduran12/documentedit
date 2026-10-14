import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { nativeToFrame } from "@/lib/editor/pdf/blocks";
import { analyzePage, type ImageRecord } from "@/lib/editor/pdf/interpret";
import type { ImageEditObject, ZoneEraseObject } from "@/lib/editor/types";
import { decodeQr } from "./helpers/qr";
import { diffPixels, inkBox, renderPage, type PtRect } from "./helpers/render";
import { blocksOf, editFor, exportWith, findBlock, FIXTURE, pagesOf } from "./helpers/text-edit";

const pad = (r: PtRect, p = 1): PtRect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });

async function imagesOf(pageIndex: number) {
  const doc = await PDFDocument.load(FIXTURE);
  const pages = await pagesOf(FIXTURE);
  const a = analyzePage(doc.getPage(pageIndex));
  return a.images.map((im) => ({ im, box: frameBox(im, pages[pageIndex].view) }));
}
function frameBox(im: ImageRecord, view: [number, number, number, number]): PtRect {
  const a = nativeToFrame(im.bbox[0], im.bbox[1], view, 0);
  const b = nativeToFrame(im.bbox[2], im.bbox[3], view, 0);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
}
const imageEdit = (pageId: string, im: ImageRecord, box: PtRect, patch: Partial<ImageEditObject> = {}): ImageEditObject => ({
  type: "imageEdit",
  id: `img-${im.id}`,
  pageId,
  ...box,
  ref: im.id,
  orig: box,
  removed: false,
  ...patch,
});

describe("detección de imágenes originales", async () => {
  it("encuentra cabecera, QR, sello compartido, PNG con transparencia e imagen en línea", async () => {
    const p1 = await imagesOf(0);
    const p2 = await imagesOf(1);
    expect(p1.length).toBeGreaterThanOrEqual(4); // cabecera, degradado, QR, sello (XObject compartido)
    expect(p2.some(({ im }) => im.kind === "inline")).toBe(true);
    expect(p2.some(({ im }) => im.hasSoftMask)).toBe(true);
    expect(p2.some(({ im }) => im.path.length > 0)).toBe(true); // dentro de un Form XObject
  });
});

describe("borrar imágenes originales del content stream", async () => {
  const p1 = await imagesOf(0);
  const p2 = await imagesOf(1);
  const before1 = await renderPage(FIXTURE, 1, 200);
  const before2 = await renderPage(FIXTURE, 2, 200);

  it("QR (imagen): desaparece y fuera de su área no cambia ni un píxel", async () => {
    const qr = p1.find(({ box }) => Math.abs(box.w - 90) < 1 && Math.abs(box.h - 90) < 1)!;
    expect(decodeQr(before1, pad(qr.box, 8))).toBe("https://ejemplo.invalid/s/AbCdEfGh1234");
    const { bytes, others } = await exportWith([imageEdit("p0", qr.im, qr.box, { removed: true })]);
    expect(others[0]).toMatchObject({ kind: "image", clean: true, removed: true });
    const after = await renderPage(bytes, 1, 200);
    expect(diffPixels(before1, after, { exclude: [pad(qr.box)] }).diff).toBe(0);
    expect(inkBox(after, qr.box)).toBeNull();
  }, 60000);

  it("PNG con transparencia (SMask): se borra y el fondo de color queda intacto", async () => {
    const logo = p2.find(({ im }) => im.hasSoftMask)!;
    const { bytes } = await exportWith([imageEdit("p1", logo.im, logo.box, { removed: true })]);
    const after = await renderPage(bytes, 2, 200);
    expect(diffPixels(before2, after, { exclude: [pad(logo.box)] }).diff).toBe(0);
    // Dentro del área queda solo la banda azul clara (sin el logo)
    const band = diffPixels(before2, after, { only: [logo.box] });
    expect(band.diff).toBeGreaterThan(0);
  }, 60000);

  it("imagen en línea (BI…EI): se borra limpiamente", async () => {
    const inline = p2.find(({ im }) => im.kind === "inline")!;
    const { bytes } = await exportWith([imageEdit("p1", inline.im, inline.box, { removed: true })]);
    const after = await renderPage(bytes, 2, 200);
    expect(diffPixels(before2, after, { exclude: [pad(inline.box)] }).diff).toBe(0);
    expect(inkBox(after, { x: inline.box.x + 1, y: inline.box.y + 1, w: inline.box.w - 2, h: inline.box.h - 2 })).toBeNull();
  }, 60000);

  it("imagen dentro de un Form XObject compartido: se borra en una página y la otra no cambia", async () => {
    const shared = p2.find(({ im }) => im.path.length > 0)!;
    const { bytes } = await exportWith([imageEdit("p1", shared.im, shared.box, { removed: true })]);
    const after2 = await renderPage(bytes, 2, 200);
    const after1 = await renderPage(bytes, 1, 200);
    expect(diffPixels(before2, after2, { exclude: [pad(shared.box)] }).diff).toBe(0);
    expect(inkBox(after2, { x: shared.box.x + 1, y: shared.box.y + 1, w: shared.box.w - 2, h: shared.box.h - 2 })).toBeNull();
    expect(diffPixels(before1, after1).diff).toBe(0);
  }, 60000);
});

describe("«Borrar zona» sobre un QR vectorial", async () => {
  const before2 = await renderPage(FIXTURE, 2, 200);
  // QR vectorial: 29 módulos de 3 pt, de x = 72 a 159 y de y = 572 a 659 (PDF); zona algo mayor que el código
  const zone: PtRect = { x: 68, y: 841.89 - 662, w: 95, h: 94 };

  it("el QR deja de poder leerse, la línea de tabla que lo cruza sigue y fuera de la zona nada cambia", async () => {
    expect(decodeQr(before2, pad(zone, 6))).toBe("https://ejemplo.invalid/s/VectorQR0001");
    const erase: ZoneEraseObject = { type: "zoneErase", id: "z1", pageId: "p1", ...zone, includeText: false, label: "QR" };
    const { bytes, others } = await exportWith([erase]);
    const report = others[0] as { stats: { subpaths: number; crossing: number } };
    expect(report.stats.subpaths + (report as never as { stats: { paths: number } }).stats.paths).toBeGreaterThan(0);
    expect(report.stats.crossing).toBeGreaterThanOrEqual(1); // la línea de tabla se conservó
    const after = await renderPage(bytes, 2, 200);
    expect(decodeQr(after, pad(zone, 6))).toBeNull();
    expect(diffPixels(before2, after, { exclude: [pad(zone, 1)] }).diff).toBe(0);
    // La línea de tabla (y = 600 PDF) sigue completa de punta a punta, también dentro de la zona
    // (en el original el QR estaba dibujado encima de la línea; al borrarlo, la línea se ve entera).
    const y0 = Math.floor((841.89 - 601) * after.scale);
    const y1 = Math.ceil((841.89 - 599) * after.scale);
    let gaps = 0;
    for (let x = Math.ceil(51 * after.scale); x < Math.floor(544 * after.scale); x++) {
      let dark = false;
      for (let y = y0; y <= y1; y++) if (after.data[(y * after.width + x) * 4] < 128) dark = true;
      if (!dark) gaps++;
    }
    expect(gaps).toBe(0);
  }, 60000);
});

describe("mover elementos originales", async () => {
  const blocks = await blocksOf(FIXTURE);
  const before = await renderPage(FIXTURE, 1, 200);
  // 36 pt × 18 pt = 100 px × 50 px a 200 DPI (desplazamiento exacto en píxeles)
  const DX = 36, DY = 18;
  const shiftDiff = (a: typeof before, b: typeof before, r: PtRect) => {
    let diff = 0, n = 0;
    const s = a.scale;
    for (let y = Math.floor(r.y * s); y < Math.ceil((r.y + r.h) * s); y++)
      for (let x = Math.floor(r.x * s); x < Math.ceil((r.x + r.w) * s); x++) {
        const k = (y * a.width + x) * 4;
        const k2 = ((y + DY * s) * b.width + (x + DX * s)) * 4;
        n++;
        if (Math.abs(a.data[k] - b.data[k2]) > 40) diff++;
      }
    return diff / n;
  };

  it("texto original movido: el origen queda limpio y el texto conserva fuente y escala en su nueva posición", async () => {
    const b = findBlock(blocks, "Firma del representante");
    const { bytes, reports } = await exportWith([editFor(b, b.text, "p0", { dx: DX, dy: DY })]);
    expect(reports[0].removal).toBe("clean");
    const after = await renderPage(bytes, 1, 200);
    expect(inkBox(after, b.box)).toBeNull();
    expect(shiftDiff(before, after, pad(b.box, 0.5))).toBeLessThan(0.01);
  }, 60000);

  it("imagen original movida: el origen queda limpio y la imagen aparece idéntica en el destino", async () => {
    const qr = (await imagesOf(0)).find(({ box }) => Math.abs(box.w - 90) < 1)!;
    const to = { ...qr.box, x: qr.box.x + DX, y: qr.box.y + DY };
    const { bytes } = await exportWith([imageEdit("p0", qr.im, to, { orig: qr.box })]);
    const after = await renderPage(bytes, 1, 200);
    expect(shiftDiff(before, after, { x: qr.box.x + 1, y: qr.box.y + 1, w: qr.box.w - 2, h: qr.box.h - 2 })).toBeLessThan(0.01);
    expect(decodeQr(after, pad(to, 8))).toBe("https://ejemplo.invalid/s/AbCdEfGh1234");
  }, 60000);
});
