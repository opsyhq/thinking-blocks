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
// Order a finished part: call the machine, always get a validated result
const facts = await nutrition.get({ food: "dragon fruit" })
// facts.output is { serving, calories, protein, carbs, fat }, validated and kept;
// the same food -> the same part, instantly, forever
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
