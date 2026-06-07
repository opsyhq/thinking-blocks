import { openai } from "@ai-sdk/openai"
import {
	DEFAULT_LOCAL_STORE_PATH,
	LocalThinkingBlockStore,
} from "@thinking-blocks/store-local"
import type { ThinkingBlock, ThinkingBlockResult } from "thinking-blocks"
import { createEmojiBlock, createNutritionBlock, type FoodInput } from "./block"

// The product is a function you call: `nutrition.get({ food })`. This CLI is
// that one call and nothing more.
//
// Run it once for a food: the model runs, the output is validated, and the
// artifact is kept in a JSON file on disk. Run the SAME command again and the
// same part comes straight back from that file — instantly, with no model call.
// It's a fresh process every time, so the cache surviving proves it's durable on
// disk, not held in memory. That round trip — generated once, cached forever
// after — is the whole idea, and you do it with your own hands.

const food = process.argv.slice(2).join(" ").trim()
if (!food) {
	console.error('Usage: pnpm --filter nutrition run get "<food>"')
	console.error('   e.g. pnpm --filter nutrition run get "dragon fruit"')
	process.exit(1)
}

if (!process.env.OPENAI_API_KEY) {
	console.error("OPENAI_API_KEY is not set. Add it to examples/nutrition/.env")
	process.exit(1)
}

const model = openai(process.env.TB_MODEL ?? "gpt-4o-mini")

// `get` returns a ready artifact, generating one if the block has never made it
// — but a `failed` artifact is terminal, and `get` replays it forever. If a
// prior run died (a bad key, a network blip), force one fresh run with
// `generate` so the command always recovers. A second failure is real failure —
// let it surface.
async function getOrHeal<T>(
	block: ThinkingBlock<FoodInput, T>,
	order: FoodInput,
): Promise<ThinkingBlockResult<T>> {
	try {
		return await block.get(order)
	} catch {
		return await block.generate(order)
	}
}

async function main() {
	const store = new LocalThinkingBlockStore(DEFAULT_LOCAL_STORE_PATH)
	const nutrition = createNutritionBlock({ store, model })
	const emoji = createEmojiBlock({ store, model })

	const order = { food }
	const startedAt = performance.now()
	const [facts, icon] = await Promise.all([
		getOrHeal(nutrition, order),
		getOrHeal(emoji, order),
	])
	const ms = Math.round(performance.now() - startedAt)

	await nutrition.stop()
	await emoji.stop()

	if (!facts.ok) {
		// A validator rejected the output — the block ran fine and decided the
		// result wasn't good enough. An honest outcome, not a crash.
		console.log(
			`\n  ⚠  ${food} — a validator rejected the output: ${facts.reason}\n`,
		)
		return
	}

	const glyph = icon.ok ? icon.output.emoji : "•"
	const n = facts.output
	console.log(`\n  ${glyph}  ${food}`)
	console.log(
		`     ${n.calories} kcal · ${n.protein}g protein · ${n.carbs}g carbs · ${n.fat}g fat · per ${n.serving}`,
	)

	// `source` is the proof. "generated" means the model just ran; "cached" means
	// the part came back from disk with no model call. If either block had to run,
	// this was a generate.
	const generated =
		facts.source === "generated" || (icon.ok && icon.source === "generated")
	if (generated) {
		console.log(
			`     generated · ${(ms / 1000).toFixed(1)}s · validated, kept as an artifact on disk`,
		)
		console.log(
			`     run the same command again — same food, same serial: it comes back cached, no model call.\n`,
		)
	} else {
		console.log(`     cached · ${ms}ms · no model call — served from disk\n`)
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
