# Admin module

The arbiter console's API surface and the platform's cross-cutting audit and
observability plumbing. Nothing here moves money on its own — every
money-moving endpoint delegates to the same services earlier milestones
already gate behind the state machine and the ledger (`DisputeService`,
`LedgerService`). This module adds the human-facing controls on top, plus the
record of who did what.

## Endpoints

| Route | Roles | Purpose |
|---|---|---|
| `GET /admin/disputes?state=` | ARBITER, ADMIN | Disputes filtered by state, each with its latest `ArbitrationRecord` (or `null` if the AI hasn't run) so the queue can distinguish a pre-filled recommendation from `NEEDS_HUMAN`. |
| `GET /admin/disputes/:id` | ARBITER, ADMIN | The `DisputePacket` plus every `ArbitrationRecord` for the dispute, newest first. |
| `GET /admin/ledger/postings?correlationId=` | ADMIN | Postings (with entries) sharing a correlation id — the read side of the trace-continuity story below. |
| `GET /admin/ledger/entries?accountRef=` | ADMIN | Recent entries for one account ref — the per-account ledger explorer. |
| `GET /admin/ledger/reconciliation` | ADMIN | Runs `ReconciliationService.reconcile()` on demand. |
| `POST /admin/ledger/adjustments` | ADMIN | Posts a compensating entry (see below). |
| `GET /admin/kyc/queue?status=` | ADMIN | `KycVerification` rows, optionally filtered by status. |
| `POST /admin/kyc/users/:userId/tier` | ADMIN | Manual tier override. |
| `GET /admin/users` | ADMIN | User roster with role and KYC tier. |
| `GET /admin/audit` | ADMIN | `AuditEvent` rows, optionally filtered by entity. |

Every response shape above that the web console reads — the dispute summary, the
packet-with-records envelope, the `ArbitrationRecord`, and the `AuditEvent` — is
defined once as a zod schema in `packages/shared-types` and imported here, so the
F7 console consumes exactly what this module returns.

The actual resolution-execution endpoint is `POST /disputes/:id/resolve`
(Milestone 8) — it isn't duplicated here. This milestone extends it with an
optional `arbitrationRecordId`: if present, it's validated against the
dispute and persisted on `Dispute.resolvedArbitrationRecordId`, so the
executed decision always references the recommendation it was based on (or
`null` for a resolution made without one).

## Where the first privileged account comes from

Every route above is `@Roles(ARBITER, ADMIN)` or `@Roles(ADMIN)`, and the only
endpoint that can change a user's role is itself admin-gated — so a fresh
deployment had no way to mint its first privileged account. `UsersService.create()`
now checks the registering email against `BOOTSTRAP_ADMIN_EMAILS` (a comma-separated
env value, empty by default) and assigns `ADMIN` instead of `USER` on a match. It
is deliberately dumb: nothing is promoted after the fact, an unset variable means
every registration is an ordinary `USER`, and the address still has to complete a
normal registration with a password of its own. It is also what lets the web
Playwright suite drive the arbiter console at all, since that suite can only reach
the API over HTTP.

## Adjustments are reversals, never edits

`POST /admin/ledger/adjustments` builds a two-line balanced posting — a debit
and a credit for the same amount and currency — through the ordinary
`LedgerService.postTransaction()` path. There is no code path anywhere that
updates a `LedgerEntry` or a cached balance directly outside that method;
"editing the ledger" as an admin action does not exist. Every adjustment is
audited with the reason the caller supplied.

## Only the latest funding attempt counts as a stuck payment

Every Fund click creates a new payment intent with its own reference (see the
`payments` README), and earlier attempts stay `PENDING` so a checkout already
open in another tab can still fund the escrow. Flagging each of those as
`PAYMENT_INTENT_STUCK` would bury the at-risk list in abandoned tabs.
`computeRiskItems` therefore flags a stale `PENDING` intent only when it is
the most recent intent for its escrow. A replaced attempt is not stuck, since
the buyer moved on to a newer checkout. A `QUARANTINED` intent is flagged
whatever its position, because a quarantine means money arrived and needs a
human decision.

## `AuditEvent` — the immutable record of privileged actions

`AuditService.record()` is an append-only insert; there is no `update` or
`delete` on the service. Three call sites write one today:

- `DisputeService.resolve()` — one `DISPUTE_RESOLUTION_EXECUTED` event per
  resolution, referencing the arbitration record id in its `reason` when one
  was supplied.
- `AdminService.postAdjustment()` — one `LEDGER_ADJUSTMENT_POSTED` event per
  adjustment.
- `AdminService.overrideKycTier()` — one `KYC_TIER_OVERRIDE` event per
  override, with `before`/`after` tiers.

## Correlation id propagation

A `CorrelationIdMiddleware` (in `common/context`) reads `x-correlation-id`
off the inbound request, or generates one, and stores it for the life of the
request in an `AsyncLocalStorage`-backed `RequestContextService`. Both state
machines (`EscrowStateMachine`, `DisputeStateMachine`) and `DisputeService`'s
resolution path read that value as the correlation id for their events, the
ledger posting, and the notification job they enqueue — so one id ties
together the dispute event, the escrow event, the ledger posting, and the
notification job produced by a single privileged HTTP action. `GET
/admin/ledger/postings?correlationId=` is the read path that lets an operator
pull that whole trace back out.

## Observability (`../observability`)

- `MetricsService` exposes Prometheus counters/gauges via `GET /metrics`
  (public, unauthenticated, as Prometheus expects): escrow counts by state,
  disputes raised, auto-releases, AI abstentions, and ledger drift
  detections.
- `LoggingAlertsService` is the `AlertsService` implementation wired by
  default — `ReconciliationService.reconcile()` calls it (and increments the
  drift counter) whenever it finds a drifted account or a global imbalance.
  Swap the DI binding for a paging integration without touching
  `ReconciliationService`.
- `TracingService` wraps `@opentelemetry/api`; `main.ts` optionally boots a
  `NodeTracerProvider` with a console exporter when `OTEL_ENABLED=true`, so
  spans are real whether or not a collector is configured.
- `AppLoggerService` is a pino-backed Nest `LoggerService` that stamps every
  log line with the current request's correlation id from
  `RequestContextService`.
- `GET /admin/payments/provider-float` reports, per provider, the ledger's
  `provider:{name}:clearing` balance against the provider's live balance and
  the drift between them. It is admin-only and always returns a row for both
  Paystack and Flutterwave regardless of which one `PAYMENT_PROVIDER`
  currently selects — see the payments module README for why. `AdminService`
  delegates to `ProviderFloatService` and adds nothing; the endpoint lives
  here because float is an operator concern, not a user-facing one.
