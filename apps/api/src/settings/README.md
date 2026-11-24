# Settings Module

Manages application settings, feature flags, and configuration overrides.

## Key Exports

- `SettingsService` - Retrieval and management of settings
- `SettingsController` - HTTP endpoints for admin setting management
- `Setting` - Entity definition
- `SettingsModule` - NestJS module

## Dependencies

- `DatabaseModule` - For entity persistence
- `CommonModule` - Shared utilities
- `AuthModule` - For permission checks

## Usage

Provides endpoints for:
- Retrieving current application settings
- Updating feature flags and configuration
- Querying historical setting changes
- Getting settings audit trail

## Design

Settings are persisted in the database and cached in Redis for performance. Changes are logged for audit purposes. Admin users can update settings through authenticated endpoints.

## Common Settings

- Verification feature availability (live/coming-soon)
- Payment provider configurations
- Rate limits and feature toggles
