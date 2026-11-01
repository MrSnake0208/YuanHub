package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.Notification
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 通知仓储
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate,
 * 与主库(MaaBackend)仓储互不影响。
 */
interface NotificationRepository : MongoRepository<Notification, String> {

    /**
     * 按用户分页查询通知(按创建时间倒序)
     */
    fun findByUserIdOrderByCreatedAtDesc(userId: String, pageable: Pageable): Page<Notification>

    /**
     * 按用户分页查询未读通知(按创建时间倒序)
     */
    fun findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId: String, pageable: Pageable): Page<Notification>

    /**
     * 统计用户未读通知数
     */
    fun countByUserIdAndReadAtIsNull(userId: String): Long

    /**
     * 查询用户全部未读通知
     */
    fun findByUserIdAndReadAtIsNull(userId: String): List<Notification>

    fun findByRefTypeAndRefIdAndReadAtIsNull(refType: String, refId: String): List<Notification>
}
