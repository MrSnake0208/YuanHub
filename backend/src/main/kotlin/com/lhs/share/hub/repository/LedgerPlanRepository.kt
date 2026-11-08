package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.LedgerPlan
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 广陵账房方案仓储(HubBackend.hub_ledger_plan)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate。
 * 铁律:本接口必须位于 com.lhs.share.hub.repository 顶层包,否则不被
 * HubMongoConfig 扫描而落入主库(MaaBackend)。
 *
 * 单条删除先查归属;账号级删除供子账号删除事务调用。
 */
interface LedgerPlanRepository : MongoRepository<LedgerPlan, String> {
    /**
     * 按用户查询方案列表,按更新时间倒序
     */
    fun findByUserIdOrderByUpdatedAtDesc(userId: String): List<LedgerPlan>

    /**
     * 统计用户方案数(配额校验用,命中 userId 单字段索引)
     */
    fun countByUserId(userId: String): Long

    /**
     * 按 id + userId 查询(归属校验,仓储层杜绝越权)
     */
    fun findByIdAndUserId(id: String, userId: String): LedgerPlan?

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)

    fun existsByUserIdAndAccountId(userId: String, accountId: String): Boolean
}
