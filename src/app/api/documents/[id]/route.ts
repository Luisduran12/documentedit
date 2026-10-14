import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getDocument, latestHeadId, purgeDocument, toDTO } from "@/lib/documents/repo";
import { HttpError, readJson, withSession } from "@/lib/http";
import { presignGet } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };
const Id = z.uuid({ message: "Identificador no válido" });

/** Metadatos + URL firmada de lectura (corta duración) para abrir el PDF en el editor. */
export const GET = withSession<Ctx>(async (_req, { params }) => {
  const row = await getDocument(Id.parse((await params).id));
  const [url, latestId] = await Promise.all([presignGet(row.storageKey, { contentType: "application/pdf" }), latestHeadId(row.id)]);
  return NextResponse.json({ document: toDTO(row), url, isLatest: latestId === row.id, latestId });
});

const Patch = z.union([
  z.object({ name: z.string().trim().min(1, "El nombre no puede estar vacío").max(255) }),
  z.object({ action: z.enum(["trash", "restore"]) }),
]);

export const PATCH = withSession<Ctx>(async (request, { params }) => {
  const id = Id.parse((await params).id);
  const body = Patch.parse(await readJson(request));
  const doc = await getDocument(id);
  const set =
    "name" in body
      ? { name: body.name, updatedAt: new Date() }
      : { deletedAt: body.action === "trash" ? new Date() : null };
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    if ("name" in body) {
      localDb.prepare("UPDATE documents SET name = ?, updated_at = ? WHERE id = ?").run(body.name, set.updatedAt!.toISOString(), id);
      doc.name = body.name;
      doc.updatedAt = set.updatedAt!;
    } else {
      localDb.prepare("UPDATE documents SET deleted_at = ? WHERE id = ?").run(set.deletedAt ? set.deletedAt.toISOString() : null, id);
      doc.deletedAt = set.deletedAt;
    }
    return NextResponse.json({ document: toDTO(doc) });
  }
  const [row] = await db().update(schema.documents).set(set).where(eq(schema.documents.id, id)).returning();
  return NextResponse.json({ document: toDTO(row) });
});

/** Eliminación definitiva (solo desde la papelera): borra todas las versiones y sus archivos en R2. */
export const DELETE = withSession<Ctx>(async (_req, { params }) => {
  const id = Id.parse((await params).id);
  const row = await getDocument(id);
  if (!row.deletedAt) throw new HttpError(409, "Primero envía el documento a la papelera");
  await purgeDocument(id);
  return NextResponse.json({ ok: true });
});
