import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { localDb } from "@/lib/db/sqlite-local";

export const MAX_FAILED = 5;
export const WINDOW_MS = 15 * 60 * 1000;

export function clientIp(headers: Headers) {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
}

/** Retraso progresivo según fallos previos: 0, 0.5, 1, 2, 4 s… (máx. 8 s). */
export function progressiveDelayMs(failures: number) {
  return failures === 0 ? 0 : Math.min(500 * 2 ** (failures - 1), 8000);
}

export async function recentFailures(ip: string) {
  if (!process.env.DATABASE_URL) {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const row = localDb.prepare("SELECT COUNT(*) as n FROM login_attempts WHERE ip = ? AND attempted_at >= ?").get(ip, since) as any;
    return row?.n ?? 0;
  }
  const since = new Date(Date.now() - WINDOW_MS);
  const [row] = await db()
    .select({ n: count() })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.ip, ip), gte(schema.loginAttempts.attemptedAt, since)));
  return row?.n ?? 0;
}

export async function recordFailure(ip: string) {
  if (!process.env.DATABASE_URL) {
    localDb.prepare("INSERT INTO login_attempts (ip, attempted_at) VALUES (?, datetime('now'))").run(ip);
    return;
  }
  await db().insert(schema.loginAttempts).values({ ip });
}

export async function clearFailures(ip: string) {
  if (!process.env.DATABASE_URL) {
    localDb.prepare("DELETE FROM login_attempts WHERE ip = ?").run(ip);
    return;
  }
  await db().delete(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip));
}
