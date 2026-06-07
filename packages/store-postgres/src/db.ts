import { fileURLToPath } from "node:url"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { migrate as runMigrations } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import * as schema from "./schema"

type Db = PostgresJsDatabase<typeof schema>

/** `db` or a drizzle transaction — use for helpers that work in both. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Build a postgres-js client and drizzle db wired to the Thinking Blocks
 * schema. The raw `client` is returned so callers can close the pool.
 */
export function createThinkingBlockDb(connectionString: string): {
	db: Db
	client: postgres.Sql
} {
	const client = postgres(connectionString)
	const db = drizzle(client, { schema })
	return { db, client }
}

/**
 * Apply the migrations bundled with this package. The `./drizzle` folder is
 * resolved relative to this module so it works from `dist`.
 */
export async function migrate(db: Db): Promise<void> {
	const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))
	await runMigrations(db, { migrationsFolder })
}
