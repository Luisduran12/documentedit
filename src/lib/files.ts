// Límites y detección de tipo real por "magic bytes" (compartido cliente/servidor).

export const MB = 1024 * 1024;
export const MAX_PDF_BYTES = 50 * MB;
export const MAX_IMAGE_BYTES = 10 * MB;
export const MAX_FONT_BYTES = 10 * MB;

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

export type FileKind = "pdf" | "image" | "font";

export const KIND_LIMITS: Record<FileKind, number> = {
  pdf: MAX_PDF_BYTES,
  image: MAX_IMAGE_BYTES,
  font: MAX_FONT_BYTES,
};

/** Identifica el tipo real a partir de los primeros bytes. Nunca se confía en la extensión. */
export function sniffMime(b: Uint8Array): string | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, j) => b[i + j] === x);
  const ascii = (i: number, s: string) => at(i, ...Array.from(s, (c) => c.charCodeAt(0)));
  // %PDF- puede ir precedido de basura en los primeros 1024 bytes (lo toleran los lectores).
  for (let i = 0; i <= Math.min(1019, b.length - 5); i++) if (ascii(i, "%PDF-")) return "application/pdf";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (at(0, 0x00, 0x01, 0x00, 0x00) || ascii(0, "true")) return "font/ttf";
  if (ascii(0, "OTTO")) return "font/otf";
  return null;
}

export function kindOfMime(mime: string | null): FileKind | null {
  if (!mime) return null;
  if (mime === "application/pdf") return "pdf";
  if ((IMAGE_MIMES as readonly string[]).includes(mime)) return "image";
  if (mime === "font/ttf" || mime === "font/otf") return "font";
  return null;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}

export function extForMime(mime: string) {
  return (
    { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "font/ttf": "ttf", "font/otf": "otf" } as Record<string, string>
  )[mime] ?? "bin";
}
