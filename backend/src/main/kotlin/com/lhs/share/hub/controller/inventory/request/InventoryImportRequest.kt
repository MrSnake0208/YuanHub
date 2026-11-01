package com.lhs.share.hub.controller.inventory.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/**
 * 库存/奖励导入请求(协议 5.1,Jackson SNAKE_CASE 反序列化)
 *
 * 对应交换文档完整 JSON 顶层结构:format / version / exported_at / producer /
 * catalog_version / records。正文不携带 user_id,用户归属由登录态确定。
 */
data class InventoryImportRequest(
    @field:NotBlank(message = "format 不能为空")
    @field:Pattern(regexp = "^myshare-inventory-exchange$", message = "format 必须为 myshare-inventory-exchange")
    @field:Schema(allowableValues = ["myshare-inventory-exchange"])
    val format: String,
    @field:NotNull(message = "version 不能为空")
    @field:Min(value = 2, message = "version 必须为 2")
    @field:Schema(minimum = "2", maximum = "2")
    val version: Int,
    @field:NotBlank(message = "exported_at 不能为空")
    @field:Schema(format = "date-time")
    val exportedAt: String,
    @field:Valid
    @field:NotNull(message = "producer 不能为空")
    val producer: ProducerDto,
    @field:Size(min = 1, max = 128, message = "catalog_version 长度须在 1..128")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val catalogVersion: String? = null,
    @field:Valid
    @field:Size(min = 1, max = 1000, message = "accounts 数量须在 1..1000")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val accounts: List<InventoryExchangeAccountDto>? = null,
    @field:Valid
    @field:Size(min = 1, max = 1000, message = "records 数量须在 1..1000")
    val records: List<InventoryRecordRequest>,
) {
    @JsonAnySetter
    fun handleExtension(name: String, value: Any?) {
        if (name == "user_id") throw IllegalArgumentException("user_id must not be present in an inventory document")
    }
}

data class InventoryExchangeAccountDto(
    @field:NotBlank(message = "accounts[].id 不能为空")
    @field:Size(min = 1, max = 64, message = "accounts[].id 长度须在 1..64")
    @field:Pattern(
        regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
        message = "accounts[].id 格式无效",
    )
    val id: String,
    @field:Size(min = 1, max = 64, message = "accounts[].name 长度须在 1..64")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val name: String? = null,
)

/**
 * 单条记录(协议 4 Record 字段);field 级约束无法表达「快照必填 snapshot_scope、
 * 奖励不得携带 snapshot_scope、reward_delta count 必须 > 0」这类跨字段规则,
 * 由服务层补充校验。
 */
@Schema(
    oneOf = [
        InventoryRewardRecordSchema::class,
        InventoryFullSnapshotRecordSchema::class,
        InventoryListedSnapshotRecordSchema::class,
    ],
)
data class InventoryRecordRequest(
    @field:NotBlank(message = "account_id 不能为空")
    @field:Size(min = 1, max = 64, message = "account_id 长度须在 1..64")
    @field:Pattern(
        regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
        message = "account_id 格式无效",
    )
    val accountId: String,
    @field:NotBlank(message = "record_id 不能为空")
    @field:Size(min = 1, max = 128, message = "record_id 长度须在 1..128")
    val recordId: String,
    @field:NotBlank(message = "record_type 不能为空")
    @field:Pattern(regexp = "reward_delta|stock_snapshot", message = "record_type 仅支持 reward_delta 或 stock_snapshot")
    @field:Schema(allowableValues = ["reward_delta", "stock_snapshot"])
    val recordType: String,
    @field:NotBlank(message = "entity_type 不能为空")
    @field:Pattern(regexp = "item|agent", message = "entity_type 仅支持 item 或 agent")
    @field:Schema(allowableValues = ["item", "agent"])
    val entityType: String,
    /**
     * 获取渠道(协议 5.1 可选字段):推荐稳定值 背包 / 据点情报 / 派遣
     */
    @field:Size(min = 1, max = 64, message = "acquisition_channel 长度须在 1..64")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val acquisitionChannel: String? = null,
    /**
     * 派遣消耗体力数。acquisition_channel 包含“派遣”时必填，其他渠道不得携带。
     */
    @field:Min(value = 0, message = "stamina_cost 不能为负")
    @field:Max(value = 2147483647, message = "stamina_cost 超出协议上限")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val staminaCost: Long? = null,
    @field:NotNull(message = "effective_at 不能为空")
    @field:Schema(format = "date-time")
    val effectiveAt: String,
    @field:Pattern(regexp = "full|listed", message = "snapshot_scope 仅支持 full 或 listed")
    @field:Schema(allowableValues = ["full", "listed"])
    @field:JsonSetter(nulls = Nulls.FAIL)
    val snapshotScope: String? = null,
    @field:Valid
    @field:NotNull(message = "entries 不能为空")
    val entries: List<InventoryEntryRequest>,
)

/**
 * 记录条目(协议 5 Entry 字段);id 唯一性由服务层校验,count 取值范围由记录类型决定。
 */
data class InventoryEntryRequest(
    @field:NotBlank(message = "id 不能为空")
    @field:Size(min = 1, max = 128, message = "id 长度须在 1..128")
    val id: String,
    @field:Size(min = 1, max = 256, message = "name 长度须在 1..256")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val name: String? = null,
    @field:NotNull(message = "count 不能为空")
    @field:Min(value = 0, message = "count 不能为负")
    @field:Max(value = 2147483647, message = "count 超出协议上限")
    val count: Long,
)
