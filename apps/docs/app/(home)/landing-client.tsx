"use client"

import { useState } from "react"

/* Tiny interactive islands for the otherwise-static landing: the install pill's
   copy button and the With/Without code comparison toggle. Everything else on
   the page is server-rendered. */

export function CopyInstall({ cmd }: { cmd: string }) {
	const [copied, setCopied] = useState(false)
	return (
		<button
			type="button"
			className="v-install"
			onClick={() => {
				navigator.clipboard?.writeText(cmd)
				setCopied(true)
				setTimeout(() => setCopied(false), 1400)
			}}
		>
			<span className="v-install-prompt">$</span>
			<span className="v-install-cmd">{cmd}</span>
			<span className="v-install-icon" aria-hidden="true">
				{copied ? (
					<svg
						width="15"
						height="15"
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M13.5 4.5 6 12 2.5 8.5"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				) : (
					<svg
						width="15"
						height="15"
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
					>
						<rect
							x="5.25"
							y="5.25"
							width="7.5"
							height="7.5"
							rx="1.5"
							stroke="currentColor"
							strokeWidth="1.3"
						/>
						<path
							d="M3.25 10.75A1.5 1.5 0 0 1 2.5 9.5v-6A1.5 1.5 0 0 1 4 2h5c.46 0 .87.21 1.14.54"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
						/>
					</svg>
				)}
			</span>
		</button>
	)
}

export function Comparison() {
	const [withTb, setWithTb] = useState(true)
	return (
		<div className="v-cmp">
			<div className="v-seg" role="tablist" aria-label="Comparison">
				<button
					type="button"
					role="tab"
					aria-selected={withTb}
					className={withTb ? "on" : ""}
					onClick={() => setWithTb(true)}
				>
					With Thinking Blocks
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={!withTb}
					className={withTb ? "" : "on"}
					onClick={() => setWithTb(false)}
				>
					Without
				</button>
			</div>
			<div className="v-code">
				<pre className="v-pre">{withTb ? <WithCode /> : <WithoutCode />}</pre>
				<div className="v-code-foot">
					{withTb ? (
						<>
							<span className="v-dot v-dot-ok" /> second <code>.get()</code>{" "}
							ships the same part — no model call
						</>
					) : (
						<>
							<span className="v-dot v-dot-warn" /> invent a cache key, validate
							by hand, and a miss still 404s
						</>
					)}
				</div>
			</div>
		</div>
	)
}

function WithCode() {
	return (
		<code>
			<span className="t-k">const</span> nutrition ={" "}
			<span className="t-f">thinkingBlock</span>({"{ schema, agent, check }"})
			{"\n\n"}
			<span className="t-k">const</span> a = <span className="t-k">await</span>{" "}
			nutrition.<span className="t-f">get</span>({"{ "}food:{" "}
			<span className="t-s">"dragon fruit"</span>
			{" }"}) <span className="t-c">{"// generated · 2.9s"}</span>
			{"\n"}
			<span className="t-k">const</span> b = <span className="t-k">await</span>{" "}
			nutrition.<span className="t-f">get</span>({"{ "}food:{" "}
			<span className="t-s">"dragon fruit"</span>
			{" }"}) <span className="t-ok">{"// cached · 0ms"}</span>
		</code>
	)
}

function WithoutCode() {
	return (
		<code>
			<span className="t-k">let</span> row = <span className="t-k">await</span>{" "}
			db.parts.<span className="t-f">find</span>({"{ "}food{" }"}){"\n"}
			<span className="t-k">if</span> (!row) {"{"}
			{"\n"}
			{"  "}
			<span className="t-k">const</span> out ={" "}
			<span className="t-k">await</span> model.
			<span className="t-f">generate</span>(<span className="t-f">prompt</span>
			(food))
			{"\n"}
			{"  "}
			<span className="t-k">const</span> parsed = schema.
			<span className="t-f">parse</span>(out){" "}
			<span className="t-c">{"// hope it validates"}</span>
			{"\n"}
			{"  "}row = <span className="t-k">await</span> db.parts.
			<span className="t-f">insert</span>({"{ "}food, parsed{" }"}){"\n"}
			{"}"}
			{"\n"}
			<span className="t-k">return</span> row.parsed{" "}
			<span className="t-c">{"// on a miss earlier: 404"}</span>
		</code>
	)
}
