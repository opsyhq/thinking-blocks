# Thinking Blocks

**A warehouse serves what you put in. A factory makes what you ask for.**

Today's software is a warehouse: it shelves the data you loaded and 404s the
moment you ask for something nobody stocked. A Thinking Block is a factory. You
call `.get(input)` and you *always* get a finished product — because if the part
was never made, the machine makes it now: worked to spec (your schema), passed
through QC (your validators), reworked until it's in-spec, stamped with a serial
(its identity), and kept. The next order for the same part ships cold, with no
model call. **The catalog is infinite.**

```ts
import { Output, ToolLoopAgent } from "ai"
import { check, InMemoryThinkingBlockStore, judge, ThinkingBlock } from "thinking-blocks"
import { z } from "zod"

type FoodInput = { food: string }

// The spec — the shape every finished part must match.
const NutritionFacts = z.object({
  serving: z.string(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
})
type NutritionFacts = z.infer<typeof NutritionFacts>

const Judgement = z.object({ ok: z.boolean(), reason: z.string() })
type Judgement = z.infer<typeof Judgement>

// The machine. Define it once; the catalog it serves is infinite.
const nutrition = new ThinkingBlock<FoodInput, NutritionFacts>({
  name: "nutrition",
  store: new InMemoryThinkingBlockStore(),
  agent: new ToolLoopAgent({
    model: "openai/gpt-5",
    output: Output.object({ schema: NutritionFacts }),
  }),
  // The serial number: same food -> same part, forever.
  identity: ({ food }) => food.trim().toLowerCase(),
  prepareCall: ({ input }) => ({
    prompt: `Nutrition facts for one typical serving of "${input.food}". Give "serving" as a short human description and protein/carbs/fat in grams.`,
  }),
  attempts: { max: 3 },
  validators: [
    // QC, no model — a caliper: the stated calories must reconcile with the
    // macros (4·protein + 4·carbs + 9·fat), or the part is reworked.
    check<FoodInput, NutritionFacts>("macros-reconcile", {
      validate: ({ output }) => {
        const implied = 4 * output.protein + 4 * output.carbs + 9 * output.fat
        return Math.abs(implied - output.calories) <= Math.max(40, 0.25 * output.calories)
          ? { success: true }
          : { success: false, feedback: `${output.calories} kcal doesn't match the macros (~${Math.round(implied)} kcal) — fix the numbers.` }
      },
    }),
    // QC, with a model — an inspector: is this a realistic serving for the food?
    judge<FoodInput, NutritionFacts, Judgement>("serving-is-realistic", {
      agent: new ToolLoopAgent({
        model: "openai/gpt-5",
        output: Output.object({ schema: Judgement }),
      }),
      schema: Judgement,
      prepareCall: ({ input, output }) => ({
        prompt: `Is "${output.serving}" a realistic serving of "${input.food}", with plausible macros?`,
      }),
      validate: ({ judgement }) =>
        judgement.ok ? { success: true } : { success: false, feedback: judgement.reason },
    }),
  ],
})

// Order a finished part: the machine makes it, runs it through QC, keeps it.
const facts = await nutrition.get({ food: "dragon fruit" })
// facts.output is { serving, calories, protein, carbs, fat }, validated and kept;
// the same food -> the same part, instantly, forever, with no model call.
```

Under the hood a Thinking Block is `function + AI agent + validation + memory +
artifact + trace`. The input **is** the serial number: `{ food }` content-addresses
the part, so the same order returns the same validated part forever. Change the spec
(the schema) and the serial changes, so the machine remakes the part against new
reality instead of shipping a stale one. No static maps, no hand-rolled cache keys,
no drift.

Read the full concept guide in [`packages/thinking-blocks/README.md`](./packages/thinking-blocks/README.md),
and the positioning + real-world Opsy examples in [`docs/positioning.md`](./docs/positioning.md).

## Install

```sh
npm install thinking-blocks ai zod
```

## Packages

| Package | Description |
| --- | --- |
| [`thinking-blocks`](./packages/thinking-blocks) | Flagship package — the one you install. Re-exports the engine + in-memory store. |
| [`@thinking-blocks/core`](./packages/core) | The engine: `ThinkingBlock`, `check`, `judge`, the runner, and `InMemoryThinkingBlockStore`. |
| [`@thinking-blocks/store`](./packages/store) | The storage interface (`ThinkingBlockStore`) and its IO types. The seam every backend implements. |
| [`@thinking-blocks/store-local`](./packages/store-local) | File-backed store — durable on disk, zero setup. A JSON snapshot the writer and the `tb dev` reader share. |
| [`@thinking-blocks/store-postgres`](./packages/store-postgres) | Postgres-backed store (Drizzle) + audit read queries. |
| [`@thinking-blocks/web`](./packages/web) | Observability dashboard — read-only, no auth, reads the store server-side. |
| [`@thinking-blocks/cli`](./packages/cli) | `tb migrate` / `tb dev`. |

The design mirrors Vercel's Workflow DevKit: a thin interface package, a core
engine, pluggable backends, and an observability UI on top.

## Develop

```sh
pnpm install
pnpm build       # turbo, dependency-ordered
pnpm typecheck
pnpm test
```

## License

[Apache-2.0](./LICENSE)
