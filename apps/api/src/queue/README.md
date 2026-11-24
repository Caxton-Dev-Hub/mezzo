# Queue Module

Provides job queue and asynchronous task processing infrastructure.

## Key Exports

- `QueueService` - Interface for job scheduling and processing
- `QueueModule` - NestJS module with queue integration
- Job handlers for various async tasks

## Dependencies

- `@nestjs/bull` - Queue management
- `Redis` - Message broker backend
- Other service modules for job processing

## Configuration

Queue implementation uses Redis as a message broker. Configure Redis connection via REDIS_* environment variables.

## Supported Jobs

- Email delivery
- Webhook notifications
- Report generation
- Payment reconciliation
- Scheduled maintenance tasks

## Usage

Inject `QueueService` to schedule jobs. Jobs are processed asynchronously by registered handlers.
