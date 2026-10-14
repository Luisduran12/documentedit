import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, readJson, withSession } from "@/lib/http";
import { ALLOW_DEV_TTL } from "@/lib/shares/dev";
import { getShare, revokeShare, toShareDTO } from "@/lib/shares/repo";
import { extendExpiry, SHARE_ID_RE, ttlMs } from "@/lib/shares/ttl";

type Ctx = { params: Promise<{ id: string }> };
const Id = z.string().regex(SHARE_ID_RE, "Identificador no válido");

const Extend = z.object({
  action: z.literal("extend"),
  ttl: z.string().refine((v) => ttlMs(v, ALLOW_DEV_TTL) !== null, "Caducidad no válida"),
});

/** Ampliar caducidad (solo si el archivo aún existe). */
export const PATCH = withSession<Ctx>(async (request, { params }) => {
  const id = Id.parse((await params).id);
  const body = Extend.parse(await readJson(request));
  const row = await getShare(id);
  if (row.deletedAt) throw new HttpError(409, "Este enlace ya fue eliminado; sube la imagen de nuevo");
  const expiresAt = extendExpiry(row.expiresAt, body.ttl, new Date(), ALLOW_DEV_TTL);
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    localDb.prepare("UPDATE shares SET expires_at = ?, ttl_label = ? WHERE id = ?").run(expiresAt.toISOString(), body.ttl, id);
    row.expiresAt = expiresAt;
    row.ttlLabel = body.ttl;
    return NextResponse.json({ share: await toShareDTO(row, true) });
  }
  const [updated] = await db()
    .update(schema.shares)
    .set({ expiresAt, ttlLabel: body.ttl })
    .where(eq(schema.shares.id, id))
    .returning();
  return NextResponse.json({ share: await toShareDTO(updated, true) });
});

/** Revocar ahora: borra el archivo de inmediato. */
export const DELETE = withSession<Ctx>(async (_req, { params }) => {
  await revokeShare(Id.parse((await params).id));
  return NextResponse.json({ ok: true });
});
