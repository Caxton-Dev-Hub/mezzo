# Mezzo — Build Prompts

A milestone-driven prompt playbook for building Mezzo, an AI-assisted escrow platform for peer-to-peer marketplace transactions (physical goods, buyer/seller in different locations). Each milestone below is a self-contained prompt you paste into **Claude Code**, followed by the test cases that gate the milestone.

**Product in one line:** two strangers create an escrow, the initiator captures the product's condition (photos + optional video), invites the counterparty, both agree on terms, the buyer funds the escrow *after* reviewing the evidence, the seller ships, the buyer confirms receipt and either releases funds or raises a dispute — where an AI arbitration layer (human in the loop) rules on the evidence.

**Two tracks.** Backend milestones (Milestone 0–13) build the API. Frontend milestones (F1–F7) build the Next.js web client against it. They interleave: build a backend milestone, then the frontend milestone that consumes its API surface. The suggested interleaving is at the end of this file.

---

## How to use this file

1. Work one milestone at a time, in order. Do **not** skip ahead — later milestones assume earlier contracts exist.
2. Before starting, set up the project conventions file (below) so every prompt inherits the same context. Claude Code reads `CLAUDE.md` automatically.
3. For each milestone: paste the **Prompt** block, let it build, then paste the **Test cases** block as a follow-up ("now write these tests and make them pass"). Treat green tests as the gate.
4. Commit per milestone. One milestone = one PR. Keep the state machine and ledger invariants sacred across all of them.

### Stack (decided — keep prompts opinionated)

**Monorepo:** pnpm workspaces — `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared-types` (Zod schemas + TS types shared by both), `packages/config` (shared ESLint/TSConfig/Prettier).

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js + TypeScript + NestJS |
| DB | PostgreSQL (TypeORM ORM; TypeORM acceptable if you prefer) |
| Cache / queues / locks | Redis + BullMQ |
| Auth | JWT access + refresh, Passport, RBAC |
| Payments (NGN) | Paystack (funding via charge, payouts via transfer) |
| Off-ramp / crypto (optional) | Yellowcard / USDC |
| KYC | Dojah or Mono |
| Media storage | S3-compatible (or Cloudinary) |
| AI arbitration | Anthropic + OpenAI via LangChain, structured (zod-validated) output |
| Backend tests | Jest + Supertest, Testcontainers for Postgres/Redis |
| Observability | pino logs, OpenTelemetry traces, Prometheus metrics |
| Frontend | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Server state | TanStack Query (no duplication into a global store) |
| Local/UI state | Zustand |
| Forms | React Hook Form + Zod (schemas imported from `packages/shared-types`) |
| Frontend tests | Vitest + React Testing Library (component), Playwright (e2e vs a running API) |

**Shared-schema rule:** validation schemas live once in `packages/shared-types` as Zod and are imported by both the API (DTO validation) and the web app (form validation). Never redefine a request/response shape on the client — import it.

---

## Milestone 0 — Set up `CLAUDE.md` first (do this once)

> **Prompt**
>
> Create a `CLAUDE.md` at the repo root that documents these project conventions so you follow them in every future task:
>
> - Stack: NestJS + TypeScript, PostgreSQL via TypeORM, Redis + BullMQ, Jest + Supertest + Testcontainers.
> - Architecture: modular Nest monolith, feature modules (`auth`, `users`, `kyc`, `escrow`, `evidence`, `ledger`, `payments`, `disputes`, `arbitration`, `chat`, `notifications`, `admin`). Domain logic lives in services; controllers are thin.
> - Money is never a float. Use integer minor units (kobo) with a `Money` value object. Currency is explicit on every amount.
> - Code style: production-ready, no inline comments, no dead code, strict TypeScript (`strict: true`, no `any`), everything passes lint + prettier. Prefer the simplest correct implementation.
> - Every state transition and every money movement must be covered by tests before the milestone is considered done.
> - Errors: typed domain errors mapped to HTTP via a global exception filter. Never leak stack traces.
> - Config via `@nestjs/config` + zod-validated env schema; fail fast on boot if env is invalid.
>
> Also scaffold: `docker-compose.yml` (postgres + redis), `.env.example`, TypeORM init, ESLint + Prettier, Husky pre-commit running lint + typecheck, a `HealthController` (`/health` checks DB + Redis), and a base Jest config with a Testcontainers setup helper. Commit as `chore: project scaffolding`.

**Test cases**
- `GET /health` returns 200 with `{ db: "up", redis: "up" }` when both are reachable, 503 when either is down.
- App fails to boot with a clear error when a required env var is missing.
- `Money` rejects floats, rejects mixed-currency arithmetic, and serializes as `{ amount: <int>, currency: "NGN" }`.

**Definition of done:** `docker compose up` boots the stack, `pnpm test` is green, pre-commit hook blocks a lint failure.

---

## Milestone 1 — Auth, users & RBAC

> **Prompt**
>
> Build the `auth` and `users` modules. Requirements:
>
> - Email + password registration and login. Argon2id password hashing.
> - JWT access token (short-lived) + refresh token (rotating, stored hashed, revocable). Refresh rotation must detect reuse and revoke the token family.
> - RBAC with roles: `USER`, `ARBITER`, `ADMIN`. A single user can act as buyer or seller per-escrow — role on the escrow is separate from the account role (define `EscrowRole = BUYER | SELLER` for later).
> - Guards + decorators: `@Roles()`, `@CurrentUser()`. Global `JwtAuthGuard` with `@Public()` opt-out.
> - Rate-limit auth endpoints (Redis-backed).
> - TypeORM models: `User`, `RefreshToken`. Migrations included.
>
> Keep controllers thin, all logic in services. No comments.

