// Catálogo de fuentes y mapeo desde el nombre detectado por pdf.js.

import type { FontRef } from "./types";

export type FontKind = "standard" | "bundled" | "custom";

export type CatalogFont = {
  id: string;
  label: string;
  kind: FontKind;
  /** Familia CSS para mostrar el texto en el lienzo. */
  css: string;
  category: "sans" | "serif" | "mono";
  /** Para "custom": clave en R2 del archivo (una sola variante). */
  storageKey?: string;
};

export const STANDARD_FONTS: CatalogFont[] = [
  { id: "Helvetica", label: "Helvetica (estándar PDF)", kind: "standard", css: '"Liberation Sans", Helvetica, Arial, sans-serif', category: "sans" },
  { id: "Times", label: "Times (estándar PDF)", kind: "standard", css: '"Liberation Serif", "Times New Roman", serif', category: "serif" },
  { id: "Courier", label: "Courier (estándar PDF)", kind: "standard", css: '"Courier New", Courier, monospace', category: "mono" },
];

export const BUNDLED_FONTS: CatalogFont[] = [
  { id: "liberation-sans", label: "Liberation Sans (≈ Arial)", kind: "bundled", css: '"Liberation Sans"', category: "sans" },
  { id: "liberation-serif", label: "Liberation Serif (≈ Times New Roman)", kind: "bundled", css: '"Liberation Serif"', category: "serif" },
  { id: "inter", label: "Inter", kind: "bundled", css: '"Inter"', category: "sans" },
  { id: "roboto", label: "Roboto", kind: "bundled", css: '"Roboto"', category: "sans" },
  { id: "open-sans", label: "Open Sans", kind: "bundled", css: '"Open Sans"', category: "sans" },
  { id: "montserrat", label: "Montserrat", kind: "bundled", css: '"Montserrat"', category: "sans" },
  { id: "lora", label: "Lora", kind: "bundled", css: '"Lora"', category: "serif" },
  { id: "liberation-mono", label: "Liberation Mono (≈ Courier New)", kind: "bundled", css: '"Liberation Mono"', category: "mono" },
  { id: "carlito", label: "Carlito (≈ Calibri)", kind: "bundled", css: '"Carlito"', category: "sans" },
  { id: "caladea", label: "Caladea (≈ Cambria)", kind: "bundled", css: '"Caladea"', category: "serif" },
];

export function bundledFileName(id: string, bold: boolean, italic: boolean) {
  const variant = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "regular";
  return `${id}-${variant}.ttf`;
}

/** Quita el prefijo de subconjunto ("ABCDEF+") y normaliza para comparar. */
export function cleanFontName(raw: string) {
  return raw.replace(/^[A-Z]{6}\+/, "");
}

function norm(s: string) {
  return cleanFontName(s).toLowerCase().replace(/[\s_\-,]/g, "");
}

export function detectStyle(raw: string) {
  const n = norm(raw);
  return {
    bold: /bold|black|heavy|semibold|demibold|demi(?!light)|extrabold|ultrabold|w[6-9]$/.test(n),
    italic: /italic|oblique|ital$|it$/.test(n.replace(/(semi|demi|extra|ultra)?bold/, "")),
  };
}

const ALIASES: [RegExp, string][] = [
  [/^(arial|arialmt|helvetica|helveticaneue|liberationsans|nimbussans|arimo|freesans)/, "Helvetica"],
  [/^(times|timesnewroman|timesnewromanps|liberationserif|nimbusroman|tinos|freeserif)/, "Times"],
  [/^(courier|couriernew|liberationmono|nimbusmono|cousine|freemono)/, "Courier"],
  [/^inter/, "inter"],
  [/^roboto(?!mono|slab|condensed)/, "roboto"],
  [/^opensans/, "open-sans"],
  [/^montserrat/, "montserrat"],
  [/^lora/, "lora"],
  [/^(calibri|carlito)/, "carlito"],
  [/^(cambria|caladea)/, "caladea"],
];

export type FontMatch = {
  font: FontRef;
  /** true si la fuente original (o una equivalente métrica) está disponible. */
  exact: boolean;
  /** Nombre legible de la fuente original. */
  original: string;
};

/**
 * Elige la fuente para reescribir un texto. `hint` es la familia genérica que reporta pdf.js
 * ("serif" | "sans-serif" | "monospace") y se usa como respaldo cuando no hay coincidencia.
 */
export function mapFont(rawName: string, hint: string | undefined, custom: CatalogFont[] = []): FontMatch {
  const original = cleanFontName(rawName || "desconocida");
  const n = norm(rawName || "");
  const { bold, italic } = detectStyle(rawName || "");

  const customHit = custom.find((c) => n.startsWith(norm(c.label)));
  if (customHit) return { font: { family: customHit.id, bold: false, italic: false }, exact: true, original };

  for (const [re, id] of ALIASES) {
    if (re.test(n)) return { font: { family: id, bold, italic }, exact: true, original };
  }

  const serifish = /serif|roman|georgia|garamond|book|minion|palatino|baskerville|bodoni|didot|caslon/.test(n) && !/sans/.test(n);
  const mono = /mono|consol|code|typewriter/.test(n) || hint === "monospace";
  const family = mono ? "Courier" : serifish || hint === "serif" ? "liberation-serif" : "liberation-sans";
  return { font: { family, bold, italic }, exact: false, original };
}

export function findFont(id: string, custom: CatalogFont[] = []) {
  return [...STANDARD_FONTS, ...BUNDLED_FONTS, ...custom].find((f) => f.id === id);
}

/** Caracteres que las fuentes estándar PDF (codificación WinAnsi) no pueden dibujar. */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function fitsWinAnsi(text: string) {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 10 || c === 13) continue;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) continue;
    return false;
  }
  return true;
}
