import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { listDocuments, toDTO } from "@/lib/documents/repo";
import { readJson, withSession } from "@/lib/http";
import { confirmUpload } from "@/lib/storage/uploads";

export const GET = withSession(async (request) => {
  const params = new URL(request.url).searchParams;
  const documents = await listDocuments({ q: params.get("q")?.slice(0, 100) || undefined, trash: params.get("trash") === "1" });
  return NextResponse.json({ documents });
});

const Body = z.object({
  token: z.string(),
  name: z.string().trim().min(1).max(255),
  pageCount: z.number().int().positive().max(100000).nullable().optional(),
});

/** Confirma un PDF ya subido a R2 y crea el documento. */
export const POST = withSession(async (request) => {
  const body = Body.parse(await readJson(request));
  const upload = await confirmUpload(body.token, "pdf");
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    const now = new Date();
    localDb.prepare(`
      INSERT INTO documents (id, name, storage_key, size_bytes, page_count, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, body.name, upload.key, upload.size, body.pageCount ?? null, now.toISOString(), now.toISOString());
    const row = {
      id,
      name: body.name,
      storageKey: upload.key,
      sizeBytes: upload.size,
      pageCount: body.pageCount ?? null,
      parentId: null,
      version: 1,
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
    .values({ name: body.name, storageKey: upload.key, sizeBytes: upload.size, pageCount: body.pageCount ?? null })
    .returning();
  return NextResponse.json({ document: toDTO(row) }, { status: 201 });
});
