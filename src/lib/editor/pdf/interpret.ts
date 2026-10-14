// Intérprete de content streams: reconstruye el estado gráfico y de texto para obtener, por cada operación
// de texto (Tj, TJ, ', "), la fuente, tamaño, escala horizontal (Tz), espaciados (Tc/Tw), color y la
// posición exacta de cada glifo. También recoge las líneas rectas (bordes de tablas) para no unir celdas.

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, type PDFContext, type PDFObject, type PDFPage } from "pdf-lib";
import { decodeCodes, loadFont, resolve, streamBytes, type PdfFont } from "./fonts";
import { serializeOp, tokenize, type Op, type Operand } from "./tokenizer";

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** A seguido de B (convención de vector fila de PDF). */
export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
export const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export type Glyph = {
  code: number;
  unicode: string;
  /** Ancho en unidades de glifo (1/1000 em). */
  w: number;
  /** Posición horizontal en espacio de texto al inicio del glifo y avance total (incluye Tc/Tw y escala). */
  tx: number;
  adv: number;
  /** Ajuste TJ (en milésimas) inmediatamente anterior a este glifo. */
  kernBefore: number;
  /** Índice del elemento dentro del arreglo TJ (0 para Tj). */
  element: number;
};

export type FillColor = { ops: string; hex: string };

export type ShowRecord = {
  id: string;
  /** Cadena «Nombre@índiceDelDo» de XObjects desde la página (vacía = content stream de la página). */
  path: string[];
  opIndex: number;
  operator: "Tj" | "TJ" | "'" | '"';
  font: PdfFont;
  size: number;
  tc: number;
  tw: number;
  /** Escala horizontal en porcentaje (Tz). */
  tz: number;
  rise: number;
  render: number;
  fill: FillColor;
  /** Matriz espacio de texto → espacio de usuario al inicio de la operación (Tm × CTM). */
  trm: Matrix;
  /** CTM vigente en la operación (para escribir en el mismo sitio del content stream). */
  ctm: Matrix;
  /** Matrices de texto (Tm y Tlm) justo después de la operación (para restaurar el estado). */
  tmAfter: Matrix;
  tlmAfter: Matrix;
  glyphs: Glyph[];
  /** Avance total en espacio de texto. */
  advance: number;
};

export type Segment = { x0: number; y0: number; x1: number; y1: number };

/** Dibujo de una imagen (XObject o en línea): el cuadrado unidad se transforma con `ctm`. */
export type ImageRecord = {
  id: string;
  path: string[];
  opIndex: number;
  kind: "xobject" | "inline";
  name: string | null;
  ref: PDFRef | null;
  ctm: Matrix;
  /** Caja en espacio de usuario [x0, y0, x1, y1]. */
  bbox: [number, number, number, number];
  pixelWidth: number;
  pixelHeight: number;
  hasSoftMask: boolean;
  /** ¿Se dibuja con un recorte (clip) activo? */
  clipped: boolean;
};

/** Objeto de trayecto: desde su primera operación de construcción hasta la de pintado. */
export type PathRecord = {
  id: string;
  path: string[];
  start: number;
  end: number;
  subpaths: { start: number; end: number; bbox: [number, number, number, number] }[];
  bbox: [number, number, number, number];
  paint: "fill" | "stroke" | "both" | "none";
  clip: boolean;
};

export type PageAnalysis = {
  records: ShowRecord[];
  rules: Segment[];
  images: ImageRecord[];
  paths: PathRecord[];
  /** false si no se pudo interpretar (cifrado, sintaxis rota…): se usará el respaldo de tapado. */
  ok: boolean;
  error?: string;
};

type GState = {
  ctm: Matrix;
  fill: FillColor;
  font: PdfFont | null;
  size: number;
  tc: number;
  tw: number;
  tz: number;
  tl: number;
  rise: number;
  render: number;
};

const n = (o: Operand | undefined) => (o && o.t === "num" ? o.v : 0);

