// Eliminación limpia de texto: reescribe SOLO las operaciones de texto afectadas. Cada glifo eliminado se
// sustituye por un desplazamiento TJ equivalente a su avance exacto, así los glifos que quedan no se mueven
// y trazos, líneas, imágenes y fondos quedan intactos (todo lo demás se copia byte a byte).

import { PDFDict, PDFName, PDFRawStream, type PDFContext, type PDFPage, type PDFRef } from "pdf-lib";
import { encodeCodes, resolve } from "./fonts";
import { formXObject, opsOf, pageContentBytes, pageResources, subDict, type ShowRecord } from "./interpret";
import { fmtNum, serializeOp, serializeOperand, splice, type Operand } from "./tokenizer";

/** Glifos a eliminar por registro: índices dentro de `ShowRecord.glyphs`. */
export type RemovalMap = Map<string, Set<number>>;

/**
 * Texto nuevo a insertar justo después de una operación de texto (mismo recorte, orden y estado gráfico).
 * Recibe el diccionario de recursos del stream donde se inserta; devuelve operadores o null si no procede.
 */
export type InsertionMap = Map<string, (resources: PDFDict) => string | null>;

/** Operadores que restauran Tm/Tlm tras cerrar y reabrir el objeto de texto. */
export function restoreTextState(rec: ShowRecord): string | null {
  const tl = rec.tlmAfter;
  const tm = rec.tmAfter;
  const th = rec.tz / 100;
  if (!rec.size || !th) return null;
  const dx = Math.abs(tl[0]) > 1e-9 ? (tm[4] - tl[4]) / tl[0] : Math.abs(tl[1]) > 1e-9 ? (tm[5] - tl[5]) / tl[1] : 0;
  const m = tl.map(fmtNum).join(" ");
  const shift = Math.abs(dx) > 1e-9 ? ` [${fmtNum((-dx / (rec.size * th)) * 1000)}] TJ` : "";
  return `${m} Tm${shift}`;
}

/** Desplazamiento TJ (milésimas) equivalente al avance del glifo, incluidos Tc y Tw. */
function glyphAsKern(rec: ShowRecord, gi: number) {
  const g = rec.glyphs[gi];
  const isSpace = rec.font.codeBytes === 1 && g.code === 32;
  return -(g.w + ((rec.tc + (isSpace ? rec.tw : 0)) * 1000) / rec.size);
}

export function replacementFor(rec: ShowRecord, remove: Set<number>, originalOperands: Operand[]): string | null {
  if (!rec.size) return null;
  const items: Operand[] = [];
  const pushNum = (v: number) => {
    const last = items[items.length - 1];
    if (last && last.t === "num") last.v += v;
    else items.push({ t: "num", v });
  };
  let codes: number[] = [];
  const flush = () => {
    if (codes.length) items.push({ t: "str", bytes: encodeCodes(codes, rec.font.codeBytes), hex: true });
    codes = [];
  };

  // Recorremos los glifos en orden; los números TJ originales ya están en `kernBefore`.
  rec.glyphs.forEach((g, gi) => {
    if (g.kernBefore) {
      flush();
      pushNum(g.kernBefore);
    }
    if (remove.has(gi)) {
      flush();
      pushNum(glyphAsKern(rec, gi));
    } else codes.push(g.code);
  });
  flush();
  // Ajuste TJ final (después del último glifo) — afecta a la posición de lo que sigue en el bloque BT.
  const trailing = trailingKern(rec, originalOperands);
  if (trailing) pushNum(trailing);

  const arr = `[${items.map(serializeOperand).join(" ")}] TJ`;
  if (rec.operator === "'") return `T* ${arr}`;
  if (rec.operator === '"') return `${fmtNum(numOf(originalOperands[0]))} Tw ${fmtNum(numOf(originalOperands[1]))} Tc T* ${arr}`;
  return arr;
}

const numOf = (o: Operand | undefined) => (o && o.t === "num" ? o.v : 0);

function trailingKern(rec: ShowRecord, ops: Operand[]) {
  if (rec.operator !== "TJ" || ops[0]?.t !== "arr") return 0;
  const items = ops[0].items;
  let sum = 0;
  for (let k = items.length - 1; k >= 0 && items[k].t === "num"; k--) sum += (items[k] as { v: number }).v;
  return sum;
}

type RewriteResult = { bytes: Uint8Array; failed: string[] };

/**
 * Reescribe el content stream de la página (y de los Form XObjects implicados) eliminando los glifos indicados.
 * Devuelve los ids de registros que no se pudieron eliminar (para usar el respaldo de tapado).
 */
