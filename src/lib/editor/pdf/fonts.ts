// Modelo de las fuentes de un PDF: anchos por código, decodificación a Unicode y codificación inversa
// (para volver a escribir con la MISMA fuente incrustada del documento).

import fontkit from "@pdf-lib/fontkit";
import { Encodings, Font as StdFont, FontNames } from "@pdf-lib/standard-fonts";
import { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, type PDFContext, type PDFObject } from "pdf-lib";

export type PdfFont = {
  resName: string;
  ref: PDFRef | null;
  dict: PDFDict | null;
  baseFont: string;
  subtype: string;
  codeBytes: 1 | 2;
  /** false: no se puede reescribir/eliminar con precisión (Type3, CMap no Identity, escritura vertical…). */
  supported: boolean;
  embedded: boolean;
  /** Anchos en unidades de glifo (1/1000 de em). */
  width: (code: number) => number;
  toUnicode: Map<number, string>;
  fromUnicode: Map<string, number>;
  /** ¿El programa de fuente incrustado contiene el glifo de este código? */
  hasGlyph: (code: number) => boolean;
  ascent: number;
  descent: number;
  bold: boolean;
  italic: boolean;
};

// ── Tablas de codificación ────────────────────────────────

type WinMap = Record<number, [number, string]>;
const winMappings = (Encodings.WinAnsi as unknown as { unicodeMappings: WinMap }).unicodeMappings;

/** WinAnsi: código → [unicode, nombre de glifo]. */
const WIN_ANSI = new Map<number, [string, string]>();
const NAME_TO_UNICODE = new Map<string, string>();
for (const [cp, [code, name]] of Object.entries(winMappings)) {
  const ch = String.fromCodePoint(Number(cp));
  if (!WIN_ANSI.has(code)) WIN_ANSI.set(code, [ch, name]);
  if (!NAME_TO_UNICODE.has(name)) NAME_TO_UNICODE.set(name, ch);
}

// Mitad alta de MacRoman (0x80–0xFF).
const MAC_ROMAN_HIGH =
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";

function glyphNameToUnicode(name: string): string | undefined {
  const hit = NAME_TO_UNICODE.get(name);
  if (hit) return hit;
  let m = /^uni([0-9A-F]{4,})$/i.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1].slice(0, 4), 16));
  m = /^u([0-9A-F]{4,6})$/i.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  if (/^[A-Za-z]$/.test(name)) return name;
  return undefined;
}

function baseEncodingUnicode(enc: string | undefined, code: number): string | undefined {
  if (enc === "MacRomanEncoding") {
    if (code >= 0x20 && code < 0x7f) return String.fromCharCode(code);
    if (code >= 0x80) return MAC_ROMAN_HIGH[code - 0x80];
    return undefined;
  }
  if (enc === "StandardEncoding") {
    if (code === 0x27) return "’";
    if (code === 0x60) return "‘";
    if (code >= 0x20 && code < 0x7f) return String.fromCharCode(code);
    return undefined;
  }
  // WinAnsi (también la base por defecto de las fuentes TrueType no simbólicas)
  return WIN_ANSI.get(code)?.[0] ?? (code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : undefined);
}

// ── Utilidades pdf-lib ────────────────────────────────────

export function resolve(ctx: PDFContext, o: PDFObject | undefined): PDFObject | undefined {
  return o instanceof PDFRef ? ctx.lookup(o) : o;
}
const num = (ctx: PDFContext, o: PDFObject | undefined) => {
  const v = resolve(ctx, o);
  return v instanceof PDFNumber ? v.asNumber() : undefined;
};
const nameOf = (ctx: PDFContext, o: PDFObject | undefined) => {
  const v = resolve(ctx, o);
  return v instanceof PDFName ? v.decodeText() : undefined;
};

export function streamBytes(ctx: PDFContext, o: PDFObject | undefined): Uint8Array | null {
  const s = resolve(ctx, o);
  if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
  if (s instanceof PDFStream) return (s as unknown as { getContents(): Uint8Array }).getContents();
  return null;
}

