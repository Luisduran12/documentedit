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
export async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) throw new UnauthorizedError();
  const settings = await getSettings();
  if (session.sv !== settings.sessionVersion) throw new UnauthorizedError();
  return { session, settings };
}

export function unauthorizedResponse() {
  const res = NextResponse.json({ error: "Sesión no válida o vencida" }, { status: 401 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
