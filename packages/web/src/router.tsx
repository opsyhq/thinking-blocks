import {
	createRootRoute,
	createRoute,
	createRouter,
	ErrorComponent,
	Link,
	Outlet,
} from "@tanstack/react-router"
import { ArtifactDetailPage } from "@/pages/ArtifactDetailPage"
import { BlockResourcesPage } from "@/pages/BlockResourcesPage"
import { BlocksPage } from "@/pages/BlocksPage"
import { ResourceArtifactsPage } from "@/pages/ResourceArtifactsPage"

function BrandMark({ className }: { className?: string }) {
	// Pixel-block mark — a square built from a 5x5 grid of little squares,
	// inherits currentColor. Cells live at multiples of 5 (4px cell, 1px gutter).
	const cells = [
		[0, 0], [5, 0], [15, 0],
		[0, 5], [10, 5], [20, 5],
		[0, 10], [10, 10], [15, 10],
		[5, 15], [15, 15],
		[0, 20], [20, 20],
	]
	return (
		<svg
			className={className}
			viewBox="-2 -2 28 28"
			fill="currentColor"
			shapeRendering="crispEdges"
			aria-hidden="true"
		>
			{cells.map(([x, y]) => (
				<rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" />
			))}
		</svg>
	)
}

function Shell() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
				<div className="flex h-12 items-center justify-between px-4">
					<Link
						to="/"
						className="inline-flex items-center gap-2 text-sm font-semibold tracking-normal text-foreground"
					>
						<BrandMark className="h-[18px] w-[18px] flex-none" />
						Thinking Blocks
					</Link>
					<nav className="flex items-center gap-3 text-xs text-muted-foreground">
						<Link
							to="/"
							activeProps={{ className: "text-foreground" }}
							className="hover:text-foreground"
						>
							Blocks
						</Link>
					</nav>
				</div>
			</header>
			<main className="mx-auto w-full max-w-[1480px] px-4 py-4">
				<Outlet />
			</main>
		</div>
	)
}

const rootRoute = createRootRoute({
	component: Shell,
	errorComponent: ({ error }) => (
		<div className="flex min-h-[60vh] items-center justify-center">
			<ErrorComponent error={error} />
		</div>
	),
	notFoundComponent: () => (
		<div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
			Not found
		</div>
	),
})

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: BlocksPage,
})

const blockRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/blocks/$blockName",
	component: BlockResourcesPage,
})

const resourceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/resources/$identityRef",
	component: ResourceArtifactsPage,
})

const artifactRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/artifacts/$artifactId",
	component: ArtifactDetailPage,
})

const routeTree = rootRoute.addChildren([
	indexRoute,
	blockRoute,
	resourceRoute,
	artifactRoute,
])

export const router = createRouter({
	routeTree,
	defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}
