import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

export type TestDb = {
  db: PostgresJsDatabase<Record<string, never>>;
  client: Sql;
  schema: string;
  cleanup: () => Promise<void>;
};

/**
 * Create an isolated test database by spinning up a fresh schema in the
 * configured Postgres instance and pointing search_path at it. Tests that
 * exercise multi-module flows MUST use this rather than mocking the DB
 * (per CLAUDE.md §4).
 *
 * Usage:
 *   const t = await createTestDb();
 *   try {
 *     // run schema migrations against t.db, then test
 *   } finally {
 *     await t.cleanup();
 *   }
 */
export async function createTestDb(): Promise<TestDb> {
  const url =
    process.env["DATABASE_URL"] ?? "postgres://bdas:bdas@localhost:5432/bdas";
  const schema = `test_${randomSlug()}`;

  // 1. Create the schema using a one-shot connection.
  const setup = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await setup.unsafe(`CREATE SCHEMA "${schema}"`);
  } finally {
    await setup.end();
  }

  // 2. Open the test connection with search_path bound to the new schema.
  const client = postgres(url, {
    max: 3,
    onnotice: () => {},
    connection: { search_path: schema },
  });
  const db = drizzle(client);

  return {
    db,
    client,
    schema,
    cleanup: async () => {
      await client.end();
      const teardown = postgres(url, { max: 1, onnotice: () => {} });
      try {
        await teardown.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await teardown.end();
      }
    },
  };
}

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}
