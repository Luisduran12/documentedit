import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decodeHash, verifyPassword } from "@/lib/auth/password";
import { clearFailures, clientIp, MAX_FAILED, progressiveDelayMs, recentFailures, recordFailure, WINDOW_MS } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/auth/settings";

const Body = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });

  const ip = clientIp(request.headers);
  const failures = await recentFailures(ip);
  if (failures >= MAX_FAILED) {
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Espera ${Math.round(WINDOW_MS / 60000)} minutos e inténtalo de nuevo.` },
      { status: 429 },
    );
  }

  await new Promise((r) => setTimeout(r, progressiveDelayMs(failures)));

  const settings = await getSettings();
  const hash = settings.passwordHash ?? decodeHash(process.env.ADMIN_PASSWORD_HASH);
  const ok = await verifyPassword(parsed.data.password, hash);

  if (!ok) {
    await recordFailure(ip);
    const left = MAX_FAILED - failures - 1;
    return NextResponse.json(
      { error: left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento${left === 1 ? "" : "s"}.` : "Contraseña incorrecta. Acceso bloqueado temporalmente." },
      { status: 401 },
    );
  }

  await clearFailures(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(settings.sessionVersion), sessionCookieOptions);
  return res;
}