function rgbHex(r: number, g: number, b: number) {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorFromOps(op: string, ops: Operand[], cs: string): string {
  const v = ops.filter((o) => o.t === "num").map((o) => (o as { v: number }).v);
  if (op === "g") return rgbHex(v[0], v[0], v[0]);
  if (op === "rg") return rgbHex(v[0], v[1], v[2]);
  if (op === "k") return rgbHex((1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3]));
  if (v.length === 1) return rgbHex(v[0], v[0], v[0]);
  if (v.length === 3) return rgbHex(v[0], v[1], v[2]);
  if (v.length === 4) return rgbHex((1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3]));
  void cs;
  return "#000000";
}

export function pageContentBytes(ctx: PDFContext, page: PDFPage): Uint8Array {
  const contents = resolve(ctx, page.node.get(PDFName.of("Contents")));
  const parts: Uint8Array[] = [];
  if (contents instanceof PDFArray) for (const c of contents.asArray()) parts.push(streamBytes(ctx, c) ?? new Uint8Array());
  else {
    const b = streamBytes(ctx, contents);
    if (b) parts.push(b);
  }
  // Los streams de un arreglo se concatenan como si fueran uno solo (separados por espacio).
  const total = parts.reduce((s, p) => s + p.length + 1, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
    out[off++] = 0x0a;
  }
  return out;
}

