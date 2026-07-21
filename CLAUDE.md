# CLAUDE.md

Project conventions for AI-assisted development on Mezzo. Read this before starting any milestone in `prompts.md`.

## Stack

- NestJS + TypeScript (backend), Next.js App Router + TypeScript (frontend, from milestone F1 onward).
- PostgreSQL via TypeORM.
- Redis + BullMQ for caching, queues, and distributed locks.
- Jest + Supertest for backend tests; Testcontainers spins up real Postgres/Redis for e2e tests — never mock the database or Redis in e2e tests.
- npm workspaces monorepo: `apps/api`, `apps/web`, `packages/shared-types`, `packages/config`.

## Architecture

- Modular Nest monolith. Feature modules: `auth`, `users`, `kyc`, `escrow`, `evidence`, `ledger`, `payments`, `disputes`, `arbitration`, `chat`, `notifications`, `admin`.
- Domain logic lives in services. Controllers are thin: request in, DTO validation, delegate to a service, response out.
- Each module owns its own entities/models, service logic, and test suite.
- Request/response validation schemas live once in `packages/shared-types` as Zod schemas and are imported by both the API (DTO validation) and the web app (form validation). Never redefine a shape on the client.

## Money

- Money is never represented as a float, anywhere — not in the database, not in DTOs, not in application code.
- Use integer minor units (kobo) and a `Money` value object for all arithmetic and comparisons.
- Currency is explicit on every amount; a bare integer is never treated as an implicit-currency value.

## Code style

- Production-ready code only: no inline comments, no dead code, no unused exports.
- Strict TypeScript everywhere (`strict: true`), no `any`.
- Every change passes lint (ESLint) and formatting (Prettier) before commit — enforced by a Husky pre-commit hook running lint + typecheck.
- Prefer the simplest correct implementation. Do not add abstractions, config options, or generality the current milestone doesn't need.

## Testing

- Every state transition (escrow state machine, dispute lifecycle) and every money movement (ledger postings, payment webhooks) must be covered by tests before a milestone is considered done.
- Unit tests for service logic; e2e tests (Supertest + Testcontainers) for API surfaces that touch the database, Redis, or external providers.
- A milestone is not complete until its tests are green.

## Errors

- Domain errors are typed classes (e.g. `IllegalTransitionError`, `InsufficientFundsError`), not raw `Error` or string throws.
- A global exception filter maps typed domain errors to the correct HTTP status and a structured error response.
- Stack traces and internal error details are never leaked to API responses.

## Configuration

- Configuration is loaded via `@nestjs/config` and validated against a Zod schema at boot.
- The application fails fast on startup if required environment variables are missing or malformed — it never starts in a partially-configured state.

## Repository structure

```
apps/
  api/                         NestJS backend
    src/
      <feature modules>/       one directory per feature module listed above
      common/                  shared guards, filters, decorators, and the Money value object
      config/                  env schema and configuration module
      health/                  HealthController (DB + Redis checks)
      database/
        entities/               TypeORM entity definitions
        migrations/              database migrations
        data-source.ts           DataSource used by the TypeORM CLI
    test/
      e2e/
      setup/                   Testcontainers bootstrap helper

  web/                         Next.js frontend (from milestone F1)

packages/
  shared-types/                Zod schemas and TypeScript types shared between api and web
  config/                      shared ESLint/TSConfig/Prettier base configs

docker-compose.yml              local Postgres + Redis
```
