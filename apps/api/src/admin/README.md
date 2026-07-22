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

The actual resolution-execution endpoint is `POST /disputes/:id/resolve`
(Milestone 8) — it isn't duplicated here. This milestone extends it with an
optional `arbitrationRecordId`: if present, it's validated against the
dispute and persisted on `Dispute.resolvedArbitrationRecordId`, so the
executed decision always references the recommendation it was based on (or
`null` for a resolution made without one).

## Adjustments are reversals, never edits

`POST /admin/ledger/adjustments` builds a two-line balanced posting — a debit
and a credit for the same amount and currency — through the ordinary
`LedgerService.postTransaction()` path. There is no code path anywhere that
updates a `LedgerEntry` or a cached balance directly outside that method;
"editing the ledger" as an admin action does not exist. Every adjustment is
audited with the reason the caller supplied.

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
