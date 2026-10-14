import "server-only";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Share } from "@/lib/db/schema";
import { SITE_URL } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { deleteObjects, presignGet } from "@/lib/storage/r2";
import { localDb } from "@/lib/db/sqlite-local";

const s = schema.shares;

function fromLocalShare(r: any): Share {
  return {
    id: r.id,
    storageKey: r.storage_key,
    mime: r.mime,
    originalName: r.original_name ?? null,
    sizeBytes: r.size_bytes,
    ttlLabel: r.ttl_label,
    createdAt: new Date(r.created_at),
    expiresAt: new Date(r.expires_at),
    deletedAt: r.deleted_at ? new Date(r.deleted_at) : null,
    views: r.views ?? 0,
  };
}

export function publicUrl(id: string) {
  return `${SITE_URL}/s/${id}`;
}

export async function toShareDTO(row: Share, withThumb = false) {
  return {
    id: row.id,
    url: publicUrl(row.id),
    mime: row.mime,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    ttlLabel: row.ttlLabel,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    views: row.views,
    thumbUrl: withThumb && !row.deletedAt ? await presignGet(row.storageKey, { expiresIn: 600, contentType: row.mime }) : null,
  };
}

export async function listShares() {
  if (!process.env.DATABASE_URL) {
    const rows = localDb.prepare("SELECT * FROM shares ORDER BY created_at DESC LIMIT 500").all() as any[];
    return Promise.all(rows.map(fromLocalShare).map((r) => toShareDTO(r, true)));
  }
  const rows = await db().select().from(s).orderBy(desc(s.createdAt)).limit(500);
  return Promise.all(rows.map((r) => toShareDTO(r, true)));
}

export async function getShare(id: string) {
  if (!process.env.DATABASE_URL) {
    const row = localDb.prepare("SELECT * FROM shares WHERE id = ?").get(id) as any;
    if (!row) throw new HttpError(404, "Enlace no encontrado");
    return fromLocalShare(row);
  }
  const [row] = await db().select().from(s).where(eq(s.id, id));
  if (!row) throw new HttpError(404, "Enlace no encontrado");
  return row;
}

/** Revoca: borra el archivo de R2 y marca deleted_at. */
export async function revokeShare(id: string) {
  const row = await getShare(id);
  if (!row.deletedAt) {
    await deleteObjects([row.storageKey]);
    if (!process.env.DATABASE_URL) {
      localDb.prepare("UPDATE shares SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
      return;
    }
    await db().update(s).set({ deletedAt: new Date() }).where(eq(s.id, id));
  }
}

/**
 * Valida e incrementa vistas en una sola sentencia atómica:
 * solo cuenta si el enlace existe, no está revocado y no ha vencido.
 */
export async function consumeView(id: string) {
  if (!process.env.DATABASE_URL) {
    const nowIso = new Date().toISOString();
    localDb.prepare("UPDATE shares SET views = views + 1 WHERE id = ? AND deleted_at IS NULL AND expires_at > ?").run(id, nowIso);
    const row = localDb.prepare("SELECT * FROM shares WHERE id = ?").get(id) as any;
    return row ? fromLocalShare(row) : null;
  }
  const [row] = await db()
    .update(s)
    .set({ views: sql`${s.views} + 1` })
    .where(and(eq(s.id, id), isNull(s.deletedAt), gt(s.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

export async function findShare(id: string) {
  if (!process.env.DATABASE_URL) {
    const row = localDb.prepare("SELECT * FROM shares WHERE id = ?").get(id) as any;
    return row ? fromLocalShare(row) : null;
  }
  const [row] = await db().select().from(s).where(eq(s.id, id));
  return row ?? null;
}

/** Enlaces vencidos cuyo archivo aún existe (los purga el cron). */
export async function purgeExpiredShares(now = new Date()) {
  if (!process.env.DATABASE_URL) {
    const rows = localDb.prepare("SELECT id, storage_key as key FROM shares WHERE deleted_at IS NULL AND expires_at <= ?").all(now.toISOString()) as any[];
    if (rows.length === 0) return 0;
    await deleteObjects(rows.map((r) => r.key));
    for (const r of rows) {
      localDb.prepare("UPDATE shares SET deleted_at = ? WHERE id = ?").run(now.toISOString(), r.id);
    }
    return rows.length;
  }
  const rows = await db()
    .select({ id: s.id, key: s.storageKey })
    .from(s)
    .where(and(isNull(s.deletedAt), lte(s.expiresAt, now)));
  if (rows.length === 0) return 0;
  await deleteObjects(rows.map((r) => r.key));
  await db().update(s).set({ deletedAt: now }).where(sql`${s.id} in ${rows.map((r) => r.id)}`);
  return rows.length;
}
