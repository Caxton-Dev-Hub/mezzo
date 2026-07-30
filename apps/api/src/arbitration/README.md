# Arbitration module

The AI dispute analyst on top of Milestone 8's `DisputePacket`. This module
produces a *recommendation* only. As `disputes/README.md` already put it
before this module existed: "the human decision that Milestone 9's AI
arbiter will later feed a recommendation into, but never execute on its
own." Nothing here changed that -- this module cannot move money or
transition an escrow or dispute, by construction, not by convention.

## Why there's no state machine here

Unlike every other module so far, `arbitration` doesn't own a lifecycle.
An `ArbitrationRecord` is a single immutable fact -- "this dispute, at this
time, was analyzed and produced this result" -- appended once per
`recommend()` call and never updated. There's nothing to transition:
`RECOMMENDED` and `NEEDS_HUMAN` are outcomes of one evaluation, not states
a record moves through.

## Reasoning is separate from control

`ArbitrationService.recommend()` does exactly four things, in order:

1. Read the `DisputePacket` via `DisputeService.getPacket()` (Milestone 8)
   -- frozen terms, timeline, evidence bundles with integrity flags,
   submission flags. No account balances are in this packet; the prompt
   built from it (`ArbitrationPromptBuilder`) doesn't add any.
2. Call the primary `LlmProvider` (`AnthropicLlmProvider` in `live` mode),
   falling back to the secondary (`OpenAiLlmProvider`) if it throws. If
   both throw, that's not treated as a crash -- it's itself a result (see
   below).
3. Hand the raw text response to `RecommendationEngine.evaluate()`, a pure
   function with no DI, no database, no network. It defensively extracts
   the first balanced `{...}` JSON block from the response (models
   sometimes wrap JSON in prose despite instructions), validates it
   against `arbitrationRecommendationSchema` (zod), and applies the
   confidence-routing guardrails.
4. Persist exactly one `ArbitrationRecord` row (insert-only; there is no
   update path for this entity) and return it.

