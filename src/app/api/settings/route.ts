import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings } from "@/lib/auth/settings";
import { db, schema } from "@/lib/db";
import { readJson, withSession } from "@/lib/http";
import { TTL_OPTIONS } from "@/lib/shares/ttl";

export const GET = withSession(async () => {
  const s = await getSettings();
  return NextResponse.json({ defaultTtl: s.defaultTtl, signature: s.signature ?? null, passwordFromApp: Boolean(s.passwordHash) });
});

const Body = z.object({
  defaultTtl: z.enum(TTL_OPTIONS.map((o) => o.label) as [string, ...string[]]).optional(),
  // Firma reutilizable: trazos normalizados [0..1] y proporción de la caja.
  signature: z
    .object({
      aspect: z.number().positive().max(20),
      strokes: z.array(z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).max(5000)).max(200),
    })
    .nullable()
    .optional(),
});

export const PATCH = withSession(async (request) => {
  const body = Body.parse(await readJson(request));
  if (!process.env.DATABASE_URL) {
    const fields: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];
    if (body.defaultTtl !== undefined) {
      fields.push("default_ttl = ?");
      params.push(body.defaultTtl);
    }
    if (body.signature !== undefined) {
      fields.push("signature = ?");
      params.push(body.signature ? JSON.stringify(body.signature) : null);
    }
    const sql = `UPDATE app_settings SET ${fields.join(", ")} WHERE id = 1`;
    const { localDb } = await import("@/lib/db/sqlite-local");
    localDb.prepare(sql).run(...params);
    return NextResponse.json({ ok: true });
  }
  await getSettings();
  await db()
    .update(schema.appSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.appSettings.id, 1));
  return NextResponse.json({ ok: true });
});
