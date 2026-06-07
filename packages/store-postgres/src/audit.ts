import {
	type ArtifactIdentityRef,
	type ArtifactVersionSummary,
	artifactStatuses,
	type BlockSummary,
	encodeArtifactIdentityRef,
	InvalidCursorError,
	identityGroupKey,
	type ListArtifactVersionsQuery,
	type ListBlocksQuery,
	type ListResourcesQuery,
	type ResourceSortBy,
	type ResourceSortDirection,
	type ResourceSummary,
	type SearchQuery,
	type StatusCounts,
	type ThinkingBlockReader,
} from "@thinking-blocks/core"
import {
	and,
	asc,
	avg,
	count,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	isNotNull,
	lt,
	max,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import type { Executor } from "./db"
import {
	thinkingBlockArtifacts,
	thinkingBlockModelCalls,
	thinkingBlockRuns,
	thinkingBlockValidationResults,
} from "./schema"

// The query/cursor schemas, the identity-ref codec, the result shapes, and the
// ThinkingBlockReader interface live in @thinking-blocks/core (the backend-
// agnostic read contract). This file is the Postgres backend for it: the five
// reads as Drizzle queries, plus DrizzleThinkingBlockReader at the bottom.

// ---------------------------------------------------------------------------
// blocks
// ---------------------------------------------------------------------------

export async function listBlocks(db: Executor, query: ListBlocksQuery) {
	const visibleBlockConditions: SQL[] = []
	if (query.q) {
		const pattern = `%${query.q}%`
		if (query.searchField === "blockName") {
			visibleBlockConditions.push(
				ilike(thinkingBlockArtifacts.blockName, pattern),
			)
		} else if (query.searchField === "artifactId") {
			visibleBlockConditions.push(
				ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
			)
		} else if (query.searchField === "identityKey") {
			visibleBlockConditions.push(
				ilike(thinkingBlockArtifacts.identityKey, pattern),
			)
		} else {
			visibleBlockConditions.push(
				or(
					ilike(thinkingBlockArtifacts.blockName, pattern),
					ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
					ilike(thinkingBlockArtifacts.identityKey, pattern),
				) ?? sql`false`,
			)
		}
	}
	if (query.status) {
		visibleBlockConditions.push(eq(thinkingBlockArtifacts.status, query.status))
	}

	const latestActivityAt = max(thinkingBlockArtifacts.updatedAt)
	const rows = await db
		.select({
			blockName: thinkingBlockArtifacts.blockName,
			latestActivityAt,
		})
		.from(thinkingBlockArtifacts)
		.where(and(...visibleBlockConditions))
		.groupBy(thinkingBlockArtifacts.blockName)
		.having(
			query.cursor
				? or(
						sql<boolean>`${latestActivityAt} < ${query.cursor.latestActivityAt}::timestamptz`,
						and(
							sql<boolean>`${latestActivityAt} = ${query.cursor.latestActivityAt}::timestamptz`,
							gt(thinkingBlockArtifacts.blockName, query.cursor.blockName),
						),
					)
				: undefined,
		)
		.orderBy(desc(latestActivityAt), asc(thinkingBlockArtifacts.blockName))
		.limit(query.limit + 1)

	const page = rows.slice(0, query.limit)
	const blockNames = page.map((row) => row.blockName)
	const [statusRows, durationRows] =
		blockNames.length === 0
			? [[], []]
			: await Promise.all([
					db
						.select({
							blockName: thinkingBlockArtifacts.blockName,
							status: thinkingBlockArtifacts.status,
							value: count(),
						})
						.from(thinkingBlockArtifacts)
						.where(inArray(thinkingBlockArtifacts.blockName, blockNames))
						.groupBy(
							thinkingBlockArtifacts.blockName,
							thinkingBlockArtifacts.status,
						),
					db
						.select({
							blockName: thinkingBlockRuns.blockName,
							avgMs: avg(thinkingBlockRuns.durationMs),
							p95Ms: sql<
								number | string | null
							>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${thinkingBlockRuns.durationMs})`,
						})
						.from(thinkingBlockRuns)
						.where(
							and(
								inArray(thinkingBlockRuns.blockName, blockNames),
								isNotNull(thinkingBlockRuns.durationMs),
							),
						)
						.groupBy(thinkingBlockRuns.blockName),
				])

	const visibleBlockStatusCounts = new Map<
		string,
		Partial<Record<(typeof artifactStatuses)[number], number>>
	>()
	for (const row of statusRows) {
		const statusCounts = visibleBlockStatusCounts.get(row.blockName) ?? {}
		statusCounts[row.status] = row.value
		visibleBlockStatusCounts.set(row.blockName, statusCounts)
	}

	const visibleBlockDurations = new Map<
		string,
		{ avgMs: number | null; p95Ms: number | null }
	>()
	for (const row of durationRows) {
		visibleBlockDurations.set(row.blockName, {
			avgMs: row.avgMs === null ? null : Number(row.avgMs),
			p95Ms: row.p95Ms === null ? null : Number(row.p95Ms),
		})
	}

	const blocks: BlockSummary[] = page.map((row) => {
		const counts = visibleBlockStatusCounts.get(row.blockName) ?? {}
		const statusCounts = {
			pending: counts.pending ?? 0,
			running: counts.running ?? 0,
			ready: counts.ready ?? 0,
			rejected: counts.rejected ?? 0,
			failed: counts.failed ?? 0,
			superseded: counts.superseded ?? 0,
		}
		return {
			blockName: row.blockName,
			totalArtifacts: artifactStatuses.reduce(
				(total, status) => total + statusCounts[status],
				0,
			),
			statusCounts,
			latestActivityAt: row.latestActivityAt
				? new Date(row.latestActivityAt).toISOString()
				: null,
			duration: visibleBlockDurations.get(row.blockName) ?? {
				avgMs: null,
				p95Ms: null,
			},
		}
	})

	return {
		blocks,
		nextCursor:
			rows.length > query.limit && page.at(-1)
				? Buffer.from(
						JSON.stringify({
							latestActivityAt: page.at(-1)?.latestActivityAt
								? new Date(page.at(-1)?.latestActivityAt ?? "").toISOString()
								: "",
							blockName: page.at(-1)?.blockName ?? "",
						}),
						"utf8",
					).toString("base64url")
				: null,
	}
}

// ---------------------------------------------------------------------------
// artifacts
// ---------------------------------------------------------------------------

export async function listArtifactVersions(
	db: Executor,
	identity: ArtifactIdentityRef,
	query: ListArtifactVersionsQuery,
) {
	const identityRef = encodeArtifactIdentityRef(identity)

	const rows = await db
		.select()
		.from(thinkingBlockArtifacts)
		.where(
			and(
				eq(thinkingBlockArtifacts.blockName, identity.blockName),
				eq(thinkingBlockArtifacts.blockVersion, identity.blockVersion),
				eq(thinkingBlockArtifacts.identityKey, identity.identityKey),
				query.cursor
					? or(
							sql<boolean>`${thinkingBlockArtifacts.createdAt} < ${query.cursor.createdAt}::timestamptz`,
							and(
								sql<boolean>`${thinkingBlockArtifacts.createdAt} = ${query.cursor.createdAt}::timestamptz`,
								lt(thinkingBlockArtifacts.id, query.cursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(
			desc(thinkingBlockArtifacts.createdAt),
			desc(thinkingBlockArtifacts.id),
		)
		.limit(query.limit + 1)

	const page = rows.slice(0, query.limit)
	const versionSummaries = await readArtifactVersionSummaries(
		db,
		page.map((row) => row.id),
	)

	return {
		identity: {
			...identity,
			identityRef,
		},
		artifacts: page.map((row) =>
			artifactVersionResponse(row, versionSummaries.get(row.id)),
		),
		nextCursor:
			rows.length > query.limit && page.at(-1)
				? Buffer.from(
						JSON.stringify({
							createdAt: page.at(-1)?.createdAt
								? new Date(page.at(-1)?.createdAt ?? "").toISOString()
								: "",
							id: page.at(-1)?.id ?? "",
						}),
						"utf8",
					).toString("base64url")
				: null,
	}
}

export async function getArtifactDetail(db: Executor, artifactId: string) {
	const artifact = await db.query.thinkingBlockArtifacts.findFirst({
		where: eq(thinkingBlockArtifacts.id, artifactId),
	})
	if (!artifact) return null

	const runs = await db
		.select()
		.from(thinkingBlockRuns)
		.where(eq(thinkingBlockRuns.thinkingBlockArtifactId, artifact.id))
		.orderBy(asc(thinkingBlockRuns.startedAt), asc(thinkingBlockRuns.id))

	const runIds = runs.map((run) => run.id)
	const [modelCalls, validations, supersededArtifacts] = await Promise.all([
		runIds.length > 0
			? db
					.select()
					.from(thinkingBlockModelCalls)
					.where(inArray(thinkingBlockModelCalls.thinkingBlockRunId, runIds))
					.orderBy(
						asc(thinkingBlockModelCalls.createdAt),
						asc(thinkingBlockModelCalls.attempt),
						asc(thinkingBlockModelCalls.stepIndex),
						asc(thinkingBlockModelCalls.id),
					)
			: Promise.resolve([]),
		runIds.length > 0
			? db
					.select()
					.from(thinkingBlockValidationResults)
					.where(
						inArray(thinkingBlockValidationResults.thinkingBlockRunId, runIds),
					)
					.orderBy(
						asc(thinkingBlockValidationResults.createdAt),
						asc(thinkingBlockValidationResults.attempt),
						asc(thinkingBlockValidationResults.id),
					)
			: Promise.resolve([]),
		db
			.select({
				id: thinkingBlockArtifacts.id,
				status: thinkingBlockArtifacts.status,
				createdAt: thinkingBlockArtifacts.createdAt,
				updatedAt: thinkingBlockArtifacts.updatedAt,
			})
			.from(thinkingBlockArtifacts)
			.where(eq(thinkingBlockArtifacts.supersededBy, artifact.id))
			.orderBy(
				asc(thinkingBlockArtifacts.supersededAt),
				asc(thinkingBlockArtifacts.id),
			),
	])

	const identity = {
		blockName: artifact.blockName,
		blockVersion: artifact.blockVersion,
		identityKey: artifact.identityKey,
	}

	const statusHistory = [
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
		...(() => {
			const finalAt =
				artifact.status === "ready"
					? artifact.readyAt
					: artifact.status === "superseded"
						? artifact.supersededAt
						: artifact.status === "rejected" || artifact.status === "failed"
							? artifact.updatedAt
							: null
			return finalAt
				? [
						{
							status: artifact.status,
							at: finalAt.toISOString(),
							source: "artifact",
							label: `Artifact ${artifact.status}`,
						},
					]
				: []
		})(),
	].sort((a, b) => a.at.localeCompare(b.at))

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
			artifactId: run.thinkingBlockArtifactId,
			blockName: run.blockName,
			status: run.status,
			trigger: run.trigger,
			rejectionReason: run.rejectionReason,
			rejection: run.rejection,
			metadata: run.metadata,
			error: run.error,
			startedAt: run.startedAt.toISOString(),
			finishedAt: run.finishedAt?.toISOString() ?? null,
			durationMs: run.durationMs,
			createdAt: run.createdAt.toISOString(),
			updatedAt: run.updatedAt.toISOString(),
		})),
		modelCalls: modelCalls.map((call) => ({
			id: call.id,
			runId: call.thinkingBlockRunId,
			operationId: call.operationId,
			attempt: call.attempt,
			stepIndex: call.stepIndex,
			role: call.role,
			blockName: call.blockName,
			provider: call.provider,
			model: call.model,
			responseModel: call.responseModel,
			status: call.status,
			artifactType: call.artifactType,
			artifactId: call.artifactId,
			metadata: call.metadata,
			input: call.input,
			instructions: call.instructions,
			instructionsHash: call.instructionsHash,
			output: call.output,
			error: call.error,
			validatorId: call.validatorId,
			validatorType: call.validatorType,
			createdAt: call.createdAt.toISOString(),
		})),
		validations: validations.map((validation) => ({
			id: validation.id,
			runId: validation.thinkingBlockRunId,
			operationId: validation.operationId,
			attempt: validation.attempt,
			validatorId: validation.validatorId,
			validatorType: validation.validatorType,
			status: validation.status,
			feedback: validation.feedback,
			metadata: validation.metadata,
			createdAt: validation.createdAt.toISOString(),
		})),
		statusHistory,
		lineage: {
			supersededBy: artifact.supersededBy,
			supersededAt: artifact.supersededAt?.toISOString() ?? null,
			supersededArtifacts: supersededArtifacts.map((row) => ({
				id: row.id,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
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

export async function readArtifactVersionSummaries(
	db: Executor,
	artifactIds: string[],
) {
	const summariesByArtifactId = new Map<string, ArtifactVersionSummary>()
	if (artifactIds.length === 0) return summariesByArtifactId

	for (const artifactId of artifactIds) {
		summariesByArtifactId.set(artifactId, {
			runCount: 0,
			modelCallCount: 0,
			validationCount: 0,
			latestDurationMs: null,
		})
	}

	const [runCounts, modelCallCounts, validationCounts, durationRows] =
		await Promise.all([
			db
				.select({
					artifactId: thinkingBlockRuns.thinkingBlockArtifactId,
					value: count(),
				})
				.from(thinkingBlockRuns)
				.where(inArray(thinkingBlockRuns.thinkingBlockArtifactId, artifactIds))
				.groupBy(thinkingBlockRuns.thinkingBlockArtifactId),
			db
				.select({
					artifactId: thinkingBlockRuns.thinkingBlockArtifactId,
					value: count(),
				})
				.from(thinkingBlockModelCalls)
				.innerJoin(
					thinkingBlockRuns,
					eq(thinkingBlockModelCalls.thinkingBlockRunId, thinkingBlockRuns.id),
				)
				.where(inArray(thinkingBlockRuns.thinkingBlockArtifactId, artifactIds))
				.groupBy(thinkingBlockRuns.thinkingBlockArtifactId),
			db
				.select({
					artifactId: thinkingBlockRuns.thinkingBlockArtifactId,
					value: count(),
				})
				.from(thinkingBlockValidationResults)
				.innerJoin(
					thinkingBlockRuns,
					eq(
						thinkingBlockValidationResults.thinkingBlockRunId,
						thinkingBlockRuns.id,
					),
				)
				.where(inArray(thinkingBlockRuns.thinkingBlockArtifactId, artifactIds))
				.groupBy(thinkingBlockRuns.thinkingBlockArtifactId),
			db
				.select({
					artifactId: thinkingBlockRuns.thinkingBlockArtifactId,
					durationMs: thinkingBlockRuns.durationMs,
				})
				.from(thinkingBlockRuns)
				.where(
					and(
						inArray(thinkingBlockRuns.thinkingBlockArtifactId, artifactIds),
						isNotNull(thinkingBlockRuns.durationMs),
					),
				)
				.orderBy(
					desc(thinkingBlockRuns.finishedAt),
					desc(thinkingBlockRuns.startedAt),
					desc(thinkingBlockRuns.id),
				),
		])

	for (const row of runCounts) {
		const summary = row.artifactId
			? summariesByArtifactId.get(row.artifactId)
			: undefined
		if (summary) {
			summary.runCount = row.value
		}
	}
	for (const row of modelCallCounts) {
		const summary = row.artifactId
			? summariesByArtifactId.get(row.artifactId)
			: undefined
		if (summary) {
			summary.modelCallCount = row.value
		}
	}
	for (const row of validationCounts) {
		const summary = row.artifactId
			? summariesByArtifactId.get(row.artifactId)
			: undefined
		if (summary) {
			summary.validationCount = row.value
		}
	}
	for (const row of durationRows) {
		const summary = row.artifactId
			? summariesByArtifactId.get(row.artifactId)
			: undefined
		if (
			summary &&
			row.durationMs !== null &&
			summary.latestDurationMs === null
		) {
			summary.latestDurationMs = row.durationMs
		}
	}

	return summariesByArtifactId
}

export function artifactVersionResponse(
	row: typeof thinkingBlockArtifacts.$inferSelect,
	summary: ArtifactVersionSummary | undefined,
) {
	return {
		id: row.id,
		blockName: row.blockName,
		blockVersion: row.blockVersion,
		identityRef: encodeArtifactIdentityRef({
			blockName: row.blockName,
			blockVersion: row.blockVersion,
			identityKey: row.identityKey,
		}),
		identityKey: row.identityKey,
		status: row.status,
		phase: row.phase,
		phaseLabel: row.phaseLabel,
		phaseAt: row.phaseAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		readyAt: row.readyAt?.toISOString() ?? null,
		supersededBy: row.supersededBy,
		supersededAt: row.supersededAt?.toISOString() ?? null,
		runCount: summary?.runCount ?? 0,
		modelCallCount: summary?.modelCallCount ?? 0,
		validationCount: summary?.validationCount ?? 0,
		latestDurationMs: summary?.latestDurationMs ?? null,
	}
}

// ---------------------------------------------------------------------------
// resources
// ---------------------------------------------------------------------------

export async function listBlockResources(
	db: Executor,
	blockName: string,
	query: ListResourcesQuery,
) {
	const visibleIdentityConditions: SQL[] = [
		eq(thinkingBlockArtifacts.blockName, blockName),
	]
	if (query.q) {
		const pattern = `%${query.q}%`
		if (query.searchField === "blockName") {
			visibleIdentityConditions.push(
				ilike(thinkingBlockArtifacts.blockName, pattern),
			)
		} else if (query.searchField === "artifactId") {
			visibleIdentityConditions.push(
				ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
			)
		} else if (query.searchField === "identityKey") {
			visibleIdentityConditions.push(
				ilike(thinkingBlockArtifacts.identityKey, pattern),
			)
		} else {
			visibleIdentityConditions.push(
				or(
					ilike(thinkingBlockArtifacts.blockName, pattern),
					ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
					ilike(thinkingBlockArtifacts.identityKey, pattern),
				) ?? sql`false`,
			)
		}
	}
	if (query.status) {
		visibleIdentityConditions.push(
			eq(thinkingBlockArtifacts.status, query.status),
		)
	}

	const latestUpdatedAt = max(thinkingBlockArtifacts.updatedAt)
	const totalArtifacts = count()
	const sortValue =
		query.sortBy === "identityKey"
			? sql<string>`${thinkingBlockArtifacts.identityKey}`
			: query.sortBy === "totalArtifacts"
				? sql<number>`${totalArtifacts}`
				: sql<Date>`${latestUpdatedAt}`
	if (
		query.cursor &&
		(query.cursor.sortBy !== query.sortBy ||
			query.cursor.sortDirection !== query.sortDirection)
	) {
		throw new InvalidCursorError()
	}
	const cursorTie =
		query.cursor &&
		(or(
			gt(thinkingBlockArtifacts.blockVersion, query.cursor.blockVersion),
			and(
				eq(thinkingBlockArtifacts.blockVersion, query.cursor.blockVersion),
				gt(thinkingBlockArtifacts.identityKey, query.cursor.identityKey),
			),
		) ??
			sql`false`)
	const cursorCondition = query.cursor
		? or(
				cursorSortComparison(
					query.sortBy,
					query.sortDirection,
					sortValue,
					query.cursor.sortValue,
				),
				and(
					cursorSortEquality(query.sortBy, sortValue, query.cursor.sortValue),
					cursorTie,
				),
			)
		: undefined

	const rows = await db
		.select({
			blockName: thinkingBlockArtifacts.blockName,
			blockVersion: thinkingBlockArtifacts.blockVersion,
			identityKey: thinkingBlockArtifacts.identityKey,
			latestUpdatedAt,
			totalArtifacts,
			sortValue,
		})
		.from(thinkingBlockArtifacts)
		.where(and(...visibleIdentityConditions))
		.groupBy(
			thinkingBlockArtifacts.blockName,
			thinkingBlockArtifacts.blockVersion,
			thinkingBlockArtifacts.identityKey,
		)
		.having(cursorCondition)
		.orderBy(
			query.sortDirection === "asc" ? asc(sortValue) : desc(sortValue),
			asc(thinkingBlockArtifacts.blockVersion),
			asc(thinkingBlockArtifacts.identityKey),
		)
		.limit(query.limit + 1)

	const page = rows.slice(0, query.limit)
	const identityConditions =
		page.length === 0
			? sql`false`
			: (or(
					...page.map((identity) =>
						and(
							eq(thinkingBlockArtifacts.blockVersion, identity.blockVersion),
							eq(thinkingBlockArtifacts.identityKey, identity.identityKey),
						),
					),
				) ?? sql`false`)

	const [statusRows, latestArtifactRows, durationRows, latestDurationRows] =
		page.length === 0
			? [[], [], [], []]
			: await Promise.all([
					db
						.select({
							blockVersion: thinkingBlockArtifacts.blockVersion,
							identityKey: thinkingBlockArtifacts.identityKey,
							status: thinkingBlockArtifacts.status,
							value: count(),
						})
						.from(thinkingBlockArtifacts)
						.where(and(...visibleIdentityConditions, identityConditions))
						.groupBy(
							thinkingBlockArtifacts.blockVersion,
							thinkingBlockArtifacts.identityKey,
							thinkingBlockArtifacts.status,
						),
					db
						.select({
							id: thinkingBlockArtifacts.id,
							blockVersion: thinkingBlockArtifacts.blockVersion,
							identityKey: thinkingBlockArtifacts.identityKey,
							status: thinkingBlockArtifacts.status,
							phase: thinkingBlockArtifacts.phase,
							phaseLabel: thinkingBlockArtifacts.phaseLabel,
						})
						.from(thinkingBlockArtifacts)
						.where(and(...visibleIdentityConditions, identityConditions))
						.orderBy(
							desc(thinkingBlockArtifacts.updatedAt),
							desc(thinkingBlockArtifacts.createdAt),
							desc(thinkingBlockArtifacts.id),
						),
					db
						.select({
							blockVersion: thinkingBlockArtifacts.blockVersion,
							identityKey: thinkingBlockArtifacts.identityKey,
							avgMs: avg(thinkingBlockRuns.durationMs),
							p95Ms: sql<
								number | string | null
							>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${thinkingBlockRuns.durationMs})`,
						})
						.from(thinkingBlockArtifacts)
						.innerJoin(
							thinkingBlockRuns,
							eq(
								thinkingBlockRuns.thinkingBlockArtifactId,
								thinkingBlockArtifacts.id,
							),
						)
						.where(
							and(
								...visibleIdentityConditions,
								identityConditions,
								isNotNull(thinkingBlockRuns.durationMs),
							),
						)
						.groupBy(
							thinkingBlockArtifacts.blockVersion,
							thinkingBlockArtifacts.identityKey,
						),
					db
						.select({
							blockVersion: thinkingBlockArtifacts.blockVersion,
							identityKey: thinkingBlockArtifacts.identityKey,
							durationMs: thinkingBlockRuns.durationMs,
						})
						.from(thinkingBlockArtifacts)
						.innerJoin(
							thinkingBlockRuns,
							eq(
								thinkingBlockRuns.thinkingBlockArtifactId,
								thinkingBlockArtifacts.id,
							),
						)
						.where(
							and(
								...visibleIdentityConditions,
								identityConditions,
								isNotNull(thinkingBlockRuns.durationMs),
							),
						)
						.orderBy(
							desc(thinkingBlockRuns.finishedAt),
							desc(thinkingBlockRuns.startedAt),
							desc(thinkingBlockRuns.id),
						),
				])

	const visibleIdentityStatusCounts = new Map<string, Partial<StatusCounts>>()
	for (const row of statusRows) {
		const key = identityGroupKey(row)
		const counts = visibleIdentityStatusCounts.get(key) ?? {}
		counts[row.status] = row.value
		visibleIdentityStatusCounts.set(key, counts)
	}

	const visibleIdentityLatestArtifacts = new Map<
		string,
		(typeof latestArtifactRows)[number]
	>()
	for (const row of latestArtifactRows) {
		const key = identityGroupKey(row)
		if (!visibleIdentityLatestArtifacts.has(key)) {
			visibleIdentityLatestArtifacts.set(key, row)
		}
	}

	const visibleIdentityDurations = new Map<
		string,
		{ avgMs: number | null; p95Ms: number | null }
	>()
	for (const row of durationRows) {
		visibleIdentityDurations.set(identityGroupKey(row), {
			avgMs: row.avgMs === null ? null : Number(row.avgMs),
			p95Ms: row.p95Ms === null ? null : Number(row.p95Ms),
		})
	}

	const visibleIdentityLatestDurations = new Map<string, number>()
	for (const row of latestDurationRows) {
		const key = identityGroupKey(row)
		if (row.durationMs !== null && !visibleIdentityLatestDurations.has(key)) {
			visibleIdentityLatestDurations.set(key, row.durationMs)
		}
	}

	const resources: ResourceSummary[] = page.map((row) => {
		const key = identityGroupKey(row)
		const counts = visibleIdentityStatusCounts.get(key) ?? {}
		const latestArtifact = visibleIdentityLatestArtifacts.get(key)
		const statusCounts = {
			pending: counts.pending ?? 0,
			running: counts.running ?? 0,
			ready: counts.ready ?? 0,
			rejected: counts.rejected ?? 0,
			failed: counts.failed ?? 0,
			superseded: counts.superseded ?? 0,
		}
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
			statusCounts,
			latestArtifactId: latestArtifact?.id ?? null,
			latestStatus: latestArtifact?.status ?? null,
			latestPhase: latestArtifact?.phase ?? null,
			latestPhaseLabel: latestArtifact?.phaseLabel ?? null,
			latestUpdatedAt: row.latestUpdatedAt
				? new Date(row.latestUpdatedAt).toISOString()
				: null,
			latestDurationMs: visibleIdentityLatestDurations.get(key) ?? null,
			duration: visibleIdentityDurations.get(key) ?? {
				avgMs: null,
				p95Ms: null,
			},
		}
	})

	return {
		blockName,
		resources,
		nextCursor:
			rows.length > query.limit && page.at(-1)
				? Buffer.from(
						JSON.stringify({
							sortBy: query.sortBy,
							sortDirection: query.sortDirection,
							sortValue:
								query.sortBy === "latestUpdatedAt"
									? page.at(-1)?.sortValue
										? new Date(page.at(-1)?.sortValue ?? "").toISOString()
										: ""
									: query.sortBy === "totalArtifacts"
										? Number(page.at(-1)?.sortValue ?? 0)
										: String(page.at(-1)?.sortValue ?? ""),
							identityKey: page.at(-1)?.identityKey ?? "",
							blockVersion: page.at(-1)?.blockVersion ?? "",
						}),
						"utf8",
					).toString("base64url")
				: null,
	}
}

