#!/usr/bin/env node
// @thinking-blocks/cli — `thinking-blocks` / `tb`
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	DEFAULT_LOCAL_STORE_PATH,
	LocalThinkingBlockReader,
} from "@thinking-blocks/store-local"
import {
	createThinkingBlockDb,
	DrizzleThinkingBlockReader,
	migrate,
} from "@thinking-blocks/store-postgres"

// Auto-load a local .env (DATABASE_URL, model keys) from the working directory.
if (existsSync(".env")) process.loadEnvFile(".env")

function requireDatabaseUrl(): string {
	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL is not set.")
		process.exit(1)
	}
	return url
}

async function runMigrate(): Promise<void> {
	const { db, client } = createThinkingBlockDb(requireDatabaseUrl())
	await migrate(db)
	await client.end()
	console.log("Migrations applied.")
}

async function runDev(argv: string[]): Promise<void> {
	const { values } = parseArgs({
		args: argv,
		options: { port: { type: "string" }, path: { type: "string" } },
		allowPositionals: false,
	})
	const port = values.port ? Number(values.port) : 4500
	if (!Number.isInteger(port) || port <= 0) {
		console.error(`Invalid --port: ${values.port}`)
		process.exit(1)
	}

	// Pick the backend the way every other tool does: DATABASE_URL means
	// Postgres, its absence means the local file-backed world. Same dashboard,
	// either source.
	const databaseUrl = process.env.DATABASE_URL
	const storePath = values.path ?? DEFAULT_LOCAL_STORE_PATH
	const reader = databaseUrl
		? new DrizzleThinkingBlockReader(createThinkingBlockDb(databaseUrl).db)
		: new LocalThinkingBlockReader(storePath)

	const { startServer } = await import("@thinking-blocks/web/server")

	// The web package's built SPA lives at <web>/dist/client. Resolve the
	// package off its server entry so we don't bundle the web build.
	const serverEntry = fileURLToPath(
		import.meta.resolve("@thinking-blocks/web/server"),
	)
	const staticDir = join(dirname(serverEntry), "client")

	startServer({ reader, port, staticDir })
	console.log(`Thinking Blocks dashboard: http://localhost:${port}`)
	console.log(
		databaseUrl ? "Source: Postgres (DATABASE_URL)" : `Source: ${storePath}`,
	)
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2)
	switch (command) {
		case "migrate":
			await runMigrate()
			break
		case "dev":
			await runDev(rest)
			break
		default:
			console.error(
				command
					? `Unknown command: ${command}`
					: "Usage: tb <migrate|dev> [--port N] [--path FILE]",
			)
			process.exit(1)
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
