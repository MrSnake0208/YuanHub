package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackTicket
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository
import org.springframework.data.mongodb.repository.Query

/**
 * Hub 库反馈工单仓储(HubBackend.feedback_tickets)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate,
 * 与主库(MaaBackend)仓储互不影响。
 */
interface FeedbackTicketRepository : MongoRepository<FeedbackTicket, String> {
    fun findByMergedIntoId(mergedIntoId: String): List<FeedbackTicket>
    fun findByOperatorAssigneeUserIdAndStatusAndMergedIntoIdIsNull(userId: String, status: String): List<FeedbackTicket>

    /**
     * 按提交人查询(按创建时间倒序)
     */
    fun findByReporterUserIdOrderByCreatedAtDesc(reporterUserId: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按状态、类型筛选(按创建时间倒序)
     */
    fun findByStatusAndTypeOrderByCreatedAtDesc(status: String, type: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按类型筛选(按创建时间倒序)
     */
    fun findByTypeOrderByCreatedAtDesc(type: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按状态筛选(按创建时间倒序)
     */
    fun findByStatusOrderByCreatedAtDesc(status: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 全部查询(按创建时间倒序)
     */
    fun findAllByOrderByCreatedAtDesc(pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按提交人筛选(按更新时间倒序)
     */
    fun findByReporterUserIdOrderByUpdatedAtDesc(reporterUserId: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按状态、类型筛选(按更新时间倒序)
     */
    fun findByStatusAndTypeOrderByUpdatedAtDesc(status: String, type: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按类型筛选(按更新时间倒序)
     */
    fun findByTypeOrderByUpdatedAtDesc(type: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按状态筛选(按更新时间倒序)
     */
    fun findByStatusOrderByUpdatedAtDesc(status: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 全部查询(按更新时间倒序)
     */
    fun findAllByOrderByUpdatedAtDesc(pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按提交人+状态查询(按创建时间倒序)
     */
    fun findByReporterUserIdAndStatusOrderByCreatedAtDesc(reporterUserId: String, status: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按提交人+类型查询(按创建时间倒序)
     */
    fun findByReporterUserIdAndTypeOrderByCreatedAtDesc(reporterUserId: String, type: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按提交人+状态+类型查询(按创建时间倒序)
     */
    fun findByReporterUserIdAndStatusAndTypeOrderByCreatedAtDesc(
        reporterUserId: String,
        status: String,
        type: String,
        pageable: Pageable,
    ): Page<FeedbackTicket>

    /**
     * 搜索 content 或 id 包含关键词(按创建时间倒序)
     */
    @Query("{ \$or: [ { 'content': { \$regex: ?0, \$options: 'i' } }, { '_id': { \$regex: ?0, \$options: 'i' } } ] }")
    fun searchByKeywordOrderByCreatedAtDesc(keyword: String, pageable: Pageable): Page<FeedbackTicket>

    /**
     * 按提交人搜索 content 或 id 包含关键词
     */
    @Query(
        value = "{ \$and: [ { 'reporterUserId': ?0 }, " +
            "{ \$or: [ { 'content': { \$regex: ?1, \$options: 'i' } }, " +
            "{ '_id': { \$regex: ?1, \$options: 'i' } } ] } ] }",
    )
    fun searchByReporterUserIdAndKeywordOrderByCreatedAtDesc(
        reporterUserId: String,
        keyword: String,
        pageable: Pageable,
    ): Page<FeedbackTicket>
}
