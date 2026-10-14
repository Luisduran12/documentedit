import { NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/auth/dal";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { bumpSessionVersion } from "@/lib/auth/settings";

/** Invalida todas las sesiones emitidas (incluida la actual). */
export async function POST() {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }
  await bumpSessionVersion();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