/** Parser de CMap ToUnicode (bfchar / bfrange). */
export function parseToUnicode(bytes: Uint8Array): { map: Map<number, string>; codeBytes: number } {
  const text = new TextDecoder("latin1").decode(bytes);
  const map = new Map<number, string>();
  let codeBytes = 1;
  const hexToStr = (h: string) => {
    let s = "";
    for (let k = 0; k + 4 <= h.length; k += 4) s += String.fromCharCode(parseInt(h.slice(k, k + 4), 16));
    if (h.length === 2) s = String.fromCharCode(parseInt(h, 16));
    return s;
  };
  const range = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
  if (range) {
    const m = /<([0-9a-fA-F]+)>/.exec(range[1]);
    if (m) codeBytes = m[1].length / 2;
  }
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]));
      codeBytes = Math.max(codeBytes, m[1].length / 2);
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      codeBytes = Math.max(codeBytes, m[1].length / 2);
      if (m[3].startsWith("[")) {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexToStr(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      } else {
        const start = m[3].slice(1, -1);
        const base = hexToStr(start);
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          const last = base.charCodeAt(base.length - 1) + (c - lo);
          map.set(c, base.slice(0, -1) + String.fromCharCode(last));
        }
      }
    }
  }
  return { map, codeBytes };
}

const STANDARD_14: Record<string, FontNames> = {
  Helvetica: FontNames.Helvetica,
  "Helvetica-Bold": FontNames.HelveticaBold,
  "Helvetica-Oblique": FontNames.HelveticaOblique,
  "Helvetica-BoldOblique": FontNames.HelveticaBoldOblique,
  "Times-Roman": FontNames.TimesRoman,
  "Times-Bold": FontNames.TimesRomanBold,
  "Times-Italic": FontNames.TimesRomanItalic,
  "Times-BoldItalic": FontNames.TimesRomanBoldItalic,
  Courier: FontNames.Courier,
  "Courier-Bold": FontNames.CourierBold,
  "Courier-Oblique": FontNames.CourierOblique,
  "Courier-BoldOblique": FontNames.CourierBoldOblique,
  Symbol: FontNames.Symbol,
  ZapfDingbats: FontNames.ZapfDingbats,
  // Alias habituales sin incrustar
  Arial: FontNames.Helvetica,
  ArialMT: FontNames.Helvetica,
  "Arial,Bold": FontNames.HelveticaBold,
  "Arial-BoldMT": FontNames.HelveticaBold,
  TimesNewRoman: FontNames.TimesRoman,
  TimesNewRomanPSMT: FontNames.TimesRoman,
  CourierNew: FontNames.Courier,
  CourierNewPSMT: FontNames.Courier,
};

const fontCache = new WeakMap<PDFDict, PdfFont>();