export function pageResources(page: PDFPage): PDFDict | undefined {
  // Recursos heredados del árbol de páginas.
  let node: PDFDict | undefined = page.node;
  const ctx = page.doc.context;
  while (node) {
    const r = resolve(ctx, node.get(PDFName.of("Resources")));
    if (r instanceof PDFDict) return r;
    const parent = resolve(ctx, node.get(PDFName.of("Parent")));
    node = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

export function subDict(ctx: PDFContext, res: PDFDict | undefined, key: string): PDFDict | undefined {
  const d = res && resolve(ctx, res.get(PDFName.of(key)));
  return d instanceof PDFDict ? d : undefined;
}

export type StreamPass = { ops: Op[]; bytes: Uint8Array };

/** Analiza una página completa (con sus Form XObjects). */
export function analyzePage(page: PDFPage): PageAnalysis {
  const ctx = page.doc.context;
  const acc: Acc = { records: [], rules: [], images: [], paths: [] };
  try {
    const bytes = pageContentBytes(ctx, page);
    interpretStream(ctx, bytes, pageResources(page), IDENTITY, [], acc, 0);
    return { ...acc, ok: true };
  } catch (e) {
    return { ...acc, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const opCache = new WeakMap<Uint8Array, Op[]>();
export function opsOf(bytes: Uint8Array) {
  let ops = opCache.get(bytes);
  if (!ops) {
    ops = tokenize(bytes);
    opCache.set(bytes, ops);
  }
  return ops;
}

export function imageXObject(ctx: PDFContext, res: PDFDict | undefined, name: string) {
  const xo = subDict(ctx, res, "XObject");
  const ref = xo?.get(PDFName.of(name));
  const obj = resolve(ctx, ref);
  if (!obj || !("dict" in (obj as object))) return null;
  const dict = (obj as unknown as { dict: PDFDict }).dict;
  const sub = resolve(ctx, dict.get(PDFName.of("Subtype")));
  if (!(sub instanceof PDFName) || sub.decodeText() !== "Image") return null;
  const num = (k: string) => {
    const v = resolve(ctx, dict.get(PDFName.of(k)));
    return v instanceof PDFNumber ? v.asNumber() : 0;
  };
  return { ref: ref instanceof PDFRef ? ref : null, width: num("Width"), height: num("Height"), smask: dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("Mask")) };
}

export function formXObject(ctx: PDFContext, res: PDFDict | undefined, name: string) {
  const xo = subDict(ctx, res, "XObject");
  const ref = xo?.get(PDFName.of(name));
  const obj = resolve(ctx, ref);
  if (!obj || !("dict" in (obj as object))) return null;
  const dict = (obj as unknown as { dict: PDFDict }).dict;
  const sub = resolve(ctx, dict.get(PDFName.of("Subtype")));
  if (!(sub instanceof PDFName) || sub.decodeText() !== "Form") return null;
  const m = resolve(ctx, dict.get(PDFName.of("Matrix")));
  const matrix: Matrix = m instanceof PDFArray ? (m.asArray().map((x) => (resolve(ctx, x) as PDFNumber).asNumber()) as Matrix) : IDENTITY;
  const fres = resolve(ctx, dict.get(PDFName.of("Resources")));
  return { ref, obj, dict, matrix, resources: fres instanceof PDFDict ? fres : res, bytes: streamBytes(ctx, obj as PDFObject) ?? new Uint8Array() };
}

type Acc = { records: ShowRecord[]; rules: Segment[]; images: ImageRecord[]; paths: PathRecord[] };

function interpretStream(ctx: PDFContext, bytes: Uint8Array, res: PDFDict | undefined, baseCtm: Matrix, path: string[], acc: Acc, depth: number) {
  const { records, rules } = acc;
  if (depth > 8) return;
  const ops = opsOf(bytes);
  const fonts = subDict(ctx, res, "Font");
  const fontCache = new Map<string, PdfFont>();
  const getFont = (name: string) => {
    let f = fontCache.get(name);
    if (!f) {
      f = loadFont(ctx, name, fonts?.get(PDFName.of(name)));
      fontCache.set(name, f);
    }
    return f;
  };

  let gs: GState = { ctm: baseCtm, fill: { ops: "0 g", hex: "#000000" }, font: null, size: 0, tc: 0, tw: 0, tz: 100, tl: 0, rise: 0, render: 0 };
  const stack: GState[] = [];
  let fillCs = "DeviceGray";
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let cur: [number, number] = [0, 0];
  let pathSegs: Segment[] = [];
  let pathRects: [number, number, number, number][] = [];
  // Objeto de trayecto en construcción (para "Borrar zona")
  type Sub = { start: number; end: number; pts: [number, number][] };
  let pathObj: { start: number; subs: Sub[]; clip: boolean } | null = null;
  let clipDepth = 0;
  const clipStack: number[] = [];
  let lineWidth = 1;
  const bboxOf = (pts: [number, number][], pad = 0): [number, number, number, number] => {
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  };
  const addPts = (index: number, pts: [number, number][], newSub: boolean) => {
    if (!pathObj) pathObj = { start: index, subs: [], clip: false };
    if (newSub || pathObj.subs.length === 0) pathObj.subs.push({ start: index, end: index, pts: [] });
    const sub = pathObj.subs[pathObj.subs.length - 1];
    sub.pts.push(...pts);
    sub.end = index;
  };
  const finishPath = (index: number, paint: PathRecord["paint"]) => {
    if (pathObj && pathObj.subs.some((x) => x.pts.length)) {
      const pad = paint === "stroke" || paint === "both" ? (lineWidth * Math.hypot(gs.ctm[0], gs.ctm[1])) / 2 : 0;
      const subs = pathObj.subs.filter((x) => x.pts.length).map((x) => ({ start: x.start, end: x.end, bbox: bboxOf(x.pts, pad) }));
      acc.paths.push({
        id: `${path.join("/")}#${index}`,
        path,
        start: pathObj.start,
        end: index,
        subpaths: subs,
        bbox: [Math.min(...subs.map((x) => x.bbox[0])), Math.min(...subs.map((x) => x.bbox[1])), Math.max(...subs.map((x) => x.bbox[2])), Math.max(...subs.map((x) => x.bbox[3]))],
        paint,
        clip: pathObj.clip,
      });
      if (pathObj.clip) clipDepth++;
    }
    pathObj = null;
  };
  const unitBox = (m: Matrix): [number, number, number, number] => bboxOf([apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)]);

  const toUser = (x: number, y: number) => apply(gs.ctm, x, y);
  const td = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  const show = (op: Op, index: number, operator: ShowRecord["operator"], parts: Operand[]) => {
    const font = gs.font;
    if (!font) return;
    const th = gs.tz / 100;
    const glyphs: Glyph[] = [];
    let tx = 0;
    let pendingKern = 0;
    parts.forEach((p, element) => {
      if (p.t === "num") {
        tx -= (p.v / 1000) * gs.size * th;
        pendingKern += p.v;
        return;
      }
      if (p.t !== "str") return;
      for (const code of decodeCodes(p.bytes, font.codeBytes)) {
        const w = font.width(code);
        const isSpace = font.codeBytes === 1 && code === 32;
        const adv = ((w / 1000) * gs.size + gs.tc + (isSpace ? gs.tw : 0)) * th;
        glyphs.push({ code, unicode: font.toUnicode.get(code) ?? "", w, tx, adv, kernBefore: pendingKern, element });
        pendingKern = 0;
        tx += adv;
      }
    });
    records.push({
      id: `${path.join("/")}#${index}`,
      path,
      opIndex: index,
      operator,
      font,
      size: gs.size,
      tc: gs.tc,
      tw: gs.tw,
      tz: gs.tz,
      rise: gs.rise,
      render: gs.render,
      fill: gs.fill,
      trm: mul(tm, gs.ctm),
      ctm: gs.ctm,
      tmAfter: mul([1, 0, 0, 1, tx, 0], tm),
      tlmAfter: tlm,
      glyphs,
      advance: tx,
    });
    tm = mul([1, 0, 0, 1, tx, 0], tm);
  };

  ops.forEach((op, index) => {
    const o = op.operands;
    switch (op.operator) {
      case "q":
        stack.push({ ...gs });
        clipStack.push(clipDepth);
        break;
      case "Q":
        gs = stack.pop() ?? gs;
        clipDepth = clipStack.pop() ?? clipDepth;
        break;
      case "w":
        lineWidth = n(o[0]);
        break;
      case "W":
      case "W*":
        if (pathObj) pathObj.clip = true;
        break;
      case "c":
        addPts(index, [toUser(n(o[0]), n(o[1])), toUser(n(o[2]), n(o[3])), (cur = toUser(n(o[4]), n(o[5])))], false);
        break;
      case "v":
      case "y":
        addPts(index, [toUser(n(o[0]), n(o[1])), (cur = toUser(n(o[2]), n(o[3])))], false);
        break;
      case "h":
        if (pathObj) addPts(index, [], false);
        break;
      case "BI":
        acc.images.push({
          id: `${path.join("/")}#${index}`,
          path,
          opIndex: index,
          kind: "inline",
          name: null,
          ref: null,
          ctm: gs.ctm,
          bbox: unitBox(gs.ctm),
          pixelWidth: 0,
          pixelHeight: 0,
          hasSoftMask: false,
          clipped: clipDepth > 0,
        });
        break;
      case "cm":
        gs.ctm = mul([n(o[0]), n(o[1]), n(o[2]), n(o[3]), n(o[4]), n(o[5])], gs.ctm);
        break;
      // Color de relleno (el texto usa el relleno salvo modos de render especiales)
      case "g":
      case "rg":
      case "k":
        gs.fill = { ops: serializeOp(op.operator, o), hex: colorFromOps(op.operator, o, "") };
        fillCs = op.operator === "g" ? "DeviceGray" : op.operator === "rg" ? "DeviceRGB" : "DeviceCMYK";
        break;
      case "cs":
        fillCs = o[0]?.t === "name" ? o[0].v : fillCs;
        gs.fill = { ops: serializeOp("cs", o), hex: "#000000" };
        break;
      case "sc":
      case "scn":
        gs.fill = { ops: `${serializeOp("cs", [{ t: "name", v: fillCs }])} ${serializeOp(op.operator, o)}`, hex: colorFromOps(op.operator, o, fillCs) };
        break;
      // Estado de texto
      case "BT":
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case "Tf":
        gs.font = o[0]?.t === "name" ? getFont(o[0].v) : gs.font;
        gs.size = n(o[1]);
        break;
      case "Tc":
        gs.tc = n(o[0]);
        break;
      case "Tw":
        gs.tw = n(o[0]);
        break;
      case "Tz":
        gs.tz = n(o[0]);
        break;
      case "TL":
        gs.tl = n(o[0]);
        break;
      case "Ts":
        gs.rise = n(o[0]);
        break;
      case "Tr":
        gs.render = n(o[0]);
        break;
      case "Td":
        td(n(o[0]), n(o[1]));
        break;
      case "TD":
        gs.tl = -n(o[1]);
        td(n(o[0]), n(o[1]));
        break;
      case "Tm":
        tlm = [n(o[0]), n(o[1]), n(o[2]), n(o[3]), n(o[4]), n(o[5])];
        tm = tlm;
        break;
      case "T*":
        td(0, -gs.tl);
        break;
      case "Tj":
        show(op, index, "Tj", [o[0]]);
        break;
      case "TJ":
        show(op, index, "TJ", o[0]?.t === "arr" ? o[0].items : []);
        break;
      case "'":
        td(0, -gs.tl);
        show(op, index, "'", [o[0]]);
        break;
      case '"':
        gs.tw = n(o[0]);
        gs.tc = n(o[1]);
        td(0, -gs.tl);
        show(op, index, '"', [o[2]]);
        break;
      // Trayectos (para detectar bordes de tablas)
      case "m":
        cur = toUser(n(o[0]), n(o[1]));
        addPts(index, [cur], true);
        break;
      case "l": {
        const p = toUser(n(o[0]), n(o[1]));
        pathSegs.push({ x0: cur[0], y0: cur[1], x1: p[0], y1: p[1] });
        addPts(index, [p], false);
        cur = p;
        break;
      }
      case "re": {
        const [x, y, w, h] = [n(o[0]), n(o[1]), n(o[2]), n(o[3])];
        const a = toUser(x, y);
        const b = toUser(x + w, y + h);
        pathRects.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
        addPts(index, [a, b, toUser(x + w, y), toUser(x, y + h)], true);
        break;
      }
      case "S":
      case "s":
      case "B":
      case "B*":
      case "b":
      case "b*":
        rules.push(...pathSegs);
        for (const [x0, y0, x1, y1] of pathRects) {
          rules.push({ x0, y0, x1: x0, y1 }, { x0: x1, y0, x1, y1 }, { x0, y0, x1, y1: y0 }, { x0, y0: y1, x1, y1 });
        }
        pathSegs = [];
        pathRects = [];
        finishPath(index, op.operator === "S" || op.operator === "s" ? "stroke" : "both");
        break;
      case "f":
      case "F":
      case "f*":
        // Rectángulos delgados rellenos = líneas
        for (const [x0, y0, x1, y1] of pathRects) {
          if (x1 - x0 < 2.5) rules.push({ x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1 });
          else if (y1 - y0 < 2.5) rules.push({ x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2 });
        }
        pathSegs = [];
        pathRects = [];
        finishPath(index, "fill");
        break;
      case "n":
        pathSegs = [];
        pathRects = [];
        finishPath(index, "none");
        break;
      case "Do": {
        const name = o[0]?.t === "name" ? o[0].v : "";
        const form = formXObject(ctx, res, name);
        if (form) {
          interpretStream(ctx, form.bytes, form.resources, mul(form.matrix, gs.ctm), [...path, `${name}@${index}`], acc, depth + 1);
          break;
        }
        const img = imageXObject(ctx, res, name);
        if (img)
          acc.images.push({
            id: `${path.join("/")}#${index}`,
            path,
            opIndex: index,
            kind: "xobject",
            name,
            ref: img.ref,
            ctm: gs.ctm,
            bbox: unitBox(gs.ctm),
            pixelWidth: img.width,
            pixelHeight: img.height,
            hasSoftMask: img.smask,
            clipped: clipDepth > 0,
          });
        break;
      }
    }
  });
}
