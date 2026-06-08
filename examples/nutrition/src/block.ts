import { type LanguageModel, Output, ToolLoopAgent } from "ai"
import type { ThinkingBlockStore } from "thinking-blocks"
import { check, judge, ThinkingBlock } from "thinking-blocks"
import { z } from "zod"

// Two machines on the floor, both fed the same raw material: a food name.
//
// This is the factory, not the warehouse. A warehouse has a row for every food
// someone remembered to stock; ask for "dragon fruit" and if nobody loaded it
// you get a 404. These machines have no shelves to miss. Call `.get({ food })`
// and you always get a finished part, because if it was never made, the machine
// makes it now: worked to spec (the schema), passed through QC (the validators),
// reworked on a fail, then stamped with its serial (the identity) and kept. The
// next order for the same food ships cold, with no model call. The catalog is
// every food there is.
//
// The store and model are injected so the same machines run against a real model
// (the `get` script) or a deterministic mock one (the test harness).

export type FoodInput = { food: string }

// ── Machine 1: nutrition ────────────────────────────────────────────────────
// Raw material: a food name. Finished part: a typical serving and its macros.

export const NutritionFacts = z.object({
	serving: z.string().min(1),
	calories: z.number().nonnegative(),
	protein: z.number().nonnegative(),
	carbs: z.number().nonnegative(),
	fat: z.number().nonnegative(),
})
export type NutritionFacts = z.infer<typeof NutritionFacts>

const Judgement = z.object({ ok: z.boolean(), reason: z.string() })

// A marker in the judge prompt so a judge call is distinguishable from a
// generate call. Harmless in production; the test harness's mock model uses it
// to answer the two roles correctly without an API key.
export const JUDGE_MARKER = "QC/serving-is-realistic"

// The caliper tolerance for the macro→calorie gauge below. Atwater factors
// (4 kcal/g protein, 4 kcal/g carb, 9 kcal/g fat) are approximate and labels
// round, so allow the larger of 40 kcal or 25%. One source of truth: the gauge
// reads it, and the feedback quotes it, so they can't drift.
const CALORIE_TOLERANCE = { absKcal: 40, fraction: 0.25 }

/**
 * Build the nutrition machine. The output schema is the spec; the validators are
 * the QC gates the part must pass before it's stamped and kept.
 */
export function createNutritionBlock(opts: {
	store: ThinkingBlockStore
	model: LanguageModel
}) {
	return new ThinkingBlock<FoodInput, NutritionFacts>({
		name: "nutrition",
		store: opts.store,
		agent: new ToolLoopAgent({
			model: opts.model,
			output: Output.object({ schema: NutritionFacts }),
		}),
		// The serial number. Same food → same part, forever.
		identity: ({ food }) => food.trim().toLowerCase(),
		prepareCall: ({ input }) => ({
			prompt: `Give the nutrition facts for one typical serving of "${input.food}". Report "serving" as a short human description (e.g. "1 medium banana (118g)") and protein, carbs, and fat in grams.`,
		}),
		attempts: { max: 3 },
		validators: [
			// The caliper (a code gauge, no model). The stated calories must
			// reconcile with the macros (4·protein + 4·carbs + 9·fat). Catches a
			// hallucinated or fat-fingered number that a schema check never could.
			check<FoodInput, NutritionFacts>("macros-reconcile", {
				validate: ({ output }) => {
					const implied = 4 * output.protein + 4 * output.carbs + 9 * output.fat
					const allowed = Math.max(
						CALORIE_TOLERANCE.absKcal,
						CALORIE_TOLERANCE.fraction * output.calories,
					)
					return Math.abs(implied - output.calories) <= allowed
						? { success: true }
						: {
								success: false,
								feedback: `stated calories (${output.calories}) don't reconcile with the macros: 4·protein + 4·carbs + 9·fat = ${Math.round(implied)} kcal, off by more than ${Math.round(allowed)} kcal. Fix the numbers so they agree.`,
							}
				},
			}),
			// The inspector (a model judge). Gates whether the serving and values
			// are realistic for this food. On a fail the machine reworks the part
			// with this feedback instead of shipping a weak one.
			judge<FoodInput, NutritionFacts, z.infer<typeof Judgement>>(
				"serving-is-realistic",
				{
					agent: new ToolLoopAgent({
						model: opts.model,
						output: Output.object({ schema: Judgement }),
					}),
					schema: Judgement,
					prepareCall: ({ input, output }) => ({
						prompt: `${JUDGE_MARKER}\nIs "${output.serving}" a realistic single serving of "${input.food}", and are ${output.calories} kcal / ${output.protein}g protein / ${output.carbs}g carbs / ${output.fat}g fat plausible for it?`,
					}),
					validate: ({ judgement }) =>
						judgement.ok
							? { success: true }
							: { success: false, feedback: judgement.reason },
				},
			),
		],
	})
}

// ── Machine 2: emoji ──────────────────────────────────────────────────────────
// The same raw material, a different product: the single best emoji for a food.
// The legible echo of Opsy's real icon machine: a catalog where every type has
// an icon waiting the moment you ask.

// `reason` is required, not optional: OpenAI's strict structured output rejects
// a schema unless every property is in `required`. The prompt always asks for a
// reason anyway.
export const EmojiPick = z.object({
	emoji: z.string().min(1),
	reason: z.string(),
})
export type EmojiPick = z.infer<typeof EmojiPick>

// One source of truth for "is this exactly one emoji": grapheme-segment the
// string and require a single cluster that is pictographic. Handles ZWJ
// sequences (👩‍🍳) that span many code points but render as one glyph.
function isSingleEmoji(value: string): boolean {
	const graphemes = [...new Intl.Segmenter().segment(value.trim())]
	return graphemes.length === 1 && /\p{Extended_Pictographic}/u.test(value)
}

/**
 * Build the emoji machine. A single code caliper: the part must be exactly one
 * emoji: no label, no trailing text.
 */
export function createEmojiBlock(opts: {
	store: ThinkingBlockStore
	model: LanguageModel
}) {
	return new ThinkingBlock<FoodInput, EmojiPick>({
		name: "emoji",
		store: opts.store,
		agent: new ToolLoopAgent({
			model: opts.model,
			output: Output.object({ schema: EmojiPick }),
		}),
		identity: ({ food }) => food.trim().toLowerCase(),
		prepareCall: ({ input }) => ({
			prompt: `Pick the single best emoji to represent the food "${input.food}". Return just the emoji and a one-line reason.`,
		}),
		attempts: { max: 3 },
		validators: [
			check<FoodInput, EmojiPick>("single-emoji", {
				validate: ({ output }) =>
					isSingleEmoji(output.emoji)
						? { success: true }
						: {
								success: false,
								feedback: `"${output.emoji}" is not exactly one emoji. Return a single emoji glyph with no extra text.`,
							},
			}),
		],
	})
}
