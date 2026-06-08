import Link from "next/link"
import type { ReactNode } from "react"
import { Comparison, CopyInstall } from "./landing-client"
import "./landing.css"

const INSTALL = "npm install thinking-blocks ai zod"

const FEATURES = [
	{
		lead: "Identity-cached.",
		body: "Same input resolves to the same part, forever. No cache key to invent, no row to miss, no TTL to tune.",
	},
	{
		lead: "Validated before kept.",
		body: "Deterministic checks and model judges gate every output. Bad parts are reworked with feedback, never stored.",
	},
	{
		lead: "Content-addressed.",
		body: "Change the recipe and old parts are superseded, not overwritten. Every part is versioned and traceable.",
	},
	{
		lead: "Durable by default.",
		body: "A file on disk locally, Postgres in production. Parts and their run history survive restarts.",
	},
	{
		lead: "Observable.",
		body: "A no-login dashboard shows every block, part, model call, and QC result. One command, one port.",
	},
	{
		lead: "One tiny API.",
		body: ".get(input) hands you the part, manufacturing it if it never existed. .generate() forces a fresh run.",
	},
]

const WILD = [
	{
		call: "resourceRelationships.get({ resource, type })",
		body: "which fields point at other resources — a validated directional graph.",
	},
	{
		call: "resourceTypeMetadata.get({ provider, type })",
		body: "a human product name and diagram footprint for an unknown type.",
	},
	{
		call: "resourceFieldLayout.get({ type, fields })",
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

const PROVIDERS = [
	"openai",
	"anthropic",
	"google",
	"mistral",
	"groq",
	"bedrock",
	"ollama",
]

export default function HomePage() {
	return (
		<div className="v">
			<header className="v-nav">
				<div className="v-nav-inner">
					<Link className="v-brand" href="/">
						<span className="v-logo" aria-hidden="true" />
						<span className="v-brand-name">thinking-blocks</span>
					</Link>
					<nav className="v-nav-links">
						<Link href="/docs">Docs</Link>
						<Link href="/docs/concepts">Concepts</Link>
						<a href="https://github.com/opsyhq/thinking-blocks">
							GitHub <span className="v-ext">↗</span>
						</a>
						<Link className="v-nav-cta" href="/docs/quickstart">
							Get started
						</Link>
					</nav>
				</div>
			</header>

			<div className="v-frame">
				{/* ── Hero ───────────────────────────────────────────── */}
				<section className="v-hero">
					<h1 className="v-title">
						Don't fetch the answer.
						<br />
						Manufacture it.
					</h1>
					<p className="v-sub">
						<code className="v-chip">.get(input)</code> brings durability,
						validation, and memory to any AI call. Define a block once — every
						call returns a finished, validated part, cached on its identity.
					</p>
					<div className="v-hero-actions">
						<CopyInstall cmd={INSTALL} />
						<Link className="v-hero-link" href="/docs/quickstart">
							Read the quickstart <span className="v-ext">↗</span>
						</Link>
					</div>
				</section>

				{/* ── Comparison ─────────────────────────────────────── */}
				<section className="v-section v-split">
					<div className="v-split-head">
						<h2 className="v-h2">
							A capability,
							<br />
							not a prompt.
						</h2>
						<p className="v-lead">
							You never load a row and hope it's there. Call the block — if the
							part was never made, the line makes it now, validates it, and
							keeps it on its serial.
						</p>
					</div>
					<Comparison />
				</section>

				{/* ── Define a block once ────────────────────────────── */}
				<section className="v-section">
					<h2 className="v-h2">Define a block once.</h2>
					<p className="v-lead v-lead-wide">
						A schema for the part, an agent to build it, and a gate to pass it.
						That's the whole declaration.
					</p>
					<div className="v-cols">
						<CodePanel title="block.ts" foot="schema in, typed part out">
							<code>
								<span className="t-k">const</span> nutrition ={" "}
								<span className="t-f">thinkingBlock</span>({"{"}
								{"\n"}
								{"  "}schema: Nutrition,
								{"\n"}
								{"  "}agent: <span className="t-f">myAgent</span>,{"\n"}
								{"  "}check: (p) =&gt; p.calories &gt;{" "}
								<span className="t-n">0</span>,{"\n"}
								{"}"})
							</code>
						</CodePanel>
						<CodePanel title="use.ts" foot="cached on identity">
							<code>
								<span className="t-k">const</span> part ={" "}
								<span className="t-k">await</span> nutrition.
								<span className="t-f">get</span>({"{"}
								{"\n"}
								{"  "}food: <span className="t-s">"dragon fruit"</span>,{"\n"}
								{"}"}){"\n\n"}
								part.calories{" "}
								<span className="t-c">{"// 60 — typed, validated"}</span>
							</code>
						</CodePanel>
					</div>
				</section>

				{/* ── Any model ──────────────────────────────────────── */}
				<section className="v-section v-center">
					<h2 className="v-h2 v-h2-center">Bring any model.</h2>
					<p className="v-lead v-lead-center">
						Blocks run on the Vercel AI SDK, so every provider it supports works
						unchanged. <code className="v-chip">ai</code> and{" "}
						<code className="v-chip">zod</code> are peer deps — never bundled.
					</p>
					<div className="v-providers">
						{PROVIDERS.map((p) => (
							<span className="v-provider" key={p}>
								{p}
							</span>
						))}
					</div>
				</section>

				{/* ── Features ───────────────────────────────────────── */}
				<section className="v-section">
					<h2 className="v-h2">Everything a block gives you.</h2>
					<div className="v-grid">
						{FEATURES.map((f) => (
							<div className="v-feature" key={f.lead}>
								<p>
									<span className="v-feature-lead">{f.lead}</span> {f.body}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* ── In the wild ────────────────────────────────────── */}
				<section className="v-section">
					<h2 className="v-h2">Born inside Opsy.</h2>
					<p className="v-lead v-lead-wide">
						Five blocks turn messy, schema-shaped Terraform data into product UI
						— each a <code className="v-chip">.get({"{ … }"})</code> cached on
						identity.
					</p>
					<div className="v-wild">
						{WILD.map((w) => (
							<div className="v-wild-row" key={w.call}>
								<code>{w.call}</code>
								<span>{w.body}</span>
							</div>
						))}
					</div>
				</section>

				{/* ── Final CTA ──────────────────────────────────────── */}
				<section className="v-section v-final">
					<h2 className="v-final-title">
						Ship your first block
						<br />
						in five minutes.
					</h2>
					<div className="v-hero-actions v-center-actions">
						<CopyInstall cmd={INSTALL} />
						<Link className="v-hero-link" href="/docs/quickstart">
							Quickstart <span className="v-ext">↗</span>
						</Link>
					</div>
				</section>
			</div>

			<footer className="v-foot">
				<div className="v-foot-inner">
					<span className="v-brand">
						<span className="v-logo" aria-hidden="true" />
						<span className="v-brand-name">thinking-blocks</span>
					</span>
					<div className="v-foot-links">
						<Link href="/docs">Docs</Link>
						<a href="https://github.com/opsyhq/thinking-blocks">GitHub</a>
						<a href="https://www.npmjs.com/package/thinking-blocks">npm</a>
						<span className="v-foot-license">Apache-2.0</span>
					</div>
				</div>
			</footer>
		</div>
	)
}

function CodePanel({
	title,
	foot,
	children,
}: {
	title: string
	foot: string
	children: ReactNode
}) {
	return (
		<div className="v-code">
			<div className="v-code-bar">
				<span className="v-code-file">{title}</span>
			</div>
			<pre className="v-pre">{children}</pre>
			<div className="v-code-foot">
				<span className="v-dot v-dot-ok" /> {foot}
			</div>
		</div>
	)
}
