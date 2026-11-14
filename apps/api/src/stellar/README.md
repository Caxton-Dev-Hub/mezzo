# Stellar module

The on-chain funding rail. An escrow can be funded in USDC on Stellar instead
of in naira through a card processor, and settled back out to the winning
party's own wallet. This module owns the chain; it does not own the escrow.

## What this module is allowed to do

The escrow state machine, the ledger, disputes and settlement are unchanged by
this milestone and stay the source of truth. This module is a *rail* — it sits
in exactly the position `payments` sits in, and obeys the same two rules:

- It never assigns `escrow.state`. It calls `EscrowStateMachine.transition()`,
  which validates `AGREED -> FUNDED` against the transition table like any
  other caller, and throws `IllegalTransitionError` if the escrow has moved on.
- It never moves money outside the double-entry ledger. A confirmed deposit
  posts `DR provider:stellar:clearing -> CR escrow:{id}:holding` in the *same*
  database transaction as the state transition, so a funded escrow and its
  ledger balance can never disagree.

The consequence worth stating plainly: **release, refund, dispute and
arbitration required no changes at all.** They already act on the ledger
balance, and the ledger balance is credited identically whichever rail the
money arrived on.

```
                      money in                         money out
buyer's wallet ──USDC──> custody account ──USDC──> seller's / buyer's wallet
       │                        │                          ▲
       │  StellarEscrowService  │                          │ StellarSettlementService
       ▼                        ▼                          │
  DR provider:stellar:clearing ──> CR escrow:{id}:holding ──┘
            (the existing ledger; the existing state machine)
```

## The seam

`StellarNetworkClient` (`providers/stellar-network.interface.ts`) is the only
thing in this module that knows Stellar exists as a network. Three methods:
open a deposit address, look a payment up by transaction hash, submit a
payment. Everything else — the services, the controller, the DTOs — is
ordinary Nest code that would read the same against any chain.

| Provider | `STELLAR_MODE` | What it is |
|---|---|---|
| `FakeStellarProvider` | `dev` | An in-memory network. Deterministic deposit addresses, no I/O. Lets the whole flow run locally with no funded account and no faucet. |
| `HorizonStellarProvider` | `live` | Real Horizon. Reads payments through `/transactions/{hash}` + `/payments`, signs and submits payouts with the custody keypair. |
| — | `off` | The rail is disabled; every entry point throws `StellarRailDisabledError` (503) and the web app shows "coming soon". |

`STELLAR_MODE=dev` is rejected at boot when `NODE_ENV=production` — a simulated
network must never be what a real buyer pays into. That check lives in the Zod
env schema with the rest of the fail-fast configuration rules.

`isSimulated()` is a type guard rather than an `instanceof` check, so
`simulateDeposit()` is available exactly when the injected network can mint a
payment, and returns a typed 403 otherwise. No `NODE_ENV` branch in the
service, and no dev-only route that exists in a production build.

`GET /stellar/config` reports that same fact to the client as `simulated`, so
the web app offers the "simulate the deposit" shortcut exactly when the server
would honour it. The alternative — a `NEXT_PUBLIC_` build-time flag — is how the
rail's availability used to be decided in the browser, and it was wrong twice
over: it could disagree with the server, and it meant the front end asserted
something only the back end knows. `enabled` and `simulated` both now come from
this endpoint, and the web app has no Stellar environment variable at all.

## Custody, and why deposits are addressed by memo

Every escrow shares one custody account and is distinguished by the
transaction's **memo** — the escrow id with its dashes stripped, 28 bytes,
which is exactly Stellar's `MEMO_TEXT` limit (`escrow-memo.ts`).

The alternative — an account per escrow — costs a base reserve in XLM per
escrow, a funding transaction before the buyer can pay, and a key to manage per
escrow. Memo routing is what exchanges do, and it is the same shape the fiat
rail already has: a single `provider:paystack:clearing` account whose internal
ownership is tracked by the ledger, not by the bank. Commingling on-chain is
not commingling in the ledger; `escrow:{id}:holding` is still one account per
escrow.

`FakeStellarProvider` derives a distinct deposit address per escrow instead,
which costs nothing in memory and proves the interface does not secretly
assume a single account.

## A linked wallet is proven, not claimed

`POST /stellar/wallet` is the settlement destination: on a release the sweep
pays whatever account sits in that row. So the row cannot be an unverified
claim, and linking is a two-step challenge instead of a single write.

1. `POST /stellar/wallet/challenge` returns a human-readable message naming the
   account, the Mezzo user id, the network, a 16-byte nonce and the time. The
   message is stored in Redis under `stellar:link-challenge:{userId}` with a
   five-minute TTL.
2. `POST /stellar/wallet` takes that account plus a signature over the message.
   The challenge is claimed with `GETDEL` — atomically, so it is single-use —
   and the signature is checked against the account's own public key.

The three things this binds together are worth naming, because each one is a
separate attack: the **signature** proves control of the Stellar key, the
**nonce** stops a captured signature being replayed, and keying the challenge
by `userId` from the JWT means a challenge issued to one session cannot be
spent by another. A challenge issued for one account will not verify a link to
a different one either — the stored account is compared before the signature is
checked.

