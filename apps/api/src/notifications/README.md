# Notifications module

Fans a state transition out to every party as a queued, retried, per-
channel delivery — without ever letting a notification failure affect
the transition itself, and without ever double-sending when the same
transition is observed twice.

## Dependency direction: notifications know nothing about escrows

`NotificationsModule` imports nothing from `escrow`, `disputes`, or
`chat` — it exports one method, `NotificationsService.notify()`, and lets
the modules that own a state machine call it. That keeps the dependency
graph one-directional (`escrow`/`payments`/`disputes` -> `notifications`,
never the reverse) and mirrors how every other cross-cutting concern in
this codebase (the ledger, evidence) is consumed rather than consuming.

## Where `notify()` is called from

There is no event bus in this codebase, so each call site is explicit,
placed at the exact point an earlier milestone already enqueues its own
BullMQ follow-up job (the auto-release job in
`SettlementService.confirmDelivery()`, the evidence-window job in
`DisputeService.raise()`) — after the state transition's own transaction
has committed, never from inside it:

| Event | Call site |
|---|---|
| `INVITED` | `EscrowService.invite()` |
| `AGREED` | `EscrowService.acceptTerms()` (once both parties have) |
| `FUNDED` | `PaymentsService.handleWebhook()` (verified `charge.success` only) |
| `SHIPPED` | `SettlementService.ship()` |
| `DELIVERED` | `SettlementService.confirmDelivery()` |
| `INSPECTION_ENDING_SOON` | `InspectionEndingSoonProcessor`, a second BullMQ delayed job scheduled alongside the auto-release job |
| `RELEASED` | `SettlementService.executeRelease()` (buyer release and auto-release both) |
| `DISPUTED` | `DisputeService.raise()` |
| `RESOLVED` | `DisputeService.resolve()` |

Firing after commit, not before, matters the same way it does for the
existing delayed jobs: if the surrounding transaction rolls back, the
line that calls `notify()` is never reached, so a notification can never
describe a transition that didn't actually happen.

## Idempotency: two independent layers

**Layer one — the queue itself.** `notify()` computes a deterministic
`dedupeKey` per `(sourceEventId, channel, recipient)` and passes it as
the BullMQ `jobId`. `sourceEventId` is built from data the caller already
has in hand — `${escrowId}_${escrow.state}_${escrow.version}` for escrow
transitions, `${disputeId}_RESOLVED_${dispute.version}` for dispute
resolution — using the optimistic `version` column each state machine
already increments exactly once per real transition. A duplicate call
describing the *same* transition (a retried request, a re-fired event)
reproduces the same key, and BullMQ's `add()` is a no-op for a `jobId`
that already exists, so the processor never runs twice for it. (BullMQ
job IDs cannot contain `:` — the separator here is `_`, not the `:` the
rest of the codebase uses for composite keys elsewhere.)

**Layer two — the processor, for retried/stalled jobs specifically.**
Layer one only protects against a second `.add()` call; it does not
protect against BullMQ retrying the *same* job after a worker crash mid-
send. `NotificationDeliveryProcessor` guards that path separately: it
looks up (or inserts) a `Notification` row keyed on the same `dedupeKey`
(a unique index) before calling the channel, short-circuits if that row
is already `SENT`, and treats a unique-constraint violation on insert as
"another attempt is already handling this" rather than an error.

## Delivery: `NotificationChannel`, swapped by config

`EMAIL_CHANNEL`/`SMS_CHANNEL` are two DI tokens resolved by a
`useFactory`, the same "interface + Symbol token + Fake/real,
factory-selected by an env enum" shape as `KYC_PROVIDER`/
`PAYSTACK_PROVIDER`/`ARBITRATION_PROVIDER`:
`NOTIFICATION_EMAIL_PROVIDER`/`NOTIFICATION_SMS_PROVIDER`, each
`fake` (default, everywhere except a real deployment) or a real provider
(`resend`, `termii`). `FakeNotificationChannel` records every delivery in
memory (`.sent`) so tests can assert on it directly, exactly like
`FakeKycProvider`.

Delivery failure marks the `Notification` row `FAILED` and rethrows, so
BullMQ's `attempts`/`backoff` (`NOTIFICATION_QUEUE_ATTEMPTS`/
`NOTIFICATION_QUEUE_BACKOFF_MS`) retry it — this is the first queue in
the codebase that needed retry configuration at all, since the two
existing delayed jobs (auto-release, evidence-window) are one-shot by
design.

## Key pieces

- **`NotificationsService`** — `notify()` (fan-out + enqueue),
  `listForUser()` (the read model behind `GET /notifications`).
- **`NotificationDeliveryProcessor`** — the BullMQ worker; owns the
  `Notification` row's `PENDING -> SENT | FAILED` lifecycle.
- **`channels/`** — `NotificationChannel` interface,
  `FakeNotificationChannel`, `ResendEmailChannel`, `TermiiSmsChannel`.
- **`database/entities/notification.entity.ts`** — one row per
  `(event, channel, recipient)`, unique on `dedupeKey`.
