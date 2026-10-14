import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, withSession } from "@/lib/http";
import { deleteObjects } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withSession<Ctx>(async (_req, { params }) => {
  const id = z.uuid().parse((await params).id);
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const row = localDb.prepare("SELECT * FROM custom_fonts WHERE id = ?").get(id) as any;
    if (!row) throw new HttpError(404, "Fuente no encontrada");
    localDb.prepare("DELETE FROM custom_fonts WHERE id = ?").run(id);
    await deleteObjects([row.storage_key]);
    return NextResponse.json({ ok: true });
  }
  const [row] = await db().delete(schema.customFonts).where(eq(schema.customFonts.id, id)).returning();
  if (!row) throw new HttpError(404, "Fuente no encontrada");
  await deleteObjects([row.storageKey]);
  return NextResponse.json({ ok: true });
});
