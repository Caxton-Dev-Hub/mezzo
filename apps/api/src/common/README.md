# Common Module

Shared utilities, decorators, pipes, filters, and middleware used across the API.

## Key Exports

- `CustomValidationPipe` - Request validation and transformation
- `GlobalExceptionFilter` - Centralized error handling
- `AuthGuard` - Authentication middleware
- `RateLimitingMiddleware` - Request throttling
- `LoggingMiddleware` - HTTP request/response logging
- Utility functions for pagination, sorting, and filtering

## Dependencies

- NestJS core modules
- Class validators

## Usage

Import `CommonModule` in feature modules to access decorators and utilities without duplication.
