# Mezzo

**AI-assisted escrow infrastructure for peer-to-peer marketplace transactions.**

_Powered by [caxton-dev-hub](https://github.com/caxton-dev-hub)._

Mezzo enables buyers and sellers — often located in different cities or states — to transact safely without requiring prior trust between the parties. Sellers document the condition of an item at the point of listing using photo and video evidence. Buyers review that evidence before funding the transaction. Funds are held in escrow until delivery is confirmed, and in the event of a dispute, an AI-assisted arbitration layer analyzes the recorded evidence to produce a recommended resolution, subject to human review before any funds are moved.

---

## Table of Contents

- [Overview](#overview)
- [Transaction Flow](#transaction-flow)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Escrow State Machine](#escrow-state-machine)
- [Ledger Design](#ledger-design)
- [AI Arbitration Layer](#ai-arbitration-layer)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [Development Roadmap](#development-roadmap)
- [Security](#security)
- [Social](#social)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Peer-to-peer trade of physical goods across distance is undermined by a simple asymmetry: the buyer risks paying for goods that are misrepresented or never delivered, and the seller risks shipping goods that are never paid for. Existing escrow providers address the payment side of this problem but generally treat evidence — photos, video, proof of condition — as a secondary artifact retrieved only after a dispute has already begun.

Mezzo is built on the opposite premise: **structured evidence capture is the foundation of the transaction, not a fallback.** Every escrow requires the seller to document the item's condition before a buyer is permitted to fund it. This evidence is hashed, timestamped, and stored immutably, and forms the primary input to dispute resolution if one becomes necessary.

The name reflects the product's role: Mezzo — Italian for "middle" — sits as the neutral, verifiable intermediary between two parties who have no other basis for trust.

Mezzo is a full-stack application: a NestJS API that owns every rule about money, state, and evidence integrity, and a Next.js web client that gives buyers, sellers, and arbiters a fast, camera-first interface for creating escrows, capturing condition evidence, and resolving disputes.

## Transaction Flow

1. **Create** — The initiating party creates an escrow, specifying item description, price, delivery method, and inspection window, along with required photo evidence and optional video.
2. **Invite** — The initiator invites the counterparty via a single-use, expiring link. Either party may act as buyer or seller.
3. **Agree** — Both parties explicitly accept the transaction terms. Terms are frozen upon agreement and cannot subsequently be altered.
4. **Fund** — The buyer reviews the submitted evidence and funds the transaction. Funds are held in escrow, not transferred to the seller.
5. **Ship** — The seller dispatches the item and records shipment.
6. **Deliver & Inspect** — The buyer confirms receipt, initiating an inspection window during which they may submit their own evidence of the item as received.
7. **Release or Dispute** — The buyer releases funds to the seller, raises a dispute if the item does not match the evidence provided, or — if the inspection window elapses without action — funds are released automatically.
8. **Resolution** — In the event of a dispute, both parties submit supporting evidence. The AI arbitration layer evaluates the complete evidence bundle and transaction history, producing a recommended outcome with an associated confidence score and cited rationale. High-confidence, well-evidenced recommendations are surfaced to a human arbiter for execution; ambiguous or contradictory cases are routed directly to manual review. The AI layer does not execute financial transactions under any circumstance — resolution always requires an explicit human action.

## Core Capabilities

- **Condition capture at point of listing** — mandatory photo and optional video evidence, verified on ingest via content hashing, EXIF extraction, and duplicate/tamper detection.
- **Two-party escrow with explicit mutual agreement** — invite-based onboarding, frozen terms, single-use tokens.
- **Regulated payment rails** — NGN funding and payout via Paystack; KYC-tiered transaction limits; funds are recognized only on cryptographically verified provider webhooks, never client-reported status.
- **Double-entry ledger** — every unit of currency is fully traceable; balances are derived from an immutable journal, never stored as a mutable authoritative value.
- **Time-bound inspection with automatic release** — buyer-initiated release, or automatic release upon expiry of an unchallenged inspection window.
- **In-platform transaction chat** — all buyer-seller communication occurs on-platform, preserving an admissible record in the event of a dispute.
- **AI-assisted dispute resolution** — structured, evidence-cited recommendations gated by a human-in-the-loop review step; the system is designed to defer to human judgment rather than issue low-confidence rulings.
- **Complete audit trail** — every state transition and privileged action is recorded immutably.

## System Architecture

Mezzo is a monorepo with a clear client/server boundary: a NestJS API organized by business domain, and a web client responsible for evidence capture, transaction management, and the arbitration console. Each backend module owns its data models, service logic, and test suite; the frontend owns its routes, components, and end-to-end tests against a running API.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Web Client (Next.js)                        │
│  auth · escrow wizard · camera/media capture · chat · wallet ·       │
│  dispute center · arbiter console                                    │
└───────────────────────────────┬────────────────────────────────────┘
                                 │  REST + WebSocket, JWT-authenticated
┌────────────────────────────────▼───────────────────────────────────┐
│                            API (NestJS)                            │
│   auth · users · kyc · escrow · evidence · chat · notifications    │
└────────────────┬─────────────────────────────┬─────────────────────┘
                  │                             │
         ┌────────▼─────────┐          ┌────────▼──────────┐
         │  Escrow state      │          │   Evidence store    │
         │     machine         │          │  (object storage +   │
         │                     │          │      hashing)          │
         └────────┬─────────┘          └────────────────────┘
                  │
         ┌────────▼─────────┐          ┌────────────────────┐
         │      Ledger         │◄────────►│  Payments (Paystack) │
         │  (double-entry)      │          └────────────────────┘
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐          ┌────────────────────┐
         │     Disputes        │◄────────►│  AI arbitration      │
         │                     │          │   (advisory only)     │
         └────────────────────┘          └────────────────────┘
```

The client never talks to Paystack, storage, or the AI provider directly — every external integration is mediated by the API, so secrets, webhook verification, and ledger writes stay server-side.

### Design Invariants

The following properties hold across the entire system and are enforced structurally, not by convention:

1. Funds move **only** through the ledger, within the same database transaction as the corresponding state change, and only in response to a **cryptographically verified** provider event.
2. Escrow state changes **only** through the defined state machine. Direct field mutation is not permitted, and terminal states cannot be re-entered.
3. Evidence, ledger entries, and audit logs are **append-only**. Corrections are made via compensating entries, never edits or deletions.
4. The ledger invariant `sum(debits) == sum(credits)` holds globally at all times; `held + released + refunded == captured` holds per escrow at all times.
5. The AI arbitration layer **recommends**; it does not **decide**. No AI code path has the ability to transition an escrow to a resolved state or post to the ledger.

## Technology Stack

### Backend

| Layer                 | Technology                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Language / framework  | TypeScript, NestJS                                                                                |
| Database              | PostgreSQL, TypeORM                                                                               |
| Cache / queues        | Redis, BullMQ                                                                                     |
| Authentication        | JWT (access + rotating refresh), Passport, role-based access control                              |
| Payments              | Paystack (NGN funding and payouts)                                                                |
| Identity verification | Dojah / Mono                                                                                      |
| Media storage         | S3-compatible object storage                                                                      |
| AI arbitration        | Anthropic (primary) and OpenAI (fallback), via LangChain, with schema-validated structured output |
| Realtime              | WebSocket (NestJS gateway)                                                                        |
| Testing               | Jest, Supertest, Testcontainers                                                                   |
| Observability         | pino (structured logging), OpenTelemetry, Prometheus                                              |

### Frontend

| Layer                 | Technology                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Framework             | Next.js (App Router), TypeScript                                                                                             |
| Styling / components  | Tailwind CSS, shadcn/ui                                                                                                      |
| Data fetching / cache | TanStack Query                                                                                                               |
| Forms / validation    | React Hook Form + Zod (schemas shared with the API via a common package)                                                     |
| State                 | Zustand for local/UI state; server state stays in TanStack Query, not duplicated into a global store                         |
| Realtime              | WebSocket client for live escrow status, chat, and inspection countdowns                                                     |
| Media capture         | `getUserMedia` / native `<input capture>` for in-browser photo and video capture, with client-side compression before upload |
| Auth                  | HTTP-only cookie or secure storage for tokens; silent refresh against the API                                                |
| Testing               | Vitest + React Testing Library (unit/component), Playwright (end-to-end against a running API)                               |

A React Native (Expo) client is a natural phase-two addition once the web app and API are stable — native camera access, push notifications, and offline evidence queuing are meaningfully better on native than in a mobile browser. It is treated as an optional milestone (see [Development Roadmap](#development-roadmap)) rather than a day-one dependency, since the API and evidence contracts are client-agnostic by design.

## Escrow State Machine

```
DRAFT ─────► PENDING_COUNTERPARTY ─────► AGREED ─────► FUNDED ─────► SHIPPED ─────► DELIVERED ─────► RELEASED
  │                   │                     │                                             │
  └───────────────────┴─────► CANCELLED     │                                             ├──► DISPUTED ──┬──► RESOLVED_RELEASE ──► RELEASED
                                             │                                             │               └──► RESOLVED_REFUND ───► REFUNDED
                                             └── terms frozen from this point forward ──────┘
```

All transitions are validated against an explicit transition table and produce an append-only `EscrowEvent`. Invalid transitions raise a typed `IllegalTransitionError`; no state change occurs silently. Refer to `src/escrow/README.md` for the complete diagram and transition guards once implemented.

## Ledger Design

Mezzo maintains a double-entry ledger with the following chart of accounts:

- `user:{userId}:wallet` — a user's available balance
- `escrow:{escrowId}:holding` — funds held against a specific transaction
- `platform:fee_revenue` — platform fee income
- `provider:paystack:clearing` — funds in transit with the payment provider
- `treasury:main` — house/reserve account

Every posting consists of a balanced set of entries (debits equal credits, per currency) committed atomically. Balances are derived from the entry ledger rather than read from a cached mutable field. A continuous reconciliation process asserts the invariant `held + released + refunded == captured` for every escrow and raises an alert on any detected drift.

## AI Arbitration Layer

The arbitration layer consumes a deterministic `DisputePacket` — frozen transaction terms, the complete event timeline, both parties' evidence bundles with integrity flags, and the transaction chat transcript — and returns a structured, schema-validated recommendation:

```json
{
  "recommendedOutcome": "RELEASE_TO_SELLER | REFUND_TO_BUYER | SPLIT",
  "splitRatio": null,
  "confidence": 0.0,
  "rationale": "string",
  "citedEvidenceIds": ["..."],
  "contradictions": [],
  "missingEvidence": []
}
```

**Safeguards:**

- A recommendation citing no supporting evidence is automatically downgraded to `NEEDS_HUMAN`.
- Recommendations below the configured confidence threshold, or based on contradictory or incomplete evidence, are routed directly to human review.
- Every recommendation is persisted as an immutable `ArbitrationRecord`. Resolution — the action that moves funds — is always an explicit human decision referencing that record.
- An evaluation harness scores arbitration output against a set of hand-labeled reference disputes, measuring both accuracy on clear-cut cases and correct abstention on ambiguous or tampered-evidence cases. This harness runs in continuous integration against a recorded model by default.

## Repository Structure

```
apps/
  api/                         NestJS backend
    src/
      auth/                    registration, login, JWT issuance, refresh rotation, RBAC
      users/                   user profile and role management
      kyc/                     verification tiers, provider integration, transaction caps
      escrow/                  state machine, terms, invitations
      evidence/                media upload, hashing, EXIF extraction, integrity flags
      ledger/                  double-entry postings, accounts, reconciliation
      payments/                Paystack funding and payouts, webhook processing
      stellar/                 on-chain USDC funding rail and settlement (Stellar)
      disputes/                dispute lifecycle, evidence windows, DisputePacket assembly
      arbitration/             AI recommendation engine and evaluation harness
      chat/                    in-transaction messaging
      notifications/           email and SMS notifications on state transitions
      admin/                   arbiter console, audit log, ledger explorer
      common/                  shared guards, filters, decorators, and the Money value object
    src/database/
      entities/                TypeORM entity definitions
      migrations/              database migrations
    test/
      e2e/
      fixtures/

  web/                         Next.js frontend
    app/
      (auth)/                  login, register, onboarding
      (dashboard)/             escrow list, wallet, notifications
      escrow/[id]/             escrow detail: status, evidence, chat
      escrow/new/               escrow creation wizard, evidence capture
      disputes/[id]/            dispute center (buyer/seller view)
      admin/                   arbiter console (role-gated route group)
    components/
      evidence/                camera capture, upload progress, media gallery
      escrow/                  status timeline, terms summary, action buttons
      chat/                    message thread, attachment upload
      ui/                      shadcn/ui primitives
    lib/
      api-client/              typed REST client generated/shared from API contracts
      websocket/               realtime subscription hooks
    test/
      e2e/                     Playwright specs

packages/
  shared-types/                Zod schemas and TypeScript types shared between api and web
  config/                      shared ESLint/TSConfig/Prettier base configs

docker-compose.yml             full local stack: Postgres, Redis, MinIO, API, web
apps/api/Dockerfile            API image (build, prune to prod deps, migrate on start)
apps/web/Dockerfile            web image (NEXT_PUBLIC_* baked in at build time)
CLAUDE.md                      project conventions for AI-assisted development
prompts.md                     milestone-based build plan with acceptance test cases
```

## Getting Started

### Prerequisites

- Node.js 20 or later
- Docker (for local PostgreSQL, Redis and MinIO — or for the whole stack, see below)
- A Paystack test account
- Anthropic and/or OpenAI API credentials

### Installation

This is a pnpm-workspaces monorepo. A single install at the root pulls dependencies for both `apps/api` and `apps/web`.

```bash
git clone <repository-url> mezzo
cd mezzo
pnpm install

# Backend
cp apps/api/.env.example apps/api/.env
docker compose up -d
pnpm --filter @mezzo/api migration:run
pnpm --filter @mezzo/api start:dev

# Frontend (separate terminal)
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @mezzo/web dev
```

The API is served at `http://localhost:3000`; the web client at `http://localhost:3001`, configured to talk to the local API via `NEXT_PUBLIC_API_URL`. The API's `GET /health` endpoint verifies database and cache connectivity; both apps fail fast on startup if required configuration is missing.

### Running the whole stack in Docker

`docker compose up` runs every piece — Postgres, Redis, MinIO, the API and the
web app — in containers, with no Node toolchain on the host:

```bash
docker compose up -d --build
```

The web app is served at `http://localhost:3001` and the API at
`http://localhost:3000`; `docker compose logs -f api web` follows both. The API
container runs pending migrations on start, so there is no separate
`migration:run` step, and it creates the MinIO evidence bucket on boot.

API configuration is layered: the `api` service reads `apps/api/.env.example`
first, then your own `apps/api/.env` if it exists, so a fresh clone comes up on
the example defaults (fake payment, KYC, notification and arbitration providers)
and your real credentials override them when present. Compose then overrides the
handful of values that have to differ inside the container network —
`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` — so those
are not worth setting in your `.env` for Docker.

Note that whichever providers your `.env` selects are the ones the container
uses. With `NOTIFICATION_EMAIL_PROVIDER=resend` and a live key, for instance,
registration really does call Resend, and Resend rejects recipients outside your
verified domain — so sign-up fails with a 500 on throwaway addresses. Set it to
`fake` for local work.

The web app is configured differently: every `NEXT_PUBLIC_*` value is inlined
into the bundle at build time, so those are passed as build args in
`docker-compose.yml` rather than read from an env file, and changing one means
`docker compose build web`, not a restart. The only value it reads at run time is
`API_INTERNAL_URL`, which compose points at `http://api:3000` for server-side
rendering.

If ports 5432, 6379, 3000, 3001, 9000 or 9001 are already taken on your machine
— a local Postgres or Redis is the usual culprit — set the host-side port in a
root `.env` and leave the rest alone:

```bash
POSTGRES_PORT=5434
REDIS_PORT=6380
```

Compose reads that file for `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`,
`MINIO_CONSOLE_PORT`, `API_PORT` and `WEB_PORT`. Only the published host ports
change; the containers always talk to each other on the standard ones.

### Running without PostgreSQL

Leaving `DATABASE_URL` unset starts the API in a **JSON file store** mode intended for local work on sign-up and sign-in. Accounts and refresh tokens are written to `JSON_STORE_PATH` (default `.data/mezzo-store.json`) instead of Postgres, so registration, password login, Google sign-in, `/users/me`, and refresh-token rotation all work with no database running.

This mode is deliberately narrow:

- Only `auth`, `users`, and `health` are mounted. Escrow, ledger, payments, disputes, evidence, chat, KYC, arbitration, admin, and receipts require Postgres and are not registered, so their routes return 404. The `/profile` endpoints are among them — profile statistics are derived from escrow history.
- **Redis is still required.** `REDIS_URL` must point at a running instance; `docker compose up -d redis` is enough.
- The API refuses to start in this mode when `NODE_ENV=production`, so a missing or misspelled `DATABASE_URL` in a deployed environment fails fast instead of quietly accepting signups into a file.
- There are no transactions, row locks, or foreign keys. It is a development convenience, never a substitute for the database.

`GET /health` reports a `jsonStore` indicator in place of `database`, including the file path and row count, so it is always obvious which mode is live.

### Migrating the JSON store into PostgreSQL

The file is structured to import directly. Each key under `tables` is the real Postgres table name, each carries the TypeORM entity name, and every row uses entity property names with ISO-8601 timestamps:

```json
{
  "version": 1,
  "updatedAt": "2026-08-03T09:12:44.117Z",
  "tables": {
    "users": {
      "entity": "User",
      "rows": [
        {
          "id": "0f5d…",
          "email": "buyer@example.com",
          "passwordHash": "$argon2id$…",
          "googleSub": null,
          "role": "USER",
          "kycTier": "TIER_0",
          "createdAt": "2026-08-03T09:12:44.117Z",
          "updatedAt": "2026-08-03T09:12:44.117Z"
        }
      ]
    },
    "refresh_tokens": { "entity": "RefreshToken", "rows": [] }
  }
}
```

Point `DATABASE_URL` at a migrated database and run:

```bash
pnpm --filter @mezzo/api migration:run
pnpm --filter @mezzo/api json-store:import
```

The importer saves by primary key, so it is safe to re-run. Uniqueness on `email` and `googleSub` is enforced on write in JSON mode, so a store that accumulated locally will not collide with the unique indexes on import.

## Configuration

### `apps/api/.env`

| Variable                                                        | Purpose                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                  | PostgreSQL connection string; unset falls back to the JSON file store     |
| `JSON_STORE_PATH`                                               | Where the JSON file store writes when `DATABASE_URL` is unset             |
| `REDIS_URL`                                                     | Redis connection string                                                   |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                      | Token signing secrets                                                     |
| `PAYSTACK_SECRET_KEY`                                           | Paystack API credential                                                   |
| `PAYSTACK_WEBHOOK_SECRET`                                       | Webhook signature verification                                            |
| `KYC_PROVIDER_API_KEY`                                          | Identity verification provider credential                                 |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Media storage configuration                                               |
| `ANTHROPIC_API_KEY`                                             | Primary arbitration model provider                                        |
| `OPENAI_API_KEY`                                                | Fallback arbitration model provider                                       |
| `ARBITRATION_CONFIDENCE_THRESHOLD`                              | Minimum confidence required to surface an AI recommendation               |
| `CORS_ALLOWED_ORIGINS`                                          | Origins permitted to call the API (the web app's URL in each environment) |
| `GOOGLE_AUTH_ENABLED`                                           | Turns the Google sign-in endpoint on; the API refuses it when unset       |
| `GOOGLE_CLIENT_ID`                                              | OAuth client ID every Google ID token must be minted for                  |
| `STELLAR_MODE`                                                  | `off` disables the rail, `dev` runs it against a simulated network, `live` against Horizon |
| `STELLAR_NETWORK`                                               | `testnet` or `public`                                                     |
| `STELLAR_ASSET_CODE` / `STELLAR_ASSET_ISSUER`                   | The asset escrows are funded in (USDC and its issuing account)            |
| `STELLAR_HORIZON_URL`                                           | Horizon endpoint used when `STELLAR_MODE=live`                            |
| `STELLAR_CUSTODY_SECRET`                                        | Signing seed for the account that holds escrowed USDC; required for `live` |

### `apps/web/.env.local`

| Variable                       | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | Base URL of the API the client talks to                                           |
| `NEXT_PUBLIC_WS_URL`           | WebSocket endpoint for realtime updates                                           |
| `NEXT_PUBLIC_MAX_UPLOAD_MB`    | Client-side cap enforced before an upload is attempted, mirroring the API's limit |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same OAuth client ID as the API; absent, the Google button is not rendered        |
| `NEXT_PUBLIC_STELLAR_MODE`     | `live` renders a working Connect wallet button; anything else renders "Stellar — coming soon" |

### Google sign-in

Sign-in uses the Google Identity Services ID-token flow: the browser obtains a signed ID token, the API verifies it against Google's published JWKS, and a Mezzo session is issued. There is no client secret and no redirect URI to register.

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Create (or select) a project, then open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name, support email, and developer contact. Add the `email`, `profile`, and `openid` scopes — nothing further is needed. While the app is in **Testing**, add each account you intend to sign in with as a test user.
2. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID** and choose **Web application**.
3. Under **Authorized JavaScript origins**, add every origin that renders the button — `http://localhost:3000` for local development, plus the production web origin. Leave **Authorized redirect URIs** empty; this flow does not use one.
4. Copy the generated client ID into `GOOGLE_CLIENT_ID` (API) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web), and set `GOOGLE_AUTH_ENABLED=true`. The client ID is public by design; the client secret is not used and does not need to be stored.

A Google identity is matched first on its subject, then on its verified email, so signing in with Google attaches to an existing password account with the same address rather than creating a second one. Tokens whose `email_verified` claim is not true are rejected.

All configuration is validated against a schema at startup; neither application will boot with missing or malformed required variables. No secret keys (Paystack, KYC provider, AI providers, storage credentials) are ever exposed to the frontend — only the API holds them.

## Testing

```bash
# Backend
pnpm --filter @mezzo/api test           # unit tests
pnpm --filter @mezzo/api test:e2e        # end-to-end tests (Testcontainers-backed Postgres/Redis)
pnpm --filter @mezzo/api test:cov        # coverage report

# Frontend
pnpm --filter @mezzo/web test            # component/unit tests (Vitest)
pnpm --filter @mezzo/web test:e2e         # Playwright, against a running API
```

Each milestone defined in `prompts.md` carries its own acceptance criteria. Backend milestones are gated on state-machine transition coverage, ledger reconciliation under randomized and concurrent operations, webhook idempotency and replay safety, and arbitration evaluation accuracy and abstention rates. Frontend milestones are gated on component tests for evidence capture and upload states, and Playwright flows covering the full escrow journey (create → invite → agree → fund → deliver → release/dispute) against a live API. A milestone is not considered complete until its associated tests pass.

## Development Roadmap

The complete milestone breakdown, including per-milestone build prompts and acceptance tests, is maintained in [`prompts.md`](./prompts.md).

- [x] Research and architecture design
- [ ] M0 — Project scaffolding and conventions
- [ ] M1 — Authentication and access control
- [ ] M2 — KYC and verification tiers
- [ ] M3 — Escrow core: state machine, invitations, agreement
- [ ] M4 — Evidence capture and integrity verification
- [ ] M5 — Double-entry ledger
- [ ] M6 — Funding (Paystack intake)
- [ ] M7 — Settlement: shipping, delivery, inspection, release/refund
- [ ] M8 — Dispute lifecycle
- [ ] M9 — AI arbitration and evaluation harness
- [ ] M10 — Transaction chat and notifications
- [ ] M11 — Admin console, audit log, observability
- [ ] M12 — On-chain settlement mirror _(optional)_
- [ ] M13 — React Native client _(optional, phase two)_

`prompts.md` currently details backend milestones only. Frontend milestones (auth screens, escrow creation wizard, evidence capture, wallet, chat, dispute center, arbiter console) follow the same domain boundaries and are tracked as a parallel milestone track — each backend milestone that exposes a new API surface has a corresponding frontend milestone to build the screens against it.

## Security

- No card or bank credentials are handled or stored directly by this codebase; all payment data is managed by Paystack.
- Funds are recognized only upon cryptographically verified provider webhooks — client-reported transaction status is never trusted.
- Evidence and audit records are append-only and content-hashed; no party, including administrators, may silently modify historical records.
- Transaction limits are tiered according to KYC verification level to limit exposure from unverified accounts.

To report a security vulnerability, please disclose it privately rather than through a public issue. See `SECURITY.md` for contact details (to be added prior to public release).

## Social

Short bio used for social/business profiles (e.g. Facebook Page):

> Secure escrow for every transaction. Your money, protected until the deal is done.

## Contributing

This project is under active early-stage development. Prior to opening the repository to external contributors:

1. Branch from `main`; scope each pull request to a single milestone or feature.
2. Follow the conventions defined in `CLAUDE.md`.
3. All tests, linting, and type checks must pass before requesting review.
4. Code should be self-documenting; avoid inline comments in favor of clear naming and structure, and use commit messages and pull request descriptions to convey rationale.

## License

To be determined. A `LICENSE` file will be added prior to making this repository public.