The threat this closes is not theft from another user: the JWT already pins the
link to the caller's own row. It is a user linking an account they do not
control — by typo, by paste, or because a page told them to — and then losing
their own release proceeds to it irrecoverably. On-chain payments do not bounce.

`verifyStellarSignature()` is deliberately permissive about *encoding* and
strict about *provenance*. Wallets disagree on both halves of what `signMessage`
returns, so it accepts base64 (what SEP-43 specifies) or hex, requiring exactly
64 bytes, and checks the signature against three payloads:

1. **SEP-53** — `sha256("Stellar Signed Message:\n" + message)`. This is the
   standard, and what Freighter produces. It is tried first.
2. The raw message bytes.
3. The SHA-256 digest of the raw message.

Only the first of those was missing once, and it was the one that mattered: a
SEP-53 wallet could not link at all, failing with a 403 that correctly said the
signature did not prove control — because against the two payloads then being
checked, it didn't. The lesson is that "permissive about encoding" has to
include the payload construction, not just the character set.

Every one of those candidates is still a signature over a payload uniquely
derived from this challenge's nonce, so widening them costs nothing: an attacker
needs the private key either way. A test asserts that a SEP-53 signature over a
*different* message is still rejected.

`signMessage` is a required method on the kit's module interface, but a few
hardware and bridge wallets reject it at runtime; those wallets cannot link an
account, and the web app says so rather than falling back to an unproven link.

`StellarSignatureInvalidError` is a **403, and must never be a 401**. The web
app's `apiRequest` treats 401 as a stale access token: it silently refreshes the
session and replays the request. Replaying a link attempt hits a challenge that
the first attempt already spent with `GETDEL`, so the caller sees
`STELLAR_LINK_CHALLENGE_NOT_FOUND` and the real failure — a signature that did
not verify — is swallowed. 401 has to keep meaning "your session is bad", not
"your proof is bad". A test asserts the status code for exactly this reason.

## A deposit is verified, never asserted

`confirmDeposit()` takes a transaction hash from the client, and then believes
nothing else it was told. It fetches the payment from the network and checks
the destination, the memo, the asset code *and* issuer, and the amount, to the
cent. Any mismatch is a typed `StellarDepositMismatchError` naming which of the
five failed, and nothing is posted.

This is the same posture as the fiat rail's webhook path — which quarantines a
charge whose amount disagrees with the intent — with one difference that
matters: a Stellar deposit needs no signature check, because the claim is
verified against the chain itself rather than against the sender.

Idempotency is enforced three deep, because a buyer refreshing a page must not
be able to double-fund:

1. Re-confirming the *same* hash returns the row unchanged, without a write.
2. A *different* hash against an already-funded escrow is `ALREADY_APPLIED`.
3. If both of those were somehow bypassed, the ledger's own
   `stellar-fund:{hash}` idempotency key and the partial unique index on
   `funding_transaction_hash` make a second posting impossible at the database.

## Settlement claims the row before it touches the chain

`settleDue()` is the one place in this module that moves money *out*, and an
on-chain payment does not bounce. So the sweep claims each escrow with a
conditional update before it submits anything:

```sql
UPDATE stellar_escrows SET status = 'SETTLING'
 WHERE id = $1 AND status = 'FUNDED'
```

If that update touches no rows, another run already holds the payout and this
one skips it. Writing `SETTLED` *after* a successful submit would not have been
enough: two overlapping sweeps — two admins, or a cron overlapping a manual run
— would both read `FUNDED`, both submit, and the seller would be paid twice.
Postgres serialises the two updates on the row lock, so exactly one wins.

A submission that throws is the harder case, because a timeout does not say
whether the transaction landed. Guessing either way loses money: assume it
failed and you pay twice, assume it succeeded and the seller is never paid. So
the sweep never guesses — it makes the answer *knowable in advance*.

A Stellar transaction's hash is fixed when it is signed, and its time bounds
make it permanently unappliable once they pass. `preparePayment()` therefore
signs the payment and hands back that hash and expiry **without submitting**,
and the sweep records both on the row before `submit()` is ever called. That
ordering is the whole guarantee: there is no window in which money can move
under a hash Mezzo has not already written down.

A row found in `SETTLING` with a recorded attempt is then resolved by asking the
chain, never by assuming:

| The chain says | What that proves | What the sweep does |
|---|---|---|
| found, successful | the payout landed | mark `SETTLED` with **that** hash — no second payment |
| found, failed | it moved no funds | clear the attempt, retry from `FUNDED` |
| not found, past expiry | it can never apply | clear the attempt, retry from `FUNDED` |
| not found, within expiry | still in flight | leave it alone and report it |

Both transitions out of `SETTLING` are themselves conditional updates pinned to
the attempt hash, so two concurrent sweeps cannot both reconcile the same row.