export function loadFont(ctx: PDFContext, resName: string, fontObj: PDFObject | undefined): PdfFont {
  const ref = fontObj instanceof PDFRef ? fontObj : null;
  const dict = resolve(ctx, fontObj);
  if (!(dict instanceof PDFDict)) return unsupportedFont(resName);
  const cached = fontCache.get(dict);
  if (cached) return { ...cached, resName };

  const subtype = nameOf(ctx, dict.get(PDFName.of("Subtype"))) ?? "Type1";
  const baseFontRaw = nameOf(ctx, dict.get(PDFName.of("BaseFont"))) ?? "";
  const baseFont = baseFontRaw.replace(/^[A-Z]{6}\+/, "");
  const isType0 = subtype === "Type0";

  let descDict = dict;
  if (isType0) {
    const arr = resolve(ctx, dict.get(PDFName.of("DescendantFonts")));
    const d0 = arr instanceof PDFArray ? resolve(ctx, arr.get(0)) : undefined;
    if (d0 instanceof PDFDict) descDict = d0;
  }
  const fd = resolve(ctx, descDict.get(PDFName.of("FontDescriptor")));
  const fdDict = fd instanceof PDFDict ? fd : undefined;
  const fontFileObj = fdDict && (fdDict.get(PDFName.of("FontFile2")) ?? fdDict.get(PDFName.of("FontFile3")) ?? fdDict.get(PDFName.of("FontFile")));
  const embedded = Boolean(fontFileObj);
  const flags = (fdDict && num(ctx, fdDict.get(PDFName.of("Flags")))) ?? 0;
  const ascent = (fdDict && num(ctx, fdDict.get(PDFName.of("Ascent")))) || 800;
  const descent = Math.abs((fdDict && num(ctx, fdDict.get(PDFName.of("Descent")))) || -200);
  const lname = baseFont.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(lname) || ((flags >> 18) & 1) === 1;
  const italic = /italic|oblique/.test(lname) || ((flags >> 6) & 1) === 1;

  // ToUnicode
  let toUnicode = new Map<number, string>();
  const tu = streamBytes(ctx, dict.get(PDFName.of("ToUnicode")));
  if (tu) toUnicode = parseToUnicode(tu).map;

  // Codificación
  let supported = subtype !== "Type3";
  let codeBytes: 1 | 2 = 1;
  let width: (code: number) => number;

  if (isType0) {
    const encName = nameOf(ctx, dict.get(PDFName.of("Encoding")));
    if (encName !== "Identity-H") supported = false; // Identity-V (vertical) u otras CMaps: no soportado
    codeBytes = 2;
    const dw = num(ctx, descDict.get(PDFName.of("DW"))) ?? 1000;
    const widths = new Map<number, number>();
    const W = resolve(ctx, descDict.get(PDFName.of("W")));
    if (W instanceof PDFArray) {
      const items = W.asArray().map((o) => resolve(ctx, o));
      for (let k = 0; k < items.length; ) {
        const first = (items[k] as PDFNumber).asNumber();
        const next = items[k + 1];
        if (next instanceof PDFArray) {
          next.asArray().forEach((w, j) => widths.set(first + j, (resolve(ctx, w) as PDFNumber).asNumber()));
          k += 2;
        } else {
          const last = (next as PDFNumber).asNumber();
          const w = (items[k + 2] as PDFNumber).asNumber();
          for (let c = first; c <= last; c++) widths.set(c, w);
          k += 3;
        }
      }
    }
    width = (c) => widths.get(c) ?? dw;
  } else {
    const encObj = resolve(ctx, dict.get(PDFName.of("Encoding")));
    let baseEnc: string | undefined;
    const differences = new Map<number, string>();
    if (encObj instanceof PDFName) baseEnc = encObj.decodeText();
    else if (encObj instanceof PDFDict) {
      baseEnc = nameOf(ctx, encObj.get(PDFName.of("BaseEncoding")));
      const diffs = resolve(ctx, encObj.get(PDFName.of("Differences")));
      if (diffs instanceof PDFArray) {
        let code = 0;
        for (const o of diffs.asArray()) {
          const v = resolve(ctx, o);
          if (v instanceof PDFNumber) code = v.asNumber();
          else if (v instanceof PDFName) differences.set(code++, v.decodeText());
        }
      }
    }
    const symbolic = ((flags >> 2) & 1) === 1 && !baseEnc && differences.size === 0;
    const glyphName = (code: number) => differences.get(code) ?? (baseEnc === "MacRomanEncoding" ? undefined : WIN_ANSI.get(code)?.[1]);

    // Unicode por codificación cuando no hay ToUnicode
    if (toUnicode.size === 0 && !symbolic) {
      for (let code = 0; code < 256; code++) {
        const dn = differences.get(code);
        const u = dn ? glyphNameToUnicode(dn) : baseEncodingUnicode(baseEnc, code);
        if (u) toUnicode.set(code, u);
      }
    }

    const firstChar = num(ctx, dict.get(PDFName.of("FirstChar"))) ?? 0;
    const widthsArr = resolve(ctx, dict.get(PDFName.of("Widths")));
    const missing = (fdDict && num(ctx, fdDict.get(PDFName.of("MissingWidth")))) ?? 0;
    if (widthsArr instanceof PDFArray) {
      const ws = widthsArr.asArray().map((o) => num(ctx, o) ?? 0);
      width = (c) => (c >= firstChar && c < firstChar + ws.length ? ws[c - firstChar] : missing);
    } else {
      const std = STANDARD_14[baseFont] ?? STANDARD_14[baseFont.replace(/,.*$/, "")];
      if (std) {
        const metrics = StdFont.load(std);
        width = (c) => {
          const n = glyphName(c);
          return (n && metrics.getWidthOfGlyph(n)) || missing || 0;
        };
      } else {
        width = () => missing || 500;
        if (!embedded) supported = false; // sin anchos no se puede posicionar con precisión
      }
    }
  }

  // Codificación inversa (Unicode → código), prefiriendo el primer código que da ese carácter.
  const fromUnicode = new Map<string, number>();
  for (const [code, u] of toUnicode) if (u && !fromUnicode.has(u)) fromUnicode.set(u, code);

  const hasGlyph = embedded ? glyphChecker(ctx, fontFileObj, isType0, descDict) : () => true;

  const font: PdfFont = {
    resName,
    ref,
    dict,
    baseFont,
    subtype,
    codeBytes,
    supported,
    embedded,
    width,
    toUnicode,
    fromUnicode,
    hasGlyph,
    ascent,
    descent,
    bold,
    italic,
  };
  fontCache.set(dict, font);
  return font;
}

