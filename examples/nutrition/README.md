# nutrition

The whole stack with no database: the **engine** (`thinking-blocks`), a
**file-backed local store** (`@thinking-blocks/store-local`), and the
**dashboard** (`tb dev`). Two blocks, both keyed on a food name:

- **`nutrition`** — `nutrition.get({ food })` returns
  `{ serving, calories, protein, carbs, fat }`. Two validators gate it before
  anything is stored: a `check` (`macros-reconcile` — deterministic code that
  confirms 4·protein + 4·carbs + 9·fat agrees with the stated calories, catching
  a hallucinated number a schema never could) and a `judge`
  (`serving-is-realistic` — a model). A rejected output is retried with the
  validator's feedback, not stored.
- **`emoji`** — `emoji.get({ food })` returns the single best emoji for a food,
  the legible echo of Opsy's real icon block. One `check`: the output must be
  exactly one emoji glyph.

This is the "factory, not warehouse" idea end to end: you never load a row for
"dragon fruit" and hope it's there — you call `.get({ food })` and the block
makes the part on demand if it has never made it, then caches it on identity so
the next call is instant.

```
src/block.ts    the two blocks: `nutrition` and `emoji`
src/get.ts      the `get` command — one `.get({ food })` call per invocation
src/foods.ts    a few inputs (used by the verify harness)
test/verify.ts  runs the whole path with a MOCK model — no API key needed
```

## The store lives in a file

`@thinking-blocks/store-local` persists every artifact to a JSON file
(`.thinking-blocks/store.json`). Because the artifacts outlive the process, each
`get` call and the **dashboard** are *separate processes* pointed at the same
file — exactly the way they'd both connect to one Postgres. Swap the file for a
database (`DATABASE_URL` + `@thinking-blocks/store-postgres`) and nothing else
changes.

## Run it (real model)

All you need is an OpenAI key.

```sh
# from the repo root — build the workspace so the engine + the CLI exist
pnpm install
pnpm build

# config — the get script auto-loads this .env
cp examples/nutrition/.env.example examples/nutrition/.env
# then set OPENAI_API_KEY in examples/nutrition/.env
```

Now order a food. The **first** call runs the model; the **second** call — the
same command, a brand-new process — comes straight back from disk:

```sh
$ pnpm --filter nutrition run get "dragon fruit"
  🐉  dragon fruit
     60 kcal · 1g protein · 13g carbs · 0g fat · per 1 medium dragon fruit (200g)
     generated · 3.4s · validated, kept as an artifact on disk
     run the same command again — same food, same serial: it comes back cached, no model call.

$ pnpm --filter nutrition run get "dragon fruit"
  🐉  dragon fruit
     60 kcal · 1g protein · 13g carbs · 0g fat · per 1 medium dragon fruit (200g)
     cached · 0ms · no model call — served from disk
```

That round trip *is* the demo: you call `nutrition.get({ food })` (and
`emoji.get({ food })`) once and the model runs, the output is validated, the
artifact is kept; you call it again and the same part ships cold. It's a fresh
process each time, so the cache surviving proves it's durable on disk, not in
memory. Order a few different foods — they all land in the same store file.

> Use `pnpm … run get` (not `pnpm … get`): `get` is also a built-in pnpm
> subcommand, so the `run` keyword is what tells pnpm to run *this* script.

Then open the dashboard on that same file:

```sh
pnpm --filter nutrition dev    # the dashboard — http://localhost:4500
```

`dev` runs `tb dev` — no login. You'll see the two blocks, every food you
ordered as a resource, the artifacts each block produced, and — on every
artifact — the model calls and validation results behind it. Order more foods
and refresh to see new artifacts; the data survives restarts because it lives in
a file, not in memory.

To run against Postgres instead, set `DATABASE_URL` (and use
`@thinking-blocks/store-postgres`): `tb dev` reads the database when
`DATABASE_URL` is set, the local file otherwise — same dashboard, either source.

`TB_MODEL` overrides the model id (default `gpt-4o-mini`). `src/get.ts` uses the
`@ai-sdk/openai` provider; swap `openai(...)` for any Vercel AI SDK provider
(Anthropic, Azure, the [AI Gateway](https://vercel.com/docs/ai-gateway), …) — the
blocks only need a `LanguageModel`.

## Verify it (no API key)

`test/verify.ts` runs the entire generate + read path against the in-memory store
using a deterministic **mock model** — no credentials, no network, no database.
It works both blocks, then reads the artifacts, runs, model calls, and validation
results back through the `InMemoryThinkingBlockReader` — the same interface the
dashboard uses — asserting the cache hits, the model calls (generate + judge),
and the validation passes all landed.

```sh
pnpm --filter nutrition verify    # prints "VERIFY OK — ..."
```
