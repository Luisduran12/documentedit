// Métricas de las fuentes sustitutas incluidas (mismos números en el navegador y al exportar).
import fontkit from "@pdf-lib/fontkit";
import { bundledFileName } from "../fonts";
import type { SubFont, SubFontResolver } from "./layout";

type FkFont = { unitsPerEm: number; glyphForCodePoint(cp: number): { advanceWidth: number; id: number }; hasGlyphForCodePoint(cp: number): boolean };

export function makeSubFont(family: string, bold: boolean, italic: boolean, bytes: Uint8Array): SubFont {
  const f = fontkit.create(bytes) as unknown as FkFont;
  const cache = new Map<string, number>();
  return {
    key: `${family}-${bold ? "b" : ""}${italic ? "i" : ""}`,
    family,
    bold,
    italic,
    has: (ch) => f.hasGlyphForCodePoint(ch.codePointAt(0)!),
    width: (ch) => {
      let w = cache.get(ch);
      if (w === undefined) {
        w = (f.glyphForCodePoint(ch.codePointAt(0)!).advanceWidth * 1000) / f.unitsPerEm;
        cache.set(ch, w);
      }
      return w;
    },
  };
}

/** Registro de sustitutas ya cargadas; `need` devuelve las variantes que faltan por cargar. */
export class SubFontRegistry {
  private fonts = new Map<string, SubFont>();
  private bytes = new Map<string, Uint8Array>();
  constructor(private load: (family: string, bold: boolean, italic: boolean) => Promise<Uint8Array>) {}

  static file(family: string, bold: boolean, italic: boolean) {
    return bundledFileName(family, bold, italic);
  }

  async ensure(variants: { family: string; bold: boolean; italic: boolean }[]) {
    await Promise.all(
      variants.map(async (v) => {
        const file = SubFontRegistry.file(v.family, v.bold, v.italic);
        if (this.fonts.has(file)) return;
        const bytes = await this.load(v.family, v.bold, v.italic);
        this.bytes.set(file, bytes);
        this.fonts.set(file, makeSubFont(v.family, v.bold, v.italic, bytes));
      }),
    );
  }

  bytesOf(sub: SubFont) {
    return this.bytes.get(SubFontRegistry.file(sub.family, sub.bold, sub.italic));
  }

  resolver: SubFontResolver = (family, bold, italic) => this.fonts.get(SubFontRegistry.file(family, bold, italic)) ?? null;
}
