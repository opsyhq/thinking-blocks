# quickstart

A Thinking Block is a machine on a line, not a one-off prompt. This example puts
one machine (`productBrief`) on the floor and sends the same order through twice:

1. The first order works the raw idea to spec with an AI agent, runs it past an
   inspector (a model judge), and keeps the finished part.
2. The second order with the same `idea` ships the same validated brief cold —
   `source: "cached"` — with no model call.

## Run

```sh
# from the repo root
pnpm install
pnpm build

# set a key the Vercel AI SDK can use (AI Gateway), then:
AI_GATEWAY_API_KEY=... pnpm --filter quickstart start
```

Swap the `model` string for any provider the AI SDK supports (e.g.
`openai("gpt-4o-mini")` with `OPENAI_API_KEY`).
