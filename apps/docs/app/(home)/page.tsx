import Link from "next/link"
import "./landing.css"

const STEPS = [
	{
		n: "1",
		title: "An order comes in",
		body: 'An input is the order: { food: "dragon fruit" }. Its identity is the serial number — same order, same part, forever.',
	},
	{
		n: "2",
		title: "The machine runs",
		body: "Your AI agent works the raw material to spec — a Zod schema. Structured, typed output, not a blob of text.",
	},
	{
		n: "3",
		title: "QC gates it",
		body: "check is a code caliper; judge is a model inspector. A part that fails is reworked with the feedback, not shipped.",
	},
	{
		n: "4",
		title: "Kept on its serial",
		body: "The finished part is stamped and stored. The next .get() with the same identity ships cold — no model call.",
	},
]

const FEATURES = [
	{
		e: "🔁",
		title: "Identity-cached",
		body: "Same input → same part, forever. No cache key to invent, no row to miss.",
	},
	{
		e: "✅",
		title: "Validated before kept",
		body: "Deterministic checks and model judges gate every output. Bad parts get reworked, not stored.",
	},
	{
		e: "🧾",
		title: "Versioned & content-addressed",
		body: "Change the recipe and old parts are superseded, not overwritten. Every part is traceable.",
	},
	{
		e: "💾",
		title: "Durable by default",
		body: "A file on disk for local, Postgres for production. Parts and their travelers survive restarts.",
	},
	{
		e: "📡",
		title: "Observable",
		body: "A no-login dashboard shows every block, part, model call, and QC result. tb dev, one port.",
	},
	{
		e: "🎯",
		title: "One tiny API",
		body: ".get(input) hands you the part, making it if it never existed. .generate() forces a fresh run.",
	},
]

const WILD = [
	{
		call: "resourceRelationships.get({ resource, type, version })",
		body: "which fields point at other resources, and how — a validated directional graph.",
	},
	{
		call: "resourceTypeMetadata.get({ provider, kind, type, schemaHash })",
		body: "a human product name and diagram footprint for an unknown type.",
	},
	{
		call: "resourceFieldLayout.get({ provider, kind, type, fields })",
		body: "every schema field arranged into a real, sectioned form.",
	},
	{
		call: "resourceFieldMetadata.get({ … })",
		body: "per-field labels, actionable help, and icons.",
	},
	{
		call: "resourceTypeIcon.get({ provider, type })",
		body: "a real icon asset, verified to exist before it is stored.",
	},
]

