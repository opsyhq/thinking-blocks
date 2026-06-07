import Link from "next/link"

export default function HomePage() {
	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
			<h1 className="max-w-3xl text-3xl font-semibold sm:text-4xl">
				A warehouse serves what you put in. A factory makes what you ask for.
			</h1>
			<p className="max-w-2xl text-fd-muted-foreground">
				Today's software is a warehouse — it shelves data and 404s on a miss. A
				Thinking Block is a factory: call <code>.get(input)</code> and you
				always get a finished part, made to spec and kept on its serial. The
				next order ships cold. The catalog is infinite.
			</p>
			<pre className="max-w-2xl overflow-x-auto rounded-lg bg-fd-muted p-4 text-left text-sm">
				<code>{`const facts = await nutrition.get({ food: "dragon fruit" })`}</code>
			</pre>
			<div className="flex flex-wrap items-center justify-center gap-3">
				<Link
					href="/docs"
					className="rounded-full bg-fd-primary px-6 py-2 font-medium text-fd-primary-foreground"
				>
					Read the docs
				</Link>
				<Link
					href="/docs/quickstart"
					className="rounded-full border px-6 py-2 font-medium"
				>
					Quickstart
				</Link>
			</div>
		</main>
	)
}