export function rewritePage(
  page: PDFPage,
  records: ShowRecord[],
  removals: RemovalMap,
  insertions: InsertionMap = new Map(),
  /** Operaciones a eliminar enteras (imágenes, trayectos): ids «ruta#índice». */
  deleteOps: Set<string> = new Set(),
): RewriteResult & { inserted: string[] } {
  const ctx = page.doc.context;
  const byId = new Map(records.map((r) => [r.id, r]));
  const failed: string[] = [];
  const inserted: string[] = [];

  // Recursos propios de la página (clonados): nunca se tocan diccionarios compartidos con otras páginas.
  const res = clonedResources(ctx, page);

  const rewriteStream = (bytes: Uint8Array, resources: PDFDict, path: string[]): Uint8Array => {
    const ops = opsOf(bytes);
    const prefix = path.join("/");
    const replacements: { start: number; end: number; text: string }[] = [];
    ops.forEach((op, index) => {
      if (deleteOps.has(`${prefix}#${index}`)) {
        replacements.push({ start: op.start, end: op.end, text: "" });
        return;
      }
      if (op.operator === "Tj" || op.operator === "TJ" || op.operator === "'" || op.operator === '"') {
        const id = `${prefix}#${index}`;
        const remove = removals.get(id);
        const rec = byId.get(id);
        const insert = insertions.get(id);
        if ((!remove || remove.size === 0) && !insert) return;
        let text = remove && remove.size ? (rec ? replacementFor(rec, remove, op.operands) : null) : new TextDecoder("latin1").decode(bytes.subarray(op.start, op.end));
        if (text === null) {
          failed.push(id);
          return;
        }
        if (insert && rec) {
          const ops = insert(resources);
          const restore = restoreTextState(rec);
          if (ops && restore) {
            // Cerrar el objeto de texto, dibujar el texto nuevo aislado y reabrir restaurando la posición.
            text += `\nET q\n${ops}\nQ BT\n${restore}\n`;
            inserted.push(id);
          }
        }
        replacements.push({ start: op.start, end: op.end, text });
      } else if (op.operator === "Do" && op.operands[0]?.t === "name") {
        const name = op.operands[0].v;
        const childPath = [...path, `${name}@${index}`];
        const childPrefix = childPath.join("/");
        const touches = [...removals.keys(), ...insertions.keys(), ...deleteOps].some((id) => id.startsWith(`${childPrefix}#`) || id.startsWith(`${childPrefix}/`));
        if (!touches) return;
        const form = formXObject(ctx, resources, name);
        if (!form) return;
        // Clonar el XObject para esta página: otras páginas (o usos) siguen viendo el original.
        const formRes = form.resources instanceof PDFDict ? (form.resources.clone(ctx) as PDFDict) : ctx.obj({});
        cloneSub(ctx, formRes, "XObject");
        const newBytes = rewriteStream(form.bytes, formRes, childPath);
        const dict = form.dict.clone(ctx);
        for (const k of ["Length", "Filter", "DecodeParms"]) dict.delete(PDFName.of(k));
        dict.set(PDFName.of("Resources"), formRes);
        const stream = ctx.flateStream(newBytes, Object.fromEntries(dict.entries().map(([k, v]) => [k.decodeText(), v])));
        const ref = ctx.register(stream);
        const newName = uniqueName(subDictOrCreate(ctx, resources, "XObject"), `DPX${index}`);
        subDictOrCreate(ctx, resources, "XObject").set(PDFName.of(newName), ref);
        replacements.push({ start: op.start, end: op.end, text: serializeOp("Do", [{ t: "name", v: newName }]) });
      }
    });
    return replacements.length ? splice(bytes, replacements) : bytes;
  };

  const bytes = rewriteStream(pageContentBytes(ctx, page), res, []);
  return { bytes, failed, inserted };
}

export function clonedResources(ctx: PDFContext, page: PDFPage): PDFDict {
  const current = page.node.get(PDFName.of("Resources"));
  const existing = resolve(ctx, current);
  if (existing instanceof PDFDict && (page.node as unknown as { __dpCloned?: boolean }).__dpCloned) return existing;
  const base = pageResources(page);
  const res = base ? (base.clone(ctx) as PDFDict) : ctx.obj({});
  for (const k of ["Font", "XObject", "ExtGState", "ColorSpace"]) cloneSub(ctx, res, k);
  page.node.set(PDFName.of("Resources"), res);
  (page.node as unknown as { __dpCloned?: boolean }).__dpCloned = true;
  return res;
}

function cloneSub(ctx: PDFContext, res: PDFDict, key: string) {
  const d = subDict(ctx, res, key);
  if (d) res.set(PDFName.of(key), d.clone(ctx));
}

export function subDictOrCreate(ctx: PDFContext, res: PDFDict, key: string): PDFDict {
  let d = subDict(ctx, res, key);
  if (!d) {
    d = ctx.obj({});
    res.set(PDFName.of(key), d);
  }
  return d;
}

export function uniqueName(dict: PDFDict, base: string) {
  let name = base;
  let k = 0;
  while (dict.has(PDFName.of(name))) name = `${base}_${++k}`;
  return name;
}

/** Sustituye el contenido de la página por un único stream (comprimido). */
export function setPageContent(page: PDFPage, bytes: Uint8Array): PDFRef {
  const ctx = page.doc.context;
  const ref = ctx.register(ctx.flateStream(bytes) as PDFRawStream);
  page.node.set(PDFName.of("Contents"), ref);
  return ref;
}
