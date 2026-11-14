# Accessories Module

Manages phone accessories inventory and sales for the charge powerbank rental product.

## Design Decisions

### Staff Assignment Enforcement on `recordSale`

The `recordSale` method enforces that the staff member recording the sale is assigned to the accessory's shop. This prevents cross-shop sales where staff from one location could incorrectly record transactions for inventory at a different location. Shop assignment is verified through `ShopsService.getStaffShopIds` before the sale is recorded.

### Atomic Stock Decrement

Stock levels are decremented atomically within a database transaction using pessimistic write locks. This prevents race conditions where concurrent sale requests could oversell inventory beyond available stock. The lock ensures that stock checks and decrements happen as a single atomic operation.

### Audit Logging

Every sale is audit-logged with the staff member's ID, quantity sold, total amount, and the resulting stock level. This provides a complete audit trail for inventory tracking and revenue reconciliation.
