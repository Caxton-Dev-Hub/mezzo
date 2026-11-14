# Rentals Module

Manages powerbank rentals, checkout/checkin lifecycle, overdue accrual, and replacement charges for the Mezzo charge powerbank system.

## Design Decisions

### Checkout blocks outstanding balances

Checkout requires users to have zero uncleared outstanding balances before renting a new powerbank. This prevents accumulation of uncollectable debt and ensures customers settle previous charges before creating new rental obligations. The alternative (allowing rentals with outstanding balances) would increase financial risk, particularly for high-volume repeat customers.

### Overdue accrual runs hourly vs real-time

The overdue accrual job runs every hour via BullMQ repeatable job (`0 * * * *`) rather than computing charges in real-time on every request. This balances responsiveness with database and ledger load: hourly granularity provides acceptable latency for customers (fees are transparent and capped) while avoiding the overhead of per-request accrual checks across all active rentals. Real-time accrual would require either expensive queries on every rental read or complex event-driven triggers.

### Accrual uses idempotency keys with hoursOverdue

Each overage charge posts to the ledger with an idempotency key of `rental-overage:{rentalId}:{hoursOverdue}`. This ensures exactly-once semantics even if the accrual job runs multiple times for the same hour milestone (e.g., due to worker restart, job retry, or scheduler drift). The key includes `hoursOverdue` so that each hourly increment is a distinct transaction: hour 1 posts 2500 kobo, hour 2 posts another 2500 kobo, and so on. Without the hour component, re-running the job at hour 12 would incorrectly skip all charges after the first one.

The accrual logic computes the total charge that should have been posted (`hoursOverdue * HOURLY_OVERAGE_KOBO`, capped at `MAX_OVERAGE_KOBO`) and subtracts the sum of existing overage charges to derive the delta. This ensures late or skipped job runs catch up correctly: if the job doesn't run at hour 3 but runs at hour 4, it posts 10000 kobo (4 * 2500) minus any previously posted charges.

### Replacement charges create outstanding balance for deficit

When a powerbank is marked lost or stolen, the replacement charge is recorded immediately regardless of wallet balance. If the wallet has sufficient funds, the charge posts to the ledger. If not, an `OutstandingBalance` is created for the deficit. This approach ensures the debt is recorded and visible to admins without blocking the charge action itself. Collection happens automatically on the customer's next wallet deposit (handled by the payments module), allowing the business to track and recover losses even when customers lack immediate funds.

Reversal of a replacement charge posts a compensating ledger entry crediting the user's wallet and clears any associated outstanding balance, restoring the customer's account state as if the charge never occurred.

## Pricing

- Base rate: 600 NGN (60000 kobo) for 24 hours, charged at checkout
- Overdue rate: 25 NGN per hour (2500 kobo), starting when the 24-hour period expires
- Maximum overage: 600 NGN (60000 kobo) over 24 overage hours
- Maximum total per rental: 1200 NGN (120000 kobo)

At the 48-hour mark (24 hours rental + 24 hours overage), the rental transitions to `UNRETURNED` and no further charges accrue. The rental then appears in the follow-up queue for admin and staff to contact the customer.

## State Transitions

- `ACTIVE`: Rental created at checkout, base charge posted
- `OVERDUE`: First overage charge posted (rental past due date, under 24 overage hours)
- `UNRETURNED`: 24 overage hours elapsed, capped at maximum charge
- `RETURNED`: Customer returned powerbank, checked in by staff

Powerbank status mirrors rental status: `AVAILABLE` → `RENTED` → `OVERDUE` → `UNRETURNED` (or `RETURNED`).

## Audit Trail

All staff and admin actions (checkin, mark unreturned, charge replacement, reverse replacement) are logged via `AuditService` with actor ID, entity type, entity ID, reason, and before/after state snapshots.
