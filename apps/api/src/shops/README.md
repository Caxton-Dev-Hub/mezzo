# Shops Module

The Shops module manages physical powerbank rental locations, staff assignments, and identity verification for staff members.

## Design Decisions

### Why verification is shop-scoped

Verification submissions are tied to staff users who work at physical shop locations. Staff members need to verify customer identity before allowing powerbank checkouts. By making verification photo-accessible to all staff members (regardless of shop assignment), we enable any staff to validate identity at the point of checkout. This design acknowledges that customers may visit different shop locations, and verification should not be tied to a single shop.

The verification status (PENDING, APPROVED, REJECTED) is reviewed by admins but accessible to all staff members once approved. This allows staff to confirm that a customer's identity has been verified before completing a rental transaction.

### Why StaffScopeGuard attaches allowedShopIds

The StaffScopeGuard enforces shop-level data isolation for staff users while granting admins unrestricted access. When a staff member authenticates, the guard queries their assigned shops and attaches `allowedShopIds` to the request. This array can be used by downstream services to filter data (e.g., rentals, powerbanks) to only those belonging to the staff member's assigned shops.

For admin users, `allowedShopIds` is set to `null` to signal unrestricted access to all shops. This pattern allows authorization logic to be centralized in the guard while keeping business logic in services simple.

### Why photo access is restricted

Verification photos contain personally identifiable information (PII) including facial images and potentially identity documents. Access is restricted to:

- **ADMIN users**: Full access to all verification photos for review and approval workflows.
- **STAFF users assigned to any shop**: Access to all verification photos to validate customer identity at checkout.

This restriction protects user privacy while enabling staff to perform their verification duties. The presigned URL pattern (following the KYC module's approach) ensures photos are served directly from S3 without passing through the API, improving performance and reducing server load.

## Endpoints

- `POST /shops` - Create a new shop (ADMIN only)
- `GET /shops` - List all shops (ADMIN + STAFF)
- `GET /shops/:id` - Get shop details (ADMIN + STAFF)
- `POST /shops/:id/staff` - Assign staff to shop (ADMIN only)
- `DELETE /shops/:shopId/staff/:userId` - Remove staff from shop (ADMIN only)
- `POST /verifications` - Submit identity verification (authenticated users)
- `GET /verifications` - List verification submissions (ADMIN + STAFF)
- `GET /verifications/:id` - Get verification details (ADMIN + STAFF)
- `POST /verifications/:id/approve` - Approve verification (ADMIN only)
- `POST /verifications/:id/reject` - Reject verification (ADMIN only)
- `GET /verifications/:id/photo` - Get presigned URL for verification photo (ADMIN + STAFF)

## State Transitions

Verification submissions follow a simple state machine:

```
PENDING → APPROVED (via admin approval)
PENDING → REJECTED (via admin rejection)
```

Once a verification is approved or rejected, it cannot be modified. Users can only have one PENDING or APPROVED verification at a time, enforced by `submitVerification`.
