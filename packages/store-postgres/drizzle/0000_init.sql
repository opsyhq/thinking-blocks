CREATE TABLE "thinking_block_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_name" text NOT NULL,
	"block_version" text DEFAULT 'v1' NOT NULL,
	"identity_key" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"rejection" jsonb,
	"error" jsonb,
	"phase" text,
	"phase_label" text,
	"phase_at" timestamp with time zone,
	"superseded_by" uuid,
	"superseded_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thinking_block_model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thinking_block_run_id" uuid,
	"operation_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'generate' NOT NULL,
	"block_name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"response_model" text,
	"status" text NOT NULL,
	"artifact_type" text,
	"artifact_id" uuid,
	"metadata" jsonb NOT NULL,
	"input" jsonb NOT NULL,
	"instructions" text,
	"instructions_hash" text,
	"output" jsonb,
	"error" jsonb,
	"validator_id" text,
	"validator_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thinking_block_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thinking_block_artifact_id" uuid,
	"block_name" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text,
	"rejection_reason" text,
	"rejection" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thinking_block_validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thinking_block_run_id" uuid,
	"operation_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"validator_id" text NOT NULL,
	"validator_type" text NOT NULL,
	"status" text NOT NULL,
	"feedback" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thinking_block_artifacts" ADD CONSTRAINT "thinking_block_artifacts_superseded_by_thinking_block_artifacts_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."thinking_block_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thinking_block_model_calls" ADD CONSTRAINT "thinking_block_model_calls_thinking_block_run_id_thinking_block_runs_id_fk" FOREIGN KEY ("thinking_block_run_id") REFERENCES "public"."thinking_block_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thinking_block_runs" ADD CONSTRAINT "thinking_block_runs_thinking_block_artifact_id_thinking_block_artifacts_id_fk" FOREIGN KEY ("thinking_block_artifact_id") REFERENCES "public"."thinking_block_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thinking_block_validation_results" ADD CONSTRAINT "thinking_block_validation_results_thinking_block_run_id_thinking_block_runs_id_fk" FOREIGN KEY ("thinking_block_run_id") REFERENCES "public"."thinking_block_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thinking_block_artifacts_ready_unique" ON "thinking_block_artifacts" USING btree ("block_name","block_version","identity_key") WHERE "thinking_block_artifacts"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "thinking_block_artifacts_lookup_idx" ON "thinking_block_artifacts" USING btree ("block_name","block_version","identity_key","status");--> statement-breakpoint
CREATE INDEX "thinking_block_artifacts_claim_idx" ON "thinking_block_artifacts" USING btree ("block_name","block_version","status","updated_at","created_at");--> statement-breakpoint
CREATE INDEX "thinking_block_model_calls_block_created_at_idx" ON "thinking_block_model_calls" USING btree ("block_name","created_at");--> statement-breakpoint
CREATE INDEX "thinking_block_model_calls_run_step_idx" ON "thinking_block_model_calls" USING btree ("thinking_block_run_id","step_index");--> statement-breakpoint
CREATE INDEX "thinking_block_model_calls_role_created_at_idx" ON "thinking_block_model_calls" USING btree ("role","created_at");--> statement-breakpoint
CREATE INDEX "thinking_block_model_calls_operation_attempt_idx" ON "thinking_block_model_calls" USING btree ("thinking_block_run_id","operation_id","attempt");--> statement-breakpoint
CREATE INDEX "thinking_block_runs_block_created_at_idx" ON "thinking_block_runs" USING btree ("block_name","created_at");--> statement-breakpoint
CREATE INDEX "thinking_block_runs_artifact_idx" ON "thinking_block_runs" USING btree ("thinking_block_artifact_id");--> statement-breakpoint
CREATE INDEX "thinking_block_validation_results_run_idx" ON "thinking_block_validation_results" USING btree ("thinking_block_run_id");--> statement-breakpoint
CREATE INDEX "thinking_block_validation_results_operation_attempt_idx" ON "thinking_block_validation_results" USING btree ("thinking_block_run_id","operation_id","attempt");