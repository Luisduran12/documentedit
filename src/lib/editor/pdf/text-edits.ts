// Aplica las ediciones de texto original de una página: eliminación limpia + reescritura fiel.
//
// El texto nuevo se inserta JUSTO DESPUÉS de la última operación original de la línea, dentro del mismo
// content stream: hereda el mismo recorte (clip), orden de dibujo y estado gráfico. Solo si eso no es
// posible (partes en streams distintos, modos de recorte de texto…) se añade al final de la página.

import { PDFName, type PDFDict, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { frameToNative, isIdentityPlacement, placementTransform } from "../geometry";
import type { ImageEditObject, PageState, TextEditObject, ZoneEraseObject } from "../types";
import { computeZoneErase, type EraseStats, type UserRect } from "./erase";
import type { PdfFont } from "./fonts";
import { nativeToFrame } from "./blocks";
import { analyzePage, apply, formXObject, mul, opsOf, pageContentBytes, pageResources, type Matrix, type ShowRecord } from "./interpret";
import { buildLine, hexToRg, invert, layoutEdit, substituteFamily, writeLayout, type EditLayout, type EditOptions, type Line, type SubFont } from "./layout";
import { clonedResources, rewritePage, setPageContent, subDictOrCreate, uniqueName, type InsertionMap, type RemovalMap } from "./rewrite";
import { SubFontRegistry } from "./subfonts";
import { fmtNum } from "./tokenizer";

export type FontLoader = (family: string, bold: boolean, italic: boolean) => Promise<Uint8Array>;

export type TextEditReport = {
  id: string;
  /** "clean": texto original eliminado del content stream; "cover": tapado con color (respaldo). */
  removal: "clean" | "cover";
  /** "inplace": escrito en el mismo punto del content stream (mismo recorte y orden); "appended": al final. */
  placement: "inplace" | "appended";
  layout: EditLayout | null;
  /** Caja del texto nuevo en el marco de pantalla (pt). */
  bounds?: { x: number; y: number; w: number; h: number };
  error?: string;
};

export type EraseReport = { id: string; kind: "erase"; clean: boolean; stats: EraseStats };
export type ImageEditReport = { id: string; kind: "image"; clean: boolean; removed: boolean; moved: boolean };
export type ContentReport = TextEditReport | EraseReport | ImageEditReport;
export const isTextReport = (r: ContentReport | undefined): r is TextEditReport => Boolean(r && !("kind" in r));

/** Caja del texto compuesto en el marco de pantalla. */
export function layoutBounds(line: Line, layout: EditLayout, state: PageState, sizeScale = 1, matrix: Matrix = line.matrix) {
  const st = line.main;
  const asc = (st.font.ascent / 1000) * st.size * sizeScale;
  const desc = (st.font.descent / 1000) * st.size * sizeScale;
  const pts = [
    [layout.start, -desc],
    [layout.start + layout.width, -desc],
    [layout.start, asc],
    [layout.start + layout.width, asc],
  ].map(([x, y]) => {
    const [ux, uy] = apply(matrix, x, y + st.rise);
    return nativeToFrame(ux, uy, state.view, state.baseRotation);
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const frameRectToUser = (r: { x: number; y: number; w: number; h: number }, state: PageState): UserRect => {
  const a = frameToNative(r.x, r.y, state.view, state.baseRotation);
  const b = frameToNative(r.x + r.w, r.y + r.h, state.view, state.baseRotation);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
};

/** Bytes del stream donde vive una operación (página o Form XObject anidado). */
function streamAt(page: PDFPage, path: string[]) {
  const ctx = page.doc.context;
  let bytes = pageContentBytes(ctx, page);
  let res = pageResources(page);
  for (const seg of path) {
    const form = formXObject(ctx, res, seg.split("@")[0]);
    if (!form) return null;
    bytes = form.bytes;
    res = form.resources;
  }
  return bytes;
}

/**
 * Aplica en una página todas las ediciones de contenido ORIGINAL: textos (editar/mover/rotar),
 * "Borrar zona" e imágenes originales (borrar/mover/redimensionar/rotar), con una sola reescritura del stream.
 */
export async function applyTextEdits(
  out: PDFDocument,
  page: PDFPage,
  state: PageState,
  edits: TextEditObject[],
  loadFont: FontLoader,
  extra: { erases?: ZoneEraseObject[]; images?: ImageEditObject[] } = {},
): Promise<ContentReport[]> {
  const ctx = out.context;
  const analysis = analyzePage(page);
  const byId = new Map(analysis.records.map((r) => [r.id, r]));
  const res = clonedResources(ctx, page);

  type Plan = { e: TextEditObject; line: Line | null; clean: boolean; opts: EditOptions; layout: EditLayout | null; anchor: ShowRecord | null; matrix: Matrix | null };
  const plans: Plan[] = edits.map((e) => {
    const line = buildLine(analysis.records, e.parts);
    // Texto original movido o rotado: se escribe al final de la página (fuera de su recorte original).
    const moved = Boolean(e.dx || e.dy || e.rotation);
    const box = { x: e.x, y: e.y, w: e.w, h: e.h };
    const U = moved ? placementTransform(state.view, state.baseRotation, box, { ...box, x: box.x + (e.dx ?? 0), y: box.y + (e.dy ?? 0) }, e.rotation ?? 0) : null;
    const recs = e.parts.map((p) => byId.get(p.rec));
    const clean = !e.cover && analysis.ok && !!line && recs.every((r) => r && r.font.supported);
    // Ancla: la última operación de la línea en el orden del stream, si todas están en el mismo stream.
    const samePath = recs.every((r) => r && r.path.join("/") === recs[0]!.path.join("/"));
    const anchor = clean && samePath ? (recs as ShowRecord[]).reduce((a, b) => (b.opIndex > a.opIndex ? b : a)) : null;
    const opts: EditOptions = { scaleX: e.scaleX || 1, sizeScale: e.sizeScale || 1, color: e.color, fontOverride: e.fontOverride, align: e.align };
    return { e, line, clean, opts, layout: null, anchor: anchor && anchor.render < 4 && !moved ? anchor : null, matrix: line && U ? mul(line.matrix, U) : null };
  });

  // 1) Composición (con las sustitutas necesarias ya cargadas)
  const registry = new SubFontRegistry(loadFont);
  const variants = new Map<string, { family: string; bold: boolean; italic: boolean }>();
  for (const p of plans)
    for (const c of p.line?.chars ?? []) {
      if (!c.rec) continue;
      const fam = p.e.fontOverride ?? substituteFamily(c.rec.font);
      variants.set(`${fam}|${c.rec.font.bold}|${c.rec.font.italic}`, { family: fam, bold: c.rec.font.bold, italic: c.rec.font.italic });
    }
  await registry.ensure([...variants.values()]);
  for (const p of plans) if (p.line) p.layout = layoutEdit(p.line, p.e.text, p.opts, registry.resolver, !p.clean);

  // 2) Fuentes sustitutas incrustadas (asíncrono) antes de reescribir
  const subFonts = new Map<string, PDFFont>();
  for (const p of plans)
    for (const g of p.layout?.glyphs ?? [])
      if (g.sub && !subFonts.has(g.sub.key)) subFonts.set(g.sub.key, await out.embedFont(registry.bytesOf(g.sub)!, { subset: true }));

  // Claves de fuente por diccionario de recursos (página o XObject clonado)
  const keyCache = new WeakMap<PDFDict, Map<unknown, string>>();
  const fontKey = (resources: PDFDict, id: unknown, ref: Parameters<PDFDict["set"]>[1], base: string) => {
    let m = keyCache.get(resources);
    if (!m) keyCache.set(resources, (m = new Map()));
    let key = m.get(id);
    if (!key) {
      const fd = subDictOrCreate(ctx, resources, "Font");
      key = uniqueName(fd, base);
      fd.set(PDFName.of(key), ref);
      m.set(id, key);
    }
    return key;
  };
  const resolverFor = (resources: PDFDict) => ({
    origKey: (font: PdfFont) => fontKey(resources, font.dict, font.ref ?? ctx.register(font.dict!), "DPF"),
    subKey: (sub: SubFont) => fontKey(resources, sub.key, subFonts.get(sub.key)!.ref, "DPS"),
    subEncode: (sub: SubFont, ch: string) => subFonts.get(sub.key)!.encodeText(ch).asBytes(),
  });
  // Al escribir en la página un texto que venía de un XObject, un espacio de color con nombre puede no existir ahí.
  const colorFor = (appended: boolean) => (st: ShowRecord) => (appended && st.path.length > 0 && /\bcs\b/.test(st.fill.ops) ? hexToRg(st.fill.hex) : st.fill.ops);

  // 3) Eliminación + inserción en el sitio
  const removals: RemovalMap = new Map();
  const insertions: InsertionMap = new Map();
  for (const p of plans) {
    if (!p.clean) continue;
    for (const part of p.e.parts) {
      const set = removals.get(part.rec) ?? new Set<number>();
      for (let gi = part.from; gi < part.to; gi++) set.add(gi);
      removals.set(part.rec, set);
    }
    if (p.anchor && p.line && p.layout) {
      const { line, layout, opts, anchor } = p;
      // Varias ediciones podrían compartir ancla: se encadenan.
      const prev = insertions.get(anchor.id);
      insertions.set(anchor.id, (resources) => {
        const local = mul(line.matrix, invert(anchor.ctm));
        const ops = writeLayout(line, layout, opts, resolverFor(resources), colorFor(false), local);
        const before = prev ? prev(resources) : "";
        return before ? `${before}\n${ops}` : ops;
      });
    }
  }
  // Borrar zona e imágenes originales
  const deleteOps = new Set<string>();
  const extraReports: (EraseReport | ImageEditReport)[] = [];
  const imgById = new Map(analysis.images.map((im) => [im.id, im]));
  const movedImages: { e: ImageEditObject; M: Matrix }[] = [];
  for (const z of extra.erases ?? []) {
    if (!analysis.ok) {
      extraReports.push({ id: z.id, kind: "erase", clean: false, stats: { images: 0, paths: 0, subpaths: 0, glyphs: 0, crossing: 0, partialImages: 0 } });
      continue;
    }
    const r = computeZoneErase(analysis, frameRectToUser(z, state), z.includeText);
    r.deleteOps.forEach((id) => deleteOps.add(id));
    for (const [rec, set] of r.glyphs) {
      const cur = removals.get(rec) ?? new Set<number>();
      set.forEach((g) => cur.add(g));
      removals.set(rec, cur);
    }
    extraReports.push({ id: z.id, kind: "erase", clean: true, stats: r.stats });
  }
  for (const im of extra.images ?? []) {
    const rec = imgById.get(im.ref);
    const moved = !im.removed && !isIdentityPlacement(im.orig, im, im.rotation ?? 0);
    if (!im.removed && !moved) continue;
    if (!rec || !analysis.ok) {
      extraReports.push({ id: im.id, kind: "image", clean: false, removed: im.removed, moved });
      continue;
    }
    deleteOps.add(rec.id);
    if (moved) movedImages.push({ e: im, M: mul(rec.ctm, placementTransform(state.view, state.baseRotation, im.orig, im, im.rotation ?? 0)) });
    extraReports.push({ id: im.id, kind: "image", clean: true, removed: im.removed, moved });
  }

  const { bytes, failed, inserted } = rewritePage(page, analysis.records, removals, insertions, deleteOps);

  // 4) Lo que no se pudo insertar en el sitio: tapado (si no hubo eliminación limpia) y texto al final
  const coverOps: string[] = [];
  const appendOps: string[] = [];
  const reports: TextEditReport[] = [];
  const pendingAppend: Plan[] = [];
  for (const p of plans) {
    if (!p.line || !p.layout) {
      reports.push({ id: p.e.id, removal: "cover", placement: "appended", layout: null, error: "No se encontró el texto original en la página" });
      continue;
    }
    const cleanDone = p.clean && !p.e.parts.some((part) => failed.includes(part.rec));
    const inPlace = cleanDone && p.anchor !== null && inserted.includes(p.anchor.id);
    if (!cleanDone) {
      const color = p.e.cover?.color ?? "#ffffff";
      for (const r of p.e.cover?.rects ?? [{ x: p.e.x, y: p.e.y, w: p.e.w, h: p.e.h }]) {
        const [x0, y0] = frameToNative(r.x, r.y + r.h, state.view, state.baseRotation);
        const [x1, y1] = frameToNative(r.x + r.w, r.y, state.view, state.baseRotation);
        coverOps.push(`q ${hexToRg(color)} ${fmtNum(Math.min(x0, x1))} ${fmtNum(Math.min(y0, y1))} ${fmtNum(Math.abs(x1 - x0))} ${fmtNum(Math.abs(y1 - y0))} re f Q`);
      }
      // Sin eliminación limpia se escribe con sustituta
      if (p.clean) p.layout = layoutEdit(p.line, p.e.text, p.opts, registry.resolver, true);
    }
    if (!inPlace) pendingAppend.push(p);
    reports.push({ id: p.e.id, removal: cleanDone ? "clean" : "cover", placement: inPlace ? "inplace" : "appended", layout: p.layout, bounds: layoutBounds(p.line, p.layout, state, p.opts.sizeScale, p.matrix ?? undefined) });
  }
  for (const p of pendingAppend)
    for (const g of p.layout?.glyphs ?? [])
      if (g.sub && !subFonts.has(g.sub.key)) subFonts.set(g.sub.key, await out.embedFont(registry.bytesOf(g.sub)!, { subset: true }));
  for (const p of pendingAppend) appendOps.push(writeLayout(p.line!, p.layout!, p.opts, resolverFor(res), colorFor(true), p.matrix ?? undefined));

  // Imágenes originales reubicadas: se vuelven a dibujar (mismo XObject, sin recomprimir) en su nuevo sitio.
  for (const { e, M } of movedImages) {
    const rec = imgById.get(e.ref)!;
    let draw: string | null = null;
    if (rec.kind === "xobject" && rec.ref) {
      const xd = subDictOrCreate(ctx, res, "XObject");
      const key = uniqueName(xd, "DPI");
      xd.set(PDFName.of(key), rec.ref);
      draw = `/${key} Do`;
    } else if (rec.kind === "inline") {
      const sb = streamAt(page, rec.path);
      const op = sb ? opsOf(sb)[rec.opIndex] : null;
      if (sb && op) draw = new TextDecoder("latin1").decode(sb.subarray(op.start, op.end));
    }
    if (draw) appendOps.push(`q ${M.map((v) => fmtNum(v)).join(" ")} cm ${draw} Q`);
  }
  // Respaldo cuando no se pudo eliminar limpiamente: tapar con color (se informa en pantalla).
  for (const r of extraReports) {
    if (r.clean) continue;
    const obj = (extra.erases ?? []).find((z) => z.id === r.id) ?? (extra.images ?? []).find((i) => i.id === r.id);
    if (!obj) continue;
    const box = "orig" in obj ? obj.orig : obj;
    const [x0, y0, x1, y1] = frameRectToUser(box, state);
    coverOps.push(`q 1 g ${fmtNum(x0)} ${fmtNum(y0)} ${fmtNum(x1 - x0)} ${fmtNum(y1 - y0)} re f Q`);
  }

  const enc = new TextEncoder();
  const head = enc.encode("q\n");
  const tail = enc.encode(`\nQ\n${coverOps.join("\n")}\n${appendOps.join("\n")}\n`);
  const all = new Uint8Array(head.length + bytes.length + tail.length);
  all.set(head, 0);
  all.set(bytes, head.length);
  all.set(tail, head.length + bytes.length);
  setPageContent(page, all);
  return [...reports, ...extraReports];
}
