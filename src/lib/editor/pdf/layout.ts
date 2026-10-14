// Composición y escritura del texto nuevo con las MISMAS fuentes y métricas del PDF.
//
// Se alinea el texto nuevo con el original carácter a carácter (LCS): los caracteres que no cambian
// conservan exactamente su posición relativa (kerning, huecos entre fragmentos) y su estilo (fuente,
// negrita parcial, color…); los nuevos heredan el estilo del vecino. Si la fuente incrustada (subconjunto)
// no tiene un carácter, se escribe con una fuente sustituta y se informa cuál.

import type { PdfFont } from "./fonts";
import { apply, mul, type Matrix, type ShowRecord } from "./interpret";
import { fmtNum } from "./tokenizer";

export type BlockPart = { rec: string; from: number; to: number };

/** Glifo del bloque original en coordenadas de línea (x en espacio de texto a lo largo de la línea base). */
export type LineChar = {
  ch: string;
  /** null = espacio virtual (hueco entre fragmentos, sin glifo). */
  rec: ShowRecord | null;
  gi: number;
  x: number;
  adv: number;
};

export type Line = {
  chars: LineChar[];
  text: string;
  /** Matriz de línea: (x, 0) → espacio de usuario. */
  matrix: Matrix;
  start: number;
  end: number;
  /** Registro con el estilo dominante (para valores por defecto del inspector). */
  main: ShowRecord;
};

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** Construye la línea a partir de los registros/glifos que la forman. */
export function buildLine(records: ShowRecord[], parts: BlockPart[]): Line | null {
  const byId = new Map(records.map((r) => [r.id, r]));
  const items: { rec: ShowRecord; gi: number; x: number; adv: number }[] = [];
  let matrix: Matrix | null = null;
  let inv: Matrix | null = null;
  for (const p of parts) {
    const rec = byId.get(p.rec);
    if (!rec) return null;
    if (!matrix) {
      matrix = rec.trm;
      inv = invert(matrix);
    }
    const toLine = mul(rec.trm, inv!);
    const scale = Math.hypot(toLine[0], toLine[1]) || 1;
    for (let gi = p.from; gi < p.to && gi < rec.glyphs.length; gi++) {
      const g = rec.glyphs[gi];
      const [x] = apply(toLine, g.tx, 0);
      items.push({ rec, gi, x, adv: g.adv * scale });
    }
  }
  if (!matrix || items.length === 0) return null;
  items.sort((a, b) => a.x - b.x);
  const chars: LineChar[] = [];
  items.forEach((it, k) => {
    const prev = items[k - 1];
    const g = it.rec.glyphs[it.gi];
    if (prev) {
      const gap = it.x - (prev.x + prev.adv);
      const prevCh = prev.rec.glyphs[prev.gi].unicode;
      // Hueco visible entre fragmentos sin carácter de espacio: espacio virtual que conserva el hueco.
      if (gap > it.rec.size * 0.15 && prevCh !== " " && g.unicode !== " ") chars.push({ ch: " ", rec: null, gi: -1, x: prev.x + prev.adv, adv: gap });
    }
    chars.push({ ch: g.unicode || "�", rec: it.rec, gi: it.gi, x: it.x, adv: it.adv });
  });
  const counts = new Map<ShowRecord, number>();
  for (const c of chars) if (c.rec) counts.set(c.rec, (counts.get(c.rec) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const last = chars[chars.length - 1];
  return { chars, text: chars.map((c) => c.ch).join(""), matrix, start: chars[0].x, end: last.x + last.adv, main };
}

/** LCS clásico sobre caracteres: devuelve, para cada índice nuevo, el índice antiguo emparejado (o -1). */
export function lcsMap(oldS: string[], newS: string[]): number[] {
  const n = oldS.length;
  const m = newS.length;
  // Prefijo y sufijo comunes: casos típicos (cambiar un dígito, añadir al final) sin coste cuadrático.
  let pre = 0;
  while (pre < n && pre < m && oldS[pre] === newS[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && oldS[n - 1 - suf] === newS[m - 1 - suf]) suf++;
  const map = new Array<number>(m).fill(-1);
  for (let k = 0; k < pre; k++) map[k] = k;
  for (let k = 0; k < suf; k++) map[m - 1 - k] = n - 1 - k;
  const a = oldS.slice(pre, n - suf);
  const b = newS.slice(pre, m - suf);
  if (a.length && b.length && a.length * b.length <= 4_000_000) {
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        map[pre + j] = pre + i;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  }
  return map;
}

/** Métricas de una fuente sustituta (anchos en 1/1000 em). */
export type SubFont = { key: string; family: string; bold: boolean; italic: boolean; width: (ch: string) => number; has: (ch: string) => boolean };
export type SubFontResolver = (family: string, bold: boolean, italic: boolean) => SubFont | null;

export type EditOptions = {
  /** Multiplicador de la escala horizontal original (1 = igual). */
  scaleX: number;
  /** Multiplicador del tamaño original. */
  sizeScale: number;
  color?: string;
  /** Familia sustituta elegida a mano (fuerza todo el texto con esa fuente). */
  fontOverride?: string;
  align: "left" | "center" | "right";
};

export type OutGlyph = {
  ch: string;
  x: number;
  adv: number;
  style: ShowRecord;
  /** Código en la fuente original, o null si se escribe con sustituta o es solo un desplazamiento. */
  code: number | null;
  sub: SubFont | null;
  /** Solo desplazamiento (espacio virtual o espacio inexistente en la fuente). */
  gapOnly: boolean;
};

export type EditLayout = {
  glyphs: OutGlyph[];
  start: number;
  width: number;
  originalWidth: number;
  /** Caracteres escritos con fuente sustituta (únicos, en orden). */
  substituted: string[];
  /** Caracteres que ninguna fuente disponible puede dibujar. */
  missing: string[];
  usedFonts: string[];
};

/** Familia sustituta incluida para una fuente del PDF (métricamente compatible cuando existe). */
export function substituteFamily(font: PdfFont): string {
  const n = font.baseFont.toLowerCase().replace(/[\s_-]/g, "");
  if (/^(arial|helvetica|arimo|liberationsans|nimbussans|freesans)/.test(n)) return "liberation-sans";
  if (/^(times|tinos|liberationserif|nimbusroman)/.test(n)) return "liberation-serif";
  if (/^(courier|cousine|liberationmono|nimbusmono)/.test(n)) return "liberation-mono";
  if (/^calibri|^carlito/.test(n)) return "carlito";
  if (/^cambria|^caladea/.test(n)) return "caladea";
  if (/^inter/.test(n)) return "inter";
  if (/^roboto/.test(n)) return "roboto";
  if (/^opensans/.test(n)) return "open-sans";
  if (/^montserrat/.test(n)) return "montserrat";
  if (/^lora/.test(n)) return "lora";
  if (/mono|consol|code/.test(n)) return "liberation-mono";
  if (/serif|roman|georgia|garamond|book|minion|palatino|baskerville|bodoni|didot/.test(n) && !/sans/.test(n)) return "liberation-serif";
  return "liberation-sans";
}

export function layoutEdit(line: Line, newText: string, opts: EditOptions, subs: SubFontResolver, cover = false): EditLayout {
  const oldChars = line.chars;
  const newChars = [...newText.replace(/\r?\n/g, " ")];
  const map = lcsMap(
    oldChars.map((c) => c.ch),
    newChars,
  );
  const k = opts.scaleX * opts.sizeScale;
  const substituted: string[] = [];
  const missing: string[] = [];
  const used = new Set<string>();

  // Estilo de cada carácter nuevo: el del glifo emparejado o el del vecino anterior/siguiente.
  const styleOf: (ShowRecord | null)[] = newChars.map((_, i) => (map[i] >= 0 ? oldChars[map[i]].rec : null));
  let last: ShowRecord | null = null;
  for (let i = 0; i < styleOf.length; i++) {
    if (!styleOf[i]) styleOf[i] = last;
    last = styleOf[i];
  }
  let next: ShowRecord | null = null;
  for (let i = styleOf.length - 1; i >= 0; i--) {
    if (!styleOf[i]) styleOf[i] = next ?? line.main;
    next = styleOf[i];
  }

  const glyphs: OutGlyph[] = newChars.map((ch, i) => {
    const st = styleOf[i] ?? line.main;
    const size = st.size * opts.sizeScale;
    const th = (st.tz / 100) * opts.scaleX;
    const mappedOld = map[i] >= 0 ? oldChars[map[i]] : null;
    const isVirtualGap = mappedOld !== null && mappedOld.rec === null;
    const font = st.font;
    let code: number | null = null;
    let sub: SubFont | null = null;
    let gapOnly = false;
    let w = 0;
    const canOrig = !cover && !opts.fontOverride && font.supported;
    const origCode = canOrig ? (mappedOld && mappedOld.rec === st ? st.glyphs[mappedOld.gi].code : font.fromUnicode.get(ch)) : undefined;
    if (isVirtualGap) {
      gapOnly = true;
    } else if (origCode !== undefined && font.hasGlyph(origCode)) {
      code = origCode;
      w = font.width(origCode);
      used.add(font.baseFont);
    } else {
      const fam = opts.fontOverride ?? substituteFamily(font);
      sub = subs(fam, font.bold, font.italic);
      if (sub && sub.has(ch)) {
        w = sub.width(ch);
        used.add(sub.family);
        if (!opts.fontOverride && !cover && ch.trim() && !substituted.includes(ch)) substituted.push(ch);
      } else if (ch === " ") {
        gapOnly = true;
        w = sub?.width(" ") ?? 250;
      } else {
        if (!missing.includes(ch)) missing.push(ch);
        gapOnly = true;
      }
    }
    // Tw solo se aplica al código 32 de fuentes de un byte (y no a la sustituta, escrita con Tw 0).
    const tw = code !== null && font.codeBytes === 1 && code === 32 ? st.tw : 0;
    const adv = isVirtualGap ? mappedOld!.adv * k : ((w / 1000) * size + st.tc + tw) * th;
    return { ch, x: 0, adv, style: st, code, sub, gapOnly };
  });

  // Posiciones: los tramos contiguos sin cambios conservan su separación original exacta.
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    if (i > 0) {
      const a = map[i - 1];
      const b = map[i];
      const contiguous = !opts.fontOverride && a >= 0 && b === a + 1;
      x = contiguous ? glyphs[i - 1].x + (oldChars[b].x - oldChars[a].x) * k : glyphs[i - 1].x + glyphs[i - 1].adv;
    }
    glyphs[i].x = x;
  }
  const width = glyphs.length ? glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].adv : 0;
  const originalWidth = line.end - line.start;
  const start = opts.align === "right" ? line.end - width : opts.align === "center" ? line.start + (originalWidth - width) / 2 : line.start;
  for (const g of glyphs) g.x += start;
  return { glyphs, start, width, originalWidth, substituted, missing, usedFonts: [...used] };
}

/** Escala horizontal que hace que el texto nuevo ocupe el mismo ancho que el original. */
export function fitScale(line: Line, newText: string, opts: EditOptions, subs: SubFontResolver) {
  const base = layoutEdit(line, newText, { ...opts, scaleX: 1 }, subs);
  if (!base.width) return 1;
  return Math.max(0.3, Math.min(3, base.originalWidth / base.width));
}

export type WriteResolver = {
  /** Nombre del recurso de fuente (en la página) para una fuente original del PDF. */
  origKey: (font: PdfFont) => string;
  /** Nombre del recurso y codificación de un carácter en la fuente sustituta. */
  subKey: (sub: SubFont) => string;
  subEncode: (sub: SubFont, ch: string) => Uint8Array;
};

const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");

/** Genera los operadores PDF (en espacio de usuario) que dibujan el texto compuesto. */
export function writeLayout(
  line: Line,
  layout: EditLayout,
  opts: EditOptions,
  r: WriteResolver,
  colorOps?: (st: ShowRecord) => string,
  /** Matriz de línea en el sistema de coordenadas donde se escribe (por defecto, espacio de usuario). */
  matrix: Matrix = line.matrix,
): string {
  const out: string[] = [];
  type Seg = { glyphs: OutGlyph[]; key: string; st: ShowRecord; sub: SubFont | null };
  const segs: Seg[] = [];
  for (const g of layout.glyphs) {
    if (g.gapOnly) continue;
    const key = g.sub ? `s:${g.sub.key}` : `o:${g.style.font.resName}:${g.style.id}`;
    const styleKey = `${key}|${g.style.size}|${g.style.tz}|${g.style.tc}|${g.style.tw}|${g.style.rise}|${g.style.fill.ops}`;
    const seg = segs[segs.length - 1];
    if (seg && seg.key === styleKey) seg.glyphs.push(g);
    else segs.push({ glyphs: [g], key: styleKey, st: g.style, sub: g.sub });
  }
  for (const seg of segs) {
    const st = seg.st;
    const size = st.size * opts.sizeScale;
    const tz = st.tz * opts.scaleX;
    const th = tz / 100;
    const fontKey = seg.sub ? r.subKey(seg.sub) : r.origKey(st.font);
    const codeBytes = seg.sub ? 2 : st.font.codeBytes;
    const items: string[] = [];
    seg.glyphs.forEach((g, j) => {
      if (j > 0) {
        const prev = seg.glyphs[j - 1];
        const d = g.x - (prev.x + prev.adv);
        if (Math.abs(d) > 1e-6) items.push(fmtNum((-d / (size * th)) * 1000));
      }
      const bytes = g.sub ? r.subEncode(g.sub, g.ch) : codeBytes === 2 ? Uint8Array.of((g.code! >> 8) & 0xff, g.code! & 0xff) : Uint8Array.of(g.code!);
      items.push(`<${hex(bytes)}>`);
    });
    const [e, f] = apply(matrix, seg.glyphs[0].x, 0);
    const m = matrix;
    const color = opts.color ? hexToRg(opts.color) : colorOps ? colorOps(st) : st.fill.ops;
    out.push(
      [
        "BT",
        `/${fontKey} ${fmtNum(size)} Tf`,
        `${fmtNum(tz)} Tz ${fmtNum(st.tc)} Tc ${fmtNum(seg.sub ? 0 : st.tw)} Tw ${fmtNum(st.rise)} Ts ${st.render === 7 ? 0 : st.render} Tr`,
        color,
        `${fmtNum(m[0])} ${fmtNum(m[1])} ${fmtNum(m[2])} ${fmtNum(m[3])} ${fmtNum(e)} ${fmtNum(f)} Tm`,
        `[${items.join(" ")}] TJ`,
        "ET",
      ].join("\n"),
    );
  }
  return out.join("\n");
}

export function hexToRg(hexColor: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexColor);
  if (!m) return "0 g";
  return `${fmtNum(parseInt(m[1], 16) / 255)} ${fmtNum(parseInt(m[2], 16) / 255)} ${fmtNum(parseInt(m[3], 16) / 255)} rg`;
}
