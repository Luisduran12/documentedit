import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { readJson, withSession } from "@/lib/http";
import { confirmUpload } from "@/lib/storage/uploads";

export const GET = withSession(async () => {
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const rows = localDb.prepare("SELECT * FROM custom_fonts ORDER BY created_at DESC").all() as any[];
    return NextResponse.json({ fonts: rows.map((r) => ({ id: r.id, family: r.family, createdAt: new Date(r.created_at).toISOString() })) });
  }
  const rows = await db().select().from(schema.customFonts).orderBy(desc(schema.customFonts.createdAt));
  return NextResponse.json({ fonts: rows.map((r) => ({ id: r.id, family: r.family, createdAt: r.createdAt.toISOString() })) });
});

const Body = z.object({ token: z.string(), family: z.string().trim().min(1, "Indica el nombre de la fuente").max(80) });

export const POST = withSession(async (request) => {
  const body = Body.parse(await readJson(request));
  const upload = await confirmUpload(body.token, "font");
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    const now = new Date();
    localDb.prepare("INSERT INTO custom_fonts (id, family, storage_key, created_at) VALUES (?, ?, ?, ?)").run(id, body.family, upload.key, now.toISOString());
    return NextResponse.json({ font: { id, family: body.family, createdAt: now.toISOString() } }, { status: 201 });
  }
  const [row] = await db().insert(schema.customFonts).values({ family: body.family, storageKey: upload.key }).returning();
  return NextResponse.json({ font: { id: row.id, family: row.family, createdAt: row.createdAt.toISOString() } }, { status: 201 });
});
