import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getDocument, latestHeadId, toDTO, versionChain } from "@/lib/documents/repo";
import { readJson, withSession } from "@/lib/http";
import { deleteObjects } from "@/lib/storage/r2";
import { confirmUpload } from "@/lib/storage/uploads";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  token: z.string(),
  /** updated_at de la versión que se abrió en el editor. */
  expectedUpdatedAt: z.string(),
  pageCount: z.number().int().positive().max(100000).nullable(),
  /** "onLatest": el usuario aceptó guardar encima de la versión más reciente tras un aviso de conflicto. */
  mode: z.enum(["normal", "onLatest"]).default("normal"),
});

/**
 * Guardar = crear versión nueva (version + 1, parent_id = anterior) con el PDF ya subido a R2.
 * Protección entre dispositivos: si la versión abierta ya no es la vigente o cambió desde que se abrió,
 * responde 409 en lugar de pisar el trabajo; el cliente puede reintentar con mode = "onLatest".
 */
export const POST = withSession<Ctx>(async (request, { params }) => {
  const id = z.uuid().parse((await params).id);
  const body = Body.parse(await readJson(request));
  const opened = await getDocument(id);
  const headId = await latestHeadId(id);
  const head = headId === id ? opened : await getDocument(headId);

  const conflict = headId !== id || opened.updatedAt.toISOString() !== body.expectedUpdatedAt;
  if (conflict && body.mode !== "onLatest") {
    return NextResponse.json(
      { error: "Otro dispositivo guardó una versión más reciente", conflict: true, latest: toDTO(head) },
      { status: 409 },
    );
  }

  const upload = await confirmUpload(body.token, "pdf");
  const [row] = await db()
    .insert(schema.documents)
    .values({
      name: head.name,
      storageKey: upload.key,
      sizeBytes: upload.size,
      pageCount: body.pageCount,
      parentId: head.id,
      version: head.version + 1,
    })
    .returning();

  // El borrador ya quedó incorporado en la nueva versión.
  const drafts = (await versionChain(head.id)).map((d) => d.draftKey).filter(Boolean) as string[];
  if (opened.draftKey) drafts.push(opened.draftKey);
  if (drafts.length) await deleteObjects([...new Set(drafts)]);
  await db().update(schema.documents).set({ draftKey: null, draftUpdatedAt: null }).where(eq(schema.documents.id, head.id));
  if (opened.id !== head.id) await db().update(schema.documents).set({ draftKey: null, draftUpdatedAt: null }).where(eq(schema.documents.id, opened.id));

  return NextResponse.json({ document: toDTO(row) }, { status: 201 });
});
