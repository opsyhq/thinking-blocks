import assert from "node:assert/strict"
import { MockLanguageModelV3 } from "ai/test"
import {
	InMemoryThinkingBlockReader,
	InMemoryThinkingBlockStore,
	listBlocksQuerySchema,
	listResourcesQuerySchema,
} from "thinking-blocks"
import {
	createEmojiBlock,
	createNutritionBlock,
	JUDGE_MARKER,
} from "../src/block"
import { FOODS } from "../src/foods"

// Run the whole factory WITHOUT an API key: a deterministic mock model works
// every machine, an InMemoryThinkingBlockStore holds the parts, and the
// InMemoryThinkingBlockReader reads them back, the same reader the floor monitor
// (the dashboard) talks to. This is a test harness; the example itself (the `get`
// script) uses a real model.

// One mock model answers all three call shapes by inspecting the prompt: the
// nutrition machine gets reconciling macros (so the caliper passes), the judge
// (tagged with JUDGE_MARKER) approves, and the emoji machine gets a single glyph.
const model = new MockLanguageModelV3({
	provider: "mock",
	modelId: "mock-model",
	doGenerate: async (options) => {
		const promptText = JSON.stringify(options.prompt)
		const text = promptText.includes(JUDGE_MARKER)
			? JSON.stringify({ ok: true, reason: "realistic serving" })
			: promptText.includes("emoji")
				? JSON.stringify({ emoji: "🍌", reason: "stand-in glyph" })
				: // 4·5 + 4·15 + 9·2 = 98 kcal, reconciles with 100 within tolerance.
					JSON.stringify({
						serving: "1 standard serving",
						calories: 100,
						protein: 5,
						carbs: 15,
						fat: 2,
					})
		return {
			content: [{ type: "text", text }],
			finishReason: { unified: "stop", raw: "stop" },
			usage: {
				inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
				outputTokens: { total: 1, text: 1, reasoning: 0 },
			},
			response: { modelId: "mock-model" },
			warnings: [],
		}
	},
})

async function main() {
	const store = new InMemoryThinkingBlockStore()
	const nutrition = createNutritionBlock({ store, model })
	const emoji = createEmojiBlock({ store, model })

	// First run: every order manufactures, runs QC, and persists.
	for (const order of FOODS) {
		const facts = await nutrition.get(order)
		assert(facts.ok, `nutrition rejected ${order.food}`)
		assert.equal(
			facts.source,
			"generated",
			`nutrition not generated for ${order.food}`,
		)
		const icon = await emoji.get(order)
		assert(icon.ok, `emoji rejected ${order.food}`)
		assert.equal(
			icon.source,
			"generated",
			`emoji not generated for ${order.food}`,
		)
	}

	// Second run: same orders ship from the line cold, no model call.
	for (const order of FOODS) {
		const facts = await nutrition.get(order)
		assert(
			facts.ok && facts.source === "cached",
			`nutrition not cached for ${order.food}`,
		)
	}

	await nutrition.stop()
	await emoji.stop()

	// Read the floor back through the in-memory reader, the same interface the
	// dashboard's read server calls.
	const reader = new InMemoryThinkingBlockReader(store)
	const blocks = await reader.listBlocks(listBlocksQuerySchema.parse({}))
	for (const name of ["nutrition", "emoji"]) {
		const block = blocks.blocks.find((b) => b.blockName === name)
		assert(block, `${name} machine missing from listBlocks`)
		assert.equal(
			block.statusCounts.ready,
			FOODS.length,
			`expected ${FOODS.length} ready parts from ${name}`,
		)
	}

	// Pull one nutrition part and check its traveler: a generate + judge model
	// call, and both QC gates recorded as a pass.
	const resources = await reader.listBlockResources(
		"nutrition",
		listResourcesQuerySchema.parse({}),
	)
	const latestId = resources.resources[0]?.latestArtifactId
	assert(latestId, "nutrition resource has no artifact")
	const detail = await reader.getArtifactDetail(latestId)
	assert(detail, "nutrition artifact detail missing")
	assert.equal(detail.artifact.status, "ready", "part should be ready")
	assert(
		detail.modelCalls.some((c) => c.role === "judge"),
		"expected a judge (inspector) model call",
	)
	assert.equal(detail.validations.length, 2, "expected caliper + inspector QC")
	assert(
		detail.validations.every((v) => v.status === "pass"),
		"all QC gates should pass",
	)

	console.log(
		`VERIFY OK: ${FOODS.length} foods through 2 machines, generated then ` +
			`shipped cold; parts, runs, ${detail.modelCalls.length} model calls and ` +
			`${detail.validations.length} QC gates recorded and read back.`,
	)
}

main().catch((error) => {
	console.error("VERIFY FAILED")
	console.error(error)
	process.exitCode = 1
})
