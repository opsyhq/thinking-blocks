// Ambient declaration so side-effect CSS imports (e.g. "fumadocs-ui/style.css")
// type-check under moduleResolution: bundler during `next build`.
declare module "*.css" {
	const content: string
	export default content
}
