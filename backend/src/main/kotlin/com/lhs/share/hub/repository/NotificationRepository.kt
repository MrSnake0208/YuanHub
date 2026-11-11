package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.Notification
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository
import org.springframework.data.mongodb.repository.Query

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
    @Query("{'userId': ?0, '\$nor': [{'refType': 'FEEDBACK', 'refId': {'\$regex': '^rpt_diag_'}}]}", sort = "{'createdAt': -1}")
    fun findByUserIdOrderByCreatedAtDesc(userId: String, pageable: Pageable): Page<Notification>

    /**
     * 按用户分页查询未读通知(按创建时间倒序)
     */
    @Query(
        "{'userId': ?0, 'readAt': null, '\$nor': [{'refType': 'FEEDBACK', 'refId': {'\$regex': '^rpt_diag_'}}]}",
        sort = "{'createdAt': -1}",
    )
    fun findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId: String, pageable: Pageable): Page<Notification>

    /**
     * 统计用户未读通知数
     */
    @Query("{'userId': ?0, 'readAt': null, '\$nor': [{'refType': 'FEEDBACK', 'refId': {'\$regex': '^rpt_diag_'}}]}", count = true)
    fun countByUserIdAndReadAtIsNull(userId: String): Long

    /**
     * 查询用户全部未读通知
     */
    // rpt_diag_ is reserved by createDiagnostic; hide legacy replies without deleting notifications.
    @Query("{'userId': ?0, 'readAt': null, '\$nor': [{'refType': 'FEEDBACK', 'refId': {'\$regex': '^rpt_diag_'}}]}")
    fun findByUserIdAndReadAtIsNull(userId: String): List<Notification>

    fun findByRefTypeAndRefIdAndReadAtIsNull(refType: String, refId: String): List<Notification>
}
