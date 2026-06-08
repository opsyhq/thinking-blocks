# Thinking Blocks

**A warehouse serves what you put in. A factory makes what you ask for.**

Today's software is a warehouse: it shelves the data you loaded and 404s on a miss. A Thinking Block is a factory: a machine you order from with `.get(input)` and always get a finished part, worked to spec by code plus an AI agent, passed through QC, reworked on a fail, stamped with a serial (its identity), and kept. Every order after that on the same serial ships the part cold, with no model call. You stop improvising one-off prompts and start manufacturing inspectable product primitives:

```txt
function + AI agent + validation + memory + artifact + trace
```

## The shift

Most AI in products is disposable. You build a prompt, call a model, get a blob back, and throw it away. Nobody can answer "did we already compute this," "which model produced the current product state," or "can we invalidate and regenerate it."

A Thinking Block flips that. The unit is not a prompt, it is a **capability** with a name, an input that forms its identity, a validated output, and a durable artifact behind it.

```ts
// WRONG mental model: a disposable prompt
const text = await generateObject({
  model,
  prompt: `which fields of the ${type} resource point at other resources?`,
})
// no identity, no cache, no validation, no trace: recomputed every render

// RIGHT mental model: a capability cached on identity
const rels = await resourceRelationships.get({ resource, type, version })
// rels.output is a validated directional relationship graph;
// same { resource, type, version } -> same artifact, instantly, forever
```

The input is not just an argument. It **is** the identity. `{ provider, type, schemaHash }` content-addresses the artifact. Same identity, same answer. Change the schema, the hash changes, and the block regenerates against new reality instead of serving stale knowledge. No static maps, no hand-rolled cache keys, no "did this drift" guesswork.

Evidence: [`apps/api/src/resources/artifacts/relationship-rules/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/relationship-rules/block.ts), core primitive at [`packages/thinking-blocks/src/thinking-block.ts`](../../opsy-open/packages/thinking-blocks/src/thinking-block.ts).

## One example, end to end

`resourceRelationships.get({...})` is the strongest real capability. The question it answers is genuinely hard: given one Terraform resource type's schema, which of its fields are *handles* that point at other resources, what do they point at, and what kind of relationship is it (reference, scope, attachment, association)? That is messy, unknown, schema-shaped knowledge that no static table can keep correct as provider schemas change.

In opsy this is the `resource-relationship-rules` block. The call site lives in [`apps/api/src/resources/artifacts.ts`](../../opsy-open/apps/api/src/resources/artifacts.ts):

```ts
const rulesLookup = await relationshipRulesBlock.get(
  { ref, kind, type, schema, schemaHash },
  { mode: "background", trigger: "resource_artifacts" },
)
```

**The identity.** The full schema is passed in, but the identity is only what content-addresses the artifact:

```ts
// apps/api/src/resources/artifacts/relationship-rules/block.ts
identity: (input) =>
  relationshipRulesIdentityKey({
    provider: input.ref.name,
    kind: input.kind,
    type: input.type,
    schemaHash: input.schemaHash,
  }),
// -> "aws:resource:aws_instance:<schemaHash>"
```

**First call: reason, validate, store.** The block runs a tool-using agent (it can call `searchProviderTypes` and `getProviderTypeSchema` to confirm targets), constrained by instructions that define what a directional relationship is. The raw output then passes two real validators before anything is stored:

- `provider-schema`: every emitted source/target path must exist in the actual provider schema, with the right direction. Hallucinated paths are rejected with structured feedback.
- `identity-uniqueness`: no ambiguous duplicate rules.

On rejection the block retries (`attempts: { max: 3 }`) with the validator feedback fed back into the prompt. Only a result that survives validation is committed, and the artifact adapter materializes a stable `key` per rule on commit. See [`relationship-rules/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/relationship-rules/block.ts), [`relationship-rules/validators.ts`](../../opsy-open/apps/api/src/resources/artifacts/relationship-rules/validators.ts), and [`relationship-rules/schema.ts`](../../opsy-open/apps/api/src/resources/artifacts/relationship-rules/schema.ts).

**The structured output.** Not text. A typed graph of directional rules:

```ts
{
  rules: [
    {
      key: "a1b2c3…",                              // content hash of the rule
      source: { kind: "resource", type: "aws_instance",
                path: "subnet_id" },
      target: { kind: "resource", type: "aws_subnet",
                path: "id" },
      relationship: "SCOPE",
    },
    // …
  ]
}
```

**Every later call is instant and identical.** `findActiveArtifact` returns the committed artifact for that identity with no model call. The downstream consumer in `getResourceTypeArtifacts` reshapes the same rules into `rulesByHolderPath` to drive the resource form UI, but it never reasons again. The thinking happened once; the product reads it forever.

**Full receipts.** Behind the artifact, the store persists the run, every model call (generate and judge steps), and every validation result, queryable through `block.audit(identity)`. See the store at [`apps/api/src/thinking-blocks/thinking-blocks.ts`](../../opsy-open/apps/api/src/thinking-blocks/thinking-blocks.ts).

## Capabilities in the wild

Five real Thinking Blocks ship in opsy today. Each is a capability you call with `.get({...})` that returns structured product knowledge cached on identity.

