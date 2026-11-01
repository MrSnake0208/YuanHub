package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.MediaAsset
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * Hub 库媒体资产仓储(HubBackend.hub_media)
 *
 * 由 [com.lhs.share.config.mongo.HubMongoConfig] 路由到 hubMongoTemplate,
 * 与主库(MaaBackend)仓储互不影响。
 */
interface MediaAssetRepository : MongoRepository<MediaAsset, String> {

    /**
     * 按用户查询媒体列表(按创建时间倒序)
     */
    fun findByOwnerUserIdOrderByCreatedAtDesc(ownerUserId: String): List<MediaAsset>

    /**
     * 按 id 和所属用户查询(用于鉴权)
     */
    fun findByIdAndOwnerUserId(id: String, ownerUserId: String): MediaAsset?
}