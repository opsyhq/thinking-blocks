// @thinking-blocks/core: the in-memory reader.
//
// Serves the dashboard straight from an InMemoryThinkingBlockStore: same wire
// shapes as the Postgres audit queries, grouped/paginated/summarised in plain
// JS over the store's arrays. The store is per-process, so seed and serve in the
// same process (the test harness in examples/nutrition does exactly this). This is
// the read mirror of InMemoryThinkingBlockStore. Write through the store, read
// through this.

import type { ThinkingBlockArtifactRecord } from "@thinking-blocks/store"
import type { InMemoryThinkingBlockStore } from "./memory-store"
import {
	type ArtifactDetail,
	type ArtifactIdentityRef,
	type ArtifactSearchResult,
	type ArtifactVersionResponse,
	type ArtifactVersionSummary,
	type ArtifactVersionsPage,
	type BlockSummary,
	type BlocksPage,
	type DurationSummary,
	encodeArtifactIdentityRef,
	encodeCursor,
	InvalidCursorError,
	identityGroupKey,
	type ListArtifactVersionsQuery,
	type ListBlocksQuery,
	type ListResourcesQuery,
	type ResourceSummary,
	type ResourcesPage,
	type SearchField,
	type SearchPage,
	type SearchQuery,
	type StatusCounts,
	type ThinkingBlockReader,
} from "./read"

type StoreRun = InMemoryThinkingBlockStore["runs"][number]

export class InMemoryThinkingBlockReader implements ThinkingBlockReader {
	constructor(private store: InMemoryThinkingBlockStore) {}

	async listBlocks(query: ListBlocksQuery): Promise<BlocksPage> {
		const filtered = this.store.artifacts.filter(
			(artifact) =>
				matchesSearch(artifact, query.q, query.searchField) &&
				(!query.status || artifact.status === query.status),
		)

		const groups = new Map<string, ThinkingBlockArtifactRecord[]>()
		for (const artifact of filtered) {
			const group = groups.get(artifact.blockName) ?? []
			group.push(artifact)
			groups.set(artifact.blockName, group)
		}

		const sorted = [...groups.entries()]
			.map(([blockName, artifacts]) => ({
				blockName,
				artifacts,
				latestActivityAt: maxDate(artifacts.map((a) => a.updatedAt)),
			}))
			// desc(latestActivityAt), asc(blockName)
			.sort(
				(a, b) =>
					isoOf(b.latestActivityAt).localeCompare(isoOf(a.latestActivityAt)) ||
					a.blockName.localeCompare(b.blockName),
			)
			.filter((group) => {
				if (!query.cursor) return true
				const iso = isoOf(group.latestActivityAt)
				return (
					iso < query.cursor.latestActivityAt ||
					(iso === query.cursor.latestActivityAt &&
						group.blockName > query.cursor.blockName)
				)
			})

		const page = sorted.slice(0, query.limit)
		const blocks: BlockSummary[] = page.map((group) => ({
			blockName: group.blockName,
			totalArtifacts: group.artifacts.length,
			statusCounts: countStatuses(group.artifacts),
			latestActivityAt: group.latestActivityAt
				? group.latestActivityAt.toISOString()
				: null,
			duration: this.blockDuration(group.blockName),
		}))

		const last = page.at(-1)
		return {
			blocks,
			nextCursor:
				sorted.length > query.limit && last
					? encodeCursor({
							latestActivityAt: isoOf(last.latestActivityAt),
							blockName: last.blockName,
						})
					: null,
		}
	}

