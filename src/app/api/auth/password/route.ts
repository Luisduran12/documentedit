import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, unauthorizedResponse } from "@/lib/auth/dal";
import { decodeHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

const Body = z.object({
  current: z.string().min(1).max(256),
  next: z.string().min(12, "La nueva contraseña debe tener al menos 12 caracteres").max(256),
});

/** Cambia la contraseña (se guarda el hash en BD) y cierra las demás sesiones. */
export async function POST(request: NextRequest) {
  let settings;
  try {
    ({ settings } = await requireSession());
  } catch {
    return unauthorizedResponse();
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  }
  const currentHash = settings.passwordHash ?? decodeHash(process.env.ADMIN_PASSWORD_HASH);
  if (!(await verifyPassword(parsed.data.current, currentHash))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    const { localDb } = await import("@/lib/db/sqlite-local");
    const nextHash = await hashPassword(parsed.data.next);
    localDb.prepare("UPDATE app_settings SET password_hash = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE id = 1").run(nextHash);
    const row = localDb.prepare("SELECT session_version FROM app_settings WHERE id = 1").get() as any;
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await signSession(row.session_version), sessionCookieOptions);
    return res;
  }
  const [row] = await db()
    .update(schema.appSettings)
    .set({
      passwordHash: await hashPassword(parsed.data.next),
      sessionVersion: sql`${schema.appSettings.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, 1))
    .returning({ sv: schema.appSettings.sessionVersion });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(row.sv), sessionCookieOptions);
  return res;
}
