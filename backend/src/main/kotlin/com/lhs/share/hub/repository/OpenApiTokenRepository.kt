package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OpenApiToken
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 第三方 API Token 仓储(HubBackend.open_api_token)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate。
 * 铁律:本接口必须位于 com.lhs.share.hub.repository 顶层包,否则不被
 * HubMongoConfig 扫描而落入主库(MaaBackend)。
 */
interface OpenApiTokenRepository : MongoRepository<OpenApiToken, String> {
    /**
     * 按用户查询 token 列表,按创建时间倒序
     */
    fun findByUserIdOrderByCreateTimeDesc(userId: String): List<OpenApiToken>

    fun findAllByUserIdAndAccountId(userId: String, accountId: String): List<OpenApiToken>

    /**
     * 按 token 查询,不存在时返回 null
     */
    fun findByToken(token: String): OpenApiToken?

    /**
     * 按 token_id + 用户查询,用于归属安全的撤销
     */
    fun findByIdAndUserId(id: String, userId: String): OpenApiToken?

    /**
     * 统计子账号 token 数量(配额校验用)
     */
    fun countByUserIdAndAccountId(userId: String, accountId: String): Long

    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}
