// @thinking-blocks/store-local
// A local file-backed implementation of the Thinking Blocks store + reader.
//
// This is the "local world": a zero-setup persistent backend that lives in a
// JSON file on disk. Because the data outlives the process, the writer (a seed
// script, an app) and the reader (the dashboard via `tb dev`) can be SEPARATE
// processes that simply point at the same file — exactly the way they'd both
// connect to one Postgres. No database, no docker, and no in-process coupling.
//
// The store extends the in-memory store and snapshots itself to disk after every
// write; the reader hydrates an in-memory store from the snapshot and delegates
// to the in-memory reader, so the query logic has a single home.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
	type ArtifactIdentityRef,
	InMemoryThinkingBlockReader,
	InMemoryThinkingBlockStore,
	type ListArtifactVersionsQuery,
	type ListBlocksQuery,
	type ListResourcesQuery,
	type SearchQuery,
	type ThinkingBlockReader,
} from "@thinking-blocks/core"
import type {
	ClaimPendingThinkingBlockArtifactsInput,
	CreateThinkingBlockArtifactInput,
	FailThinkingBlockRunInput,
	FinishThinkingBlockRunInput,
	MarkThinkingBlockArtifactFailedInput,
	MarkThinkingBlockArtifactReadyInput,
	MarkThinkingBlockArtifactRejectedInput,
	RecordThinkingBlockModelCallInput,
	RecordThinkingBlockValidationInput,
	RejectThinkingBlockRunInput,
	RequeueRetryableThinkingBlockArtifactsInput,
	StartThinkingBlockRunInput,
	ThinkingBlockIdentity,
	UpdateThinkingBlockArtifactPhaseInput,
} from "@thinking-blocks/store"

// Where `tb dev` and the seed scripts meet by default, relative to the working
// directory. One constant so the writer and reader never drift apart.
export const DEFAULT_LOCAL_STORE_PATH = ".thinking-blocks/store.json"

// The persisted shape is exactly the in-memory store's mutable arrays.
type Snapshot = Pick<
	InMemoryThinkingBlockStore,
	"artifacts" | "runs" | "modelCalls" | "validations" | "phases"
>

const DATE_TAG = "__tbDate"

// JSON.stringify hands the replacer the value *after* toJSON() runs, so a Date
// already arrives as a string. Reach back to the raw value on the holder to tag
// genuine Date instances; the reviver turns the tag back into a Date. Artifact
// inputs/outputs are plain JSON (no Date instances), so only the structural
// timestamp fields are ever tagged.
function serializeSnapshot(store: Snapshot): string {
	const snapshot: Snapshot = {
		artifacts: store.artifacts,
		runs: store.runs,
		modelCalls: store.modelCalls,
		validations: store.validations,
		phases: store.phases,
	}
	return JSON.stringify(
		snapshot,
		function (this: Record<string, unknown>, key, value) {
			const raw = this[key]
			return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value
		},
	)
}

function deserializeSnapshot(text: string): Snapshot {
	return JSON.parse(text, (_key, value) =>
		isDateTag(value) ? new Date(value[DATE_TAG]) : value,
	) as Snapshot
}

function isDateTag(value: unknown): value is Record<typeof DATE_TAG, string> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Record<string, unknown>)[DATE_TAG] === "string"
	)
}

function hydrate(path: string): InMemoryThinkingBlockStore {
	const store = new InMemoryThinkingBlockStore()
	if (existsSync(path)) {
		const snapshot = deserializeSnapshot(readFileSync(path, "utf8"))
		store.artifacts = snapshot.artifacts
		store.runs = snapshot.runs
		store.modelCalls = snapshot.modelCalls
		store.validations = snapshot.validations
		store.phases = snapshot.phases
	}
	return store
}

export class LocalThinkingBlockStore extends InMemoryThinkingBlockStore {
	constructor(private readonly path: string = DEFAULT_LOCAL_STORE_PATH) {
		super()
		if (existsSync(path)) {
			const snapshot = deserializeSnapshot(readFileSync(path, "utf8"))
			this.artifacts = snapshot.artifacts
			this.runs = snapshot.runs
			this.modelCalls = snapshot.modelCalls
			this.validations = snapshot.validations
			this.phases = snapshot.phases
		}
	}

	private persist(): void {
		mkdirSync(dirname(this.path), { recursive: true })
		writeFileSync(this.path, serializeSnapshot(this))
	}

	private async persistAfter<T>(op: Promise<T>): Promise<T> {
		const result = await op
		this.persist()
		return result
	}

	override createArtifact(input: CreateThinkingBlockArtifactInput) {
		return this.persistAfter(super.createArtifact(input))
	}
	override claimPendingArtifacts(
		input: ClaimPendingThinkingBlockArtifactsInput,
	) {
		return this.persistAfter(super.claimPendingArtifacts(input))
	}
	override requeueRetryableArtifacts(
		input: RequeueRetryableThinkingBlockArtifactsInput,
	) {
		return this.persistAfter(super.requeueRetryableArtifacts(input))
	}
	override markArtifactReady(input: MarkThinkingBlockArtifactReadyInput) {
		return this.persistAfter(super.markArtifactReady(input))
	}
	override markArtifactRejected(input: MarkThinkingBlockArtifactRejectedInput) {
		return this.persistAfter(super.markArtifactRejected(input))
	}
	override markArtifactFailed(input: MarkThinkingBlockArtifactFailedInput) {
		return this.persistAfter(super.markArtifactFailed(input))
	}
	override updateArtifactPhase(input: UpdateThinkingBlockArtifactPhaseInput) {
		return this.persistAfter(super.updateArtifactPhase(input))
	}
	override dumpArtifacts(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
		dumpedAt: Date
	}) {
		return this.persistAfter(super.dumpArtifacts(input))
	}
	override startRun(input: StartThinkingBlockRunInput) {
		return this.persistAfter(super.startRun(input))
	}
	override finishRun(input: FinishThinkingBlockRunInput) {
		return this.persistAfter(super.finishRun(input))
	}
	override rejectRun(input: RejectThinkingBlockRunInput) {
		return this.persistAfter(super.rejectRun(input))
	}
	override failRun(input: FailThinkingBlockRunInput) {
		return this.persistAfter(super.failRun(input))
	}
	override recordModelCall(input: RecordThinkingBlockModelCallInput) {
		return this.persistAfter(super.recordModelCall(input))
	}
	override recordValidation(input: RecordThinkingBlockValidationInput) {
		return this.persistAfter(super.recordValidation(input))
	}
}

export class LocalThinkingBlockReader implements ThinkingBlockReader {
	constructor(private readonly path: string = DEFAULT_LOCAL_STORE_PATH) {}

	// Read the snapshot fresh each call so the dashboard reflects whatever the
	// writer has flushed — the file is small and this keeps the reader stateless.
	private reader(): InMemoryThinkingBlockReader {
		return new InMemoryThinkingBlockReader(hydrate(this.path))
	}

	listBlocks(query: ListBlocksQuery) {
		return this.reader().listBlocks(query)
	}
	listBlockResources(blockName: string, query: ListResourcesQuery) {
		return this.reader().listBlockResources(blockName, query)
	}
	listArtifactVersions(
		identity: ArtifactIdentityRef,
		query: ListArtifactVersionsQuery,
	) {
		return this.reader().listArtifactVersions(identity, query)
	}
	getArtifactDetail(artifactId: string) {
		return this.reader().getArtifactDetail(artifactId)
	}
	searchArtifacts(query: SearchQuery) {
		return this.reader().searchArtifacts(query)
	}
}
