# Redis Module

Provides Redis client integration, caching, and session management.

## Key Exports

- `RedisService` - Typed Redis client wrapper
- `CacheService` - High-level caching interface
- `RedisModule` - NestJS module

## Dependencies

- `ioredis` - Redis client library
- `cache-manager` - Caching framework

## Configuration

Redis connection is configured via REDIS_* environment variables. Supports connection pooling and automatic reconnection.

## Usage

Inject `RedisService` for direct cache operations or `CacheService` for application-level caching. Supports key expiration, TTL management, and atomic operations.

## Features

- Key-value storage and retrieval
- Publish/subscribe messaging
- Session storage
- Rate limiting counters
- Distributed locks for concurrency control
