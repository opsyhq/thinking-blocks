// @thinking-blocks/web/server
// Hono server that serves the dashboard SPA and the read-only audit/trace API.
//
// Routes mirror the five read endpoints the dashboard talks to. Each one parses
// its query string with the zod schema that owns it (from @thinking-blocks/core)
// and hands the typed result to the matching ThinkingBlockReader method. The
// reader is backend-agnostic (Postgres or in-memory both satisfy it) so this
// server never touches a database directly. There is no auth middleware: this
// runs behind whatever access boundary the host already enforces.

import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import {
	decodeArtifactIdentityRef,
	InvalidCursorError,
	listArtifactVersionsQuerySchema,
	listBlocksQuerySchema,
	listResourcesQuerySchema,
	searchQuerySchema,
	type ThinkingBlockReader,
} from "@thinking-blocks/core"
import { Hono } from "hono"

export function createServer(reader: ThinkingBlockReader) {
	const app = new Hono()

	// Single boundary that turns a store error into the matching JSON response:
	// a bad cursor is the client's fault (400); everything else is a 500.
	app.onError((error, c) => {
		if (error instanceof InvalidCursorError)
			return c.json({ error: error.message, status: 400 }, 400)
		return c.json({ error: "Internal error", status: 500 }, 500)
	})

	app.get("/thinking-block/blocks", async (c) => {
		const parsed = listBlocksQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			return c.json({ error: "Invalid request", status: 400 }, 400)
		return c.json(await reader.listBlocks(parsed.data))
	})

	app.get("/thinking-block/blocks/:blockName/resources", async (c) => {
		const parsed = listResourcesQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			return c.json({ error: "Invalid request", status: 400 }, 400)
		return c.json(
			await reader.listBlockResources(c.req.param("blockName"), parsed.data),
		)
	})

	app.get("/thinking-block/resources/:identityRef/artifacts", async (c) => {
		const identity = decodeArtifactIdentityRef(c.req.param("identityRef"))
		if (!identity) return c.json({ error: "Not found", status: 404 }, 404)
		const parsed = listArtifactVersionsQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			return c.json({ error: "Invalid request", status: 400 }, 400)
		return c.json(await reader.listArtifactVersions(identity, parsed.data))
	})

	app.get("/thinking-block/artifacts/:artifactId", async (c) => {
		const detail = await reader.getArtifactDetail(c.req.param("artifactId"))
		if (!detail) return c.json({ error: "Not found", status: 404 }, 404)
		return c.json(detail)
	})

	app.get("/thinking-block/search", async (c) => {
		const parsed = searchQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			return c.json({ error: "Invalid request", status: 400 }, 400)
		return c.json(await reader.searchArtifacts(parsed.data))
	})

	return app
}

// Serve the built SPA (dist/client) for every non-API route, falling back to
// index.html so client-side routing keeps working on deep links and refreshes.
export function serveSpa(app: Hono, staticDir: string) {
	const root = staticDir.replace(/\/$/, "")
	app.use(
		"*",
		serveStatic({
			root,
			rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
		}),
	)
	app.get("*", serveStatic({ root, path: "index.html" }))
	return app
}

export type StartServerOptions = {
	reader: ThinkingBlockReader
	port?: number
	staticDir?: string
}

export function startServer({
	reader,
	port = 4500,
	staticDir,
}: StartServerOptions) {
	const app = createServer(reader)
	if (staticDir) serveSpa(app, staticDir)
	return serve({ fetch: app.fetch, port })
}
