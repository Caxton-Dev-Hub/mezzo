# Waitlist Module

Manages user waitlist for features and service availability.

## Key Exports

- `WaitlistService` - Waitlist management operations
- `WaitlistController` - HTTP endpoints for waitlist signup and status
- `WaitlistEntry` - Entity definition
- `WaitlistModule` - NestJS module

## Dependencies

- `DatabaseModule` - For entity persistence
- `CommonModule` - Shared utilities
- `MailModule` - For notification emails

## Usage

Provides endpoints for:
- Adding users to feature/service waitlist
- Checking waitlist position
- Notifying users when features become available
- Querying waitlist statistics

## Design

Waitlist entries track user position and notification status. When a feature becomes available, eligible users are notified via email, and their entries are marked as contacted.

## Common Use Cases

- Early access program signups
- Regional service availability
- Beta feature testing enrollment
