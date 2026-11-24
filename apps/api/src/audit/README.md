# Audit Module

Provides audit logging and tracking functionality for significant system events and user actions.

## Key Exports

- `AuditService` - Core service for recording audit events
- `AuditController` - HTTP endpoints for retrieving audit logs
- `AuditModule` - NestJS module definition

## Dependencies

- `TypeORM` - Database persistence
- `DatabaseModule` - Shared database services
- `CommonModule` - Utilities and decorators

## Configuration

Audit events are automatically recorded for sensitive operations across the platform. Configure retention policies and log levels in environment variables.