**Test cases**
- Register → login returns access + refresh; wrong password returns 401 without revealing which field failed.
- Refresh rotates the token; presenting an already-used refresh token revokes the whole family and returns 401.
- `@Roles(ADMIN)` endpoint returns 403 for a `USER`, 200 for an `ADMIN`.
- Rate limiter blocks after N failed logins from the same IP within the window.
- Password is never returned in any response body; hash is Argon2id, not bcrypt/plaintext.

---

## Milestone 2 — KYC & verification tiers

> **Prompt**
>
> Build the `kyc` module gating what a user can transact based on verification tier.
>
> - Tiers: `TIER_0` (unverified — can browse/create drafts only), `TIER_1` (BVN/phone verified — can fund up to a low cap), `TIER_2` (ID + liveness — higher cap), `TIER_3` (address/business — no cap).
> - Integrate a KYC provider behind a `KycProvider` interface (implement a `DojahKycProvider`, plus a `FakeKycProvider` for tests). Verification is async: submit → provider webhook / poll → update tier.
> - Store an immutable `KycEvent` audit trail. Never store raw ID images beyond what's required; store provider reference + result + tier granted.
> - Expose a `requireTier(min)` guard/policy that other modules (funding, payout) will call.
>
> Config-drive the per-tier transaction caps.

**Test cases**
- A `TIER_0` user is blocked from any funding action with a clear "verification required" error.
- Submitting KYC transitions the user to `PENDING`; a successful provider callback (via `FakeKycProvider`) grants the correct tier and writes a `KycEvent`.
- A failed/expired verification does not raise the tier and is auditable.
- Funding above a tier's cap is rejected with the cap surfaced in the error.
- Provider webhook is idempotent: replaying the same callback does not double-grant or duplicate audit events.

---

## Milestone 3 — Escrow core: domain model, state machine, invite & agreement

This is the spine. Get the state machine bulletproof before touching money.

> **Prompt**
>
> Build the `escrow` module: the escrow aggregate and its state machine.
>
> **States:** `DRAFT → PENDING_COUNTERPARTY → AGREED → FUNDED → SHIPPED → DELIVERED → RELEASED` on the happy path. Branches: any of `PENDING_COUNTERPARTY/AGREED` → `CANCELLED`; `DELIVERED` → `DISPUTED`; `DISPUTED → RESOLVED_RELEASE | RESOLVED_REFUND`; `RESOLVED_REFUND`/refund → `REFUNDED`; terminal states `RELEASED`, `REFUNDED`, `CANCELLED`, `EXPIRED`.
>
> **Rules:**
> - Encode transitions as an explicit table (a map of `state → allowed next states → guard`). Reject any transition not in the table with a typed `IllegalTransitionError`. No transition may be performed by direct field assignment — only through `EscrowStateMachine.transition()`.
> - Terminal states are terminal: any transition attempt out of a terminal state throws, even from a late/duplicate operation.
> - Every transition writes an append-only `EscrowEvent` (who, from, to, reason, timestamp, correlationId). This is the audit log later milestones and the AI layer read from.
> - **Roles:** an escrow has exactly one `BUYER` and one `SELLER`. The initiator can be either. The buyer is the funding party; the seller is the shipping party.
> - **Invite flow:** initiator creates a `DRAFT` with proposed terms → moves to `PENDING_COUNTERPARTY` and generates a single-use, expiring invite token (email/link). Counterparty accepts → both must explicitly accept terms → `AGREED`.
> - **Terms:** `price` (Money), `inspectionWindowHours`, `deliveryMethod`, `itemDescription`, `feeBps` (platform fee in basis points). Terms are frozen at `AGREED` and immutable thereafter.
>
> TypeORM models: `Escrow`, `EscrowParty`, `EscrowTerms`, `EscrowEvent`, `Invite`. Provide a state diagram in the module README. No comments in code.

**Test cases**
- Every legal transition in the table succeeds and writes exactly one `EscrowEvent`.
- Every illegal transition (e.g. `DRAFT → RELEASED`, `RELEASED → DISPUTED`, `CANCELLED → FUNDED`) throws `IllegalTransitionError` and writes no event.
- A terminal-state escrow rejects a duplicate/late transition (idempotent no-op at the API boundary, hard error at the domain boundary).
- Invite token is single-use and expires; a used or expired token cannot move the escrow to `AGREED`.
- Terms cannot be edited after `AGREED`; attempting to do so throws.
- Concurrency: two simultaneous `transition()` calls on the same escrow — exactly one wins, the other sees a stale-state error (use an optimistic version column or row lock; test it).
- An escrow always has exactly one buyer and one seller; you cannot invite a third party.

---

## Milestone 4 — Evidence layer: media capture, hashing, EXIF, immutability

> **Prompt**
>
> Build the `evidence` module. This captures the product's condition and is the source of truth the AI arbiter reasons over.
>
> - Upload photos (required, min 1) and optional video against an escrow, at two phases: `AT_CREATION` (initiator documents condition) and `AT_DELIVERY` (buyer documents what arrived).
> - Store to S3-compatible storage via pre-signed uploads. Never proxy large media through the API.
> - On ingest, compute and persist a **SHA-256 content hash**, extract **EXIF/metadata** (capture timestamp, device, GPS if present), file size, mime, and dimensions. Reject mismatched mime/extension.
> - Evidence is **immutable and append-only** — no deletes, no overwrites. A replaced photo is a new record; the old one is retained.
> - Flag suspicious media for the AI layer: EXIF timestamp far from upload time, missing EXIF (possible screenshot/re-save), duplicate content hash already seen in another escrow (reverse-dedup), or mismatched declared vs. detected mime.
> - Expose an `EvidenceBundle` read model per escrow that the arbitration module will consume (ordered, hashed, phase-tagged).
>
> TypeORM models: `EvidenceItem`, `EvidenceFlag`. Keep the content-analysis (image classification) out of scope here — this milestone is capture + integrity only.

