# @mezzo/shared-types

Shared TypeScript types, Zod schemas, and type definitions used across the Mezzo monorepo.

## Purpose

This package centralizes all type definitions that are used in both frontend and backend applications, ensuring type consistency across the entire platform.

## Structure

```
src/
  - entities/        # Domain entity types (User, Escrow, Payment, etc.)
  - api/            # API request/response types
  - schemas/        # Zod validation schemas for runtime validation
  - utils/          # Type utilities and helpers
```

## Usage

### Type Imports

```typescript
import { User, Escrow, PaymentIntent } from "@mezzo/shared-types";
```

### Schema Validation

```typescript
import { userSchema, escrowSchema } from "@mezzo/shared-types";

// Runtime validation
const user = userSchema.parse(data);

// In API responses
type UserResponse = z.infer<typeof userSchema>;
```

## Key Exports

- **Entities**: `User`, `Escrow`, `Payment`, `Dispute`, `PaymentIntent`, etc.
- **API Types**: Request and response types for all API endpoints
- **Schemas**: Zod schemas for input validation and type inference

## Build

```bash
npm run build      # Compile TypeScript to JavaScript
npm run typecheck  # Check TypeScript types
```

The package exports both ES modules and CommonJS for compatibility with different environments.

## Maintenance

When adding new types or schemas:
1. Create the type definition
2. Export from `src/index.ts`
3. Add corresponding Zod schema if used for validation
4. Update other packages' dependencies if needed
