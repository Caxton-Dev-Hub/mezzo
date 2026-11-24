# Health Module

Provides health check endpoints for monitoring application and service dependencies.

## Key Exports

- `HealthController` - HTTP endpoints for health checks
- Health indicators for database, cache, external services
- Liveness and readiness probes

## Dependencies

- `@nestjs/terminus` - Health check framework
- Other service modules

## Usage

Health checks are exposed at `/health` endpoint. Includes checks for:
- Database connectivity
- Redis cache connectivity
- External payment provider connectivity
- System resource availability
