"use client";

import { api, ApiError } from "@/lib/api-client";
import { KIND_LIMITS, formatBytes, sniffMime, kindOfMime } from "@/lib/files";

export type UploadKind = "pdf" | "image" | "asset" | "font";

/** Detecta el tipo real leyendo los primeros bytes del archivo en el navegador. */
export async function detectMime(file: File) {
  return sniffMime(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
}

export async function validateFile(file: File, kind: UploadKind): Promise<string> {
  const mime = await detectMime(file);
  const realKind = kindOfMime(mime);
  const okKind = kind === "asset" ? mime === "image/png" || mime === "image/jpeg" : realKind === kind;
  if (!mime || !okKind) {
    const expected = { pdf: "un PDF", image: "una imagen PNG, JPG, WEBP o GIF", asset: "una imagen PNG o JPG", font: "una fuente .ttf u .otf" }[kind];
    throw new ApiError(`El archivo no es ${expected}`, 415);
  }
  const limit = kind === "asset" ? KIND_LIMITS.image : KIND_LIMITS[kind];
  if (file.size > limit) throw new ApiError(`El archivo supera el máximo de ${formatBytes(limit)}`, 413);
  return mime;
}

/**
 * Sube un archivo directo a R2: pide URL firmada → PUT con progreso → devuelve el token
 * que el endpoint de confirmación verificará.
 */
export async function uploadToR2(file: File | Blob, kind: UploadKind, name: string, onProgress?: (pct: number) => void) {
  const contentType = file instanceof File ? await validateFile(file, kind) : file.type;
  const { url, token, headers } = await api<{ url: string; token: string; headers: Record<string, string> }>("/api/uploads", {
    method: "POST",
    json: { kind, contentType, size: file.size, name },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`La subida falló (${xhr.status})`, xhr.status)));
    xhr.onerror = () => reject(new ApiError("La subida falló. Revisa tu conexión o la configuración CORS del bucket.", 0));
    xhr.send(file);
  });
  return token;
}
