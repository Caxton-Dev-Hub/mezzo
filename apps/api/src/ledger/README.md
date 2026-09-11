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
| `user:{userId}:wallet:{CUR}` | `USER_WALLET` | CREDIT |
| `escrow:{escrowId}:holding` | `ESCROW_HOLDING` | CREDIT |
| `platform:fee_revenue:{CUR}` | `PLATFORM_FEE_REVENUE` | CREDIT |
| `provider:{name}:clearing:{CUR}` | `PROVIDER_CLEARING` | DEBIT |
| `treasury:{name}:{CUR}` | `TREASURY` | DEBIT |

An account row is created lazily, the first time a posting references its
`ref` — there is no separate "create account" step. A `ref` that matches no
pattern throws `UnknownLedgerAccountRefError` before any transaction opens.

### Why the currency is part of the ref

A `ledger_accounts` row carries exactly one `currency`, fixed the first time
the account is used, and `ref` is unique. So an account identity that does
*not* name a currency can only ever hold one — and the second currency to
arrive throws `CurrencyMismatchError` at posting time.

That was invisible while every escrow was priced in naira. It stops being
invisible the moment a second currency exists: `platform:fee_revenue` is a
single global row, and `user:{id}:wallet` is a single row per person, so one
USD release would have permanently pinned the platform's fee account to USD
and made every subsequent NGN release fail. The Stellar rail (USD) made that
reachable, but the collision was always there — a USD-priced escrow on the
card rail would have done the same thing.

The fix is to make currency part of the account's *identity* rather than a
property discovered after the fact. `user:u1:wallet:NGN` and
`user:u1:wallet:USD` are two accounts, as they always should have been: they
hold different money and can never be added together. `getBalance(ref)` stays
a single-argument lookup precisely because the ref now answers "which
currency?" on its own — there is no ref whose currency is ambiguous.

`escrow:{id}:holding` is deliberately *not* currency-qualified. An escrow has
one price in one currency for its whole life, so the escrow id already
determines the currency; adding it would be redundant.

Migration `CurrencyQualifyLedgerAccountRefs1787350000000` rewrites existing
rows by appending their own `currency` column to `ref`, which is exact for
every row that exists — each one already held exactly one currency.

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
