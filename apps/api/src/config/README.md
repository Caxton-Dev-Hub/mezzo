# Config Module

Centralized configuration management for environment variables and application settings.

## Key Exports

- `ConfigService` - Typed access to configuration values
- Configuration schemas for validation
- Environment-specific defaults

## Dependencies

- `@nestjs/config` - Configuration management
- `joi` - Schema validation

## Configuration

All configuration is loaded from environment variables at startup. See `.env.example` for available options. Configuration is validated against schemas to ensure all required values are present and correctly typed.
