# Database Module

Provides TypeORM integration, database connection management, and shared entity definitions.

## Key Exports

- Database connection configuration
- Shared entity interfaces and classes
- Repository base classes
- Database migration utilities

## Dependencies

- `TypeORM` - ORM and database abstraction
- `postgres` - PostgreSQL driver
- Shared types and entities

## Configuration

Database connections are configured via environment variables. See `ormconfig.ts` for connection settings. Migrations are located in `migrations/` directory.

## Entities

All entities are defined in this module to maintain a single source of truth for database schema definitions.