**Test cases**
- Uploading a photo persists a correct SHA-256 hash; re-uploading the same bytes yields the same hash and raises a `DUPLICATE_CONTENT` flag.
- EXIF is extracted when present; absence of EXIF raises a `MISSING_METADATA` flag but does not block upload.
- A file whose declared mime (`image/jpeg`) doesn't match sniffed bytes is rejected.
- Evidence records cannot be deleted or mutated via any endpoint.
- Creating an escrow requires at least one `AT_CREATION` photo before it can leave `DRAFT`.
- `EvidenceBundle` returns items in stable order, tagged by phase, with hashes — deterministically (snapshot test).

---

## Milestone 5 — Ledger & wallet: double-entry, reconciliation invariant

> **Prompt**
>
> Build the `ledger` module: an immutable double-entry ledger. Every money movement in the platform posts here. No other module may mutate balances directly.
>
> **Chart of accounts (extensible):**
> - `user:{userId}:wallet` — user available balance
> - `escrow:{escrowId}:holding` — per-order named escrow account
> - `platform:fee_revenue` — platform fees
> - `provider:paystack:clearing` — in-transit provider funds (staging)
> - `treasury:main` — house account
>
> **Rules:**
> - A `Posting` is an immutable set of balanced `Entries` (sum of debits == sum of credits, per currency). Post atomically — all entries commit or none do (single DB transaction).
> - **Balances are derived** from entries, never stored as an authoritative mutable field (a cached balance is fine only as a derived read model that can be rebuilt from entries).
> - Journals are append-only: you reverse with a compensating posting, you never edit or delete.
> - Enforce the **reconciliation invariant** for every escrow: `holding_in − released − refunded == current_holding_balance`, and globally `sum(debits) == sum(credits)` at all times.
> - Provide `postTransaction(entries, { idempotencyKey })` — the same key never posts twice.
> - Provide a `reconcile()` job that asserts the invariants and raises an alert on drift.
>
> TypeORM models: `LedgerAccount`, `Posting`, `Entry`. Index for fast balance derivation. No comments.

**Test cases**
- A balanced posting commits; an unbalanced posting (debits ≠ credits) is rejected atomically.
- Posting with a repeated `idempotencyKey` is a no-op returning the original posting — no double entries.
- Derived balance for an account equals the signed sum of its entries; rebuilding from scratch matches the cached read model.
- The global invariant `sum(debits) == sum(credits)` holds after a randomized sequence of postings (property-based test).
- A partial failure mid-posting (simulate a DB error on the 2nd entry) rolls back the whole posting — no orphan entries.
- `reconcile()` detects an artificially injected drift and flags the offending account.

---

## Milestone 6 — Funding: Paystack intake, idempotency, webhook reconciliation

> **Prompt**
>
> Build the `payments` module funding path. The buyer funds the escrow **only after** the escrow is `AGREED` and they've reviewed the evidence bundle.
>
> - Initiate a Paystack charge for the buyer for `price + buyer-side fees`. Persist a `PaymentIntent` with an `idempotencyKey` before calling the provider.
> - Money enters the ledger **only on a verified provider webhook**, not on client-side "success" callbacks. On `charge.success`: verify signature, verify amount + reference, then post `DR provider:paystack:clearing → CR escrow:{id}:holding` and transition the escrow `AGREED → FUNDED`. Do both in one DB transaction with the state machine.
> - **Webhook handler must be idempotent and safe against replay and out-of-order delivery.** Dedupe on provider event id; reconcile amount against the intent; ignore events for unknown/settled intents.
> - Reconciliation job: pull Paystack transactions for the window, match against `PaymentIntent`s, flag any provider-side charge with no matching intent (and vice versa).
> - Enforce KYC tier caps (Milestone 2) before initiating a charge.
>
> Never trust client-reported payment status. No comments.

**Test cases**
- A `charge.success` webhook with a valid signature funds the escrow exactly once and posts the correct ledger entries.
- Replaying the same webhook event id does **not** double-fund (idempotent).
- A webhook with a tampered/invalid signature is rejected (401) and posts nothing.
- A webhook whose amount ≠ intent amount is quarantined (flagged, not auto-funded).
- Funding is blocked unless the escrow is `AGREED`; funding a `DRAFT`/`DISPUTED` escrow is rejected.
- A client "payment success" callback with no corresponding webhook leaves the escrow **unfunded**.
- Reconciliation flags an orphan provider charge and an intent with no matching charge.

---

## Milestone 7 — Settlement: ship, deliver, inspection-window auto-release, refund, payouts

The concurrency milestone. This is where money leaks if the races aren't handled.

> **Prompt**
>
> Build settlement on top of the ledger and state machine.
>
> **Flow:**
> - Seller marks `FUNDED → SHIPPED` (with tracking/waybill reference, optional).
> - Buyer marks `SHIPPED → DELIVERED` (confirms receipt) — this **starts the inspection window** and schedules a BullMQ delayed job for `inspectionWindowHours`.
> - During inspection the buyer can **Release** (`DELIVERED → RELEASED`) or **Dispute** (`DELIVERED → DISPUTED`).
> - If the window elapses with no action → auto-release fires (`DELIVERED → RELEASED`).
>
> **On RELEASE** (atomic, one DB transaction): post `DR escrow:{id}:holding → CR seller:wallet` for `price − fee` and `CR platform:fee_revenue` for the fee (single balanced posting), and transition to `RELEASED`.
> **On REFUND:** post `DR escrow:{id}:holding → CR buyer:wallet`, transition to `REFUNDED`.
> **Payout:** seller withdraws from `user:{id}:wallet` via a Paystack transfer; post `DR user:wallet → CR provider:paystack:clearing`, confirm on transfer webhook, with retry + idempotency.
>
> **Critical concurrency guarantees (must be enforced, not hoped for):**
> - A **buyer dispute racing the auto-release job** must resolve to exactly one outcome. Take a row lock (or optimistic version) on the escrow inside the transition; the auto-release job must re-check current state under the lock and no-op if already `DISPUTED`/terminal.
> - A **released hold cannot be released again**; a terminal escrow cannot be re-entered by a late job or duplicate request.
> - The ledger invariant `held + released + refunded == captured` holds after every one of these paths and after every race.

