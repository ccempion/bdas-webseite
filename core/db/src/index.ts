import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

/**
 * Drizzle database client. The actual schema type is `unknown` here because
 * each module declares its own tables; consumers cast the returned client
 * to a schema-augmented type via `getDb<typeof schema>()` if they need
 * autocompletion against tables.
 */
export type Db = PostgresJsDatabase<Record<string, never>>;

let _client: Sql | null = null;
let _db: Db | null = null;

/** Get (or lazily create) the singleton database client. */
export function getDb(): Db {
  if (_db) return _db;
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and start the local DB with `pnpm db:up`.",
    );
  }
  // Runtime connects through Supabase's transaction pooler (port 6543), which
  // does not support prepared statements and recycles server connections per
  // transaction. Serverless keeps many warm instances, each with its own pool,
  // so the per-instance ceiling stays low to avoid exhausting the pooler. See
  // ADR 0015. Migrations use the session pooler via their own client.
  _client = postgres(url, {
    max: process.env["NODE_ENV"] === "production" ? 3 : 5,
    prepare: false,
    // Fail fast instead of blocking the serverless function to its 504 timeout.
    // Without these, a connection (or transaction-pooler server slot) that never
    // becomes available makes the request hang until Vercel kills it — heavy
    // board pages issue ~10 round-trips, so they hit the stall first. See ADR 0015.
    connect_timeout: 10, // s — give up acquiring a connection after 10s
    idle_timeout: 20, // s — drop idle connections so stale pooler sockets get recycled
    // statement_timeout is a Postgres GUC (ms): caps any single query so a stuck
    // statement can't pin the function. Sent via the startup packet; Supabase's
    // transaction pooler forwards it. Verify on a preview deploy before prod.
    connection: { statement_timeout: 8000 },
    onnotice: () => {},
  });
  _db = drizzle(_client);
  return _db;
}

/** Close the singleton client. Call from app shutdown hooks and at test teardown. */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

/** Run a function inside a transaction. Rolls back on throw. */
export async function withTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => fn(tx as Db));
}
