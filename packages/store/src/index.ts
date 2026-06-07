// @thinking-blocks/store — the storage interface every backend implements.
// Persistence types only: no `ai`, no `zod`, no runtime dependencies.

export type ThinkingBlockArtifactStatus =
	| "pending"
	| "running"
	| "ready"
	| "rejected"
	| "failed"
	| "superseded"

type ThinkingBlockModelCallStatus = "success" | "error"
export type ThinkingBlockModelCallRole = "generate" | "judge"
type ThinkingBlockValidationType = "check" | "model"
type ThinkingBlockValidationStatus = "pass" | "fail"

export type ThinkingBlockIdentity = string

export interface ThinkingBlockArtifactRecord {
	id: string
	blockName: string
	blockVersion: string
	identityKey: string
	input: unknown
	status: ThinkingBlockArtifactStatus
	output: unknown | null
	rejection: unknown | null
	error: Record<string, unknown> | null
	phase: string | null
	phaseLabel: string | null
	phaseAt: Date | null
	createdAt: Date
	updatedAt: Date
	readyAt: Date | null
	supersededBy: string | null
	supersededAt: Date | null
}

export interface CreateThinkingBlockArtifactInput {
	blockName: string
	blockVersion: string
	identity: ThinkingBlockIdentity
	input: unknown
	createdAt: Date
}

export interface MarkThinkingBlockArtifactReadyInput {
	artifactId: string
	blockName: string
	blockVersion: string
	identity: ThinkingBlockIdentity
	output: unknown
	readyAt: Date
}

export interface MarkThinkingBlockArtifactRejectedInput {
	artifactId: string
	rejection: unknown
	updatedAt: Date
}

export interface MarkThinkingBlockArtifactFailedInput {
	artifactId: string
	error: Record<string, unknown>
	updatedAt: Date
}

export interface UpdateThinkingBlockArtifactPhaseInput {
	artifactId: string
	phase: string
	phaseLabel: string
	phaseAt: Date
}

export interface ClaimPendingThinkingBlockArtifactsInput {
	blockName: string
	blockVersion: string
	limit: number
	claimedAt: Date
}

export interface RequeueRetryableThinkingBlockArtifactsInput {
	blockName: string
	blockVersion: string
	status: Extract<ThinkingBlockArtifactStatus, "failed">
	runCount: number
	updatedBefore: Date
	requeuedAt: Date
	excludeArtifactIds?: string[]
}

export interface StartThinkingBlockRunInput {
	artifactId: string
	blockName: string
	trigger?: string | null
	metadata: Record<string, unknown>
	startedAt: Date
}

export interface FinishThinkingBlockRunInput {
	runId: string
	metadata: Record<string, unknown>
	startedAt: Date
	finishedAt: Date
}

export interface RejectThinkingBlockRunInput {
	runId: string
	reason: string
	rejection?: unknown
	metadata: Record<string, unknown>
	startedAt: Date
	finishedAt: Date
}

export interface FailThinkingBlockRunInput {
	runId: string
	error: Record<string, unknown>
	startedAt: Date
	finishedAt: Date
}

export interface RecordThinkingBlockModelCallInput {
	runId: string
	operationId?: string | null
	attempt: number
	stepIndex: number
	role: ThinkingBlockModelCallRole
	blockName: string
	modelProvider: string
	model: string
	responseModel?: string | null
	status: ThinkingBlockModelCallStatus
	metadata: Record<string, unknown>
	input: Record<string, unknown>
	instructions?: string | null
	instructionsHash?: string | null
	output?: Record<string, unknown>
	error?: Record<string, unknown>
	validatorId?: string | null
	validatorType?: ThinkingBlockValidationType | null
}

export interface RecordThinkingBlockValidationInput {
	runId: string
	operationId?: string | null
	attempt: number
	validatorId: string
	validatorType: ThinkingBlockValidationType
	status: ThinkingBlockValidationStatus
	feedback?: unknown
	metadata?: Record<string, unknown>
}

export interface ThinkingBlockStore {
	createArtifact(
		input: CreateThinkingBlockArtifactInput,
	): Promise<ThinkingBlockArtifactRecord>
	findArtifactById(input: {
		artifactId: string
	}): Promise<ThinkingBlockArtifactRecord | null>
	findActiveArtifact(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
	}): Promise<ThinkingBlockArtifactRecord | null>
	findLatestNonSupersededArtifact(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
	}): Promise<ThinkingBlockArtifactRecord | null>
	findArtifactStatus(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
	}): Promise<ThinkingBlockArtifactStatus | null>
	claimPendingArtifacts(
		input: ClaimPendingThinkingBlockArtifactsInput,
	): Promise<ThinkingBlockArtifactRecord[]>
	requeueRetryableArtifacts(
		input: RequeueRetryableThinkingBlockArtifactsInput,
	): Promise<number>
	countRuns(input: { artifactId: string }): Promise<number>
	markArtifactReady(
		input: MarkThinkingBlockArtifactReadyInput,
	): Promise<{ supersededArtifactIds: string[] }>
	markArtifactRejected(
		input: MarkThinkingBlockArtifactRejectedInput,
	): Promise<void>
	markArtifactFailed(input: MarkThinkingBlockArtifactFailedInput): Promise<void>
	updateArtifactPhase(
		input: UpdateThinkingBlockArtifactPhaseInput,
	): Promise<void>
	dumpArtifacts(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
		dumpedAt: Date
	}): Promise<ThinkingBlockArtifactRecord[]>
	listArtifacts(input: {
		blockName: string
		blockVersion: string
		identity: ThinkingBlockIdentity
	}): Promise<ThinkingBlockArtifactRecord[]>
	startRun(input: StartThinkingBlockRunInput): Promise<{ id: string }>
	finishRun(input: FinishThinkingBlockRunInput): Promise<void>
	rejectRun(input: RejectThinkingBlockRunInput): Promise<void>
	failRun(input: FailThinkingBlockRunInput): Promise<void>
	recordModelCall(
		input: RecordThinkingBlockModelCallInput,
	): Promise<{ id?: string } | undefined>
	recordValidation(input: RecordThinkingBlockValidationInput): Promise<void>
}
