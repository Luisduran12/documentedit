import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { localDb } from "@/lib/db/sqlite-local";

function getLocalSettings() {
  const row = localDb.prepare("SELECT * FROM app_settings WHERE id = 1").get() as any;
  if (!row) {
    localDb.prepare("INSERT INTO app_settings (id, session_version, default_ttl, updated_at) VALUES (1, 1, '7d', datetime('now'))").run();
    return {
      id: 1,
      sessionVersion: 1,
      passwordHash: null,
      defaultTtl: "7d",
      signature: null,
      updatedAt: new Date(),
    };
  }
  return {
    id: row.id,
    sessionVersion: row.session_version,
    passwordHash: row.password_hash,
    defaultTtl: row.default_ttl,
    signature: row.signature ? JSON.parse(row.signature) : null,
    updatedAt: new Date(row.updated_at),
  };
}

/** Devuelve la fila única de ajustes, creándola si no existe. */
export async function getSettings() {
  if (!process.env.DATABASE_URL) {
    return getLocalSettings();
  }
  const rows = await db().select().from(schema.appSettings).where(eq(schema.appSettings.id, 1));
  if (rows[0]) return rows[0];
  const inserted = await db().insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return inserted[0] ?? (await db().select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)))[0];
}

export async function bumpSessionVersion() {
  if (!process.env.DATABASE_URL) {
    localDb.prepare("UPDATE app_settings SET session_version = session_version + 1, updated_at = datetime('now') WHERE id = 1").run();
    const row = localDb.prepare("SELECT session_version FROM app_settings WHERE id = 1").get() as any;
    return row.session_version;
  }
  await getSettings();
  const [row] = await db()
    .update(schema.appSettings)
    .set({ sessionVersion: sql`${schema.appSettings.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(schema.appSettings.id, 1))
    .returning({ sv: schema.appSettings.sessionVersion });
  return row.sv;
}
