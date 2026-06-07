// @thinking-blocks/core — the read contract.
//
// The dashboard reads through a `ThinkingBlockReader`, the same way the engine
// writes through a `ThinkingBlockStore`. This file is the backend-agnostic seam:
// the query/cursor schemas, the identity-ref + cursor codecs, the result shapes,
// and the reader interface. Both backends implement it — the Postgres audit
// queries (@thinking-blocks/store-postgres) and the in-memory reader below it
// (./memory-reader). Pure: zod + node Buffer only, no `ai`, no Drizzle.

import type { ThinkingBlockArtifactStatus } from "@thinking-blocks/store"
import { z } from "zod"

// ---------------------------------------------------------------------------
// identity-ref codec
// ---------------------------------------------------------------------------

const artifactIdentityRefSchema = z.object({
	blockName: z.string(),
	blockVersion: z.string(),
	identityKey: z.string(),
})

export type ArtifactIdentityRef = z.infer<typeof artifactIdentityRefSchema>

export function encodeArtifactIdentityRef(
	identity: ArtifactIdentityRef,
): string {
	return Buffer.from(JSON.stringify(identity), "utf8").toString("base64url")
}

export function decodeArtifactIdentityRef(
	value: string,
): ArtifactIdentityRef | null {
	try {
		const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
		const parsed = artifactIdentityRefSchema.safeParse(decoded)
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

// ---------------------------------------------------------------------------
// cursor codec
// ---------------------------------------------------------------------------

export class InvalidCursorError extends Error {
	constructor(message = "Invalid cursor") {
		super(message)
		this.name = "InvalidCursorError"
	}
}

// Cursors are an opaque base64url(JSON) token. `encodedJsonCursor` decodes one
// query-string value back to its typed keyset; `encodeCursor` is the inverse the
// readers use to mint the `nextCursor` of a page.
export const encodedJsonCursor = <T extends z.ZodType>(schema: T) =>
	z.string().transform((value, ctx): z.infer<T> => {
		try {
			const decoded = JSON.parse(
				Buffer.from(value, "base64url").toString("utf8"),
			)
			const parsed = schema.safeParse(decoded)
			if (parsed.success) return parsed.data
		} catch {
			// zod issue is added below.
		}
		ctx.addIssue({
			code: "custom",
			message: "Invalid cursor",
		})
		return z.NEVER
	})

export function encodeCursor(value: unknown): string {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

// ---------------------------------------------------------------------------
// status vocabulary
// ---------------------------------------------------------------------------

export const artifactStatuses = [
	"pending",
	"running",
	"ready",
	"rejected",
	"failed",
	"superseded",
] as const

export const artifactStatusSchema = z.enum(artifactStatuses)

export type ArtifactStatus = ThinkingBlockArtifactStatus
export type StatusCounts = Record<ArtifactStatus, number>

// ---------------------------------------------------------------------------
// query schemas
// ---------------------------------------------------------------------------

const timestampSchema = z
	.string()
	.refine((value) => Number.isFinite(Date.parse(value)), {
		message: "Invalid timestamp",
	})

const pageLimitSchema = z.preprocess(
	(value) => (value === undefined ? 50 : value),
	z.coerce.number().int().min(1).max(100).catch(50),
)

const optionalTextSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => value || undefined)

const optionalStatusSchema = z.preprocess(
	(value) => (value === "" || value === "all" ? undefined : value),
	artifactStatusSchema.optional(),
)

const searchFieldSchema = z
	.enum(["all", "blockName", "artifactId", "identityKey"])
	.catch("all")

const resourceSortBySchema = z
	.enum(["latestUpdatedAt", "identityKey", "totalArtifacts"])
	.catch("latestUpdatedAt")

const resourceSortDirectionSchema = z.enum(["asc", "desc"]).catch("desc")

export type ResourceSortBy = z.infer<typeof resourceSortBySchema>
export type ResourceSortDirection = z.infer<typeof resourceSortDirectionSchema>
export type SearchField = z.infer<typeof searchFieldSchema>

export const blockCursorSchema = z.object({
	latestActivityAt: timestampSchema,
	blockName: z.string(),
})

export const resourceCursorSchema = z
	.object({
		sortBy: resourceSortBySchema,
		sortDirection: resourceSortDirectionSchema,
		sortValue: z.union([z.string(), z.number().finite()]),
		blockVersion: z.string(),
		identityKey: z.string(),
	})
	.superRefine((value, ctx) => {
		if (
			value.sortBy === "latestUpdatedAt" &&
			(typeof value.sortValue !== "string" ||
				!Number.isFinite(Date.parse(value.sortValue)))
		) {
			ctx.addIssue({
				code: "custom",
				message: "Invalid cursor timestamp",
				path: ["sortValue"],
			})
		}
		if (
			value.sortBy === "totalArtifacts" &&
			typeof value.sortValue !== "number"
		) {
			ctx.addIssue({
				code: "custom",
				message: "Invalid cursor count",
				path: ["sortValue"],
			})
		}
		if (value.sortBy === "identityKey" && typeof value.sortValue !== "string") {
			ctx.addIssue({
				code: "custom",
				message: "Invalid cursor value",
				path: ["sortValue"],
			})
		}
	})

export const artifactCursorSchema = z.object({
	createdAt: timestampSchema,
	id: z.uuid(),
})

export const searchCursorSchema = z.object({
	updatedAt: timestampSchema,
	id: z.uuid(),
})

export const listBlocksQuerySchema = z.object({
	limit: pageLimitSchema,
	cursor: encodedJsonCursor(blockCursorSchema).optional(),
	q: optionalTextSchema,
	status: optionalStatusSchema,
	searchField: searchFieldSchema,
})

export const listResourcesQuerySchema = z.object({
	limit: pageLimitSchema,
	cursor: encodedJsonCursor(resourceCursorSchema).optional(),
	q: optionalTextSchema,
	status: optionalStatusSchema,
	sortBy: resourceSortBySchema,
	sortDirection: resourceSortDirectionSchema,
	searchField: searchFieldSchema,
})

export const listArtifactVersionsQuerySchema = z.object({
	limit: pageLimitSchema,
	cursor: encodedJsonCursor(artifactCursorSchema).optional(),
})

export const searchQuerySchema = z.object({
	limit: pageLimitSchema,
	cursor: encodedJsonCursor(searchCursorSchema).optional(),
	q: optionalTextSchema,
	blockName: optionalTextSchema,
	status: optionalStatusSchema,
	searchField: searchFieldSchema,
})

export type BlockCursor = z.infer<typeof blockCursorSchema>
export type ResourceCursor = z.infer<typeof resourceCursorSchema>
export type ArtifactCursor = z.infer<typeof artifactCursorSchema>
export type SearchCursor = z.infer<typeof searchCursorSchema>

export type ListBlocksQuery = z.infer<typeof listBlocksQuerySchema>
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>
export type ListArtifactVersionsQuery = z.infer<
	typeof listArtifactVersionsQuerySchema
>
export type SearchQuery = z.infer<typeof searchQuerySchema>

// Two identities sharing a block are grouped by (version, key); the reader and
// the SQL queries both key their per-identity maps with this.
export function identityGroupKey(input: {
	blockVersion: string
	identityKey: string
}): string {
	return `${input.blockVersion} ${input.identityKey}`
}

// ---------------------------------------------------------------------------
// result shapes
// ---------------------------------------------------------------------------

export type DurationSummary = {
	avgMs: number | null
	p95Ms: number | null
}

export type BlockSummary = {
	blockName: string
	totalArtifacts: number
	statusCounts: StatusCounts
	latestActivityAt: string | null
	duration: DurationSummary
}

export type BlocksPage = {
	blocks: BlockSummary[]
	nextCursor: string | null
}

export type ResourceSummary = {
	identityRef: string
	blockName: string
	blockVersion: string
	identityKey: string
	totalArtifacts: number
	statusCounts: StatusCounts
	latestArtifactId: string | null
	latestStatus: string | null
	latestPhase: string | null
	latestPhaseLabel: string | null
	latestUpdatedAt: string | null
	latestDurationMs: number | null
	duration: DurationSummary
}

export type ResourcesPage = {
	blockName: string
	resources: ResourceSummary[]
	nextCursor: string | null
}

// Per-version rollup the artifact list + search share.
export type ArtifactVersionSummary = {
	runCount: number
	modelCallCount: number
	validationCount: number
	latestDurationMs: number | null
}

export type ArtifactVersionResponse = {
	id: string
	blockName: string
	blockVersion: string
	identityRef: string
	identityKey: string
	status: ArtifactStatus
	phase: string | null
	phaseLabel: string | null
	phaseAt: string | null
	createdAt: string
	updatedAt: string
	readyAt: string | null
	supersededBy: string | null
	supersededAt: string | null
	runCount: number
	modelCallCount: number
	validationCount: number
	latestDurationMs: number | null
}

export type ArtifactVersionsPage = {
	identity: ArtifactIdentityRef & { identityRef: string }
	artifacts: ArtifactVersionResponse[]
	nextCursor: string | null
}

export type ArtifactSearchResult = ArtifactVersionResponse & {
	input: unknown
	output: unknown
	rejection: unknown
	error: Record<string, unknown> | null
}

export type SearchPage = {
	results: ArtifactSearchResult[]
	nextCursor: string | null
}

export type StatusHistoryEntry = {
	status: string
	at: string
	source: string
	runId?: string
	label: string
}

export type ArtifactDetail = {
	artifact: {
		id: string
		blockName: string
		blockVersion: string
		identityRef: string
		identityKey: string
		status: ArtifactStatus
		phase: string | null
		phaseLabel: string | null
		phaseAt: string | null
		createdAt: string
		updatedAt: string
		readyAt: string | null
		input: unknown
		output: unknown
		rejection: unknown
		error: Record<string, unknown> | null
		supersededBy: string | null
		supersededAt: string | null
	}
	runs: Array<{
		id: string
		artifactId: string | null
		blockName: string
		status: string
		trigger: string | null
		rejectionReason: string | null
		rejection: unknown
		metadata: Record<string, unknown>
		error: Record<string, unknown> | null
		startedAt: string
		finishedAt: string | null
		durationMs: number | null
		createdAt: string
		updatedAt: string
	}>
	modelCalls: Array<{
		id: string
		runId: string | null
		operationId: string | null
		attempt: number
		stepIndex: number
		role: string
		blockName: string
		provider: string
		model: string
		responseModel: string | null
		status: string
		artifactType: string | null
		artifactId: string | null
		metadata: Record<string, unknown>
		input: Record<string, unknown>
		instructions: string | null
		instructionsHash: string | null
		output: Record<string, unknown> | null
		error: Record<string, unknown> | null
		validatorId: string | null
		validatorType: string | null
		createdAt: string
	}>
	validations: Array<{
		id: string
		runId: string | null
		operationId: string | null
		attempt: number
		validatorId: string
		validatorType: string
		status: string
		feedback: unknown
		metadata: Record<string, unknown>
		createdAt: string
	}>
	statusHistory: StatusHistoryEntry[]
	lineage: {
		supersededBy: string | null
		supersededAt: string | null
		supersededArtifacts: Array<{
			id: string
			status: ArtifactStatus
			createdAt: string
			updatedAt: string
		}>
	}
	aiSdkTrace: {
		events: unknown[]
		source: string
		message: string
	}
}

// ---------------------------------------------------------------------------
// the reader
// ---------------------------------------------------------------------------

// The five reads the dashboard performs, free of any backend. The web server
// takes one of these; @thinking-blocks/store-postgres and ./memory-reader
// implement it.
export interface ThinkingBlockReader {
	listBlocks(query: ListBlocksQuery): Promise<BlocksPage>
	listBlockResources(
		blockName: string,
		query: ListResourcesQuery,
	): Promise<ResourcesPage>
	listArtifactVersions(
		identity: ArtifactIdentityRef,
		query: ListArtifactVersionsQuery,
	): Promise<ArtifactVersionsPage>
	getArtifactDetail(artifactId: string): Promise<ArtifactDetail | null>
	searchArtifacts(query: SearchQuery): Promise<SearchPage>
}
