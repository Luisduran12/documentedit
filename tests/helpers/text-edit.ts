import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { applyEdits, type ApplyLoaders } from "@/lib/editor/apply";
import { bundledFileName } from "@/lib/editor/fonts";
import { normalizeRotation } from "@/lib/editor/geometry";
import { detectBlocks, type TextBlock } from "@/lib/editor/pdf/blocks";
import { analyzePage } from "@/lib/editor/pdf/interpret";
import { isTextReport, type ContentReport, type TextEditReport } from "@/lib/editor/pdf/text-edits";
import type { EditDoc, EditObject, PageState, TextEditObject } from "@/lib/editor/types";

export const FIXTURE = new Uint8Array(readFileSync(new URL("../fixtures/fuec-sintetico.pdf", import.meta.url)));

export const loaders: ApplyLoaders = {
  loadFontBytes: async (f) => new Uint8Array(readFileSync(new URL(`../../public/fonts/${bundledFileName(f.family, f.bold, f.italic)}`, import.meta.url))),
  loadAsset: async () => new Uint8Array(),
  qrPng: async (u) => new Uint8Array(await QRCode.toBuffer(u, { width: 1024 })),
};

export async function pagesOf(bytes: Uint8Array): Promise<PageState[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p, i) => {
    const mb = p.getCropBox();
    return { id: `p${i}`, src: i, baseRotation: normalizeRotation(p.getRotation().angle), rotation: 0, view: [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height] };
  });
}

export async function blocksOf(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes);
  const pages = await pagesOf(bytes);
  return detectBlocks(analyzePage(doc.getPage(pageIndex)), pages[pageIndex].view, pages[pageIndex].baseRotation);
}

export function findBlock(blocks: TextBlock[], startsWith: string) {
  const b = blocks.find((x) => x.text.startsWith(startsWith));
  if (!b) throw new Error(`Bloque no encontrado: ${startsWith}\n${blocks.map((x) => x.text).join("\n")}`);
  return b;
}

export function editFor(block: TextBlock, text: string, pageId = "p0", extra: Partial<TextEditObject> = {}): TextEditObject {
  return {
    type: "textEdit",
    id: `e-${block.key}`,
    pageId,
    ...block.box,
    parts: block.parts,
    originalText: block.text,
    text,
    align: block.align,
    scaleX: 1,
    sizeScale: 1,
    ...extra,
  };
}

export async function exportWith(edits: EditObject[], opts: { pageIds?: string[] } = {}) {
  const pages = await pagesOf(FIXTURE);
  const doc: EditDoc = { pages, objects: edits };
  const reports: TextEditReport[] = [];
  const others: ContentReport[] = [];
  const bytes = await applyEdits(FIXTURE, doc, loaders, { ...opts, onTextReport: (r) => (isTextReport(r) ? reports.push(r) : others.push(r)) });
  return { bytes, reports, others };
}

export async function extractText(bytes: Uint8Array, page = 1) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const tc = await (await doc.getPage(page)).getTextContent();
  const s = tc.items.map((it) => ("str" in it ? it.str : "")).join("");
  await task.destroy();
  return s;
}
