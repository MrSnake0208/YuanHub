package com.lhs.share.hub.controller.response

import com.lhs.share.hub.repository.entity.HubPost
import java.time.Instant

/**
 * 帖子响应(含联查的用户名,跨库应用层联查结果)
 */
data class HubPostResponse(
    val id: String,
    val userId: String,
    /**
     * 发帖人用户名(来自 MaaBackend,应用层联查;用户不存在时为 null)
     */
    val userName: String?,
    val title: String,
    val content: String,
    val createdAt: Instant,
) {
    companion object {
        fun of(post: HubPost, userName: String?): HubPostResponse = HubPostResponse(
            id = checkNotNull(post.id) { "实体未持久化" },
            userId = post.userId,
            userName = userName,
            title = post.title,
            content = post.content,
            createdAt = post.createdAt,
        )
    }
}
