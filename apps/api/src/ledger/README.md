# Ledger module

An immutable double-entry ledger. Every money movement in the platform posts
here, in one atomic `Posting` made up of balanced `Entries`. No other module
may mutate a balance directly — funding (Milestone 6) and settlement
(Milestone 7) call `LedgerService.postTransaction()`, nothing else.

## Chart of accounts

Accounts are identified by a `ref` string, not a foreign key to another
module's table — the ledger has no idea what an escrow or a user *is*, only
that money moved. `ref` is parsed against a fixed set of patterns to
determine the account's `type` and `normalBalance`:

| Ref pattern | Type | Normal balance |
|---|---|---|
| `user:{userId}:wallet` | `USER_WALLET` | CREDIT |
| `escrow:{escrowId}:holding` | `ESCROW_HOLDING` | CREDIT |
| `platform:fee_revenue` | `PLATFORM_FEE_REVENUE` | CREDIT |
| `provider:{name}:clearing` | `PROVIDER_CLEARING` | DEBIT |
| `treasury:{name}` | `TREASURY` | DEBIT |

An account row is created lazily, the first time a posting references its
`ref` — there is no separate "create account" step. A `ref` that matches no
pattern throws `UnknownLedgerAccountRefError` before any transaction opens.

## Why `normalBalance` instead of one universal sign convention

`holding` and `wallet` accounts represent money the platform *owes out*
(to a seller, a buyer, or back to a provider) — they grow on the credit side,
like a liability. `clearing` and `treasury` represent cash the platform
*holds* — they grow on the debit side, like an asset. Milestone 6 and 7's
own prompt text fixes this: funding posts `DR provider:clearing → CR
escrow:holding`, and release posts `DR escrow:holding → CR seller:wallet`.
Both sides of both postings only balance to zero net effect on `holding` if
credit is holding's increasing side. A derived balance is therefore:

```
balance = normalBalance === DEBIT ? (debits - credits) : (credits - debits)
```

computed straight from `ledger_entries`, never taken from a mutable field.

## `cachedBalance` is a read model, not the source of truth

`LedgerAccount.cachedBalance` is updated in the same transaction as every
posting, purely so reads don't have to aggregate `ledger_entries` every
time. It is never read by `postTransaction` or `getBalance` — both always
derive from entries. `ReconciliationService.reconcile()` is the one thing
that compares the cache against the derived value and reports drift;
`LedgerService.rebuildBalance()` recomputes it from scratch and overwrites
the cache. If the cache were ever deleted entirely, nothing about correctness
would change — only the cost of a balance read.

## Idempotency

`postTransaction(lines, { idempotencyKey })` looks up an existing `Posting`
by key before doing anything else. If two callers race with the same key,
the loser's `INSERT` hits the unique index on `idempotency_key`, is caught,
and the loser re-reads and returns the winner's posting instead of erroring
— the same pattern used for refresh-token rotation and evidence uploads
elsewhere in this codebase, just backed by a real unique constraint instead
of an application-level status check, because money is the one place a race
can't be allowed to double-post.

## Atomicity

Balance-checking happens before `dataSource.transaction()` is ever opened
(same shape as `EscrowStateMachine.transition()` — guards run before the
transaction, not inside it). Everything from account auto-creation through
every entry insert and every `cachedBalance` update happens inside that one
transaction; a failure on any line (e.g. a line's declared currency doesn't
match the account's stored currency) rolls back the entire posting, and the
`idempotencyKey` is free to be retried — a failed attempt never consumes it.

## Reconciliation

`ReconciliationService.reconcile()` asserts the global invariant
`sum(debits) == sum(credits)` across every entry ever posted, and separately
walks every account comparing its cached balance to a fresh derivation from
entries, returning any `ref`s that disagree. Since every write path posts
through `LedgerService`, drift should only be reachable by writing to
`ledger_accounts` directly (a bug, a manual DB fix, a bypassed code path) —
which is exactly the scenario the module's tests induce to prove `reconcile()`
actually catches it.