**Test cases**
- Happy path: fund → ship → deliver → release pays the seller `price − fee` and platform the fee; ledger balances.
- Auto-release fires exactly once when the window elapses; a second firing of the same job is a no-op.
- **Race — dispute vs auto-release:** run both concurrently; assert exactly one of {released, disputed} wins, the loser no-ops, and **neither the buyer nor the seller is paid twice** (this is the money-leak test — assert final ledger to the exact kobo).
- **Double release:** two concurrent release requests → seller credited once only.
- **Terminal re-entry:** a late `deliver`/`release`/`refund` on a `RELEASED` or `REFUNDED` escrow is rejected and moves no money.
- Refund path credits the buyer's wallet and leaves the escrow holding at zero.
- Payout retries on transient provider failure without double-transferring (idempotency key).
- After a randomized interleaving of all paths across many escrows, global `sum(debits) == sum(credits)` still holds (property test).

---

## Milestone 8 — Dispute lifecycle

> **Prompt**
>
> Build the `disputes` module.
>
> - Raising a dispute (`DELIVERED → DISPUTED`) **freezes the escrow holding** — no auto-release, no release, no refund can execute except through dispute resolution.
> - A dispute has a reason code (`NOT_RECEIVED`, `NOT_AS_DESCRIBED`, `DAMAGED`, `WRONG_ITEM`, `PARTIAL`), a free-text statement, and **required counter-evidence** — the buyer submits `AT_DELIVERY` evidence, the seller may rebut with their own evidence and shipping proof.
> - Dispute states: `OPEN → EVIDENCE → UNDER_REVIEW → RESOLVED`. Both parties must be given a bounded window to submit evidence; non-submission is itself a signal recorded for the arbiter.
> - Resolution outcomes: `RELEASE_TO_SELLER`, `REFUND_TO_BUYER`, `SPLIT` (partial release + partial refund — must still balance the holding to zero). Resolution triggers the corresponding ledger postings from Milestone 7 and the corresponding escrow transition.
> - Assemble a `DisputePacket` read model: frozen terms, full event timeline, both evidence bundles with integrity flags, chat transcript (Milestone 10 later), and reason code. This is the exact, deterministic input to the AI arbiter.
>
> No comments; all money via the ledger.

**Test cases**
- Raising a dispute freezes the escrow: auto-release job and manual release/refund are all blocked while `DISPUTED`.
- Each reason code is accepted; an unknown reason code is rejected.
- Evidence windows are enforced; a party's non-submission is recorded as a flag on the packet.
- `SPLIT` resolution posts partial release + partial refund that **sum exactly to the held amount** (no residue, no overdraft).
- Resolution is idempotent — re-submitting the same resolution does not move money twice.
- `DisputePacket` is deterministic for a given escrow (snapshot test) and contains no PII beyond what the arbiter needs.

---

## Milestone 9 — AI arbitration layer + eval harness

The differentiator. The LLM **proposes**; a deterministic state machine **disposes**. Never let the model move money directly.

> **Prompt**
>
> Build the `arbitration` module: an AI dispute analyst that produces a *recommendation*, not a binding action.
>
> **Architecture — separate reasoning from control:**
> - Input: the `DisputePacket` from Milestone 8. The LLM never sees raw account balances or is given tools that move money.
> - The LLM (Anthropic primary, OpenAI fallback, via LangChain) must return **structured JSON validated by a zod schema**: `{ recommendedOutcome: RELEASE_TO_SELLER | REFUND_TO_BUYER | SPLIT, splitRatio?, confidence: 0..1, rationale: string, citedEvidenceIds: string[], contradictions: string[], missingEvidence: string[] }`. Parse defensively: extract the first valid JSON block, and on parse failure fall back to `NEEDS_HUMAN` rather than guessing.
> - **Confidence routing:** if `confidence >= HIGH_THRESHOLD` and there are no unresolved integrity flags, surface the recommendation to a human arbiter as a pre-filled decision (still requires a human click to execute for launch). If below threshold, or evidence is contradictory/missing, route straight to `NEEDS_HUMAN` — no auto-recommendation shown as authoritative.
> - **Guardrails against the fluency trap:** the model must cite specific `evidenceId`s for every claim; a recommendation that cites no evidence is downgraded to `NEEDS_HUMAN`. Log the full reasoning trace linked to the dispute for audit.
> - Every AI recommendation is written to an immutable `ArbitrationRecord`; the final money-moving decision is always an explicit human (or, later, rules-based) action that references the record.
>
> **Eval harness:** build a `arbitration/evals` directory with a set of hand-labelled fixture dispute packets (clear-seller-wins, clear-buyer-wins, genuinely-ambiguous, tampered-evidence, missing-evidence). Score model outputs against the human labels: accuracy on clear cases, and correct abstention (`NEEDS_HUMAN`) on ambiguous/tampered ones. The harness runs in CI with a mocked/cassette-recorded model by default and against the live model on demand.

**Test cases**
- A malformed / non-JSON model response yields `NEEDS_HUMAN`, never a crash and never a money move.
- A recommendation with `citedEvidenceIds: []` is downgraded to `NEEDS_HUMAN`.
- Below-threshold confidence routes to `NEEDS_HUMAN` even if an outcome is proposed.
- The arbitration module has **no code path** that can post to the ledger or transition an escrow to a resolved state on its own (assert by wiring/architecture test).
- Eval harness: on the labelled clear-cut fixtures, recommended outcome matches the human label above the target accuracy; on tampered/missing-evidence fixtures, the system abstains (`NEEDS_HUMAN`) at/above the target abstention rate.
- Every recommendation writes exactly one immutable `ArbitrationRecord` with the full trace.
- Provider fallback: when the primary model errors, the fallback is used; when both error, the dispute stays `UNDER_REVIEW` and is flagged, not auto-resolved.