	async listBlockResources(
		blockName: string,
		query: ListResourcesQuery,
	): Promise<ResourcesPage> {
		if (
			query.cursor &&
			(query.cursor.sortBy !== query.sortBy ||
				query.cursor.sortDirection !== query.sortDirection)
		) {
			throw new InvalidCursorError()
		}

		const filtered = this.store.artifacts.filter(
			(artifact) =>
				artifact.blockName === blockName &&
				matchesSearch(artifact, query.q, query.searchField) &&
				(!query.status || artifact.status === query.status),
		)

		const groups = new Map<string, ThinkingBlockArtifactRecord[]>()
		for (const artifact of filtered) {
			const key = identityGroupKey(artifact)
			const group = groups.get(key) ?? []
			group.push(artifact)
			groups.set(key, group)
		}

		const rows = [...groups.values()].map((artifacts) => {
			const head = artifacts[0] as ThinkingBlockArtifactRecord
			const latestUpdatedAt = maxDate(artifacts.map((a) => a.updatedAt))
			const totalArtifacts = artifacts.length
			const sortValue: string | number =
				query.sortBy === "identityKey"
					? head.identityKey
					: query.sortBy === "totalArtifacts"
						? totalArtifacts
						: isoOf(latestUpdatedAt)
			return {
				blockName: head.blockName,
				blockVersion: head.blockVersion,
				identityKey: head.identityKey,
				artifacts,
				latestUpdatedAt,
				totalArtifacts,
				sortValue,
			}
		})

		const direction = query.sortDirection === "asc" ? 1 : -1
		const sorted = rows
			.sort(
				(a, b) =>
					direction * compareSortValue(a.sortValue, b.sortValue) ||
					a.blockVersion.localeCompare(b.blockVersion) ||
					a.identityKey.localeCompare(b.identityKey),
			)
			.filter((row) => {
				const cursor = query.cursor
				if (!cursor) return true
				const after =
					direction === 1
						? compareSortValue(row.sortValue, cursor.sortValue) > 0
						: compareSortValue(row.sortValue, cursor.sortValue) < 0
				const tie =
					compareSortValue(row.sortValue, cursor.sortValue) === 0 &&
					(row.blockVersion > cursor.blockVersion ||
						(row.blockVersion === cursor.blockVersion &&
							row.identityKey > cursor.identityKey))
				return after || tie
			})

		const page = sorted.slice(0, query.limit)
		const resources: ResourceSummary[] = page.map((row) => {
			const latest = [...row.artifacts].sort(
				(a, b) =>
					isoOf(b.updatedAt).localeCompare(isoOf(a.updatedAt)) ||
					isoOf(b.createdAt).localeCompare(isoOf(a.createdAt)) ||
					b.id.localeCompare(a.id),
			)[0]
			const runs = this.runsForArtifacts(row.artifacts)
			return {
				identityRef: encodeArtifactIdentityRef({
					blockName: row.blockName,
					blockVersion: row.blockVersion,
					identityKey: row.identityKey,
				}),
				blockName: row.blockName,
				blockVersion: row.blockVersion,
				identityKey: row.identityKey,
				totalArtifacts: row.totalArtifacts,
				statusCounts: countStatuses(row.artifacts),
				latestArtifactId: latest?.id ?? null,
				latestStatus: latest?.status ?? null,
				latestPhase: latest?.phase ?? null,
				latestPhaseLabel: latest?.phaseLabel ?? null,
				latestUpdatedAt: row.latestUpdatedAt
					? row.latestUpdatedAt.toISOString()
					: null,
				latestDurationMs: latestDuration(runs),
				duration: durationSummary(runs),
			}
		})

		const last = page.at(-1)
		return {
			blockName,
			resources,
			nextCursor:
				sorted.length > query.limit && last
					? encodeCursor({
							sortBy: query.sortBy,
							sortDirection: query.sortDirection,
							sortValue:
								query.sortBy === "latestUpdatedAt"
									? isoOf(last.latestUpdatedAt)
									: query.sortBy === "totalArtifacts"
										? Number(last.sortValue)
										: String(last.sortValue),
							identityKey: last.identityKey,
							blockVersion: last.blockVersion,
						})
					: null,
		}
	}

	async listArtifactVersions(
		identity: ArtifactIdentityRef,
		query: ListArtifactVersionsQuery,
	): Promise<ArtifactVersionsPage> {
		const sorted = this.store.artifacts
			.filter(
				(artifact) =>
					artifact.blockName === identity.blockName &&
					artifact.blockVersion === identity.blockVersion &&
					artifact.identityKey === identity.identityKey,
			)
			// desc(createdAt), desc(id)
			.sort(
				(a, b) =>
					isoOf(b.createdAt).localeCompare(isoOf(a.createdAt)) ||
					b.id.localeCompare(a.id),
			)
			.filter((artifact) => {
				const cursor = query.cursor
				if (!cursor) return true
				const iso = isoOf(artifact.createdAt)
				return (
					iso < cursor.createdAt ||
					(iso === cursor.createdAt && artifact.id < cursor.id)
				)
			})

		const page = sorted.slice(0, query.limit)
		const last = page.at(-1)
		return {
			identity: {
				...identity,
				identityRef: encodeArtifactIdentityRef(identity),
			},
			artifacts: page.map((artifact) => this.artifactVersionResponse(artifact)),
			nextCursor:
				sorted.length > query.limit && last
					? encodeCursor({ createdAt: isoOf(last.createdAt), id: last.id })
					: null,
		}
	}