`RecommendationEngine` being pure and DB-free is what makes the eval
harness possible without mocking Nest's DI or a database: `evals/
evals.spec.ts` calls `engine.evaluate()` directly against canned model
text, no `ArbitrationService` involved.

## Guardrails against the fluency trap

`RecommendationEngine.evaluate()` downgrades a syntactically-valid,
schema-valid recommendation to `NEEDS_HUMAN` (`ArbitrationStatus`) --
keeping whatever outcome/confidence/rationale the model proposed on the
record, just not treating it as authoritative -- whenever any of, in
order:

- The JSON couldn't be extracted or didn't pass the zod schema at all
  (`AbstentionReason.PARSE_FAILURE` -- no parsed data to keep, so those
  fields are empty on the record).
- `citedEvidenceIds` is empty (`NO_CITED_EVIDENCE`) -- a recommendation
  that cites nothing is exactly the "fluency trap" the spec calls out by
  name; a confident-sounding rationale with no evidence backing it is
  worse than no rationale.
- The evidence bundle itself carries an unresolved `EvidenceFlagType`
  (`DUPLICATE_CONTENT`/`MISSING_METADATA`/`TIMESTAMP_MISMATCH` from
  Milestone 4) on any item (`UNRESOLVED_INTEGRITY_FLAGS`) -- computed by
  the service from the packet, not self-reported by the model, so a model
  that doesn't notice tampered evidence can't route around this.
- The model itself reports `contradictions` or `missingEvidence`
  (`CONTRADICTORY_OR_MISSING_EVIDENCE`) -- if the model saw a problem, a
  human sees it too, rather than the model quietly picking a side anyway.
- `confidence` is below `ARBITRATION_CONFIDENCE_THRESHOLD` (default
  `0.75`) (`LOW_CONFIDENCE`).

Only when none of the above apply does a record land as `RECOMMENDED`.
Total provider failure (`complete()` throws on both providers) produces
its own `NEEDS_HUMAN` record via `RecommendationEngine.providerFailure()`
with `AbstentionReason.PROVIDER_ERROR` and every field empty -- the
dispute is left exactly where it was (`UNDER_REVIEW`), flagged, not
auto-resolved, because `ArbitrationService` never touches
`DisputeStateMachine` or `EscrowStateMachine` in any code path.

## The architectural guarantee, not just a convention

`architecture.spec.ts` greps every non-spec source file under this module
for `LedgerService`, `ledger.module`, `EscrowStateMachine`,
`DisputeStateMachine`, and `postTransaction`, and asserts none of them
appear -- and separately asserts `arbitration.module.ts` never imports
`LedgerModule` or `EscrowModule`. `ArbitrationModule` imports only
`DisputeModule`, and only for its exported `DisputeService` (to read
`getPacket()`); it has no way to reach the ledger or drive either state
machine even transitively through DI, because nothing in this module ever
asks for those tokens.

## Providers: primary + fallback, swappable independently

`PRIMARY_LLM_PROVIDER` and `FALLBACK_LLM_PROVIDER` are DI tokens resolved
by a factory keyed on `ARBITRATION_PROVIDER` (`fake` | `live`), the same
`ConfigService`-driven factory pattern `KycModule`/`PaymentsModule` already
use for their provider toggles. In `live` mode, primary is
`AnthropicLlmProvider` (`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`) and
fallback is `OpenAiLlmProvider` (`OPENAI_API_KEY`/`OPENAI_MODEL`). In
`fake` mode (the test/dev default), primary and fallback are two
*independently* scriptable fakes (`FakePrimaryLlmProvider`,
`FakeFallbackLlmProvider`, both `ScriptableFakeLlmProvider` subclasses)
so e2e tests can queue a response or an error on each slot separately --
that's what makes the fallback and both-fail tests possible without a
live model call.

No LangChain: this module is a plain `LlmProvider` interface (`complete
(systemPrompt, userPrompt) -> string`) with two direct-SDK
implementations, mirroring the `KycProvider`/`PaystackProvider` pattern
already established in this codebase rather than introducing a new
framework dependency for what is, structurally, two API calls with a
shared retry-to-fallback policy.

## Eval harness

`evals/fixtures/*.json` are hand-labelled dispute scenarios (a canned raw
model response text + an expected label, `RELEASE_TO_SELLER` /
`REFUND_TO_BUYER` / `NEEDS_HUMAN`): `clear-seller-wins`, `clear-buyer-
wins`, `genuinely-ambiguous`, `tampered-evidence`, `missing-evidence`.
`run-evals.ts` runs each fixture's canned text through the same
`RecommendationEngine.evaluate()` the service uses and scores two
numbers: accuracy on the clear-cut fixtures, and the abstention rate
(landing on `NEEDS_HUMAN`) on the ambiguous/tampered/missing ones, each
against a target (`CLEAR_CASE_ACCURACY_TARGET`, `ABSTENTION_RATE_TARGET`,
both `0.8`). `evals/evals.spec.ts` is the CI-default run: fully mocked
(canned text, no network, no API key required), runs with `pnpm test`
like any other spec. Running the harness against a live model instead --
"on demand" per the milestone spec -- means pointing `ArbitrationService`
at the real providers (`ARBITRATION_PROVIDER=live` with API keys set) and
recording fresh model output into new fixture files; the scoring function
itself (`runEvalSuite`) doesn't care where the text came from.

## Key pieces

- **`RecommendationEngine`** -- the pure parse-and-guardrail function;
  the only thing that decides `RECOMMENDED` vs `NEEDS_HUMAN`.
- **`extractFirstJsonBlock`** -- brace-balanced, string-aware JSON
  extraction so prose wrapped around the JSON (despite the system prompt
  telling the model not to) doesn't cause a parse failure.
- **`ArbitrationPromptBuilder`** -- turns a `DisputePacketResponse` into
  system/user prompt text; the only place the packet is serialized for a
  model.
- **`ArbitrationService`** -- orchestration: packet -> prompt -> primary/
  fallback provider -> engine -> persist. The one place that touches the
  database, and the one place a future auditor should check first if
  they ever suspect a ledger/state-machine dependency crept in.
- **`ArbitrationController`** -- `POST` and `GET
  /disputes/:disputeId/arbitration-recommendations`, both
  `@Roles(ARBITER, ADMIN)` only. Deliberately stricter than
  `DisputeController.getPacket()` (party-or-arbiter): per the Milestone 9/
  F6 design intent, the AI's rationale is arbiter-only and must never be
  visible to either party.
- **`providers/`** -- `LlmProvider` interface, `AnthropicLlmProvider`,
  `OpenAiLlmProvider`, and the two independently-scriptable fakes.
- **`dto/arbitration-response.ts`** -- the record shape the F7 console
  renders, defined once as a zod schema in `packages/shared-types` and
  imported here. `status` is what the console keys its two visual
  treatments off: `RECOMMENDED` may pre-fill the arbiter's outcome,
  `NEEDS_HUMAN` never does.
- **`evals/`** -- the fixture set and the CI-safe scoring harness.
