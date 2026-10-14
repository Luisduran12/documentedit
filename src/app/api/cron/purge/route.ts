import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { expiredTrash, purgeDocument } from "@/lib/documents/repo";
import { errorResponse } from "@/lib/http";
import { purgeExpiredShares } from "@/lib/shares/repo";

const TRASH_DAYS = 30;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Lo invoca Vercel Cron (vercel.json) con "Authorization: Bearer $CRON_SECRET".
 * Borra de R2 las imágenes vencidas, vacía la papelera de más de 30 días y limpia intentos de login viejos.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const shares = await purgeExpiredShares();
    const trash = await expiredTrash(TRASH_DAYS);
    for (const doc of trash) await purgeDocument(doc.id);
    await db().delete(schema.loginAttempts).where(lt(schema.loginAttempts.attemptedAt, new Date(Date.now() - 86400_000)));
    return NextResponse.json({ ok: true, purgedShares: shares, purgedDocuments: trash.length });
  } catch (err) {
    return errorResponse(err);
  }
}