function unsupportedFont(resName: string): PdfFont {
  return {
    resName,
    ref: null,
    dict: null,
    baseFont: "desconocida",
    subtype: "?",
    codeBytes: 1,
    supported: false,
    embedded: false,
    width: () => 500,
    toUnicode: new Map(),
    fromUnicode: new Map(),
    hasGlyph: () => false,
    ascent: 800,
    descent: 200,
    bold: false,
    italic: false,
  };
}

/**
 * Comprueba en el programa de fuente incrustado (subconjunto) que el glifo exista y tenga contornos.
 * Si la fuente no se puede analizar, se confía en la tabla ToUnicode.
 */
function glyphChecker(ctx: PDFContext, fontFileObj: PDFObject | undefined, isType0: boolean, descDict: PDFDict) {
  let parsed: ReturnType<typeof fontkit.create> | null | undefined;
  const cache = new Map<number, boolean>();
  const isIdentityGid = (() => {
    const m = resolve(ctx, descDict.get(PDFName.of("CIDToGIDMap")));
    return !m || (m instanceof PDFName && m.decodeText() === "Identity");
  })();
  return (code: number) => {
    if (cache.has(code)) return cache.get(code)!;
    if (parsed === undefined) {
      try {
        const bytes = streamBytes(ctx, fontFileObj);
        parsed = bytes ? fontkit.create(bytes) : null;
      } catch {
        parsed = null;
      }
    }
    let ok = true;
    if (parsed) {
      try {
        const f = parsed as unknown as {
          numGlyphs: number;
          getGlyph(id: number): { path: { commands: unknown[] }; advanceWidth: number };
          characterToGlyph?: (cp: number) => { id: number };
          _cmapProcessor?: { lookup(cp: number): number };
        };
        let gid: number | undefined;
        if (isType0) gid = isIdentityGid ? code : undefined;
        else gid = f._cmapProcessor?.lookup(code) || f._cmapProcessor?.lookup(0xf000 + code) || undefined;
        if (gid !== undefined) ok = gid > 0 && gid < f.numGlyphs && (f.getGlyph(gid).path.commands.length > 0 || f.getGlyph(gid).advanceWidth > 0);
      } catch {
        ok = true;
      }
    }
    cache.set(code, ok);
    return ok;
  };
}

/** Separa los bytes de una cadena en códigos según los bytes por código de la fuente. */
export function decodeCodes(bytes: Uint8Array, codeBytes: 1 | 2) {
  const codes: number[] = [];
  if (codeBytes === 2) for (let k = 0; k + 1 < bytes.length; k += 2) codes.push((bytes[k] << 8) | bytes[k + 1]);
  else for (const b of bytes) codes.push(b);
  return codes;
}

export function encodeCodes(codes: number[], codeBytes: 1 | 2) {
  const out = new Uint8Array(codes.length * codeBytes);
  codes.forEach((c, k) => {
    if (codeBytes === 2) {
      out[2 * k] = (c >> 8) & 0xff;
      out[2 * k + 1] = c & 0xff;
    } else out[k] = c & 0xff;
  });
  return out;
}
