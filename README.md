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
import { check, judge, ThinkingBlock } from "thinking-blocks"

// A machine: an agent makes the part, validators are its QC gates.
const nutrition = new ThinkingBlock({
  name: "nutrition",
  store,        // where finished parts are kept
  agent,        // a ToolLoopAgent — its output schema is the spec
  prepareCall: ({ input }) => ({ prompt: `Nutrition facts for ${input.food}` }),
  validators: [
    check("macros-reconcile", { validate }),                       // QC in code
    judge("serving-realistic", { agent, schema, prepareCall, validate }), // QC by a model
  ],
})

const part = await nutrition.get({ food: "dragon fruit" })
if (part.ok) part.output.calories // 60 — typed, validated, kept
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
