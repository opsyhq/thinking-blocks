import { defineConfig } from "tsdown"

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	dts: true,
	clean: true,
	// The CLI is a thin bin: resolve its workspace deps at runtime from
	// node_modules rather than inlining the web/store builds into the bin.
	deps: {
		neverBundle: [
			"@thinking-blocks/store-postgres",
			"@thinking-blocks/web/server",
		],
	},
})
