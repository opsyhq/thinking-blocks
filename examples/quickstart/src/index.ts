import { Output, ToolLoopAgent } from "ai"
import {
	InMemoryThinkingBlockStore,
	judge,
	ThinkingBlock,
} from "thinking-blocks"
import { z } from "zod"

// A Thinking Block is a machine on a line, not a one-off prompt.
//
// `productBrief.get({ idea })` is the order window: raw material in (a messy,
// freeform idea), a finished part out (a structured, validated brief). The part
// is kept on its serial (the idea itself), so the next order with the same idea
// ships the same brief cold, with no model call. A warehouse would 404 on an
// idea nobody stocked; this machine just makes it.

const Brief = z.object({
	name: z.string(),
	tagline: z.string(),
	audience: z.string(),
	risks: z.array(z.string()),
})
type Brief = z.infer<typeof Brief>

const Judgement = z.object({ ok: z.boolean(), reason: z.string() })

// Any model the Vercel AI SDK understands. With a string id the AI SDK routes
// through the AI Gateway (set AI_GATEWAY_API_KEY), or swap in a provider like
// `openai("gpt-4o-mini")`.
const model = "openai/gpt-4o-mini"

const productBrief = new ThinkingBlock<{ idea: string }, Brief>({
	name: "product-brief",
	store: new InMemoryThinkingBlockStore(),
	agent: new ToolLoopAgent({
		model,
		output: Output.object({ schema: Brief }),
	}),
	// The serial number. Same idea -> same part, forever.
	identity: ({ idea }) => idea,
	prepareCall: ({ input }) => ({
		prompt: `Turn this raw product idea into a crisp brief.\n\nIDEA: ${input.idea}`,
	}),
	// An inspector — a model judge that gates the part. If it scraps the part,
	// the machine reworks it with the feedback instead of shipping a weak one.
	validators: [
		judge<{ idea: string }, Brief, z.infer<typeof Judgement>>(
			"tagline-is-specific",
			{
				agent: new ToolLoopAgent({
					model,
					output: Output.object({ schema: Judgement }),
				}),
				schema: Judgement,
				prepareCall: ({ output }) => ({
					prompt: `Is this a specific, punchy product tagline (not generic filler)?\n\nTagline: "${output.tagline}"`,
				}),
				validate: ({ judgement }) =>
					judgement.ok
						? { success: true }
						: { success: false, feedback: judgement.reason },
			},
		),
	],
})

async function main() {
	const idea =
		"a CLI that turns flaky test logs into a ranked list of likely root causes"

	console.time("first order  (worked to spec + QC + kept)")
	const first = await productBrief.get({ idea })
	console.timeEnd("first order  (worked to spec + QC + kept)")

	console.time("second order (shipped cold on its serial)")
	const second = await productBrief.get({ idea })
	console.timeEnd("second order (shipped cold on its serial)")

	if (first.ok) {
		console.log("\nbrief:\n", JSON.stringify(first.output, null, 2))
		console.log("\nfirst  source:", first.source) // "generated"
	}
	if (second.ok) {
		console.log("second source:", second.source) // "cached"
	}

	// The block runs a background runner; stop it so the process can exit.
	await productBrief.stop()
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
