"use client";

import { firstBaselineOffset } from "./geometry";
import { bundledFileName, findFont, type CatalogFont } from "./fonts";
import type { FontRef, TextStyle } from "./types";

export type CustomFontInfo = { id: string; family: string };

export function customCatalog(fonts: CustomFontInfo[]): CatalogFont[] {
  return fonts.map((f) => ({ id: `custom:${f.id}`, label: f.family, kind: "custom", css: `"custom-${f.id}"`, category: "sans", storageKey: f.id }));
}

export function cssFont(font: FontRef, custom: CatalogFont[]) {
  const cat = findFont(font.family, custom);
  const isCustom = cat?.kind === "custom";
  return {
    family: `${cat?.css ?? '"Liberation Sans"'}, sans-serif`,
    weight: !isCustom && font.bold ? 700 : 400,
    style: !isCustom && font.italic ? "italic" : "normal",
  };
}

const loadedCustom = new Map<string, Promise<void>>();

/** Garantiza que la fuente esté lista para pintar y medir en el lienzo. */
export async function ensureFont(font: FontRef, custom: CatalogFont[]) {
  const cat = findFont(font.family, custom);
  if (cat?.kind === "custom") {
    const id = cat.storageKey!;
    if (!loadedCustom.has(id)) {
      loadedCustom.set(
        id,
        (async () => {
          const buf = await (await fetch(`/api/fonts/${id}/file`)).arrayBuffer();
          const face = new FontFace(`custom-${id}`, buf);
          await face.load();
          document.fonts.add(face);
        })(),
      );
    }
    return loadedCustom.get(id);
  }
  const { family, weight, style } = cssFont(font, custom);
  await document.fonts.load(`${style} ${weight} 16px ${family}`).catch(() => {});
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx() {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  return measureCtx!;
}

/** Ascendente/descendente reales (como los usa CSS) para alinear líneas base. */
export function fontMetrics(style: TextStyle, custom: CatalogFont[]) {
  const c = ctx();
  const { family, weight, style: fs } = cssFont(style.font, custom);
  c.font = `${fs} ${weight} ${style.size}px ${family}`;
  const m = c.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent || style.size * 0.8;
  const descent = m.fontBoundingBoxDescent || style.size * 0.2;
  return { ascent, descent };
}

/** Caja que ocupa el texto (sin ajuste de línea: los saltos de línea son explícitos). */
export function measureText(text: string, style: TextStyle, custom: CatalogFont[]) {
  const c = ctx();
  const { family, weight, style: fs } = cssFont(style.font, custom);
  c.font = `${fs} ${weight} ${style.size}px ${family}`;
  const lines = text.split("\n");
  const w = Math.max(
    style.size * 0.5,
    ...lines.map((l) => c.measureText(l).width + style.tracking * Math.max(0, [...l].length - 1)),
  );
  return { w: Math.ceil(w + 1), h: lines.length * style.lineHeight * style.size };
}

/** y del borde superior de la caja para que la primera línea base caiga en `baseline`. */
export function topForBaseline(baseline: number, style: TextStyle, custom: CatalogFont[]) {
  const { ascent, descent } = fontMetrics(style, custom);
  return baseline - firstBaselineOffset(style.size, style.lineHeight, ascent, descent);
}

/** Bytes TTF/OTF para incrustar al exportar. */
export async function fetchFontBytes(font: FontRef, cat: CatalogFont | undefined) {
  const url = cat?.kind === "custom" ? `/api/fonts/${cat.storageKey}/file` : `/fonts/${bundledFileName(font.family, font.bold, font.italic)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente ${cat?.label ?? font.family}`);
  return new Uint8Array(await res.arrayBuffer());
}
