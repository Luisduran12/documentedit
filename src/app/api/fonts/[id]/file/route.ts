import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, withSession } from "@/lib/http";
import { presignGet } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withSession<Ctx>(async (_req, { params }) => {
  const id = z.uuid().parse((await params).id);
  const [row] = await db().select().from(schema.customFonts).where(eq(schema.customFonts.id, id));
  if (!row) throw new HttpError(404, "Fuente no encontrada");
  const url = await presignGet(row.storageKey, { expiresIn: 600, contentType: row.storageKey.endsWith(".otf") ? "font/otf" : "font/ttf" });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
});
