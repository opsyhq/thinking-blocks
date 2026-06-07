import { defineConfig } from "tsdown"

export default defineConfig({
	entry: ["src/server.ts"],
	format: "esm",
	// Use the node project config (node types, no project references) so the
	// dts plugin can load the server entry; the root tsconfig uses references.
	tsconfig: "tsconfig.node.json",
	dts: true,
	clean: false,
})
