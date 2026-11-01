package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * Hub 库(HubBackend)业务实体示例:帖子
 *
 * 存储在独立库 HubBackend 的 hub_post 集合,与用户系统(MaaBackend)分离。
 * userId 引用 MaaBackend.maa_user 的 userId,跨库无法 join,需要用户信息时在应用层联查。
 */
@Document("hub_post")
data class HubPost(
    @Id
    val id: String? = null,
    /**
     * 发帖用户 id(引用 MaaBackend.maa_user.userId)
     */
    @Indexed
    val userId: String,
    val title: String,
    val content: String,
    val createdAt: Instant = Instant.now(),
) : Serializable
