# WhatsApp module

A bidirectional bot over the Meta WhatsApp Cloud API, sitting alongside
`chat` and `notifications` rather than inside either. It owns no escrow
state of its own — every command it handles is a thin dispatch onto
`EscrowService`/`SettlementService`/`ChatService`, so the same domain
errors and audit trail the REST API produces are exactly what a
WhatsApp user sees.

## Two directions

**Inbound** (`WhatsAppWebhookController` → `WhatsAppInboundMessageProcessor`
→ `WhatsAppCommandDispatcherService`): Meta posts every inbound message
to `POST /whatsapp/webhook`. The signature (`X-Hub-Signature-256`,
HMAC-SHA256 over the raw body with `WHATSAPP_APP_SECRET`) is verified
before the body is trusted at all; an invalid signature is rejected
with no side effects. A valid message is deduped by WhatsApp's own
`message.id` via `WhatsAppDedupeService` (Redis `SET NX EX`) — a
redelivery of the same id is a no-op — then handed to
`WHATSAPP_INBOUND_QUEUE` (BullMQ) and the webhook returns 200
immediately; command handling happens off the request path, same as
every other queue in this codebase.

**Outbound**: `WhatsAppChannel` implements the existing
`NotificationChannel` interface (`notifications/channels`) exactly like
`ResendEmailChannel`/`TermiiSmsChannel`, so escrow/dispute
state-transition notifications fan out over WhatsApp the same way they
do over email/SMS — same dedupe key, same retry/backoff, same
idempotent `Notification` row. `NotificationsService.notify()` only
queues the WhatsApp leg for a recipient who has a linked,
non-opted-out `WhatsAppAccount`.

## Account linking: two independent proofs

A WhatsApp number is never trusted on its own. Linking needs proof of
two things at once:

1. **Control of the Mezzo account** — `POST /whatsapp/link/start` sits
   behind the normal JWT guard, so calling it at all already proves the
   caller controls an authenticated (email-verified) account.
2. **Control of the WhatsApp number** — `WhatsAppLinkingService.startLink()`
   sends a 6-digit code to that number (`WhatsAppLinkCode`, hashed at
   rest, TTL + max-attempt lockout — the same shape as
   `EmailVerificationService`). The number only becomes verified
   (`WhatsAppAccount.verifiedAt`) once that code is replied back over
   WhatsApp itself, via the ordinary inbound webhook path.

Re-linking a different number always goes through this whole flow
again; a `WhatsAppAccount` row is only ever updated by a successful
`confirmLink()`, never by `startLink()`.

## Conversation state: Redis, not the database

`WhatsAppConversationSessionService` holds one JSON blob per phone
number (`whatsapp:session:<phone>`), TTLed via
`WHATSAPP_SESSION_TTL_SECONDS`. Only two states are ever written:
`confirming-release` and `confirming-approve` — everything else is
implicitly `idle` (no key = idle). A PIN reply is only meaningful while
a session is open; once the TTL elapses (or the key is otherwise gone)
the same digits are just parsed as an unrecognized command, so a stale
confirmation can never be resumed.

## Step-up authentication for money movement

Releasing funds and confirming delivery (approve) both require a PIN
set in advance (`WhatsAppPinService`, argon2-hashed via the same
`PasswordService` used for login passwords — not the single-use
SHA-256 codes used for linking, since a PIN is meant to be reused).
`RELEASE`/`APPROVE` compute the exact amount and counterparty up front
(via `Money`/`computeFeeSplit`, matching what `SettlementService`
would compute) and store it in the session; only a correct PIN reply
executes the underlying `SettlementService` call. Wrong PINs increment
a per-account failure counter; reaching `WHATSAPP_PIN_MAX_ATTEMPTS`
locks the account for `WHATSAPP_PIN_LOCKOUT_MINUTES` and clears the
session — a locked-out user must wait, not just retry.

A successful `RELEASE`/`APPROVE` calls `SettlementService.release()`/
`.confirmDelivery()` directly — the exact same methods the REST API
uses — so `IllegalTransitionError`, `InsufficientFundsError`, etc. are
never re-implemented for the bot; whatever those services throw is
relayed back as the WhatsApp reply text. Each successful call also
writes an `AuditEvent` (`WHATSAPP_RELEASE_FUNDS` /
`WHATSAPP_APPROVE_DELIVERY`), same as any other privileged action.

## Feature flags: the module vs. money movement

`WHATSAPP_ENABLED` is a boot-time env flag — the whole bot (webhook
verification and processing) is a no-op while it's off. It's a
rollout gate, not something that needs to flip without a deploy.

`WHATSAPP_TRANSACTIONAL_ENABLED` is different: it gates only
`RELEASE`/`APPROVE`, and it is **not** a static env var — it's backed
by `SettingsService`/`PlatformFlag` (`WHATSAPP_TRANSACTIONAL_ENABLED`
key), the same "env default, DB row overrides it" shape as
`VERIFICATION_ENABLED`. `POST /admin/settings/whatsapp-transactional`
(admin-only) flips it instantly, so money movement over WhatsApp can be
killed mid-incident without a deploy while status/list/dispute-reply
commands keep working.

## Commands

`STATUS <code>`, `LIST`, `APPROVE <code>`, `RELEASE <code>`,
`DISPUTE <code> <message>` (posts into the escrow's existing chat —
the same transcript the dispute packet already reads),
`EVIDENCE <code>` (a deep link into the web app's evidence upload
page — the bot never ingests WhatsApp media itself), `PIN SET <4-6
digits>`, `OPTOUT`/`OPTIN`, `HELP`.

## Key pieces

- **`whatsapp-webhook.controller.ts`** — GET handshake verification,
  POST ingress: signature check → dedupe → enqueue.
- **`whatsapp-command-dispatcher.service.ts`** — the only place that
  calls into `EscrowService`/`SettlementService`/`ChatService`; every
  branch is wrapped so a thrown `DomainError` becomes the WhatsApp
  reply text instead of an unhandled rejection.
- **`whatsapp-linking.service.ts`** / **`whatsapp-pin.service.ts`** —
  the two proof-of-possession flows described above.
- **`client/`** — `WhatsAppClient` interface,
  `FakeWhatsAppClient` (records `.sent` for tests),
  `MetaWhatsAppClient` (real Graph API `fetch` calls), selected by
  `WHATSAPP_CLIENT_PROVIDER` exactly like `KYC_PROVIDER`/
  `PAYMENT_PROVIDER`.
- **`database/entities/whatsapp-account.entity.ts`** /
  **`whatsapp-link-code.entity.ts`** — TypeORM-only (no JSON-store
  support), since this module only registers when Postgres/Redis/
  BullMQ are configured.
