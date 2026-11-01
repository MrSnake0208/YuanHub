package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.HubPost
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * Hub 库仓储(HubBackend.hub_post)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate,
 * 与主库(MaaBackend)仓储互不影响。
 */
interface HubPostRepository : MongoRepository<HubPost, String> {
    /**
     * 按用户查询帖子(按创建时间倒序)
     */
    fun findByUserIdOrderByCreatedAtDesc(userId: String): List<HubPost>

    /**
     * 分页查询(按创建时间倒序)
     */
    fun findAllByOrderByCreatedAtDesc(pageable: Pageable): Page<HubPost>
}