	async getArtifactDetail(artifactId: string): Promise<ArtifactDetail | null> {
		const artifact = this.store.artifacts.find((a) => a.id === artifactId)
		if (!artifact) return null

		const runs = this.store.runs
			.filter((run) => run.artifactId === artifact.id)
			.sort(
				(a, b) =>
					a.startedAt.getTime() - b.startedAt.getTime() ||
					a.id.localeCompare(b.id),
			)
		const runIds = new Set(runs.map((run) => run.id))

		const modelCalls = this.store.modelCalls
			.filter((call) => runIds.has(call.runId))
			.sort(
				(a, b) =>
					a.createdAt.getTime() - b.createdAt.getTime() ||
					a.attempt - b.attempt ||
					a.stepIndex - b.stepIndex ||
					a.id.localeCompare(b.id),
			)
		const validations = this.store.validations
			.filter((validation) => runIds.has(validation.runId))
			.sort(
				(a, b) =>
					a.createdAt.getTime() - b.createdAt.getTime() ||
					a.attempt - b.attempt ||
					a.id.localeCompare(b.id),
			)
		const supersededArtifacts = this.store.artifacts
			.filter((a) => a.supersededBy === artifact.id)
			.sort(
				(a, b) =>
					isoOf(a.supersededAt).localeCompare(isoOf(b.supersededAt)) ||
					a.id.localeCompare(b.id),
			)

		const finalAt =
			artifact.status === "ready"
				? artifact.readyAt
				: artifact.status === "superseded"
					? artifact.supersededAt
					: artifact.status === "rejected" || artifact.status === "failed"
						? artifact.updatedAt
						: null

		const statusHistory: ArtifactDetail["statusHistory"] = [
			{
				status: "pending",
				at: artifact.createdAt.toISOString(),
				source: "artifact",
				label: "Artifact created",
			},
			...runs.flatMap((run) => [
				{
					status: "running",
					at: run.startedAt.toISOString(),
					source: "run",
					runId: run.id,
					label: "Run started",
				},
				...(run.finishedAt
					? [
							{
								status: run.status === "success" ? "ready" : run.status,
								at: run.finishedAt.toISOString(),
								source: "run",
								runId: run.id,
								label: `Run ${run.status}`,
							},
						]
					: []),
			]),
			...(finalAt
				? [
						{
							status: artifact.status,
							at: finalAt.toISOString(),
							source: "artifact",
							label: `Artifact ${artifact.status}`,
						},
					]
				: []),
		].sort((a, b) => a.at.localeCompare(b.at))

		const identity = {
			blockName: artifact.blockName,
			blockVersion: artifact.blockVersion,
			identityKey: artifact.identityKey,
		}

		return {
			artifact: {
				id: artifact.id,
				blockName: artifact.blockName,
				blockVersion: artifact.blockVersion,
				identityRef: encodeArtifactIdentityRef(identity),
				identityKey: artifact.identityKey,
				status: artifact.status,
				phase: artifact.phase,
				phaseLabel: artifact.phaseLabel,
				phaseAt: artifact.phaseAt?.toISOString() ?? null,
				createdAt: artifact.createdAt.toISOString(),
				updatedAt: artifact.updatedAt.toISOString(),
				readyAt: artifact.readyAt?.toISOString() ?? null,
				input: artifact.input,
				output: artifact.output,
				rejection: artifact.rejection,
				error: artifact.error,
				supersededBy: artifact.supersededBy,
				supersededAt: artifact.supersededAt?.toISOString() ?? null,
			},
			runs: runs.map((run) => ({
				id: run.id,
				artifactId: run.artifactId,
				blockName: run.blockName,
				status: run.status,
				trigger: run.trigger ?? null,
				rejectionReason: run.rejectionReason ?? null,
				rejection: run.rejection ?? null,
				metadata: run.finish
					? { ...run.metadata, ...run.finish.metadata }
					: run.metadata,
				error: run.error ?? null,
				startedAt: run.startedAt.toISOString(),
				finishedAt: run.finishedAt?.toISOString() ?? null,
				durationMs: runDuration(run),
				createdAt: run.startedAt.toISOString(),
				updatedAt: (run.finishedAt ?? run.startedAt).toISOString(),
			})),
			modelCalls: modelCalls.map((call) => ({
				id: call.id,
				runId: call.runId,
				operationId: call.operationId ?? null,
				attempt: call.attempt,
				stepIndex: call.stepIndex,
				role: call.role,
				blockName: call.blockName,
				provider: call.modelProvider,
				model: call.model,
				responseModel: call.responseModel ?? null,
				status: call.status,
				artifactType: null,
				artifactId: null,
				metadata: call.metadata,
				input: call.input,
				instructions: call.instructions ?? null,
				instructionsHash: call.instructionsHash ?? null,
				output: call.output ?? null,
				error: call.error ?? null,
				validatorId: call.validatorId ?? null,
				validatorType: call.validatorType ?? null,
				createdAt: call.createdAt.toISOString(),
			})),
			validations: validations.map((validation) => ({
				id: validation.id,
				runId: validation.runId,
				operationId: validation.operationId ?? null,
				attempt: validation.attempt,
				validatorId: validation.validatorId,
				validatorType: validation.validatorType,
				status: validation.status,
				feedback: validation.feedback ?? null,
				metadata: validation.metadata ?? {},
				createdAt: validation.createdAt.toISOString(),
			})),
			statusHistory,
			lineage: {
				supersededBy: artifact.supersededBy,
				supersededAt: artifact.supersededAt?.toISOString() ?? null,
				supersededArtifacts: supersededArtifacts.map((a) => ({
					id: a.id,
					status: a.status,
					createdAt: a.createdAt.toISOString(),
					updatedAt: a.updatedAt.toISOString(),
				})),
			},
			aiSdkTrace: {
				events: [],
				source: "durable_model_calls",
				message:
					"No supplementary AI SDK telemetry events are persisted for this artifact. The model-call records above are the durable generation trace.",
			},
		}
	}

