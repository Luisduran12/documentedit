import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, readJson, withSession } from "@/lib/http";
import { presignGet } from "@/lib/storage/r2";
import { confirmUpload } from "@/lib/storage/uploads";

const KEY_RE = /^assets\/[0-9a-f-]{36}\.(png|jpg)$/;

/** Confirma una imagen añadida en el editor (PNG/JPG) ya subida a R2. */
export const POST = withSession(async (request) => {
  const { token } = z.object({ token: z.string() }).parse(await readJson(request));
  const upload = await confirmUpload(token, "asset");
  return NextResponse.json({ key: upload.key, mime: upload.realMime }, { status: 201 });
});

/** Redirige a una URL firmada de lectura (para mostrarla en el lienzo y al exportar). */
export const GET = withSession(async (request) => {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_RE.test(key)) throw new HttpError(400, "Clave no válida");
  const url = await presignGet(key, { expiresIn: 600 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
});
