package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import org.springframework.data.mongodb.core.mapping.Field
import java.io.Serializable
import java.time.Instant

/**
 * 库存/奖励流水(HubBackend.inventory_records)
 *
 * 保存已接收的交换记录,仅用于幂等上报、延迟上报处理与历史统计。
 * 一条记录只属于一种 entity_type,entries 内 id 不得重复。
 *
 * 幂等键:(userId, accountId, recordId) 全局唯一;不同账号相同 recordId 互不影响。
 * recordId 建议使用 <platform>:<uuid> 形式(协议 5.1)。
 *
 * 时段获得量只聚合 record_type = "reward_delta" 的记录。
 */
@Document("inventory_records")
@CompoundIndex(
    name = "idx_user_account_record_unique",
    def = "{'userId': 1, 'accountId': 1, 'recordId': 1}",
    unique = true,
)
@CompoundIndex(
    name = "idx_user_account_effective",
    def = "{'userId': 1, 'accountId': 1, 'effectiveAt': 1}",
)
@CompoundIndex(
    name = "idx_user_account_type_effective",
    def = "{'userId': 1, 'accountId': 1, 'recordType': 1, 'effectiveAt': 1}",
)
data class InventoryRecord(
    @Id
    val id: String? = null,
    /**
     * 幂等 ID,单一用户数据集中唯一(1..128 字符)
     */
    val recordId: String,
    /**
     * 记录归属用户 id(引用 MaaBackend.maa_user.userId),取自 JWT,绝不由前端传入
     */
    @Indexed
    val userId: String,
    val accountId: String,
    /**
     * 记录类型: reward_delta(奖励增量) | stock_snapshot(库存快照) |
     * consumption_delta(升级消费) | resource_delta(带符号的资源使用/兑换；仅服务端生成)
     */
    val recordType: String,
    /**
     * 对象类型: item | agent
     */
    val entityType: String,
    /**
     * 获取渠道(协议 5.1 record 级可选字段):推荐稳定值 背包 / 据点情报 / 派遣,
     * 允许扩展其他非空值;仅排查用,不参与库存计算
     */
    val acquisitionChannel: String? = null,
    /**
     * 派遣消耗体力数；仅 acquisitionChannel 包含“派遣”的 reward_delta 记录有值。
     */
    val staminaCost: Long? = null,
    /**
     * 快照范围: full | listed;仅 record_type = stock_snapshot 时携带,
     * reward_delta 记录恒为 null
     */
    val snapshotScope: String? = null,
    /**
     * 奖励发生时间或库存实际读取时间(协议要求带时区),是历史统计与基线比较的依据
     */
    val effectiveAt: Instant,
    /**
     * 接收时间(服务端落库时间),仅排查用,不参与库存计算
     */
    val receivedAt: Instant = Instant.now(),
    /**
     * 生成数据的平台信息
     */
    val producer: ProducerInfo,
    /**
     * 记录携带的对象与数量,按 id 唯一
     */
    val entries: List<RecordEntry>,
    /**
     * 库存生效状态: applied | history_only | superseded
     * 仅用于排查导入结果,不参与业务计算
     */
    val stockEffect: String = "applied",
    /** Groups item and agent consumption records created by one atomic upgrade. */
    val transactionId: String? = null,
    /** Authenticated Open API connection; never taken from the exchange body. */
    val sourceConnectionId: String? = null,
    /** Typed command identity for JWT-only draw-resource retries; never supplied by exchange imports. */
    val resourceRequestIdentity: String? = null,
    /** Orders same-millisecond draw commands during replay, including gain before/after exchange. */
    val resourceRevision: Long? = null,
) : Serializable

/**
 * 生产者平台信息
 */
data class ProducerInfo(
    /**
     * 平台稳定短名称,如 myshare / partner-a
     */
    val platform: String,
    /**
     * 平台或客户端版本,仅排查用
     */
    val version: String? = null,
)

/**
 * 流水条目:对象 id + 可选展示名 + 数量
 */
data class RecordEntry(
    /**
     * 跨平台稳定 id(operators.json 的 formal id 或 items.json 的 id),身份主键为
     * (entity_type, id)。
     *
     * 显式 @Field("id"):Spring Data 对属性名 id 有默认映射为 _id 的约定,
     * 但协议 4.2 要求 entries 元素使用 id 字段,且时段获得量聚合按
     * $entries.id 分组,因此强制存储字段名为 id。
     */
    @Field("id")
    val id: String,
    /**
     * 展示名称,便于人工阅读,不作为主键
     */
    val name: String? = null,
    /**
     * 数量:reward_delta / consumption_delta 恒 > 0,stock_snapshot 为 0..Int.MAX_VALUE；
     * consumption_delta 的正数由 recordType 表达扣减方向。
     * resource_delta 为非零有符号变动，兑换的两项变动属于同一条记录。
     */
    val count: Long,
)
