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
enough XLM for the base reserve plus fees. `apps/api/scripts/stellar-testnet-e2e.mjs`
provisions exactly that against testnet — issuer, custody, buyer and seller
accounts, trustlines, and a full fund-then-settle round trip — and is the
script to read before pointing `STELLAR_NETWORK=public` at real money.

Going to mainnet changes four things and no code: `STELLAR_NETWORK=public`,
`STELLAR_HORIZON_URL` to a public Horizon, `STELLAR_ASSET_ISSUER` to Circle's
real USDC issuer, and a custody secret held somewhere better than an env var.
