import type { ReactNode } from "react"

// The landing owns its full canvas (dark, custom nav) — no Fumadocs HomeLayout
// chrome here. Docs routes keep their own themed layout.
export default function Layout({ children }: { children: ReactNode }) {
	return children
}