---

## Milestone 10 — Order chat, notifications & realtime

> **Prompt**
>
> Build `chat` and `notifications`.
>
> - **In-escrow chat** scoped to the two parties (and the arbiter once a dispute opens). All negotiation must happen in-app so the transcript is admissible evidence — mirror the pattern of forcing communication on-platform. Messages are append-only; attachments route through the evidence module so they're hashed.
> - Realtime status + chat via WebSocket (Nest gateway), authenticated with the same JWT, authorized per-escrow.
> - **Notifications** on every state transition (invited, agreed, funded, shipped, delivered, inspection-ending-soon, released, disputed, resolved) via a `NotificationChannel` interface with `email` + `sms` implementations (and a `Fake` for tests). Notifications are queued (BullMQ) and retried; delivery is idempotent per (event, channel, user).
> - The chat transcript feeds the `DisputePacket`.

**Test cases**
- A non-party cannot read or post to an escrow's chat (403); the arbiter gains access only after `DISPUTED`.
- Messages are append-only; edit/delete endpoints do not exist.
- Each state transition enqueues exactly one notification per channel per recipient; a re-fired transition does not duplicate.
- WebSocket rejects an unauthenticated or wrong-escrow subscription.
- Chat attachments are hashed and appear in the evidence bundle.

---

## Milestone 11 — Admin / arbiter console, audit & observability

> **Prompt**
>
> Build the `admin` module and cross-cutting observability.
>
> - Arbiter endpoints: list disputes by status, open a `DisputePacket` (with the AI `ArbitrationRecord` pre-loaded), and **execute** a resolution (`RELEASE`/`REFUND`/`SPLIT`) — this is the human decision that actually moves money, referencing the arbitration record id.
> - Admin: read-only ledger explorer (postings/entries per escrow and per account), reconciliation status, KYC review queue, user/tier management. Admins can **never** silently edit the ledger — only post compensating reversals with a reason, which are themselves audited.
> - **Audit log:** every privileged action (resolution, reversal, tier change, refund) writes an immutable `AuditEvent` with actor, before/after, reason, correlationId.
> - Observability: pino structured logs with correlationId propagated from request → job → posting; OpenTelemetry spans across the funding and settlement paths; Prometheus metrics for escrow counts by state, dispute rate, auto-release rate, AI abstention rate, and ledger-drift alerts.

**Test cases**
- Only `ARBITER`/`ADMIN` can execute a resolution; a `USER` gets 403.
- Executing a resolution moves money exactly once and links to both the `ArbitrationRecord` and a new `AuditEvent`.
- An admin "adjustment" is implemented as a compensating posting (balanced), never an in-place edit, and is audited.
- Every privileged action produces exactly one immutable `AuditEvent`.
- A ledger-drift condition increments the drift metric and fires the alert path.
- correlationId from an HTTP request appears on the resulting ledger posting and notification job (trace continuity test).

---

## Milestone 12 (optional) — On-chain settlement mirror (Stellar / Soroban)

Only if you want the trust-minimized variant that ties into your Arbitra work.

> **Prompt**
>
> Add an optional `onchain` module that mirrors the escrow holding on Stellar/Soroban for trust-minimized settlement, behind a feature flag.
>
> - A Soroban escrow contract locks a stablecoin (e.g. USDC) for the order; `release`/`refund` are contract calls authorized only by the platform arbiter key (or a 2-of-3 with buyer/seller for the decentralized mode).
> - The off-chain ledger remains the system of record for NGN; the on-chain leg is an additional settlement rail, reconciled against Horizon events. Keep the two ledgers reconciled: an on-chain release must have a matching off-chain posting and vice versa.
> - Contract tests + a reconciliation job between Horizon and the internal ledger.

**Test cases**
- Contract locks funds on escrow creation and only the authorized key can release/refund (unauthorized call reverts).
- An on-chain release emits an event that the listener reconciles to exactly one off-chain posting.
- Divergence between Horizon state and the internal ledger is detected and flagged.
- Feature flag off = zero on-chain code path exercised (the web2 flow is unaffected).

---

## Milestone 13 — WhatsApp bot (full transactional)

Depends on: Milestone 1 (Auth), Milestone 3 (Escrow), Milestone 7 (Settlement), Milestone 8 (Disputes), Milestone 10 (Notifications, Audit from Milestone 11 if built).

