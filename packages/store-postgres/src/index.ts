// @thinking-blocks/store-postgres
// Postgres (Drizzle) implementation of the Thinking Blocks store + reader.

// The read contract (schemas, codecs, result shapes, the reader interface) lives
// in @thinking-blocks/core. Re-export it here so existing importers of
// @thinking-blocks/store-postgres keep resolving the same names.
export {
	type ArtifactIdentityRef,
	type ArtifactStatus,
	type ArtifactVersionSummary,
	artifactCursorSchema,
	type BlockSummary,
	blockCursorSchema,
	decodeArtifactIdentityRef,
	encodeArtifactIdentityRef,
	encodedJsonCursor,
	InvalidCursorError,
	identityGroupKey,
	type ListArtifactVersionsQuery,
	type ListBlocksQuery,
	type ListResourcesQuery,
	listArtifactVersionsQuerySchema,
	listBlocksQuerySchema,
	listResourcesQuerySchema,
	type ResourceSummary,
	resourceCursorSchema,
	type SearchQuery,
	type StatusCounts,
	searchCursorSchema,
	searchQuerySchema,
	type ThinkingBlockReader,
	toJsonValue,
} from "@thinking-blocks/core"
export {
	artifactVersionResponse,
	cursorSortComparison,
	cursorSortEquality,
	DrizzleThinkingBlockReader,
	getArtifactDetail,
	listArtifactVersions,
	listBlockResources,
	listBlocks,
	readArtifactVersionSummaries,
	searchArtifacts,
} from "./audit"
export {
	createThinkingBlockDb,
	type Executor,
	migrate,
} from "./db"
export * from "./schema"
export { DrizzleThinkingBlockStore, toArtifactRecord } from "./store"
