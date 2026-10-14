import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Document } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { deleteObjects } from "@/lib/storage/r2";
import { localDb } from "@/lib/db/sqlite-local";

const d = schema.documents;

/** Una fila es la "cabeza" (versión vigente) si ninguna otra la tiene como parent_id. */
const isHead = sql`not exists (select 1 from ${d} as c where c.parent_id = ${d.id})`;

export type DocumentDTO = ReturnType<typeof toDTO>;

function fromLocalRow(r: any): Document {
  return {
    id: r.id,
    name: r.name,
    storageKey: r.storage_key,
    sizeBytes: r.size_bytes,
    pageCount: r.page_count ?? null,
    parentId: r.parent_id ?? null,
    version: r.version,
    draftKey: r.draft_key ?? null,
    draftUpdatedAt: r.draft_updated_at ? new Date(r.draft_updated_at) : null,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    deletedAt: r.deleted_at ? new Date(r.deleted_at) : null,
  };
}

export function toDTO(row: Document) {
  return {
    id: row.id,
    name: row.name,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    version: row.version,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    hasDraft: Boolean(row.draftKey && row.draftUpdatedAt && row.draftUpdatedAt > row.updatedAt),
    draftUpdatedAt: row.draftUpdatedAt?.toISOString() ?? null,
  };
}

export async function listDocuments({ q, trash }: { q?: string; trash?: boolean }) {
  if (!process.env.DATABASE_URL) {
    let query = `
      SELECT * FROM documents d
      WHERE NOT EXISTS (SELECT 1 FROM documents c WHERE c.parent_id = d.id)
      AND ${trash ? "d.deleted_at IS NOT NULL" : "d.deleted_at IS NULL"}
    `;
    const params: any[] = [];
    if (q) {
      query += ` AND d.name LIKE ?`;
      params.push(`%${q}%`);
    }
    query += ` ORDER BY ${trash ? "d.deleted_at" : "d.updated_at"} DESC LIMIT 500`;
    const rows = localDb.prepare(query).all(...params) as any[];
    return rows.map(fromLocalRow).map(toDTO);
  }
  const where = [isHead, trash ? isNotNull(d.deletedAt) : isNull(d.deletedAt)];
  if (q) where.push(ilike(d.name, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const rows = await db()
    .select()
    .from(d)
    .where(and(...where))
    .orderBy(trash ? desc(d.deletedAt) : desc(d.updatedAt))
    .limit(500);
  return rows.map(toDTO);
}

export async function getDocument(id: string) {
  if (!process.env.DATABASE_URL) {
    const row = localDb.prepare("SELECT * FROM documents WHERE id = ?").get(id) as any;
    if (!row) throw new HttpError(404, "Documento no encontrado");
    return fromLocalRow(row);
  }
  const [row] = await db().select().from(d).where(eq(d.id, id));
  if (!row) throw new HttpError(404, "Documento no encontrado");
  return row;
}

export async function getHead(id: string) {
  const row = await getDocument(id);
  if (!process.env.DATABASE_URL) {
    const child = localDb.prepare("SELECT id FROM documents WHERE parent_id = ? LIMIT 1").get(id);
    if (child) throw new HttpError(409, "Esta no es la versión vigente del documento");
    return row;
  }
  const [child] = await db().select({ id: d.id }).from(d).where(eq(d.parentId, id)).limit(1);
  if (child) throw new HttpError(409, "Esta no es la versión vigente del documento");
  return row;
}

/** Cadena de versiones desde la indicada hacia atrás (más reciente primero). */
export async function versionChain(id: string): Promise<Document[]> {
  if (!process.env.DATABASE_URL) {
    const rows: Document[] = [];
    let curId: string | null = id;
    while (curId) {
      const r = localDb.prepare("SELECT * FROM documents WHERE id = ?").get(curId) as any;
      if (!r) break;
      const doc = fromLocalRow(r);
      rows.push(doc);
      curId = doc.parentId;
    }
    return rows.sort((a, b) => b.version - a.version);
  }
  const result = await db().execute(sql`
    with recursive chain as (
      select * from ${d} where id = ${id}
      union all
      select p.* from ${d} p join chain on p.id = chain.parent_id
    )
    select id from chain
  `);
  const ids = (result.rows as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db().select().from(d).where(sql`${d.id} in ${ids}`);
  return rows.sort((a, b) => b.version - a.version);
}

/** Elimina definitivamente la cadena completa de versiones y sus objetos en R2. */
export async function purgeDocument(id: string) {
  const chain = await versionChain(id);
  const keys = chain.flatMap((r) => [r.storageKey, r.draftKey].filter(Boolean) as string[]);
  await deleteObjects(keys);
  const ids = chain.map((r) => r.id);
  if (ids.length) {
    if (!process.env.DATABASE_URL) {
      for (const curId of ids) {
        localDb.prepare("DELETE FROM documents WHERE id = ?").run(curId);
      }
    } else {
      await db().delete(d).where(sql`${d.id} in ${ids}`);
    }
  }
  return ids.length;
}

/** Cabezas en la papelera desde hace más de `days` días (las purga el cron). */
export async function expiredTrash(days: number) {
  if (!process.env.DATABASE_URL) {
    const before = new Date(Date.now() - days * 86400_000).toISOString();
    const rows = localDb.prepare(`
      SELECT id FROM documents d
      WHERE NOT EXISTS (SELECT 1 FROM documents c WHERE c.parent_id = d.id)
      AND d.deleted_at IS NOT NULL AND d.deleted_at < ?
    `).all(before) as any[];
    return rows.map((r) => ({ id: r.id }));
  }
  const before = new Date(Date.now() - days * 86400_000);
  return db()
    .select({ id: d.id })
    .from(d)
    .where(and(isHead, isNotNull(d.deletedAt), lt(d.deletedAt, before)));
}

/** Versión vigente (la de mayor número) de la cadena a la que pertenece `id`. */
export async function latestHeadId(id: string): Promise<string> {
  if (!process.env.DATABASE_URL) {
    const chain = await versionChain(id);
    return chain[0]?.id ?? id;
  }
  const res = await db().execute(sql`
    with recursive descendants as (
      select id, version from ${d} where id = ${id}
      union all
      select c.id, c.version from ${d} c join descendants x on c.parent_id = x.id
    )
    select id from descendants order by version desc limit 1
  `);
  return (res.rows[0] as { id: string } | undefined)?.id ?? id;
}
