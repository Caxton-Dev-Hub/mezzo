# Observability Module

Provides logging, metrics collection, tracing, and monitoring infrastructure.

## Key Exports

- `LoggerService` - Structured logging with context
- `MetricsCollector` - Performance and business metrics
- `TracingService` - Distributed tracing support
- `MonitoringModule` - NestJS module integration

## Dependencies

- `winston` - Logging framework
- `prometheus` - Metrics collection
- `jaeger` - Distributed tracing

## Configuration

Logging level and output format can be configured via environment variables. Metrics are exposed at `/metrics` endpoint. Tracing is optional and configured via JAEGER_* environment variables.

## Usage

Inject `LoggerService` into services for structured logging with context propagation.
