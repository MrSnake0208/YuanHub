# MaaYuan structured star inventory sync v1

`POST /open-api/star/inventory-sync` requires an account-bound OpenAPI token with
`star:sync:write` (code 30003). Deploy the backend before enabling the sender.
Existing image/scan-review endpoints, game-version fields and account game rules
are unchanged. The account's stored game selects validation; both supported games
currently share the canonical star-name sets in `StarScanService`.

```json
{
  "format": "maayuan-star-inventory",
  "version": 1,
  "scan_id": "11111111-1111-4111-8111-111111111111",
  "complete": true,
  "counts": {"main": 2, "support": 1},
  "inventory": [
    {"kind": "main", "name": "天府", "quality": "orange", "level": 60},
    {"kind": "main", "name": "天府", "quality": "orange", "level": 60},
    {"kind": "support", "name": "文曲", "quality": "purple", "level": 20}
  ],
  "experience": {"orange": 0, "purple": 525, "white": 91}
}
```

Every displayed field is required; extra fields are rejected at every level.
`counts` is the only metadata beyond the proposed compact document, and must equal
the respective array counts. Inventory has at most 1000 entries. Identical values
represent distinct instances. Levels must be integral and between 1 and the quality
limit: white 30, green 40, blue 50, purple/orange 60. Experience counts must be
integral 0..2147483647; null, missing, strings and fractional numbers are rejected.
No user/account ID, game version, instance ID or diagnostics are accepted.

The success envelope's `data` contains `scan_id`, `status: "synced"`, `account_id`,
`generation`, `revision`, `recovery_point_id` (nullable), and `inheritance_pending`.
`GET /open-api/star/inventory-sync/{scan_id}` uses the same scope and returns the
persisted original receipt, or 404 `star_sync_not_found`. An exact repeated POST
returns that receipt even after subsequent edits; a changed body under the same
account/scan ID returns 409 `star_sync_scan_conflict`. Array order is significant.
Receipts have no TTL and are removed only with their owning account.

The existing StarState rebuild command executes within the same Mongo transaction
as the account fence, pending-source insert and receipt insert. It checks the
generation/revision observed before the transaction, creates a checkpoint, assigns
new UUID instance IDs, increments generation, clears plan targets and replaces the
current wear relations with an empty list. A failed commit rolls all of these back.
An account SSE `star_inventory_synced` event is published only after commit.
It notifies the current account; an already-open star page needs to be reopened to
load the new generation. Ordinary local drafts continue to use their existing CAS.

If the old state has any unfinished plan, `star_plan_inheritance_pending` binds the
account, source recovery point and target generation. Its source point has
`inheritanceProtected: true`; checkpoint pruning retains it in addition to the
three ordinary points. Further automatic full syncs return 409
`star_plan_inheritance_pending`, while retries of the saved batch still succeed.

`GET /v1/star-state/plan-inheritance/pending?account_id=...` uses the existing JWT
account authorization and returns null or `account_id`, `source_recovery_point_id`,
`source_generation`, `target_generation`, `source_state`. `source_state` is the full
immutable business snapshot (inventory, plan target list, experience and bag).
No plan matching, confirmation, discard or release command is implemented yet.
The next UI integration must check target-generation ownership before applying a
mapping, then resolve the pending source and unpin it transactionally. Ordinary
manual rebuild/restore can advance generation while the source remains protected.

MaaYuan saves `inventory.json` and `inventory-sync.json` before the POST. Its next
task run retries a failed/uncertain saved batch before scanning again. A local
account/service binding prevents redirecting retries to another token account.
Only a confirmed success returns task success; OCR success and sync failure are
reported separately. The local full result and diagnostics remain available.