export default function HomePage() {
	return (
		<main className="tb-landing">
			{/* ── Hero ─────────────────────────────────────────────── */}
			<section className="tb-hero">
				<span className="tb-eyebrow">
					Open source · TypeScript · <b>Apache-2.0</b>
				</span>
				<h1 className="tb-hero-title">
					Don't fetch the answer.{" "}
					<span className="tb-mark">Manufacture it.</span>
				</h1>
				<p className="tb-hero-sub">
					Today's software is a warehouse — it shelves data and 404s on a miss.
					A Thinking Block is a factory: call <code>.get(input)</code> and you
					always get a finished part — built to spec, passed through QC, kept on
					its serial. The next order ships cold. The catalog is infinite.
				</p>
				<div className="tb-cta-row">
					<Link className="tb-btn tb-btn-primary" href="/docs/quickstart">
						Start building →
					</Link>
					<Link className="tb-btn tb-btn-ghost" href="/docs">
						Read the docs
					</Link>
				</div>

				<div className="tb-line" aria-hidden="true">
					<div className="tb-belt">
						<span className="tb-part tb-part-1">🍌</span>
						<span className="tb-part tb-part-2">🥝</span>
						<span className="tb-part tb-part-3">🍕</span>
						<span className="tb-bin">
							📦<span>⚡</span>
						</span>
					</div>
					<div className="tb-stations">
						<span>order</span>
						<span>make</span>
						<span>QC ✓</span>
						<span>keep</span>
						<span>cached</span>
					</div>
				</div>
			</section>

			{/* ── The line ─────────────────────────────────────────── */}
			<section className="tb-section">
				<div className="tb-wrap">
					<p className="tb-kicker">The line, end to end</p>
					<h2 className="tb-h2">Four stations. One function call.</h2>
					<p className="tb-lead">
						You never load a row and hope it's there. You call the block — and
						if the part was never made, the line makes it now, the same way
						every time.
					</p>
					<div className="tb-steps">
						{STEPS.map((s) => (
							<div className="tb-step" key={s.n}>
								<span className="tb-step-n">{s.n}</span>
								<h3>{s.title}</h3>
								<p>{s.body}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── .get() never misses ──────────────────────────────── */}
			<section className="tb-section">
				<div className="tb-wrap">
					<p className="tb-kicker">The whole point</p>
					<h2 className="tb-h2">
						<code>.get()</code> never misses.
					</h2>
					<p className="tb-lead">
						The first call manufactures the part. The second call — same serial
						— ships the same part cold, with no model call. Nothing to cache,
						nothing to invalidate, nothing to 404.
					</p>
					<div className="tb-code">
						<div className="tb-code-bar">
							<i />
							<i />
							<i />
						</div>
						<pre>
							<code>
								{`const first  = await nutrition.`}
								<span className="k">get</span>
								{`({ food: "dragon fruit" }) `}
								<span className="c">{"// makes it · ~3s"}</span>
								{"\n"}
								{`const second = await nutrition.`}
								<span className="k">get</span>
								{`({ food: "dragon fruit" }) `}
								<span className="g">{'// source: "cached" · 0ms'}</span>
							</code>
						</pre>
					</div>
				</div>
			</section>

			{/* ── Features ─────────────────────────────────────────── */}
			<section className="tb-section">
				<div className="tb-wrap">
					<p className="tb-kicker">What every block gives you</p>
					<h2 className="tb-h2">A capability, not a prompt.</h2>
					<div className="tb-features">
						{FEATURES.map((f) => (
							<div className="tb-feat" key={f.title}>
								<div className="e">{f.e}</div>
								<h3>{f.title}</h3>
								<p>{f.body}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── In the wild ──────────────────────────────────────── */}
			<section className="tb-section">
				<div className="tb-wrap">
					<p className="tb-kicker">Machines in the wild</p>
					<h2 className="tb-h2">Born inside Opsy.</h2>
					<p className="tb-lead">
						Five blocks turn messy, schema-shaped Terraform data into product UI
						— each called as <code>.get({"{…}"})</code> and cached on identity.
					</p>
					<div className="tb-wild">
						{WILD.map((w) => (
							<div className="tb-wild-row" key={w.call}>
								<code>{w.call}</code>
								<span>{w.body}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── Final CTA ────────────────────────────────────────── */}
			<section className="tb-final">
				<p className="tb-kicker">Put a machine on the line</p>
				<h2 className="tb-h2" style={{ marginInline: "auto" }}>
					Ship your first block in five minutes.
				</h2>
				<div className="tb-install">
					<b>npm</b> install thinking-blocks ai zod
				</div>
				<div className="tb-cta-row">
					<Link className="tb-btn tb-btn-primary" href="/docs/quickstart">
						Quickstart →
					</Link>
					<a
						className="tb-btn tb-btn-ghost"
						href="https://github.com/opsyhq/thinking-blocks"
					>
						★ Star on GitHub
					</a>
				</div>
			</section>

			<footer className="tb-foot">
				<span>Apache-2.0</span>
				<a href="https://github.com/opsyhq/thinking-blocks">GitHub</a>
				<Link href="/docs">Docs</Link>
				<a href="https://www.npmjs.com/package/thinking-blocks">npm</a>
			</footer>
		</main>
	)
}
