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
 * 删除不在此定义派生 delete 方法,服务层采用「先查归属再 deleteById」,
 * 避免派生删除返回类型的版本差异且保证归属校验在前。
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
}
