import { Output, ToolLoopAgent } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, test } from "vitest"
import {
	check,
	decodeArtifactIdentityRef,
	InMemoryThinkingBlockReader,
	InMemoryThinkingBlockStore,
	listArtifactVersionsQuerySchema,
	listBlocksQuerySchema,
	listResourcesQuerySchema,
	searchQuerySchema,
	ThinkingBlock,
} from "../src"

type MockGenerateResult = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>

// Drive a block over two identities, then read everything back through the
// in-memory reader. These assertions lock the read contract's shape so it can't
// drift away from the Postgres reader, which implements the same interface.

function mockTextResult(text: string): MockGenerateResult {
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
}

function seededBlock(store: InMemoryThinkingBlockStore) {
	return new ThinkingBlock<{ id: string }, string>({
		agent: new ToolLoopAgent({
			id: "reader-shapes-agent",
			model: new MockLanguageModelV3({
				provider: "mock",
				modelId: "mock-model",
				doGenerate: async () => mockTextResult("triaged"),
			}),
			output: Output.text(),
		}),
		name: "reader-shapes",
		store,
		identity: ({ id }) => id,
		prepareCall: ({ input }) => ({ prompt: `draft ${input.id}` }),
		validators: [
			check<{ id: string }, string>("non-empty", {
				validate: ({ output }) =>
					output.length > 0
						? { success: true }
						: { success: false, feedback: "empty" },
			}),
		],
	})
}

async function seed() {
	const store = new InMemoryThinkingBlockStore()
	const block = seededBlock(store)
	for (const id of ["alpha", "beta"]) {
		const result = await block.generate({ id })
		expect(result.ok).toBe(true)
	}
	await block.stop()
	return { store, reader: new InMemoryThinkingBlockReader(store) }
}

describe("InMemoryThinkingBlockReader", () => {
	test("listBlocks rolls up the block with status counts and a duration", async () => {
		const { reader } = await seed()
		const page = await reader.listBlocks(listBlocksQuerySchema.parse({}))

		expect(page.nextCursor).toBeNull()
		const block = page.blocks.find((b) => b.blockName === "reader-shapes")
		expect(block).toBeDefined()
		expect(block?.totalArtifacts).toBe(2)
		expect(block?.statusCounts.ready).toBe(2)
		expect(typeof block?.latestActivityAt).toBe("string")
		expect(block?.duration).toHaveProperty("avgMs")
		expect(block?.duration).toHaveProperty("p95Ms")
	})

	test("listBlockResources returns one decodable resource per identity", async () => {
		const { reader } = await seed()
		const page = await reader.listBlockResources(
			"reader-shapes",
			listResourcesQuerySchema.parse({}),
		)

		expect(page.blockName).toBe("reader-shapes")
		expect(page.nextCursor).toBeNull()
		expect(page.resources).toHaveLength(2)
		for (const resource of page.resources) {
			expect(resource.statusCounts.ready).toBe(1)
			expect(resource.latestStatus).toBe("ready")
			expect(decodeArtifactIdentityRef(resource.identityRef)).toMatchObject({
				blockName: "reader-shapes",
			})
		}
	})

	test("listArtifactVersions counts runs, model calls, and validations", async () => {
		const { reader } = await seed()
		const resources = await reader.listBlockResources(
			"reader-shapes",
			listResourcesQuerySchema.parse({}),
		)
		const ref = resources.resources[0]?.identityRef
		expect(ref).toBeDefined()
		const identity = decodeArtifactIdentityRef(ref as string)
		if (!identity) throw new Error("expected identity to decode")

		const page = await reader.listArtifactVersions(
			identity,
			listArtifactVersionsQuerySchema.parse({}),
		)
		expect(page.identity.identityRef).toBe(ref)
		expect(page.artifacts).toHaveLength(1)
		const version = page.artifacts[0]
		expect(version?.status).toBe("ready")
		expect(version?.runCount).toBeGreaterThanOrEqual(1)
		expect(version?.modelCallCount).toBeGreaterThanOrEqual(1)
		expect(version?.validationCount).toBeGreaterThanOrEqual(1)
	})

	test("getArtifactDetail exposes runs, model calls, validations, and trace", async () => {
		const { store, reader } = await seed()
		const artifactId = store.artifacts[0]?.id
		expect(artifactId).toBeDefined()

		const detail = await reader.getArtifactDetail(artifactId as string)
		expect(detail).not.toBeNull()
		if (!detail) throw new Error("expected detail")

		expect(detail.artifact.status).toBe("ready")
		expect(detail.artifact.output).toBe("triaged")
		expect(detail.runs.length).toBeGreaterThanOrEqual(1)
		expect(detail.modelCalls.some((c) => c.role === "generate")).toBe(true)
		expect(detail.validations.some((v) => v.validatorId === "non-empty")).toBe(
			true,
		)
		expect(detail.validations.every((v) => v.status === "pass")).toBe(true)
		expect(detail.statusHistory.length).toBeGreaterThanOrEqual(1)
		expect(detail.lineage).toHaveProperty("supersededArtifacts")
		expect(detail.aiSdkTrace).toHaveProperty("events")

		expect(
			await reader.getArtifactDetail("00000000-0000-0000-0000-000000000000"),
		).toBeNull()
	})

	test("searchArtifacts finds artifacts by block name", async () => {
		const { reader } = await seed()
		const page = await reader.searchArtifacts(
			searchQuerySchema.parse({ q: "reader-shapes" }),
		)

		expect(page.results.length).toBe(2)
		for (const result of page.results) {
			expect(result.blockName).toBe("reader-shapes")
			expect(result.output).toBe("triaged")
		}
	})
})
