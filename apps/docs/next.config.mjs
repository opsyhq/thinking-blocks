import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	// Fully static site (landing + SSG docs, static search index) — emit a
	// plain `out/` directory we can host on Cloudflare with no runtime.
	output: "export",
	images: { unoptimized: true },
}

export default withMDX(config)
