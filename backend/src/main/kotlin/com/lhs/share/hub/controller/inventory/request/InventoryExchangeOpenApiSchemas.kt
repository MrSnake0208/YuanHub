package com.lhs.share.hub.controller.inventory.request

import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema

/** OpenAPI-only schemas for the conditional inventory exchange record variants. */
@Schema(
    name = "InventoryRewardRecord",
    requiredProperties = ["account_id", "record_id", "record_type", "entity_type", "effective_at", "entries"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
    not = InventorySnapshotScopePresentSchema::class,
)
class InventoryRewardRecordSchema(
    @field:Schema(minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    val accountId: String,
    @field:Schema(minLength = 1, maxLength = 128)
    val recordId: String,
    @field:Schema(type = "string", allowableValues = ["reward_delta"])
    val recordType: String,
    @field:Schema(type = "string", allowableValues = ["item", "agent"])
    val entityType: String,
    @field:Schema(minLength = 1, maxLength = 64)
    val acquisitionChannel: String? = null,
    @field:Schema(
        type = "integer",
        format = "int64",
        minimum = "0",
        maximum = "2147483647",
        description = "派遣消耗体力数；acquisition_channel 包含‘派遣’时必填，其他渠道不得携带",
    )
    val staminaCost: Long? = null,
    @field:Schema(type = "string", format = "date-time")
    val effectiveAt: String,
    @field:ArraySchema(schema = Schema(implementation = InventoryRewardEntrySchema::class), minItems = 1)
    val entries: List<InventoryRewardEntrySchema>,
)

@Schema(
    name = "InventoryFullSnapshotRecord",
    requiredProperties = ["account_id", "record_id", "record_type", "entity_type", "effective_at", "snapshot_scope", "entries"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
)
class InventoryFullSnapshotRecordSchema(
    @field:Schema(minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    val accountId: String,
    @field:Schema(minLength = 1, maxLength = 128)
    val recordId: String,
    @field:Schema(type = "string", allowableValues = ["stock_snapshot"])
    val recordType: String,
    @field:Schema(type = "string", allowableValues = ["item", "agent"])
    val entityType: String,
    @field:Schema(minLength = 1, maxLength = 64)
    val acquisitionChannel: String? = null,
    @field:Schema(type = "string", format = "date-time")
    val effectiveAt: String,
    @field:Schema(type = "string", allowableValues = ["full"])
    val snapshotScope: String,
    @field:ArraySchema(schema = Schema(implementation = InventorySnapshotEntrySchema::class))
    val entries: List<InventorySnapshotEntrySchema>,
)

@Schema(
    name = "InventoryListedSnapshotRecord",
    requiredProperties = ["account_id", "record_id", "record_type", "entity_type", "effective_at", "snapshot_scope", "entries"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
)
class InventoryListedSnapshotRecordSchema(
    @field:Schema(minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    val accountId: String,
    @field:Schema(minLength = 1, maxLength = 128)
    val recordId: String,
    @field:Schema(type = "string", allowableValues = ["stock_snapshot"])
    val recordType: String,
    @field:Schema(type = "string", allowableValues = ["item", "agent"])
    val entityType: String,
    @field:Schema(minLength = 1, maxLength = 64)
    val acquisitionChannel: String? = null,
    @field:Schema(type = "string", format = "date-time")
    val effectiveAt: String,
    @field:Schema(type = "string", allowableValues = ["listed"])
    val snapshotScope: String,
    @field:ArraySchema(schema = Schema(implementation = InventorySnapshotEntrySchema::class), minItems = 1)
    val entries: List<InventorySnapshotEntrySchema>,
)

@Schema(
    name = "InventoryRewardEntry",
    requiredProperties = ["id", "count"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
)
class InventoryRewardEntrySchema(
    @field:Schema(minLength = 1, maxLength = 128)
    val id: String,
    @field:Schema(minLength = 1, maxLength = 256)
    val name: String? = null,
    @field:Schema(type = "integer", format = "int64", minimum = "1", maximum = "2147483647")
    val count: Long,
)

@Schema(
    name = "InventorySnapshotEntry",
    requiredProperties = ["id", "count"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
)
class InventorySnapshotEntrySchema(
    @field:Schema(minLength = 1, maxLength = 128)
    val id: String,
    @field:Schema(minLength = 1, maxLength = 256)
    val name: String? = null,
    @field:Schema(type = "integer", format = "int64", minimum = "0", maximum = "2147483647")
    val count: Long,
)

@Schema(
    name = "InventorySnapshotScopePresent",
    requiredProperties = ["snapshot_scope"],
    additionalProperties = Schema.AdditionalPropertiesValue.TRUE,
)
class InventorySnapshotScopePresentSchema(
    @field:Schema(type = "string")
    val snapshotScope: String,
)
