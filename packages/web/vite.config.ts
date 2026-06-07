import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": new URL("./src", import.meta.url).pathname,
		},
	},
	build: {
		outDir: "dist/client",
	},
	server: {
		port: 3001,
		proxy: {
			"/thinking-block": {
				target: "http://localhost:4500",
			},
		},
	},
})
