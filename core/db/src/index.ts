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
  _client = postgres(url, {
    max: process.env["NODE_ENV"] === "production" ? 10 : 5,
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
