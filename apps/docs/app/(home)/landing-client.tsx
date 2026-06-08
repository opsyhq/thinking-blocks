"use client"

import { useState } from "react"

/* The one interactive island on the otherwise-static landing: the install
   pill's copy button. Everything else on the page is server-rendered. */

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
