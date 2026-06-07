import Link from "next/link"
import "./landing.css"

const STEPS = [
	{
		n: "01",
		title: "An order arrives",
		body: 'The input is the order — { food: "dragon fruit" }. Its hash is the serial number. Same order, same part, forever.',
	},
	{
		n: "02",
		title: "The machine runs",
		body: "Your agent works the raw material to spec — a Zod schema in, structured typed output out. Never a blob of text.",
	},
	{
		n: "03",
		title: "QC gates it",
		body: "check is a code caliper. judge is a model inspector. A part that fails is reworked with the feedback, not shipped.",
	},
	{
		n: "04",
		title: "Kept on its serial",
		body: "The finished part is stamped and stored. The next .get() with the same identity ships cold — no model call.",
	},
]

const FEATURES = [
	{
		k: "Identity-cached",
		body: "Same input resolves to the same part, forever. No cache key to invent, no row to miss, no TTL to tune.",
	},
	{
		k: "Validated before kept",
		body: "Deterministic checks and model judges gate every output. Bad parts are reworked with feedback, never stored.",
	},
	{
		k: "Content-addressed",
		body: "Change the recipe and old parts are superseded, not overwritten. Every part is versioned and traceable.",
	},
	{
		k: "Durable by default",
		body: "A file on disk for local, Postgres for production. Parts and their run history survive restarts.",
	},
	{
		k: "Observable",
		body: "A no-login dashboard shows every block, part, model call, and QC result. One command, one port.",
	},
	{
		k: "One tiny API",
		body: ".get(input) hands you the part, manufacturing it if it never existed. .generate() forces a fresh run.",
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
		<div className="tb">
			<header className="tb-nav">
				<div className="tb-nav-inner">
					<Link className="tb-brand" href="/">
						<span className="tb-logo" aria-hidden="true" />
						Thinking Blocks
					</Link>
					<nav className="tb-nav-links">
						<Link href="/docs">Docs</Link>
						<a href="https://github.com/opsyhq/thinking-blocks">GitHub</a>
						<a href="https://www.npmjs.com/package/thinking-blocks">npm</a>
						<Link className="tb-nav-cta" href="/docs/quickstart">
							Get started
						</Link>
					</nav>
				</div>
			</header>

			<main className="tb-main">
				{/* ── Hero ───────────────────────────────────────────── */}
				<section className="tb-hero">
					<div className="tb-hero-glow" aria-hidden="true" />
					<span className="tb-eyebrow">
						Open source · TypeScript · Apache-2.0
					</span>
					<h1 className="tb-hero-title">
						Don't fetch the answer.
						<br />
						<span className="tb-mark">Manufacture it.</span>
					</h1>
					<p className="tb-hero-sub">
						Today's software is a warehouse — it shelves data and 404s on a
						miss. A Thinking Block is a factory: call <code>.get(input)</code>{" "}
						and you always get a finished part — built to spec, passed through
						QC, kept on its serial.
					</p>
					<div className="tb-cta-row">
						<Link className="tb-btn tb-btn-primary" href="/docs/quickstart">
							Start building
							<span aria-hidden="true">→</span>
						</Link>
						<Link className="tb-btn tb-btn-ghost" href="/docs">
							Read the docs
						</Link>
					</div>

					<TerminalDemo />
				</section>

				{/* ── How it works ───────────────────────────────────── */}
				<section className="tb-section">
					<div className="tb-wrap">
						<p className="tb-kicker">The line, end to end</p>
						<h2 className="tb-h2">Four stations. One function call.</h2>
						<p className="tb-lead">
							You never load a row and hope it's there. You call the block — and
							if the part was never made, the line makes it now, the same way
							every time.
						</p>
						<ol className="tb-steps">
							{STEPS.map((s) => (
								<li className="tb-step" key={s.n}>
									<span className="tb-step-n">{s.n}</span>
									<h3>{s.title}</h3>
									<p>{s.body}</p>
								</li>
							))}
						</ol>
					</div>
				</section>

				{/* ── Features ────────────────────────────────────────── */}
				<section className="tb-section">
					<div className="tb-wrap">
						<p className="tb-kicker">What every block gives you</p>
						<h2 className="tb-h2">A capability, not a prompt.</h2>
						<div className="tb-grid">
							{FEATURES.map((f, i) => (
								<div className="tb-cell" key={f.k}>
									<span className="tb-cell-n">
										{String(i + 1).padStart(2, "0")}
									</span>
									<h3>{f.k}</h3>
									<p>{f.body}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── In the wild ─────────────────────────────────────── */}
				<section className="tb-section">
					<div className="tb-wrap">
						<p className="tb-kicker">Machines in the wild</p>
						<h2 className="tb-h2">Born inside Opsy.</h2>
						<p className="tb-lead">
							Five blocks turn messy, schema-shaped Terraform data into product
							UI — each called as <code>.get({"{ … }"})</code> and cached on
							identity.
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

				{/* ── Final CTA ───────────────────────────────────────── */}
				<section className="tb-final">
					<p className="tb-kicker">Put a machine on the line</p>
					<h2 className="tb-h2 tb-h2-center">
						Ship your first block in five minutes.
					</h2>
					<div className="tb-install">
						<span className="tb-install-prompt">$</span>
						npm install thinking-blocks ai zod
					</div>
					<div className="tb-cta-row tb-cta-center">
						<Link className="tb-btn tb-btn-primary" href="/docs/quickstart">
							Quickstart
							<span aria-hidden="true">→</span>
						</Link>
						<a
							className="tb-btn tb-btn-ghost"
							href="https://github.com/opsyhq/thinking-blocks"
						>
							Star on GitHub
						</a>
					</div>
				</section>
			</main>

			<footer className="tb-foot">
				<div className="tb-foot-inner">
					<span className="tb-brand tb-brand-foot">
						<span className="tb-logo" aria-hidden="true" />
						Thinking Blocks
					</span>
					<div className="tb-foot-links">
						<Link href="/docs">Docs</Link>
						<a href="https://github.com/opsyhq/thinking-blocks">GitHub</a>
						<a href="https://www.npmjs.com/package/thinking-blocks">npm</a>
						<span className="tb-foot-license">Apache-2.0</span>
					</div>
				</div>
			</footer>
		</div>
	)
}

/* The signature visual: a real terminal. First .get() manufactures and
   validates (~3s); the second .get() — same identity — ships cached with no
   model call. Reveal is staggered pure CSS; reduced-motion shows it whole. */
function TerminalDemo() {
	return (
		<div className="tb-term" aria-hidden="true">
			<div className="tb-term-bar">
				<i />
				<i />
				<i />
				<span className="tb-term-file">nutrition.ts</span>
			</div>
			<pre className="tb-term-body">
				<span className="tb-tl tb-dim">{"// define the block once"}</span>
				<span className="tb-tl">
					<span className="tb-kw">const</span> nutrition ={" "}
					<span className="tb-fn">thinkingBlock</span>
					{"({ … })"}
				</span>
				<span className="tb-tl tb-sp" />
				<span className="tb-tl">
					<span className="tb-prompt">›</span> nutrition.
					<span className="tb-fn">get</span>
					{'({ food: "dragon fruit" })'}
				</span>
				<span className="tb-tl tb-indent tb-dim">
					manufacturing → validating → kept
				</span>
				<span className="tb-tl tb-indent">
					source: <span className="tb-str">"generated"</span>
					<span className="tb-badge tb-badge-gen">2.94s</span>
				</span>
				<span className="tb-tl tb-sp" />
				<span className="tb-tl">
					<span className="tb-prompt">›</span> nutrition.
					<span className="tb-fn">get</span>
					{'({ food: "dragon fruit" })'}
				</span>
				<span className="tb-tl tb-indent">
					source: <span className="tb-ok">"cached"</span>
					<span className="tb-badge tb-badge-cached">0ms · no model call</span>
					<span className="tb-cursor" />
				</span>
			</pre>
		</div>
	)
}
