import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSettings } from "./settings";
import { SESSION_COOKIE, verifySession } from "./session";

export class UnauthorizedError extends Error {}

/**
 * Verificación completa de sesión para route handlers: firma + versión vigente en BD
 * (así "cerrar sesión en todos los dispositivos" invalida tokens ya emitidos).
 */
// Los ajustes casi nunca cambian: se reutilizan unos segundos por instancia para no hacer una
// consulta a la BD en cada llamada de la API. "Cerrar sesión en todos" y el cambio de contraseña
// lo invalidan al instante en su instancia y, en las demás, a lo sumo tras SETTINGS_TTL_MS.
const SETTINGS_TTL_MS = 10_000;
let cached: { at: number; settings: Awaited<ReturnType<typeof getSettings>> } | undefined;

export function invalidateSettingsCache() {
  cached = undefined;
}

export async function requireSession({ fresh = false }: { fresh?: boolean } = {}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) throw new UnauthorizedError();
  if (fresh || !cached || Date.now() - cached.at > SETTINGS_TTL_MS) {
    cached = { at: Date.now(), settings: await getSettings() };
  }
  const settings = cached.settings;
  if (session.sv !== settings.sessionVersion) throw new UnauthorizedError();
  return { session, settings };
}

export function unauthorizedResponse() {
  const res = NextResponse.json({ error: "Sesión no válida o vencida" }, { status: 401 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
