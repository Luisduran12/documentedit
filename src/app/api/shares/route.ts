import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { readJson, withSession } from "@/lib/http";
import { ALLOW_DEV_TTL } from "@/lib/shares/dev";
import { listShares, toShareDTO } from "@/lib/shares/repo";
import { computeExpiry, SHARE_ID_LENGTH, ttlMs } from "@/lib/shares/ttl";
import { confirmUpload } from "@/lib/storage/uploads";

export const GET = withSession(async () => NextResponse.json({ shares: await listShares() }));

const Body = z.object({
  token: z.string(),
  ttl: z.string().refine((v) => ttlMs(v, ALLOW_DEV_TTL) !== null, "Caducidad no válida"),
});

/** Confirma una imagen subida a R2 y crea el enlace temporal. */
export const POST = withSession(async (request) => {
  const body = Body.parse(await readJson(request));
  const upload = await confirmUpload(body.token, "image");
  const now = new Date();
  const id = nanoid(SHARE_ID_LENGTH);
  const expiresAt = computeExpiry(body.ttl, now, ALLOW_DEV_TTL);
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    localDb.prepare(`
      INSERT INTO shares (id, storage_key, mime, original_name, size_bytes, ttl_label, created_at, expires_at, views)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, upload.key, upload.realMime, upload.name.slice(0, 255), upload.size, body.ttl, now.toISOString(), expiresAt.toISOString());
    const row = {
      id,
      storageKey: upload.key,
      mime: upload.realMime,
      originalName: upload.name.slice(0, 255),
      sizeBytes: upload.size,
      ttlLabel: body.ttl,
      createdAt: now,
      expiresAt,
      deletedAt: null,
      views: 0,
    };
    return NextResponse.json({ share: await toShareDTO(row, true) }, { status: 201 });
  }
  const [row] = await db()
    .insert(schema.shares)
    .values({
      id,
      storageKey: upload.key,
      mime: upload.realMime,
      originalName: upload.name.slice(0, 255),
      sizeBytes: upload.size,
      ttlLabel: body.ttl,
      createdAt: now,
      expiresAt,
    })
    .returning();
  return NextResponse.json({ share: await toShareDTO(row, true) }, { status: 201 });
});
