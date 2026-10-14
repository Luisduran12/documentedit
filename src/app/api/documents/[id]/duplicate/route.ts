import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getDocument, toDTO } from "@/lib/documents/repo";
import { withSession } from "@/lib/http";
import { copyObject, PREFIX } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withSession<Ctx>(async (_req, { params }) => {
  const src = await getDocument(z.uuid().parse((await params).id));
  const key = `${PREFIX.documents}${randomUUID()}.pdf`;
  await copyObject(src.storageKey, key);
  const name = src.name.replace(/(\.pdf)?$/i, " (copia)$1");
  const [row] = await db()
    .insert(schema.documents)
    .values({ name, storageKey: key, sizeBytes: src.sizeBytes, pageCount: src.pageCount })
    .returning();
  return NextResponse.json({ document: toDTO(row) }, { status: 201 });
});
