import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getDocument, getHead } from "@/lib/documents/repo";
import { EditDocSchema } from "@/lib/editor/schema";
import { HttpError, withSession } from "@/lib/http";
import { deleteObjects, getText, PREFIX, putObject } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };
const MAX_DRAFT_BYTES = 3 * 1024 * 1024; // muy por debajo del límite de 4.5 MB de Vercel

/** Borrador de ediciones (JSON) para retomar desde cualquier dispositivo. */
export const GET = withSession<Ctx>(async (_req, { params }) => {
  const doc = await getDocument(z.uuid().parse((await params).id));
  if (!doc.draftKey) return NextResponse.json({ draft: null });
  const text = await getText(doc.draftKey);
  return NextResponse.json({ draft: text ? JSON.parse(text) : null, draftUpdatedAt: doc.draftUpdatedAt?.toISOString() ?? null });
});

export const PUT = withSession<Ctx>(async (request, { params }) => {
  const id = z.uuid().parse((await params).id);
  const raw = await request.text();
  if (raw.length > MAX_DRAFT_BYTES) throw new HttpError(413, "El borrador es demasiado grande");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Borrador no válido");
  }
  const doc = EditDocSchema.parse(parsed);
  const head = await getHead(id); // solo la versión vigente admite borrador
  const key = `${PREFIX.drafts}${head.id}.json`;
  const savedAt = new Date();
  await putObject(key, JSON.stringify({ ...doc, formatVersion: 1, baseDocumentId: head.id, savedAt: savedAt.toISOString() }), "application/json");
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    localDb.prepare("UPDATE documents SET draft_key = ?, draft_updated_at = ? WHERE id = ?").run(key, savedAt.toISOString(), head.id);
    return NextResponse.json({ ok: true, savedAt: savedAt.toISOString() });
  }
  await db().update(schema.documents).set({ draftKey: key, draftUpdatedAt: savedAt }).where(eq(schema.documents.id, head.id));
  return NextResponse.json({ ok: true, savedAt: savedAt.toISOString() });
});

/** Descartar borrador. */
export const DELETE = withSession<Ctx>(async (_req, { params }) => {
  const doc = await getDocument(z.uuid().parse((await params).id));
  if (doc.draftKey) await deleteObjects([doc.draftKey]);
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    localDb.prepare("UPDATE documents SET draft_key = NULL, draft_updated_at = NULL WHERE id = ?").run(doc.id);
    return NextResponse.json({ ok: true });
  }
  await db().update(schema.documents).set({ draftKey: null, draftUpdatedAt: null }).where(eq(schema.documents.id, doc.id));
  return NextResponse.json({ ok: true });
});
