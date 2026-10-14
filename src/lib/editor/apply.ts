// Aplica la lista de ediciones (JSON) a un PDF con pdf-lib. Funciona en el navegador y en Node (pruebas).

import fontkit from "@pdf-lib/fontkit";
import {
  BlendMode,
  clip,
  closePath,
  concatTransformationMatrix,
  degrees,
  endPath,
  lineTo,
  moveTo,
  PDFBool,
  PDFName,
  LineCapStyle,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { findFont, fitsWinAnsi, type CatalogFont } from "./fonts";
import { firstBaselineOffset, frameToNative, placementTransform, viewSize } from "./geometry";
import { loadPdfForEditing } from "./pdf/decrypt";
import { applyTextEdits, type ContentReport } from "./pdf/text-edits";
import type { EditDoc, EditObject, FontRef, ImageEditObject, PageState, TextEditObject, TextObject, ZoneEraseObject } from "./types";

export type ApplyLoaders = {
  /** Bytes TTF/OTF de una fuente incluida o personalizada. */
  loadFontBytes: (font: FontRef, catalog: CatalogFont | undefined) => Promise<Uint8Array>;
  /** Bytes de una imagen añadida (PNG/JPG en R2). */
  loadAsset: (key: string) => Promise<Uint8Array>;
  /** PNG del QR (≥ 600 px por lado). */
  qrPng: (url: string) => Promise<Uint8Array>;
  customFonts?: CatalogFont[];
};

const STANDARD: Record<string, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  // [regular, bold, italic, bold-italic]
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Si una fuente estándar no puede codificar el texto (WinAnsi), se usa su equivalente incluida. */
const STANDARD_FALLBACK: Record<string, string> = { Helvetica: "liberation-sans", Times: "liberation-serif", Courier: "liberation-sans" };

export function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

/** Ediciones del contenido original (se aplican reescribiendo el content stream). */
export const CONTENT_TYPES = new Set<EditObject["type"]>(["textEdit", "zoneErase", "imageEdit"]);

export type ApplyOptions = {
  /** Solo estas páginas (vista previa de una página). */
  pageIds?: string[];
  /** Solo estos tipos de objeto (la vista previa del editor solo necesita las ediciones de texto). */
  types?: EditObject["type"][];
  /** Documento base ya cargado (evita volver a analizar el PDF en cada vista previa). */
  srcDoc?: PDFDocument;
  /** Recibe el informe de cada edición de texto (eliminación limpia o tapado, letras sustituidas…). */
  onTextReport?: (r: ContentReport) => void;
};

export async function applyEdits(base: Uint8Array | null, doc: EditDoc, loaders: ApplyLoaders, options: ApplyOptions = {}): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const src = options.srcDoc ?? (base ? await loadPdfForEditing(base) : null);
  const pagesToWrite = options.pageIds ? doc.pages.filter((p) => options.pageIds!.includes(p.id)) : doc.pages;

  // 1) Páginas en el orden final.
  const srcIndices = pagesToWrite.filter((p) => p.src !== null).map((p) => p.src!) as number[];
  const copied = src && srcIndices.length ? await out.copyPages(src, srcIndices) : [];
  let ci = 0;
  const outPages: { page: PDFPage; state: PageState }[] = [];
  for (const state of pagesToWrite) {
    let page: PDFPage;
    if (state.src !== null) {
      page = out.addPage(copied[ci++]);
    } else {
      const { w, h } = viewSize(state.view);
      page = out.addPage([w, h]);
    }
    page.setRotation(degrees((state.baseRotation + state.rotation) % 360));
    outPages.push({ page, state });
  }

  // 2) Recursos con caché.
  const fontCache = new Map<string, PDFFont>();
  const imageCache = new Map<string, PDFImage>();

  async function getFont(ref: FontRef, text: string): Promise<PDFFont> {
    let family = ref.family;
    if (STANDARD[family] && !fitsWinAnsi(text)) family = STANDARD_FALLBACK[family];
    const key = `${family}|${ref.bold}|${ref.italic}`;
    const hit = fontCache.get(key);
    if (hit) return hit;
    let font: PDFFont;
    if (STANDARD[family]) {
      const idx = (ref.bold ? 1 : 0) + (ref.italic ? 2 : 0);
      font = await out.embedFont(STANDARD[family][idx]);
    } else {
      const catalog = findFont(family, loaders.customFonts);
      const bytes = await loaders.loadFontBytes({ ...ref, family }, catalog);
      try {
        font = await out.embedFont(bytes, { subset: true });
      } catch {
        font = await out.embedFont(bytes, { subset: false });
      }
    }
    fontCache.set(key, font);
    return font;
  }

  async function getImage(cacheKey: string, mime: string, load: () => Promise<Uint8Array>) {
    const hit = imageCache.get(cacheKey);
    if (hit) return hit;
    const bytes = await load();
    const img = mime === "image/jpeg" ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    imageCache.set(cacheKey, img);
    return img;
  }

  // 3) Ediciones de texto original (eliminación limpia + reescritura) y luego el resto de objetos,
  //    en orden de creación (los posteriores quedan encima). Las páginas sin cambios no se tocan.
  const fontLoader = (family: string, bold: boolean, italic: boolean) => loaders.loadFontBytes({ family, bold, italic }, findFont(family, loaders.customFonts));
  for (const { page, state } of outPages) {
    const objects = doc.objects.filter((o) => o.pageId === state.id && (!options.types || options.types.includes(o.type)));
    const textEdits = objects.filter((o): o is TextEditObject => o.type === "textEdit");
    const erases = objects.filter((o): o is ZoneEraseObject => o.type === "zoneErase");
    const images = objects.filter((o): o is ImageEditObject => o.type === "imageEdit");
    if (textEdits.length || erases.length || images.length) {
      const reports = await applyTextEdits(out, page, state, textEdits, fontLoader, { erases, images });
      reports.forEach((r) => options.onTextReport?.(r));
    }
    for (const obj of objects) {
      if (CONTENT_TYPES.has(obj.type)) continue;
      // Rotación alrededor del centro de la caja (grados, horario en pantalla).
      const deg = obj.rotation ?? 0;
      if (deg) {
        const U = placementTransform(state.view, state.baseRotation, obj, obj, deg);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(U[0], U[1], U[2], U[3], U[4], U[5]));
      }
      await drawObject(page, state, obj);
      if (deg) page.pushOperators(popGraphicsState());
    }
  }

  async function drawObject(page: PDFPage, state: PageState, obj: EditObject) {
    const r = state.baseRotation;
    const at = (fx: number, fy: number) => frameToNative(fx, fy, state.view, r);
    const rotate = degrees(r);

    const rect = (x: number, y: number, w: number, h: number, color: string, opacity = 1, blendMode?: BlendMode) => {
      const [nx, ny] = at(x, y + h); // esquina inferior izquierda en el marco de pantalla
      page.drawRectangle({ x: nx, y: ny, width: w, height: h, color: hexToRgb(color), opacity, rotate, blendMode, borderWidth: 0 });
    };

    switch (obj.type) {
      case "cover":
        rect(obj.x, obj.y, obj.w, obj.h, obj.color);
        return;
      case "highlight":
        rect(obj.x, obj.y, obj.w, obj.h, obj.color, obj.opacity, BlendMode.Multiply);
        return;
      case "image":
      case "qr": {
        const img =
          obj.type === "qr"
            ? await getImage(`qr:${obj.url}`, "image/png", () => loaders.qrPng(obj.url))
            : await getImage(obj.assetKey, obj.mime, () => loaders.loadAsset(obj.assetKey));
        // QR e imágenes marcadas como nítidas: sin interpolación (siguen escaneables al ampliar).
        if (obj.type === "qr" || (obj.type === "image" && obj.pixelated)) {
          await img.embed(); // pdf-lib crea el stream de la imagen de forma diferida
          const dict = out.context.lookup(img.ref);
          if (dict && "dict" in (dict as object)) (dict as unknown as { dict: { set: (k: PDFName, v: PDFBool) => void } }).dict.set(PDFName.of("Interpolate"), PDFBool.False);
        }
        let box = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
        const fit = obj.type === "image" ? obj.fit ?? "stretch" : "stretch";
        if (fit !== "stretch") {
          const ar = img.width / img.height;
          const fitW = fit === "contain" ? Math.min(obj.w, obj.h * ar) : Math.max(obj.w, obj.h * ar);
          const fitH = fitW / ar;
          box = { x: obj.x + (obj.w - fitW) / 2, y: obj.y + (obj.h - fitH) / 2, w: fitW, h: fitH };
        }
        const clipToBox = fit === "cover";
        if (clipToBox) {
          // Recorte a la caja: polígono con sus cuatro esquinas ya en espacio nativo.
          const c = [at(obj.x, obj.y), at(obj.x + obj.w, obj.y), at(obj.x + obj.w, obj.y + obj.h), at(obj.x, obj.y + obj.h)];
          page.pushOperators(pushGraphicsState(), moveTo(c[0][0], c[0][1]), lineTo(c[1][0], c[1][1]), lineTo(c[2][0], c[2][1]), lineTo(c[3][0], c[3][1]), closePath(), clip(), endPath());
        }
        const [nx, ny] = at(box.x, box.y + box.h);
        page.drawImage(img, { x: nx, y: ny, width: box.w, height: box.h, rotate, opacity: obj.type === "image" ? obj.opacity : 1 });
        if (clipToBox) page.pushOperators(popGraphicsState());
        return;
      }
      case "ink": {
        const path = obj.strokes
          .filter((s) => s.length > 0)
          .map((s) => {
            const pts = s.length === 1 ? [s[0], s[0]] : s;
            return pts.map(([u, v], i) => `${i === 0 ? "M" : "L"}${(u * obj.w).toFixed(2)} ${(v * obj.h).toFixed(2)}`).join(" ");
          })
          .join(" ");
        if (!path) return;
        const [nx, ny] = at(obj.x, obj.y); // drawSvgPath ancla arriba-izquierda (eje Y invertido)
        page.drawSvgPath(path, { x: nx, y: ny, rotate, borderColor: hexToRgb(obj.color), borderWidth: obj.width, borderLineCap: LineCapStyle.Round });
        return;
      }
      case "text":
        await drawText(page, state, obj);
        return;
    }
  }

  async function drawText(page: PDFPage, state: PageState, obj: TextObject) {
    const r = state.baseRotation;
    const at = (fx: number, fy: number) => frameToNative(fx, fy, state.view, r);
    if (obj.cover) {
      const c = obj.cover;
      const [nx, ny] = at(c.x, c.y + c.h);
      page.drawRectangle({ x: nx, y: ny, width: c.w, height: c.h, color: hexToRgb(c.color), rotate: degrees(r), borderWidth: 0 });
    }
    const text = obj.text.replace(/\r/g, "");
    if (!text.trim()) return;
    const { style } = obj;
    const font = await getFont(style.font, text);
    const ascent = font.heightAtSize(style.size, { descender: false });
    const full = font.heightAtSize(style.size, { descender: true });
    const descent = Math.max(0, full - ascent);
    const lineStep = style.lineHeight * style.size;
    const base0 = firstBaselineOffset(style.size, style.lineHeight, ascent, descent);

    page.pushOperators(pushGraphicsState(), setCharacterSpacing(style.tracking));
    text.split("\n").forEach((line, i) => {
      if (!line) return;
      const width = font.widthOfTextAtSize(line, style.size) + style.tracking * Math.max(0, [...line].length - 1);
      const dx = style.align === "center" ? (obj.w - width) / 2 : style.align === "right" ? obj.w - width : 0;
      const [nx, ny] = at(obj.x + dx, obj.y + base0 + i * lineStep);
      page.drawText(line, { x: nx, y: ny, size: style.size, font, color: hexToRgb(style.color), opacity: style.opacity, rotate: degrees(r) });
    });
    page.pushOperators(popGraphicsState());
  }

  return out.save({ useObjectStreams: true });
}
