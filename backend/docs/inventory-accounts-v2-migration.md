# Inventory accounts v2 migration

Run this migration after stopping old backend writers and before starting the backend version that requires protocol v2:

```shell
mongosh "$HUB_MONGO_URI" scripts/migrations/20260817-inventory-accounts-v2.js
```

The script targets `HubBackend`. It creates one `默认账号` for each user with legacy inventory data, fills `accountId` in `inventory_current` and `inventory_records`, rewrites current-stock `_id` values, and replaces the v1 indexes with account-scoped indexes. It is safe to rerun after an interrupted execution because only documents without `accountId` are selected.

The migration also revokes legacy user-scoped Open API tokens by deleting token documents without `accountId`. Issue new account-bound tokens after the v2 backend starts. Existing account-bound tokens are not deleted when the script is rerun.

The deployment MongoDB must support transactions (replica set or sharded cluster). Start the new backend only after the script completes; the application contains no v1 dual-read or dual-write path.
