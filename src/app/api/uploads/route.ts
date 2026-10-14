import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extForMime, IMAGE_MIMES, KIND_LIMITS, formatBytes } from "@/lib/files";
import { HttpError, readJson, withSession } from "@/lib/http";
import { PREFIX, presignPut } from "@/lib/storage/r2";
import { signUpload } from "@/lib/storage/upload-token";

const ALLOWED: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  image: IMAGE_MIMES,
  asset: ["image/png", "image/jpeg"],
  font: ["font/ttf", "font/otf"],
};

const PREFIX_FOR = { pdf: PREFIX.documents, image: PREFIX.shares, asset: PREFIX.assets, font: PREFIX.fonts } as const;

const Body = z.object({
  kind: z.enum(["pdf", "image", "asset", "font"]),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
  name: z.string().min(1).max(255),
});

/** Emite una URL firmada de subida directa a R2 (el archivo nunca pasa por la función). */
export const POST = withSession(async (request) => {
  const body = Body.parse(await readJson(request));
  const limit = body.kind === "asset" ? KIND_LIMITS.image : KIND_LIMITS[body.kind];
  if (body.size > limit) throw new HttpError(413, `El archivo supera el máximo de ${formatBytes(limit)}`);
  if (!ALLOWED[body.kind].includes(body.contentType)) throw new HttpError(415, "Tipo de archivo no permitido");

  const key = `${PREFIX_FOR[body.kind]}${randomUUID()}.${extForMime(body.contentType)}`;
  const url = await presignPut(key, body.contentType, body.size);
  const token = await signUpload({ key, size: body.size, mime: body.contentType, kind: body.kind, name: body.name });
  return NextResponse.json({ url, token, headers: { "Content-Type": body.contentType } });
});