	async searchArtifacts(query: SearchQuery): Promise<SearchPage> {
		const sorted = this.store.artifacts
			.filter(
				(artifact) =>
					matchesSearch(artifact, query.q, query.searchField) &&
					(!query.blockName || artifact.blockName === query.blockName) &&
					(!query.status || artifact.status === query.status),
			)
			// desc(updatedAt), desc(id)
			.sort(
				(a, b) =>
					isoOf(b.updatedAt).localeCompare(isoOf(a.updatedAt)) ||
					b.id.localeCompare(a.id),
			)
			.filter((artifact) => {
				const cursor = query.cursor
				if (!cursor) return true
				const iso = isoOf(artifact.updatedAt)
				return (
					iso < cursor.updatedAt ||
					(iso === cursor.updatedAt && artifact.id < cursor.id)
				)
			})

		const page = sorted.slice(0, query.limit)
		const last = page.at(-1)
		const results: ArtifactSearchResult[] = page.map((artifact) => ({
			...this.artifactVersionResponse(artifact),
			input: artifact.input,
			output: artifact.output,
			rejection: artifact.rejection,
			error: artifact.error,
		}))
		return {
			results,
			nextCursor:
				sorted.length > query.limit && last
					? encodeCursor({ updatedAt: isoOf(last.updatedAt), id: last.id })
					: null,
		}
	}

	// --- shared rollups -----------------------------------------------------

	private artifactVersionResponse(
		artifact: ThinkingBlockArtifactRecord,
	): ArtifactVersionResponse {
		const summary = this.versionSummary(artifact.id)
		return {
			id: artifact.id,
			blockName: artifact.blockName,
			blockVersion: artifact.blockVersion,
			identityRef: encodeArtifactIdentityRef({
				blockName: artifact.blockName,
				blockVersion: artifact.blockVersion,
				identityKey: artifact.identityKey,
			}),
			identityKey: artifact.identityKey,
			status: artifact.status,
			phase: artifact.phase,
			phaseLabel: artifact.phaseLabel,
			phaseAt: artifact.phaseAt?.toISOString() ?? null,
			createdAt: artifact.createdAt.toISOString(),
			updatedAt: artifact.updatedAt.toISOString(),
			readyAt: artifact.readyAt?.toISOString() ?? null,
			supersededBy: artifact.supersededBy,
			supersededAt: artifact.supersededAt?.toISOString() ?? null,
			...summary,
		}
	}