> **Prompt**
>
> Build a `whatsapp` module giving users a bidirectional bot interface over the Meta WhatsApp Cloud API, sitting alongside `chat` and `notifications` rather than inside either.
>
> - **Webhook ingress:** `GET` handshake verification + `POST` event receiver. Verify every inbound request's `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET` before parsing the body; reject unverified requests. Enqueue each inbound message onto BullMQ and return 200 immediately — command handling happens off the request path. Dedupe on WhatsApp's `message.id` (Redis `SETNX` + short TTL) since Meta redelivers on any timeout/ambiguity.
> - **Outbound delivery:** implement a `WhatsAppChannel` satisfying the existing `NotificationChannel` interface (`notifications/channels`) so escrow/dispute state-transition notifications fan out over WhatsApp exactly like email/SMS today, using pre-approved Meta message templates for anything sent outside a 24h user-initiated session window.
> - **Account linking:** a user's WhatsApp number is never trusted on its own. Linking requires the user to prove control of the number *and* of the already-verified email/phone on their Mezzo account (reuse `auth`'s OTP/token issuance) before `whatsappVerifiedAt` is set. One WhatsApp number per user; re-verification required if the number changes.
> - **Conversation state:** Redis-backed session per phone number (`idle`, `linking`, `awaiting-pin`, `confirming-release`, …) driven by a BullMQ worker, with a TTL so a half-finished flow can't sit open indefinitely. Prefer WhatsApp interactive buttons/lists over free-text parsing.
> - **Step-up auth for money movement:** releasing funds, approving an escrow, or accepting a dispute resolution over WhatsApp requires a second factor inside that same conversation turn — a hashed PIN (set at onboarding, rate-limited, lockout after N failures) — and the confirmation message must spell out the exact amount (via the `Money` value object, never a raw integer) and counterparty before the user confirms.
> - **Command handlers only call existing services** (`escrow.service`, `settlement.service`, `disputes`) — the WhatsApp module owns no escrow state of its own, so `IllegalTransitionError`/`InsufficientFundsError` etc. surface through the same global exception filter. Every transactional command writes an `AuditEvent` (actor, command, before/after, correlationId) same as any other privileged action.
> - Commands in scope: link account, check escrow status, list active escrows/disputes, approve delivery / start inspection window, release funds (step-up), reply to a dispute / attach evidence link, opt out of notifications.
> - A `FakeWhatsAppClient` for tests — no test ever calls the real Meta API. Config (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`) is Zod-validated at boot like every other module.
> - Ship behind a feature flag; the transactional commands (release, approve) get their own inner flag so they can be disabled instantly without pulling the whole bot.

**Test cases**
- An unverified webhook signature is rejected with no side effects (no queue write, no state change).
- Redelivering the same `message.id` is a no-op the second time.
- A user cannot execute any command before completing account linking; linking requires proving control of both the WhatsApp number and the existing verified email/phone.
- `release funds` without a correct PIN does not move money; N consecutive wrong PINs locks the flow out for a cooldown window.
- A successful `release funds` command moves money exactly once, matches the amount/counterparty shown in the confirmation message, and produces exactly one `AuditEvent` linked to the resulting ledger posting.
- Fund-moving commands routed through an illegal escrow state (e.g. release before delivery is confirmed) return the same `IllegalTransitionError` the REST API would, not a bot-specific bypass.
- A stale/expired conversation session cannot be resumed to complete a fund-moving action.
- Disabling the transactional-commands flag leaves read-only commands (status, list) working while release/approve are refused.
- An outbound state-transition notification is delivered via `WhatsAppChannel` exactly once per (event, channel, user), matching the existing notification idempotency test pattern.

**Definition of done:** account linking, read-only commands, and outbound notifications are green end-to-end against `FakeWhatsAppClient`; the step-up release flow is green including PIN lockout; the transactional flag can disable money movement without a deploy.

---

# Frontend track (F1–F7)

The Next.js web client. Each frontend milestone builds the screens for a backend milestone that already exists — do not build a frontend milestone before its backend counterpart is green. All request/response shapes are imported from `packages/shared-types`; never redefine them on the client. Every screen must handle four states explicitly: loading, empty, error, and success. No screen assumes the happy path.

---

## Frontend Milestone F1 — Web app scaffolding, shared types & auth screens

Depends on: Milestone 1 (Auth).

> **Prompt**
>
> Scaffold `apps/web` (Next.js App Router + TypeScript) and the `packages/shared-types` and `packages/config` workspaces, then build the auth surface.
>
> - `packages/shared-types`: set up a package exporting Zod schemas + inferred TS types for the auth request/response shapes. The API (Milestone 1) must import its DTO validation from here too — refactor if needed so there is one source of truth.
> - `apps/web`: Tailwind + shadcn/ui configured, a typed API client in `lib/api-client` (thin fetch wrapper that attaches the access token, handles 401 by attempting a silent refresh once, and surfaces typed errors), and a TanStack Query provider.
> - Auth screens: register, login, and an onboarding shell. Forms use React Hook Form + the Zod schemas from `shared-types`. Tokens are stored securely (HTTP-only cookie via a route handler, or secure storage) — access tokens are never placed in `localStorage`.
> - A route group layout that redirects unauthenticated users away from protected routes and authenticated users away from the auth routes.
> - A design-tokens pass: calm, trustworthy, restrained — this is a fintech trust product, not a game. Define the color/type scale once and use it everywhere.
>
> Keep components small and presentational where possible; data fetching lives in hooks. No inline comments.

**Test cases**
- Register and login forms show inline validation errors driven by the shared Zod schema (not re-declared client-side).
- A successful login stores the token securely and redirects to the dashboard; the token never appears in `localStorage`.
- A 401 from the API triggers exactly one silent refresh attempt; a second failure redirects to login.
- An unauthenticated user hitting a protected route is redirected; an authenticated user hitting `/login` is redirected to the dashboard.
- Loading and error states render for both forms (submit-in-flight disables the button; a server error surfaces a readable message).

**Definition of done:** a user can register, log in, land on an (empty) dashboard, and refresh the page without being logged out.

---

## Frontend Milestone F2 — Escrow creation wizard & evidence capture

Depends on: Milestone 3 (Escrow core), Milestone 4 (Evidence). This is the product's signature screen — spend the most care here.

> **Prompt**
>
> Build the escrow creation flow at `app/escrow/new` as a multi-step wizard, plus the reusable evidence-capture component.
>
> - **Wizard steps:** (1) item details + price + delivery method + inspection window, (2) evidence capture, (3) review + invite counterparty. Persist wizard state across steps (Zustand), validate each step against the shared Zod schema before advancing, and allow back-navigation without losing input.
> - **Evidence capture component** (`components/evidence`): capture photos via the device camera using `getUserMedia` / a native `<input type="file" accept="image/*" capture>` fallback, and optional video. Show a live thumbnail gallery of captured media, allow retake/remove *before* submission, and **compress client-side** before upload.
> - **Upload:** request a pre-signed URL from the API, upload directly to storage with a visible per-file progress bar, then confirm the upload to the API. Handle a failed upload (retry a single file without restarting the batch). Enforce the `NEXT_PUBLIC_MAX_UPLOAD_MB` cap before attempting upload and surface a clear message if a file is too large.
> - **Invite step:** on submit, create the escrow (moves to `PENDING_COUNTERPARTY`), display the single-use invite link with a copy button and share affordance.
>
> Mandatory: at least one photo is required before the wizard can reach the invite step — mirror the backend rule client-side for UX, but never rely on the client for enforcement.

**Test cases**
- Advancing past a step with invalid input is blocked and shows the offending fields; back-navigation preserves previously entered data.
- A captured photo appears in the gallery and can be removed/retaken before submission.
- A file over the size cap is rejected client-side with a readable message and never uploaded.
- Upload progress renders per file; a simulated single-file upload failure can be retried without re-uploading the successful files.
- The wizard cannot reach the invite step with zero photos.
- After successful creation, the invite link is displayed and the copy button works.
- Playwright: full create flow from details → capture (mocked media) → invite link, against a running API.

---

## Frontend Milestone F3 — Escrow detail: status timeline, terms, invite acceptance & agreement

Depends on: Milestone 3.

> **Prompt**
>
> Build `app/escrow/[id]` — the shared escrow view both parties use, and the invite-acceptance flow.
>
> - **Status timeline:** a visual representation of the state machine (`DRAFT → … → RELEASED`, with dispute/refund branches), highlighting the current state and showing timestamps from the escrow event log. This is the anchor of the whole screen.
> - **Terms panel:** item, price, delivery method, inspection window — clearly marked as frozen once `AGREED`.
> - **Evidence viewer:** the `AT_CREATION` bundle, with any integrity flags surfaced honestly (e.g. "missing capture metadata") rather than hidden.
> - **Role-aware action bar:** the available actions depend on the viewer's role (buyer/seller) and the current state. Render only the actions that are legal in the current state — a buyer in `DELIVERED` sees Release / Raise dispute; a seller in `FUNDED` sees Mark shipped; etc. Confirm destructive/irreversible actions with a modal.
> - **Invite acceptance:** an invited user opening the link sees the terms + evidence and must explicitly accept to move the escrow to `AGREED`. An expired/used token shows a clear, non-alarming error state.
>
> Actions call the API and optimistically reflect the resulting state, reconciling against the server response (TanStack Query invalidation). Never let the UI show a state the server hasn't confirmed for money-moving actions.

**Test cases**
- The timeline highlights the correct current state and renders event timestamps.
- The action bar renders only state-legal, role-legal actions (parametrized test across several state/role combinations).
- Terms show as frozen (non-editable) once the escrow is `AGREED` or later.
- Evidence integrity flags are visibly surfaced, not swallowed.
- An expired or already-used invite token renders a clear error, not a crash.
- Accepting an invite transitions the escrow to `AGREED` and the timeline updates.
- Playwright: two-party flow — initiator creates, second user accepts via invite link, both see `AGREED`.

---

## Frontend Milestone F4 — Funding, wallet & payouts

Depends on: Milestone 5 (Ledger), Milestone 6 (Funding), Milestone 7 (payouts).

> **Prompt**
>
> Build the money surfaces: funding an escrow, the wallet, and requesting a payout.
>
> - **Funding:** from an `AGREED` escrow, the buyer reviews the evidence one last time, then funds. Integrate Paystack checkout (redirect or inline). Critically, **do not mark the escrow funded on the client "success" callback** — show a "confirming payment…" pending state and reflect `FUNDED` only when the API (driven by the verified webhook) reports it. Poll or subscribe for the confirmed state.
> - **Wallet:** show the three balances distinctly — available, pending (in transit), and held-in-escrow — never collapsed into one number. List recent ledger activity in human terms (funded escrow X, received release from Y, payout to bank).
> - **Payout:** a verified seller requests a withdrawal from their available balance to a bank account. Show the request as pending until the transfer webhook confirms it. Block payout for users below the required KYC tier with a clear prompt to verify.
> - **KYC prompts:** when an action is blocked by tier, surface an inline path to complete verification rather than a dead-end error.

**Test cases**
- After Paystack checkout, the escrow shows a "confirming" state and only flips to `FUNDED` when the API confirms — a simulated client success without a webhook does **not** show funded.
- The wallet renders available, pending, and held balances separately.
- A payout request shows as pending until confirmation; a sub-tier user is blocked with an inline verify-now path.
- Funding is unavailable on any escrow not in `AGREED`.
- Playwright: fund an escrow end-to-end against a test Paystack flow + simulated webhook, asserting the UI reaches `FUNDED` only post-confirmation.

---

## Frontend Milestone F5 — Order chat, realtime & notifications

Depends on: Milestone 10 (chat, notifications, realtime).

> **Prompt**
>
> Build the in-escrow chat and the realtime/notification layer.
>
> - **Chat** (`components/chat`): a message thread scoped to the escrow, WebSocket-driven, with optimistic send + reconciliation, read state, and attachment upload that routes through the evidence module (so attachments are hashed). Only the two parties (and the arbiter once disputed) can access it — enforce visibility on the client to match the API.
> - **Realtime:** a WebSocket hook that keeps the escrow status timeline and inspection-window countdown live without a refresh. When the counterparty acts, the current user's screen updates.
> - **Inspection countdown:** a visible, accurate countdown during `DELIVERED`, with a gentle warning as auto-release approaches.
> - **Notifications:** an in-app notification center reflecting state transitions (invited, agreed, funded, shipped, delivered, inspection-ending-soon, released, disputed, resolved), with unread state.

**Test cases**
- A message sent by one party appears for the other in realtime (two-client Playwright test).
- Optimistic send shows immediately and reconciles; a failed send is marked and retryable.
- A non-party cannot open the chat (route/component guard).
- The inspection countdown reflects the server's window and warns before auto-release.
- A state transition pushes a notification that appears in the center with unread state.

---

## Frontend Milestone F6 — Dispute center (buyer & seller)

Depends on: Milestone 8 (Dispute lifecycle).

> **Prompt**
>
> Build `app/disputes/[id]` — the party-facing dispute experience.
>
> - **Raise a dispute:** from `DELIVERED`, the buyer selects a reason code (`NOT_RECEIVED`, `NOT_AS_DESCRIBED`, `DAMAGED`, `WRONG_ITEM`, `PARTIAL`), writes a statement, and submits required `AT_DELIVERY` evidence (reuse the F2 evidence-capture component). Make clear this freezes the escrow.
> - **Dispute view:** shows the dispute state (`OPEN → EVIDENCE → UNDER_REVIEW → RESOLVED`), a bounded evidence-submission window with a countdown, and both parties' submitted evidence side by side once available. The seller gets a rebuttal path (their own evidence + shipping proof).
> - **Outcome view:** once resolved, show the outcome (release / refund / split) plainly, with the resulting wallet effect. Do not expose the AI's internal reasoning to the parties — that's arbiter-only.
> - Non-submission within the window is shown neutrally as "no evidence submitted," matching how the backend records it.

**Test cases**
- Raising a dispute requires a reason code + statement + at least one evidence item; incomplete submission is blocked.
- The dispute view shows the correct state and a live submission-window countdown.
- Both parties' evidence renders side by side once both have submitted; before that, each sees their own.
- The resolved outcome (including a split) is shown with its wallet effect.
- The AI rationale is **not** visible to buyer or seller anywhere on this screen.
- Playwright: buyer raises dispute → seller rebuts → (arbiter resolves in F7) → both see the outcome.

---

## Frontend Milestone F7 — Arbiter console (role-gated)

Depends on: Milestone 9 (AI arbitration), Milestone 11 (admin/audit).

> **Prompt**
>
> Build the arbiter console at `app/admin` as a role-gated route group (only `ARBITER`/`ADMIN`). This is where the human disposes of what the AI proposes.
>
> - **Dispute queue:** filterable by state, sorted by age/priority, showing which items the AI has flagged `NEEDS_HUMAN` vs. produced a high-confidence recommendation for.
> - **DisputePacket viewer:** the full deterministic packet — frozen terms, event timeline, both evidence bundles with integrity flags shown prominently, and the chat transcript.
> - **AI recommendation panel:** displays the `ArbitrationRecord` — recommended outcome, confidence, rationale, and **which evidence IDs it cited** (link each citation to the actual item so the arbiter can verify the claim, not just trust it). Make abstentions (`NEEDS_HUMAN`) and low confidence visually distinct — the UI must not nudge the arbiter to rubber-stamp.
> - **Execute resolution:** the arbiter selects the final outcome (release / refund / split with ratio) and confirms. This is the money-moving action; it must reference the `ArbitrationRecord` id and require an explicit confirmation. Show the resulting ledger effect before confirming.
> - **Audit visibility:** every executed resolution appears in an immutable audit view.
>
> Design intent: the AI is a decision-support tool, never an autopilot. The console should make it easy to *disagree* with the AI, not just accept it.

**Test cases**
- A non-arbiter user is denied access to the entire `/admin` route group (client guard + relies on API authorization).
- The queue distinguishes AI-recommended items from `NEEDS_HUMAN` items visually.
- Each cited evidence ID in the recommendation links to the actual evidence item.
- Executing a resolution requires explicit confirmation, shows the ledger effect first, and sends the `ArbitrationRecord` id with the request.
- A low-confidence/abstained case is rendered distinctly and never pre-selects an outcome for the arbiter.
- The executed resolution appears in the audit view.
- Playwright: arbiter opens a disputed escrow, reviews the packet + recommendation, executes a refund, and the escrow reaches `REFUNDED` with the buyer's wallet credited.

---

## Cross-cutting invariants to keep sacred (re-assert in every milestone)

1. **Ledger:** `sum(debits) == sum(credits)` globally, always; per-escrow `held + released + refunded == captured`.
2. **Money moves only through the ledger**, only on **verified provider webhooks** (never client callbacks), and only inside the **same DB transaction** as the state transition.
3. **State transitions only through the state machine**; terminal states are terminal; concurrent transitions are serialized (lock or optimistic version).
4. **Evidence and audit logs are append-only and hashed.** Reverse, never edit.
5. **The AI proposes, humans dispose.** No AI code path can move money or self-execute a resolution.
6. **Every milestone ships with the money-race and idempotency tests green** before you move on.
7. **The client never enforces money rules and never holds secrets.** Client-side validation and state are UX only; the API is the sole authority on state transitions, funding, and payouts. Request/response shapes are imported from `packages/shared-types`, never redefined on the client.

---

## Suggested build order recap

**Backend track:** `M0 scaffolding → M1 auth → M2 KYC → M3 escrow state machine → M4 evidence → M5 ledger → M6 funding → M7 settlement (+races) → M8 disputes → M9 AI arbiter → M10 chat/notifications → M11 admin/observability → M12 on-chain (optional)`

**Interleaved (backend milestone, then the frontend that consumes it):**

`M0 → M1 → F1 (auth screens) → M2 → M3 → F2 (creation wizard + capture) → F3 (escrow detail + agreement) → M4 → M5 → M6 → M7 → F4 (funding + wallet) → M10 → F5 (chat + realtime) → M8 → F6 (dispute center) → M9 → M11 → F7 (arbiter console) → M12 (optional)`

**Thin vertical slice for a fast demo:** `M0 → M1 → F1 → M3 → F2 → F3 → M5 → M6 → M7 → F4` — a user can register, create an escrow with evidence, invite a counterparty, agree, fund, deliver, and release, with a correct ledger behind it, all through the web UI. Layer evidence integrity, disputes, and the AI arbiter on top afterward.