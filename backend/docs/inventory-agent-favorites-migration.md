# Inventory agent favorites migration

Run this migration before deploying the backend version that exposes agent favorites:

```shell
mongosh "$HUB_MONGO_URI" scripts/migrations/20260818-inventory-agent-favorites.js
```

The script targets `HubBackend` and creates the `inventory_agent_favorites` collection indexes. The unique `(accountId, agentId)` index is the concurrency boundary for idempotent `PUT` requests. It is safe to rerun.

MongoDB has no cross-collection foreign keys. Account deletion therefore removes favorites inside the same Hub Mongo transaction that removes current inventory, records, and account-bound OpenAPI tokens.
