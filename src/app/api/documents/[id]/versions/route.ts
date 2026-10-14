import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getHead, toDTO, versionChain } from "@/lib/documents/repo";
import { HttpError, readJson, withSession } from "@/lib/http";
import { copyObject, PREFIX } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withSession<Ctx>(async (_req, { params }) => {
  const chain = await versionChain(z.uuid().parse((await params).id));
  return NextResponse.json({ versions: chain.map(toDTO) });
});

const Restore = z.object({ fromId: z.uuid() });

/** Volver a una versión anterior: crea una versión nueva con el contenido de la elegida (no se pierde nada). */
export const POST = withSession<Ctx>(async (request, { params }) => {
  const head = await getHead(z.uuid().parse((await params).id));
  const { fromId } = Restore.parse(await readJson(request));
  const chain = await versionChain(head.id);
  const from = chain.find((v) => v.id === fromId);
  if (!from) throw new HttpError(404, "Esa versión no pertenece a este documento");
  const key = `${PREFIX.documents}${randomUUID()}.pdf`;
  await copyObject(from.storageKey, key);
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const newId = randomUUID();
    const now = new Date();
    localDb.prepare(`
      INSERT INTO documents (id, name, storage_key, size_bytes, page_count, parent_id, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, head.name, key, from.sizeBytes, from.pageCount, head.id, head.version + 1, now.toISOString(), now.toISOString());
    const row = {
      id: newId,
      name: head.name,
      storageKey: key,
      sizeBytes: from.sizeBytes,
      pageCount: from.pageCount,
      parentId: head.id,
      version: head.version + 1,
      draftKey: null,
      draftUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    return NextResponse.json({ document: toDTO(row) }, { status: 201 });
  }
  const [row] = await db()
    .insert(schema.documents)
    .values({
      name: head.name,
      storageKey: key,
      sizeBytes: from.sizeBytes,
      pageCount: from.pageCount,
      parentId: head.id,
      version: head.version + 1,
    })
    .returning();
  return NextResponse.json({ document: toDTO(row) }, { status: 201 });
});
