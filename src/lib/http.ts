import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError, unauthorizedResponse } from "@/lib/auth/dal";
import { UploadError } from "@/lib/storage/uploads";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response>;

/** Envuelve un route handler: exige sesión válida y traduce errores a JSON sin filtrar detalles internos. */
export function withSession<C>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      await requireSession();
      return await handler(request, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) return unauthorizedResponse();
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  // Solo el tipo de error: nunca contenido de documentos.
  console.error("[api]", err instanceof Error ? `${err.name}: ${err.message}` : "error desconocido");
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

export async function readJson(request: Request) {
  return request.json().catch(() => {
    throw new HttpError(400, "Cuerpo JSON no válido");
  });
}
