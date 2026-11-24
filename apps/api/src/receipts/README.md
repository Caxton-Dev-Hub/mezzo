# Receipts Module

Manages transaction receipts, invoicing, and transaction history.

## Key Exports

- `ReceiptsService` - Receipt generation and retrieval
- `ReceiptsController` - HTTP endpoints for transaction records
- `Receipt` - Entity definition
- `ReceiptsModule` - NestJS module

## Dependencies

- `DatabaseModule` - For entity persistence
- `CommonModule` - Shared utilities
- `PaymentsModule` - Integration with payment processing
- `EscrowModule` - Integration with escrow transactions

## Usage

Provides endpoints for:
- Retrieving transaction receipts
- Generating invoices
- Querying transaction history with filters
- Exporting receipts in various formats

## Design

Receipts are immutable records created when transactions complete. Each receipt links to its corresponding payment or escrow transaction.
