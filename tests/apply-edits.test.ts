import { readFileSync } from "node:fs";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { beforeAll, describe, expect, it } from "vitest";
import { applyEdits, type ApplyLoaders } from "@/lib/editor/apply";
import { bundledFileName } from "@/lib/editor/fonts";
import type { EditDoc, PageState } from "@/lib/editor/types";

async function samplePdf() {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Pagina original ${i}`, { x: 60, y: 760, size: 18, font: f });
  }
  doc.getPage(2).setRotation(degrees(90)); // página 3 escaneada en horizontal
  return doc.save();
}

async function textOf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages;
}

const loaders: ApplyLoaders = {
  loadFontBytes: async (f) => new Uint8Array(readFileSync(`public/fonts/${bundledFileName(f.family, f.bold, f.italic)}`)),
  loadAsset: async () => new Uint8Array(await QRCode.toBuffer("asset", { width: 200 })),
  qrPng: async (url) => new Uint8Array(await QRCode.toBuffer(url, { width: 1024, margin: 4 })),
};

const page = (id: string, src: number | null, extra: Partial<PageState> = {}): PageState => ({
  id,
  src,
  baseRotation: 0,
  rotation: 0,
  view: [0, 0, 595, 842],
  ...extra,
});
const style = { font: { family: "Helvetica", bold: false, italic: false }, size: 14, color: "#112233", opacity: 1, lineHeight: 1.2, tracking: 0, align: "left" as const };

let base: Uint8Array;
beforeAll(async () => {
  base = await samplePdf();
});

describe("aplicación de operaciones de edición", () => {
  it("reordena, elimina, duplica, rota e inserta páginas en blanco", async () => {
    const doc: EditDoc = {
      pages: [
        page("c", 2, { baseRotation: 90, rotation: 90 }), // la 3 primero, girada +90 (total 180)
        page("a", 0),
        page("a2", 0), // duplicado de la 1
        page("blank", null, { view: [0, 0, 300, 400] }),
        // la página 2 (src 1) se eliminó
      ],
      objects: [],
    };
    const out = await PDFDocument.load(await applyEdits(base, doc, loaders));
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(0).getRotation().angle).toBe(180);
    expect(out.getPage(3).getSize()).toEqual({ width: 300, height: 400 });
    const text = await textOf(await out.save());
    expect(text[0]).toContain("Pagina original 3");
    expect(text[1]).toContain("Pagina original 1");
    expect(text[2]).toContain("Pagina original 1");
    expect(text.join(" ")).not.toContain("Pagina original 2");
  });

  it("edita texto existente (tapa el original) y añade texto con acentos y fuente incluida", async () => {
    const doc: EditDoc = {
      pages: [page("a", 0)],
      objects: [
        {
          type: "text", id: "t1", pageId: "a", x: 60, y: 62, w: 250, h: 22, text: "Contrato modificado",
          style: { ...style, size: 18 }, cover: { x: 58, y: 62, w: 200, h: 24, color: "#ffffff" }, sourceFont: "Helvetica",
        },
        {
          type: "text", id: "t2", pageId: "a", x: 60, y: 200, w: 300, h: 40, text: "Señor Muñoz\nAño 2026 — €",
          style: { ...style, font: { family: "roboto", bold: true, italic: false } },
        },
        { type: "text", id: "t3", pageId: "a", x: 60, y: 300, w: 300, h: 20, text: "Привет мир", style },
      ],
    };
    const bytes = await applyEdits(base, doc, loaders);
    const [p1] = await textOf(bytes);
    expect(p1).toContain("Contrato modificado");
    expect(p1).toContain("Señor Muñoz");
    expect(p1).toContain("Año 2026 — €");
    // Helvetica no puede con cirílico: se usa automáticamente Liberation Sans en vez de fallar.
    expect(p1).toContain("Привет мир");
  });

  it("incrusta QR, imagen, resaltado, tapado y firma; también sobre una página con /Rotate 90", async () => {
    const doc: EditDoc = {
      pages: [page("c", 2, { baseRotation: 90 })],
      objects: [
        { type: "qr", id: "q", pageId: "c", x: 600, y: 400, w: 150, h: 150, url: "https://ejemplo.com/s/AbCdEfGh1234", shareId: "AbCdEfGh1234" },
        { type: "image", id: "i", pageId: "c", x: 20, y: 20, w: 80, h: 80, assetKey: "assets/x.png", mime: "image/png", opacity: 1 },
        { type: "highlight", id: "h", pageId: "c", x: 50, y: 50, w: 200, h: 20, color: "#ffeb3b", opacity: 0.4 },
        { type: "cover", id: "r", pageId: "c", x: 300, y: 300, w: 100, h: 30, color: "#ffffff" },
        { type: "ink", id: "s", pageId: "c", x: 100, y: 450, w: 160, h: 60, color: "#1d4ed8", width: 2, strokes: [[[0, 0.5], [0.5, 0], [1, 1]]] },
        { type: "text", id: "t", pageId: "c", x: 40, y: 120, w: 300, h: 20, text: "Texto horizontal", style },
      ],
    };
    const bytes = await applyEdits(base, doc, loaders);
    const out = await PDFDocument.load(bytes);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    const [text] = await textOf(bytes);
    expect(text).toContain("Texto horizontal");
    // Dos imágenes (QR + imagen) incrustadas como XObject.
    const xobjects = out.getPage(0).node.Resources()?.lookup((await import("pdf-lib")).PDFName.of("XObject"));
    expect(xobjects?.toString().match(/\/Image-|\/Im/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("el QR se incrusta con al menos 600 px por lado", async () => {
    const png = await loaders.qrPng("https://ejemplo.com/s/AbCdEfGh1234");
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(png);
    expect(img.width).toBeGreaterThanOrEqual(600);
  });
});
