import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/source"

// Static search: the index is built at compile time and served as a static
// JSON, so the whole site stays a static export (no server at runtime). The
// client fetches it once and searches in-browser. See RootProvider's
// search={{ options: { type: "static" } }} in app/layout.tsx.
export const revalidate = false
export const { staticGET: GET } = createFromSource(source)