`POST /stellar/escrows/:id/requeue-settlement` (admin) remains for the residual
case: a row claimed but abandoned *before* an attempt was recorded. It refuses
any row that has an unresolved attempt hash — requeuing one of those would be
exactly the double-pay the recorded hash exists to prevent. The only way past an
in-flight payout is the chain answering, which it always eventually does.

## The audit trail

The rail records every step that moves money or changes where money will go,
through the same `AuditService` that `disputes` and `admin` use:

| Action | When | Actor |
|---|---|---|
| `STELLAR_WALLET_LINKED` | a proven account becomes the settlement destination | the user |
| `STELLAR_WALLET_UNLINKED` | that destination is removed | the user |
| `STELLAR_FUNDING_OPENED` | a deposit address is issued for an escrow | the buyer |
| `STELLAR_DEPOSIT_CONFIRMED` | a verified payment funds the escrow | the confirming party |
| `STELLAR_DEPOSIT_REJECTED` | a claimed deposit failed verification | the confirming party |
| `STELLAR_SETTLEMENT_PAID` | the payout landed, with hash and destination | the admin who swept |
| `STELLAR_SETTLEMENT_BLOCKED` | the sweep skipped an escrow, and why | the admin who swept |
| `STELLAR_SETTLEMENT_UNCERTAIN` | a submission failed with an unknown result | the admin who swept |
| `STELLAR_SETTLEMENT_RECONCILED` | a recorded attempt was resolved against the chain | the admin who swept |
| `STELLAR_SETTLEMENT_CLAIMED` | an operator requeued a payout that was never submitted | the admin |

`STELLAR_DEPOSIT_CONFIRMED` is written inside the funding transaction, through
the optional `EntityManager` that `AuditService.record()` now accepts, for the
same reason the ledger posting and the state transition are: a funded escrow
without an audit row would be a funded escrow nobody can explain. The rejection
events are written *outside* any transaction, because the request they belong to
is about to fail — an audit row that rolls back with the rejection would erase
exactly the evidence worth keeping. A rejected deposit is the most interesting
thing this module logs: it is what an attempted wrong-memo, wrong-amount or
double-fund deposit looks like from the inside.

## Money

Escrow prices are integer minor units with an explicit currency, as everywhere
else in the codebase. Stellar assets carry seven decimal places, USD carries
two, so `stellar-amount.ts` converts between `Money` and the on-chain decimal
string in `bigint` — never a float, and never a rounding rule. A value that is
not a whole number of cents is a typed error rather than a truncation.

The rail is **USD-only**, enforced at `openFunding()`. A naira-priced escrow
funded in USDC would need an exchange rate, an oracle for it, and a policy for
who absorbs the movement between funding and release; none of those are
decisions this milestone gets to make quietly, so it declines the escrow
instead.

## Settlement is a sweep, not a callback

`StellarSettlementService.settleDue()` finds escrows that are `FUNDED` on-chain
and `RELEASED` or `REFUNDED` in the state machine, and pays the winning party —
the seller net of the platform fee on a release, the buyer in full on a refund,
matching `SettlementService`'s ledger split exactly.

It is a sweep rather than an event listener for one reason: an event fired
inside the release transaction can be delivered before that transaction
commits, or lost entirely if the process dies between the commit and the
submit. A query over durable state cannot be lost — a missed run just means the
next run picks the escrow up. A party who has not linked a wallet is reported
as `blockedBy` and skipped, so one unlinked seller cannot stop everyone else's
payouts.

`POST /stellar/settlements/run` (admin) triggers it, matching how
`GET /admin/ledger/reconciliation` triggers the ledger's own reconciliation.

## Operating the live rail

The custody account needs a trustline to the asset before it can hold it, and
enough XLM for the base reserve plus fees. Two things exercise that against the
real network, and they cover different halves of the rail:

- `apps/api/scripts/stellar-testnet-e2e.mjs` drives `HorizonStellarProvider`
  directly. It provisions issuer, custody, buyer and seller accounts with
  friendbot, opens trustlines, and then checks both what must fund an escrow and
  what must not: a wrong memo, a short payment, a native XLM payment, and a
  payment to a third party all read back as something the deposit check will
  reject. Run `pnpm --filter @mezzo/api build` first, since it imports `dist/`.
- `apps/api/test/e2e/stellar-testnet.e2e-spec.ts` drives the *whole API* against
  testnet with `STELLAR_MODE=live`: a real escrow, a real on-chain deposit
  confirmed through `POST /stellar/escrows/:id/confirm`, a real release, and a
  real payout swept to the seller's wallet — then asserts the ledger balance,
  the seller's on-chain balance delta, and the audit trail. It is skipped unless
  `STELLAR_TESTNET_E2E=1`, so CI never depends on a public network:

  ```
  STELLAR_TESTNET_E2E=1 pnpm --filter @mezzo/api test:e2e -- stellar-testnet
  ```

Both are the scripts to read before pointing `STELLAR_NETWORK=public` at real
money.

Going to mainnet changes four things and no code: `STELLAR_NETWORK=public`,
`STELLAR_HORIZON_URL` to a public Horizon, `STELLAR_ASSET_ISSUER` to Circle's
real USDC issuer, and a custody secret held somewhere better than an env var.