| Capability | Identity input | Structured output | Evidence |
| --- | --- | --- | --- |
| `resourceRelationships.get({ ref, kind, type, schema, schemaHash })` | `provider:kind:type:schemaHash` | `{ rules: [{ key, source{kind,type,path}, target{kind,type,path}, relationship }] }`, a validated directional relationship graph between resource fields | [`relationship-rules/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/relationship-rules/block.ts) |
| `resourceTypeIcon.get({ provider, type })` | `resource-type-icon:provider:type:<icon set id>` | `{ assetKey }`, an existing SVG object key in the provider icon catalog, verified to exist in S3 | [`icon/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/icon/block.ts) |
| `resourceTypeMetadata.get({ provider, kind, type, schema, schemaHash })` | `provider:kind:type:schemaHash` | `{ name, display: "card" \| "chip" }`, a human product name and diagram footprint for the type | [`metadata/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/metadata/block.ts) |
| `resourceFieldLayout.get({ provider, kind, type, schemaHash, fields })` | `provider:kind:type:schemaHash` | `{ create, sections[] }`, a create section plus edit sections/groups/rows arranging every schema field into a real form | [`field-layout/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/field-layout/block.ts) |
| `resourceFieldMetadata.get({ provider, kind, type, schemaHash, fields })` | `provider:kind:type:schemaHash` | `{ fields: { [path]: { label, help?, icon? } } }`, per-field labels, actionable help, and Lucide icons | [`field-metadata/block.ts`](../../opsy-open/apps/api/src/resources/artifacts/field-metadata/block.ts) |

All five feed one downstream consumer, `getResourceTypeArtifacts`, which calls them in parallel and hands the renderer a uniform `{ status, data, error, artifactId }` lookup per capability. No caller hand-rolls cache, retry, or validation logic. See [`apps/api/src/resources/artifacts.ts`](../../opsy-open/apps/api/src/resources/artifacts.ts) and the search path in [`apps/api/src/schema/provider-catalog.ts`](../../opsy-open/apps/api/src/schema/provider-catalog.ts).

Note on versioning grounded in the real code: `resource-field-layout` and `resource-field-metadata` both run at version `v2`. The schema field set changed (computed-only fields were added), so the maintainers bumped the block version and every identity regenerated against the new reality. That is the invalidation story as a one-line change, not a migration.

## Why identity-caching changes everything

**Durable artifact, not a transcript.** A committed result is a typed, versioned row your product reads like any other data. `resourceTypeIcon` returns a real `{ assetKey }` that resolves to an SVG that was confirmed to exist in S3 by the `asset-key` validator before it was ever stored. The product builds on validated knowledge, not on a model's last guess.

**Reuse across every caller, for free.** `getResourceTypeArtifacts` and the type-search path in `provider-catalog.ts` both ask for the same capabilities by identity and share one artifact. `getMany` even dedupes repeated identities within a single request so one resolved identity issues one `get`. No caller imports cache logic, because identity *is* the cache.

**Invalidate and regenerate as a first-class operation.** Identity is content-addressed on `schemaHash`, so when a provider schema changes the identity changes and the block regenerates against new reality. When the *logic* changes you bump the block version (`v1` -> `v2`), as field-layout and field-metadata already did. `block.dump(identity)` supersedes a stale artifact so the next `get` rebuilds it. Marking a new artifact ready atomically supersedes the previous one and cleans up its side effects.

**Full trace and observability, built in.** Every generation records a run, each model call (generate plus judge steps with model, provider, tokens, instructions hash), and each validation pass/fail with its feedback. `block.audit(identity)` lists every artifact for an identity, ready or rejected or failed. You can answer "what input produced this," "which model calls happened," "did a validator reject anything," and "which version of the thinking produced the current product state" without adding a single log line. Store contract: [`packages/thinking-blocks/src/types.ts`](../../opsy-open/packages/thinking-blocks/src/types.ts); Drizzle implementation: [`apps/api/src/thinking-blocks/thinking-blocks.ts`](../../opsy-open/apps/api/src/thinking-blocks/thinking-blocks.ts).

## Alternative taglines

1. A warehouse serves what you put in. A factory makes what you ask for.
2. Today's software shelves data and 404s on a miss. A Thinking Block makes the part on demand.
3. Stop improvising prompts. Start manufacturing capabilities.
4. `block.get(input)` never misses: if the part was never made, the machine makes it now.
5. Content-addressed AI: same serial, same validated part, instantly.
6. The catalog is infinite, because the factory makes what you order.

## Landing-page hero

Your product needs answers that no static table can keep correct: which schema fields point at other resources, what to call this type, which icon is real, how to lay out a form for data nobody has seen yet. A warehouse can only hand you what someone stocked: reach for a prompt, get a blob, and recompute it on every render with no cache, no validation, and no trace. A Thinking Block is a factory for that work. Build a machine once with `function + AI agent + validation + memory + artifact + trace`, then order from it like a typed function: `const rels = await resourceRelationships.get({ resource, type, version })`. The first order works the raw material to spec, runs QC, and keeps a durable part addressed by its serial. Every order after that ships the same validated part instantly (remade when reality changes) with a full traveler for every step. The machine makes it once. The product orders it forever.
