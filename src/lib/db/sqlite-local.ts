import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), ".local_data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STORAGE_DIR = path.join(DATA_DIR, "storage");
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, "app.sqlite");
const sqlite = new DatabaseSync(dbPath);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    session_version INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT,
    default_ttl TEXT NOT NULL DEFAULT '7d',
    signature TEXT,
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO app_settings (id, session_version, password_hash, default_ttl, signature, updated_at)
  VALUES (1, 1, NULL, '7d', NULL, datetime('now'));

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    attempted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    page_count INTEGER,
    parent_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    draft_key TEXT,
    draft_updated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    storage_key TEXT NOT NULL,
    mime TEXT NOT NULL,
    original_name TEXT,
    size_bytes INTEGER NOT NULL,
    ttl_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    deleted_at TEXT,
    views INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS custom_fonts (
    id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export const localDb = sqlite;
export { DATA_DIR, STORAGE_DIR };
