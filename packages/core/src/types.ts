import type {
	ThinkingBlockArtifactRecord,
	ThinkingBlockArtifactStatus,
	ThinkingBlockIdentity,
	ThinkingBlockStore,
} from "@thinking-blocks/store"
import type {
	Agent,
	Output as AiOutput,
	GenerateTextResult,
	ModelMessage,
	ToolSet,
} from "ai"
import type { z } from "zod"

// Re-export the persistence vocabulary the engine surfaces to callers, so
// consumers can import everything from one place.
export type {
	ThinkingBlockArtifactRecord,
	ThinkingBlockArtifactStatus,
	ThinkingBlockIdentity,
	ThinkingBlockModelCallRole,
	ThinkingBlockStore,
} from "@thinking-blocks/store"

type ThinkingBlockOutputSpec = AiOutput.Output<unknown, unknown, unknown>
export type ThinkingBlockAgentResult = GenerateTextResult<
	ToolSet,
	ThinkingBlockOutputSpec
>
export type ThinkingBlockAgentStep = ThinkingBlockAgentResult["steps"][number]

// biome-ignore lint/suspicious/noExplicitAny: ThinkingBlock erases agent call options and concrete tool sets so ToolLoopAgent instances share one surface.
export type ThinkingBlockAgent = Agent<any, any, ThinkingBlockOutputSpec>

export type ThinkingBlockResult<OUTPUT> =
	| {
			ok: true
			status: "success"
			source: "generated" | "cached"
			output: OUTPUT
			artifactId: string
			runId?: string
	  }
	| {
			ok: false
			status: "rejected"
			source: "generated"
			artifactId: string
			runId?: string
			reason: string
			output?: unknown
			details?: unknown
	  }

export type ThinkingBlockLookup<OUTPUT> = {
	status: ThinkingBlockArtifactStatus | null
	data: OUTPUT | null
	error: Record<string, unknown> | null
	artifactId: string | null
}

export interface ThinkingBlockRunOptions {
	trigger?: string
	metadata?: Record<string, unknown>
	maxAttempts?: number
	abortSignal?: AbortSignal
}

export type ThinkingBlockGetOptions =
	| (ThinkingBlockRunOptions & { mode?: "wait" })
	| (Omit<ThinkingBlockRunOptions, "maxAttempts" | "abortSignal"> & {
			mode: "cache"
	  })
	| (ThinkingBlockRunOptions & { mode: "background" })

type ThinkingBlockAttemptOptions = { max: number }

export type ThinkingBlockPreparedCall =
	| { prompt: string; messages?: never; options?: unknown }
	| { messages: ModelMessage[]; prompt?: never; options?: unknown }

export type ThinkingBlockValidationResult =
	| { success: true }
	| { success: false; feedback?: unknown }

export interface ThinkingBlockConfig<INPUT, OUTPUT, RESULT = OUTPUT> {
	name: string
	version?: string
	instructions?: string
	agent: ThinkingBlockAgent
	store: ThinkingBlockStore
	parallelism?: number
	input?: z.ZodType<INPUT>
	identity?: (input: INPUT) => ThinkingBlockIdentity
	prepareCall(args: {
		input: INPUT
		attempt: number
		feedback: unknown
	}): ThinkingBlockPreparedCall | Promise<ThinkingBlockPreparedCall>
	attempts?: ThinkingBlockAttemptOptions
	validators?: ThinkingBlockValidation<INPUT, OUTPUT>[]
	metadata?: (input: INPUT) => Record<string, unknown>
	artifact?: ArtifactAdapter<OUTPUT, INPUT, RESULT>
}

export interface ThinkingBlockCheckValidation<INPUT, OUTPUT> {
	type: "check"
	id: string
	validate(args: {
		input: INPUT
		output: OUTPUT
		attempt: number
		raw: ThinkingBlockAgentResult
	}): ThinkingBlockValidationResult | Promise<ThinkingBlockValidationResult>
	metadata?: Record<string, unknown>
}

export interface ThinkingBlockModelValidation<INPUT, OUTPUT, JUDGEMENT> {
	type: "model"
	id: string
	instructions?: string
	agent: ThinkingBlockAgent
	schema: z.ZodType<JUDGEMENT>
	prepareCall(args: {
		input: INPUT
		output: OUTPUT
		attempt: number
	}): ThinkingBlockPreparedCall | Promise<ThinkingBlockPreparedCall>
	validate(args: {
		input: INPUT
		output: OUTPUT
		judgement: JUDGEMENT
		attempt: number
	}): ThinkingBlockValidationResult | Promise<ThinkingBlockValidationResult>
	metadata?: Record<string, unknown>
}

export type ThinkingBlockValidation<INPUT, OUTPUT> =
	| ThinkingBlockCheckValidation<INPUT, OUTPUT>
	| ThinkingBlockModelValidation<INPUT, OUTPUT, unknown>

interface ArtifactReadInput<INPUT> {
	artifactId: string
	input: INPUT
	identity: ThinkingBlockIdentity
	artifact: ThinkingBlockArtifactRecord
}

interface ArtifactCommitInput<INPUT, OUTPUT> {
	input: INPUT
	identity: ThinkingBlockIdentity
	artifactId: string
	runId: string
	output: OUTPUT
	raw: ThinkingBlockAgentResult
}

interface ArtifactCleanupInput<INPUT> {
	input?: INPUT
	identity: ThinkingBlockIdentity
	artifactId: string
}

export interface ArtifactAdapter<OUTPUT, INPUT = unknown, RESULT = OUTPUT> {
	read(args: ArtifactReadInput<INPUT>): Promise<RESULT | null>
	commit(args: ArtifactCommitInput<INPUT, OUTPUT>): Promise<RESULT>
	cleanup(args: ArtifactCleanupInput<INPUT>): Promise<void>
}
