/**
 * Postgres storage (used when DATABASE_URL is set, e.g. on Vercel + Neon).
 * The whole app state is one JSONB document in one row, so the rest of the app
 * keeps working with the same in-memory DB shape. Writes lock the row
 * (SELECT … FOR UPDATE) so concurrent requests can't overwrite each other.
 */
export interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

const TABLE = "jalnetra_store";
const ROW = 1;

export async function ensureTable(c: SqlClient) {
  await c.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

export async function readDoc(c: SqlClient): Promise<unknown | null> {
  const r = await c.query(`SELECT data FROM ${TABLE} WHERE id = $1`, [ROW]);
  return r.rows[0]?.data ?? null;
}

/** Runs `fn` on the locked document inside a transaction and saves the result. */
export async function mutateDoc<T>(c: SqlClient, empty: unknown, fn: (doc: unknown) => Promise<{ doc: unknown; result: T }>): Promise<T> {
  await c.query("BEGIN");
  try {
    await c.query(`INSERT INTO ${TABLE} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`, [ROW, JSON.stringify(empty)]);
    const r = await c.query(`SELECT data FROM ${TABLE} WHERE id = $1 FOR UPDATE`, [ROW]);
    const { doc, result } = await fn(r.rows[0].data);
    await c.query(`UPDATE ${TABLE} SET data = $2::jsonb, updated_at = now() WHERE id = $1`, [ROW, JSON.stringify(doc)]);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}
