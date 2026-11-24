# Powerbanks Module

Manages power bank inventory, tracking, and rental lifecycle.

## Key Exports

- `PowerbanksService` - Core business logic for power bank management
- `PowerbanksController` - HTTP endpoints for inventory and rental operations
- `Powerbank` - Entity definition
- `PowerbanksModule` - NestJS module

## Dependencies

- `DatabaseModule` - For entity persistence
- `CommonModule` - Shared utilities
- `ReceiptsModule` - For rental transaction records

## Usage

Provides endpoints for:
- Creating and updating power bank inventory
- Tracking power bank location and status
- Managing rental assignments and returns
- Querying available power banks by location

## Design

Each power bank has a unique identifier and tracks its current location, charge state, and rental status. Rental operations create corresponding receipt records.