export function cursorSortComparison(
	sortBy: ResourceSortBy,
	direction: ResourceSortDirection,
	sortValue: SQL,
	cursorValue: string | number,
) {
	if (sortBy === "latestUpdatedAt") {
		return direction === "asc"
			? sql<boolean>`${sortValue} > ${String(cursorValue)}::timestamptz`
			: sql<boolean>`${sortValue} < ${String(cursorValue)}::timestamptz`
	}
	if (sortBy === "totalArtifacts") {
		return direction === "asc"
			? gt(sortValue, Number(cursorValue))
			: lt(sortValue, Number(cursorValue))
	}
	return direction === "asc"
		? gt(sortValue, String(cursorValue))
		: lt(sortValue, String(cursorValue))
}

export function cursorSortEquality(
	sortBy: ResourceSortBy,
	sortValue: SQL,
	cursorValue: string | number,
) {
	if (sortBy === "latestUpdatedAt") {
		return sql<boolean>`${sortValue} = ${String(cursorValue)}::timestamptz`
	}
	if (sortBy === "totalArtifacts") {
		return eq(sortValue, Number(cursorValue))
	}
	return eq(sortValue, String(cursorValue))
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export async function searchArtifacts(db: Executor, query: SearchQuery) {
	const conditions: SQL[] = []
	if (query.q) {
		const pattern = `%${query.q}%`
		if (query.searchField === "blockName") {
			conditions.push(ilike(thinkingBlockArtifacts.blockName, pattern))
		} else if (query.searchField === "artifactId") {
			conditions.push(
				ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
			)
		} else if (query.searchField === "identityKey") {
			conditions.push(ilike(thinkingBlockArtifacts.identityKey, pattern))
		} else {
			conditions.push(
				or(
					ilike(thinkingBlockArtifacts.blockName, pattern),
					ilike(sql<string>`${thinkingBlockArtifacts.id}::text`, pattern),
					ilike(thinkingBlockArtifacts.identityKey, pattern),
				) ?? sql`false`,
			)
		}
	}
	if (query.blockName) {
		conditions.push(eq(thinkingBlockArtifacts.blockName, query.blockName))
	}
	if (query.status) {
		conditions.push(eq(thinkingBlockArtifacts.status, query.status))
	}
	if (query.cursor) {
		conditions.push(
			or(
				sql<boolean>`${thinkingBlockArtifacts.updatedAt} < ${query.cursor.updatedAt}::timestamptz`,
				and(
					sql<boolean>`${thinkingBlockArtifacts.updatedAt} = ${query.cursor.updatedAt}::timestamptz`,
					lt(thinkingBlockArtifacts.id, query.cursor.id),
				),
			) ?? sql`false`,
		)
	}

	const rows = await db
		.select()
		.from(thinkingBlockArtifacts)
		.where(and(...conditions))
		.orderBy(
			desc(thinkingBlockArtifacts.updatedAt),
			desc(thinkingBlockArtifacts.id),
		)
		.limit(query.limit + 1)

	const page = rows.slice(0, query.limit)
	const versionSummaries = await readArtifactVersionSummaries(
		db,
		page.map((row) => row.id),
	)

	return {
		results: page.map((row) => ({
			...artifactVersionResponse(row, versionSummaries.get(row.id)),
			input: row.input,
			output: row.output,
			rejection: row.rejection,
			error: row.error,
		})),
		nextCursor:
			rows.length > query.limit && page.at(-1)
				? Buffer.from(
						JSON.stringify({
							updatedAt: page.at(-1)?.updatedAt
								? new Date(page.at(-1)?.updatedAt ?? "").toISOString()
								: "",
							id: page.at(-1)?.id ?? "",
						}),
						"utf8",
					).toString("base64url")
				: null,
	}
}

// ---------------------------------------------------------------------------
// reader
// ---------------------------------------------------------------------------

// The Postgres ThinkingBlockReader the dashboard server reads through: it binds
// the five queries above to one Drizzle executor. `implements ThinkingBlockReader`
// is the guard that keeps these return shapes identical to the in-memory reader.
export class DrizzleThinkingBlockReader implements ThinkingBlockReader {
	constructor(private executor: Executor) {}

	listBlocks(query: ListBlocksQuery) {
		return listBlocks(this.executor, query)
	}
	listBlockResources(blockName: string, query: ListResourcesQuery) {
		return listBlockResources(this.executor, blockName, query)
	}
	listArtifactVersions(
		identity: ArtifactIdentityRef,
		query: ListArtifactVersionsQuery,
	) {
		return listArtifactVersions(this.executor, identity, query)
	}
	getArtifactDetail(artifactId: string) {
		return getArtifactDetail(this.executor, artifactId)
	}
	searchArtifacts(query: SearchQuery) {
		return searchArtifacts(this.executor, query)
	}
}
