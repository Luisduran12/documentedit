import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    pageCount: integer("page_count"),
    parentId: uuid("parent_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    draftKey: text("draft_key"),
    draftUpdatedAt: tz("draft_updated_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [index("documents_deleted_updated_idx").on(t.deletedAt, t.updatedAt.desc())],
);

export const shares = pgTable(
  "shares",
  {
    id: text("id").primaryKey(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    originalName: text("original_name"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    ttlLabel: text("ttl_label").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    expiresAt: tz("expires_at").notNull(),
    deletedAt: tz("deleted_at"),
    views: integer("views").notNull().default(0),
  },
  (t) => [index("shares_expires_idx").on(t.expiresAt).where(sql`${t.deletedAt} is null`)],
);

export const customFonts = pgTable("custom_fonts", {
  id: uuid("id").primaryKey().defaultRandom(),
  family: text("family").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ip: text("ip").notNull(),
    attemptedAt: tz("attempted_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_idx").on(t.ip, t.attemptedAt)],
);

/**
 * Fila única (id = 1) con ajustes de la cuenta:
 * - sessionVersion: al incrementarla se invalidan todas las sesiones ("cerrar sesión en todos los dispositivos").
 * - passwordHash: si existe, reemplaza a ADMIN_PASSWORD_HASH (permite cambiar la contraseña desde la app).
 * - signature: firma manuscrita reutilizable (trazos normalizados).
 */
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    sessionVersion: integer("session_version").notNull().default(1),
    passwordHash: text("password_hash"),
    defaultTtl: text("default_ttl").notNull().default("7d"),
    signature: jsonb("signature"),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("app_settings_singleton", sql`${t.id} = 1`)],
);

export type Document = typeof documents.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type CustomFont = typeof customFonts.$inferSelect;
