/**
 * Cloudflare D1 storage (used when STORAGE=d1, i.e. when running on Cloudflare Workers).
 * Same model as the Postgres store: the whole app state is one JSON document in one row.
 * D1 has no row locks, so writes use optimistic concurrency: a `version` column that must
 * still match when we save; if another request saved first, we re-read and retry.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface D1Like {
  prepare(sql: string): { bind(...v: unknown[]): D1Stmt } & D1Stmt;
}
interface D1Stmt {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

let ready: Promise<void> | null = null;

async function d1(): Promise<D1Like> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Like }).DB;
  if (!db) throw new Error("D1 binding 'DB' is missing (check wrangler.jsonc)");
  if (!ready) {
    ready = db
      .prepare("CREATE TABLE IF NOT EXISTS jalnetra_store (id INTEGER PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)")
      .run()
      .then(() => undefined)
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  await ready;
  return db;
}

export async function d1Read(): Promise<unknown | null> {
  const row = await (await d1()).prepare("SELECT data FROM jalnetra_store WHERE id = 1").first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

export async function d1Mutate<T>(empty: unknown, fn: (doc: unknown) => Promise<{ doc: unknown; result: T }>): Promise<T> {
  const db = await d1();
  await db.prepare("INSERT OR IGNORE INTO jalnetra_store (id, data, version) VALUES (1, ?, 0)").bind(JSON.stringify(empty)).run();
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await db.prepare("SELECT data, version FROM jalnetra_store WHERE id = 1").first<{ data: string; version: number }>();
    const { doc, result } = await fn(JSON.parse(row!.data));
    const r = await db
      .prepare("UPDATE jalnetra_store SET data = ?, version = version + 1 WHERE id = 1 AND version = ?")
      .bind(JSON.stringify(doc), row!.version)
      .run();
    if (r.meta.changes === 1) return result;
    await new Promise((res) => setTimeout(res, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("The database is busy, please try again");
}