	private versionSummary(artifactId: string): ArtifactVersionSummary {
		const runs = this.store.runs.filter((run) => run.artifactId === artifactId)
		const runIds = new Set(runs.map((run) => run.id))
		return {
			runCount: runs.length,
			modelCallCount: this.store.modelCalls.filter((call) =>
				runIds.has(call.runId),
			).length,
			validationCount: this.store.validations.filter((validation) =>
				runIds.has(validation.runId),
			).length,
			latestDurationMs: latestDuration(runs),
		}
	}

	private blockDuration(blockName: string): DurationSummary {
		return durationSummary(
			this.store.runs.filter((run) => run.blockName === blockName),
		)
	}

	private runsForArtifacts(
		artifacts: ThinkingBlockArtifactRecord[],
	): StoreRun[] {
		const ids = new Set(artifacts.map((a) => a.id))
		return this.store.runs.filter((run) => ids.has(run.artifactId))
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function matchesSearch(
	artifact: ThinkingBlockArtifactRecord,
	q: string | undefined,
	field: SearchField,
): boolean {
	if (!q) return true
	const needle = q.toLowerCase()
	if (field === "blockName")
		return artifact.blockName.toLowerCase().includes(needle)
	if (field === "artifactId") return artifact.id.toLowerCase().includes(needle)
	if (field === "identityKey")
		return artifact.identityKey.toLowerCase().includes(needle)
	return [artifact.blockName, artifact.id, artifact.identityKey].some((value) =>
		value.toLowerCase().includes(needle),
	)
}

function countStatuses(artifacts: ThinkingBlockArtifactRecord[]): StatusCounts {
	const counts: StatusCounts = {
		pending: 0,
		running: 0,
		ready: 0,
		rejected: 0,
		failed: 0,
		superseded: 0,
	}
	for (const artifact of artifacts) counts[artifact.status] += 1
	return counts
}

function runDuration(run: StoreRun): number | null {
	return run.finishedAt
		? run.finishedAt.getTime() - run.startedAt.getTime()
		: null
}

// Latest run with a duration, ordered desc(finishedAt), desc(startedAt), desc(id).
function latestDuration(runs: StoreRun[]): number | null {
	const ranked = runs
		.filter((run) => run.finishedAt)
		.sort(
			(a, b) =>
				isoOf(b.finishedAt).localeCompare(isoOf(a.finishedAt)) ||
				isoOf(b.startedAt).localeCompare(isoOf(a.startedAt)) ||
				b.id.localeCompare(a.id),
		)
	const latest = ranked[0]
	return latest ? runDuration(latest) : null
}

function durationSummary(runs: StoreRun[]): DurationSummary {
	const durations = runs
		.map(runDuration)
		.filter((ms): ms is number => ms !== null)
	if (durations.length === 0) return { avgMs: null, p95Ms: null }
	const avgMs =
		durations.reduce((total, ms) => total + ms, 0) / durations.length
	return { avgMs, p95Ms: percentileCont(durations, 0.95) }
}

// PostgreSQL percentile_cont: linear interpolation between the surrounding ranks.
function percentileCont(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b)
	if (sorted.length === 1) return sorted[0] as number
	const rank = p * (sorted.length - 1)
	const lo = Math.floor(rank)
	const hi = Math.ceil(rank)
	const low = sorted[lo] as number
	const high = sorted[hi] as number
	return low + (high - low) * (rank - lo)
}

function compareSortValue(a: string | number, b: string | number): number {
	if (typeof a === "number" && typeof b === "number") return a - b
	return String(a).localeCompare(String(b))
}

function maxDate(dates: Date[]): Date | null {
	let max: Date | null = null
	for (const date of dates) if (!max || date > max) max = date
	return max
}

function isoOf(date: Date | null | undefined): string {
	return date ? date.toISOString() : ""
}
