# MaaYuan structured star inventory sync v1

`POST /open-api/star/inventory-sync` requires an account-bound OpenAPI token with
`star:sync:write` (code 30003). Deploy the backend before enabling the sender.
The account's stored game selects validation. Both supported games share the
canonical name sets in `StarStoneCatalog`.

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
  "experience": {"orange": 0, "purple": 525, "white": null},
  "bag": {"current_count": 3, "capacity": 270}
}
```

Every displayed field except `bag` is required. Extra fields are rejected at every
level. `counts` must equal the respective array counts. Inventory has at most
1000 entries. Identical values represent distinct instances. Levels must be
integral and between 1 and the quality limit (white 30, green 40, blue 50,
purple/orange 60). Each experience count must be an integer in 0..2147483647
or explicit `null` for an unknown count. All three keys are required and any
combination is accepted, including three unknowns. Zero is a confirmed count.
Unknown counts replace the previous observation and are returned as `null`
by `GET /v1/star-state/current?account_id=...`.
When `bag` is present, its `current_count` must equal the number of entries
and `capacity` must be a positive integer at least that large or `null`. Older
batches without `bag` retain an unknown capacity. No user/account ID, game
version, instance ID or diagnostics are accepted.

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
new UUID instance IDs, increments generation, clears plan targets and uses the existing exact-instance wear inheritance and mismatch cleanup rules. A failed commit rolls all of these back.
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
POST /v1/star-state/plan-inheritance/confirm and /discard use the same JWT/account
query. Both require operation_id (UUID), source_recovery_point_id,
expected_generation and expected_revision. Confirm additionally requires
plan_targets (a map from current instance IDs to target levels); discard must omit
plan_targets. Later/close sends no modifying request.

The server never calculates a mapping. Confirm validates current account, source,
target generation, revision and instance references, and refuses to overwrite an
existing nonempty current plan. Saving targets, resolving the pending source and
unpinning its checkpoint share one Mongo transaction. Discard fences the same
state but preserves inventory, current plans, wear and revision. No-op confirm also
fences the state. Standard retention resumes immediately after unpinning, so an old
source outside the latest three ordinary points can then be evicted.

The response contains operation_id, source_recovery_point_id, target_generation,
revision and action (confirm/discard). The account slot keeps its latest resolution
for exact operation/body retries; a different operation or body is rejected. Reads
return null for a resolved slot and new full syncs may replace it with a new source.
An old operation cannot mutate that later source. This is not a historical-plan
manager. Ordinary manual rebuild/restore can advance generation while the source
remains protected; old-generation confirm and discard then reject safely.

The host's cloudPlanInheritance port supplies this transient source to YuanStar's
existing preview/adjust/apply algorithms and PlanInheritanceDialog. It never writes
a cloud source into local IndexedDB pending records. Existing local OCR inheritance
stays separate. Loading/rendering a source or receiving an account event never
forces business hydration over unsaved plan edits. Source changes require an
approved committed clean YuanStar source and the official embed sync; this phase
does not commit that source or edit generated embed assets.

MaaYuan saves `inventory.json` and `inventory-sync.json` before the POST. Its next
task run retries a failed/uncertain saved batch before scanning again. A local
account/service binding prevents redirecting retries to another token account.
Only a confirmed success returns task success; OCR success and sync failure are
reported separately. The local full result and diagnostics remain available.

## Web JSON supplementation

The JWT endpoints `/v1/star/inventory-sync/preview` and `/v1/star/inventory-sync`
use `account_id`, require current ownership/game, and reuse this same strict DTO,
validation and rebuild transaction. Preview reads only. Confirmation requires the
preview generation/revision. It cannot bypass pending old-plan protection.
Raw OCR files lack their sender's UUID: the browser derives a stable business-only
UUID and the manual raw path streams only that owner's durable receipts to find
an equivalent complete payload, ignoring scan_id only. An already-saved equivalent
result is a no-op even after later edits. This conservative equivalence intentionally
treats identical independent raw scans as saved; use the original compact batch
when an explicit upload scan_id is available. No history migration is needed.
See the [web format and UI details](../../../frontend/docs/developers/api-star.md).
