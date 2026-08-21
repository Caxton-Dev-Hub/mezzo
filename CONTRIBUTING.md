# Contributing to Mezzo

This is the workflow doc: how a change gets from your machine into `main`.
For *what* the conventions are and *why* — money handling, error types,
testing policy, architecture — see [`CLAUDE.md`](./CLAUDE.md), which is the
canonical, exhaustive statement of project conventions. This file doesn't
repeat it.

For environment setup, see the [Getting Started](./README.md#getting-started)
section of the root README.

## Before you start a change

- Read `CLAUDE.md` in full if you haven't already — it overrides default
  assumptions about how the codebase is organized.
- If you're touching a feature module (`auth`, `users`, `kyc`, `escrow`,
  `evidence`, `ledger`, `payments`, `disputes`, `arbitration`, `chat`,
  `notifications`, `admin`), read that module's `README.md` first
  (`apps/api/src/<module>/README.md`). It documents the design decisions —
  races closed, invariants enforced, alternatives rejected — that the code
  alone won't tell you. A change that violates something the README calls
  out as deliberate is very likely a bug, not an improvement.
- New feature areas belong inside an existing module. `CLAUDE.md` fixes the
  module list; propose a new one there before creating a new top-level
  directory under `apps/api/src`.

## Branches and commits

- Branch off `main`; branch names aren't enforced, but `feature/…`,
  `fix/…`, and `chore/…` prefixes make history easier to scan.
- Commit messages describe *why* over *what* — the diff already shows what
  changed. Keep the subject line under ~70 characters.
- Never `--no-verify`, `--no-gpg-sign`, or otherwise skip the pre-commit
  hook. If it's failing on something unrelated to your change, that's a
  bug in the hook or a pre-existing issue to raise, not something to route
  around.

## What has to be true before you open a PR

- **Tests are green, not just written.** Every escrow or dispute state
  transition and every money movement (ledger posting, payment webhook)
  introduced by your change is covered by a test. e2e tests use
  Testcontainers against real Postgres/Redis — never a mock of either.
- **A module's logic files don't change without a spec file changing too.**
  The pre-commit hook and the `docs-and-tests-touched` CI job both run
  `scripts/check-touched-tests.mjs`, which fails the build if
  `apps/api/src/<module>/**/*.ts` logic (service/controller/guard — not DTOs,
  entities, or errors) changes with no `*.spec.ts` in that same module in
  the diff. This is a mechanical stand-in for "is it tested," not a
  replacement for it — passing the check with a trivial or unrelated spec
  edit defeats the point. If a change genuinely needs no new coverage, set
  `SKIP_TEST_TOUCH_CHECK=1` locally or apply the `skip-test-check` label to
  the PR, and say why in the PR description.
- **Lint and typecheck pass.** The pre-commit hook (`pnpm lint && pnpm
  typecheck`) runs this automatically; don't rely on CI to catch what the
  hook already checked.
- **No `any`, no dead code, no unused exports.** Strict TypeScript
  throughout.
- **Money is never a float**, anywhere in the diff — integer minor units
  through the `Money` value object, currency always explicit.
- **Domain errors are typed classes**, not raw `Error` or string throws.
- **Shared request/response shapes live once**, as a Zod schema in
  `packages/shared-types` — never redefined independently on the API or
  web side. If you add or change one, rebuild the package
  (`pnpm --filter @mezzo/shared-types build`) before the API will see the
  new export — a stale `dist` is a common source of "this type doesn't
  exist" during local typecheck.
- **If you touched a feature module's design** (not just its
  implementation), update that module's `README.md` in the same PR. A
  README describing behavior the code no longer has is worse than no
  README. `check-touched-tests.mjs` prints a non-blocking reminder when a
  module's logic changed without its README changing — it can't tell
  design from implementation, so it warns rather than fails; use judgment
  on whether it applies.

## Opening the PR

- Keep the description focused on *why*, matching commit message style.
  The diff carries the *what*.
- Note any deliberately deferred work (a TODO, a follow-up module, a
  scheduler that doesn't exist yet) explicitly rather than leaving it
  implicit — the existing module READMEs do this consistently (e.g. "no
  scheduler drives it yet") and it's the convention to keep following.
- A PR that changes cross-cutting behavior (the ledger, the escrow state
  machine, auth, config validation) should call that out first in the
  description, since it has the widest blast radius for review.

## Review expectations

- A reviewer should be able to tell *why* a change was made without asking
  in a comment. If they can't, the description or the code comments (only
  where the *why* is genuinely non-obvious — see `CLAUDE.md`'s comment
  policy) are incomplete.
- Reviewers check the same non-negotiables listed above independently of
  CI — CI catches lint/type/test failures, not float-money bugs or an
  untyped error slipping past the exception filter.

## Docs

- Engineering docs live at [`/docs`](./apps/web/app/docs) in the web app —
  architecture, module index, and standards, meant as oriented reading
  rather than the source of truth. Update it when a change shifts the
  system's shape (a new module, a changed invariant), not for every PR.
- `CLAUDE.md` stays the authoritative reference. If `/docs` and
  `CLAUDE.md` ever disagree, `CLAUDE.md` wins and `/docs` needs fixing.
