import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	listBlocksQuerySchema,
	listResourcesQuerySchema,
} from "@thinking-blocks/core"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { LocalThinkingBlockReader, LocalThinkingBlockStore } from "../src"

// Write through LocalThinkingBlockStore, then read back through a SEPARATE
// LocalThinkingBlockReader instance pointed at the same file — the cross-process
// path the dashboard relies on. The reader never shares memory with the store;
// it only sees what was persisted, so this also proves the Date round-trip.

let dir: string
let path: string

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "tb-local-"))
	path = join(dir, "nested", "store.json")
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

async function writeReadyArtifact(store: LocalThinkingBlockStore) {
	const createdAt = new Date("2026-06-07T10:00:00.000Z")
	const artifact = await store.createArtifact({
		blockName: "local-block",
		blockVersion: "v1",
		identity: "alpha",
		input: { service: "checkout" },
		createdAt,
	})
	const run = await store.startRun({
		artifactId: artifact.id,
		blockName: "local-block",
		metadata: {},
		startedAt: createdAt,
	})
	await store.recordModelCall({
		runId: run.id,
		attempt: 1,
		stepIndex: 0,
		role: "generate",
		blockName: "local-block",
		modelProvider: "mock",
		model: "mock-model",
		status: "success",
		metadata: {},
		input: { prompt: "draft" },
	})
	await store.recordValidation({
		runId: run.id,
		attempt: 1,
		validatorId: "non-empty",
		validatorType: "check",
		status: "pass",
	})
	await store.markArtifactReady({
		artifactId: artifact.id,
		blockName: "local-block",
		blockVersion: "v1",
		identity: "alpha",
		output: { severity: "high" },
		readyAt: new Date("2026-06-07T10:00:01.000Z"),
	})
	await store.finishRun({
		runId: run.id,
		metadata: {},
		startedAt: createdAt,
		finishedAt: new Date("2026-06-07T10:00:01.000Z"),
	})
	return artifact.id
}

describe("local store + reader", () => {
	test("a fresh reader sees artifacts the store persisted", async () => {
		const artifactId = await writeReadyArtifact(
			new LocalThinkingBlockStore(path),
		)

		const reader = new LocalThinkingBlockReader(path)
		const blocks = await reader.listBlocks(listBlocksQuerySchema.parse({}))
		const block = blocks.blocks.find((b) => b.blockName === "local-block")
		expect(block?.statusCounts.ready).toBe(1)

		const resources = await reader.listBlockResources(
			"local-block",
			listResourcesQuerySchema.parse({}),
		)
		expect(resources.resources).toHaveLength(1)

		const detail = await reader.getArtifactDetail(artifactId)
		expect(detail?.artifact.status).toBe("ready")
		expect(detail?.modelCalls.some((c) => c.role === "generate")).toBe(true)
		expect(detail?.validations.some((v) => v.validatorId === "non-empty")).toBe(
			true,
		)
		// The Date round-trip survived JSON: createdAt is a real ISO timestamp.
		expect(Number.isFinite(Date.parse(detail?.artifact.createdAt ?? ""))).toBe(
			true,
		)
	})

	test("a new store reloads what a previous one persisted", async () => {
		await writeReadyArtifact(new LocalThinkingBlockStore(path))

		// A second store instance (a later process) loads the snapshot and can
		// keep writing without losing the earlier artifact.
		const reopened = new LocalThinkingBlockStore(path)
		await reopened.createArtifact({
			blockName: "local-block",
			blockVersion: "v1",
			identity: "beta",
			input: { service: "auth" },
			createdAt: new Date("2026-06-07T11:00:00.000Z"),
		})

		const reader = new LocalThinkingBlockReader(path)
		const resources = await reader.listBlockResources(
			"local-block",
			listResourcesQuerySchema.parse({}),
		)
		expect(resources.resources).toHaveLength(2)
	})
})
