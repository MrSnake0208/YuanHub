package com.lhs.share.hub.service

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.request.HubPostCreateRequest
import com.lhs.share.hub.controller.response.HubPostResponse
import com.lhs.share.hub.repository.HubPostRepository
import com.lhs.share.hub.repository.entity.HubPost
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

/**
 * Hub 库帖子服务(HubBackend.hub_post)
 *
 * 数据写入 Hub 库;发帖人信息通过 [HubUserInfoService] 跨库联查 MaaBackend。
 */
@Service
class HubPostService(
    private val hubPostRepository: HubPostRepository,
    private val hubUserInfoService: HubUserInfoService,
) {
    /**
     * 发布帖子(发帖人取自当前登录用户)
     */
    fun create(userId: String, request: HubPostCreateRequest): HubPostResponse {
        val post = hubPostRepository.save(
            HubPost(
                userId = userId,
                title = request.title,
                content = request.content,
            ),
        )
        return HubPostResponse.of(post, hubUserInfoService.get(userId)?.userName)
    }

    /**
     * 帖子详情(单查用户,走缓存)
     */
    fun getById(id: String): HubPostResponse {
        val post = hubPostRepository.findById(id).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "帖子不存在: $id")
        }
        return HubPostResponse.of(post, hubUserInfoService.get(post.userId)?.userName)
    }

    /**
     * 按用户查帖子列表(批量联查,一次 $in)
     */
    fun listByUser(userId: String): List<HubPostResponse> {
        val posts = hubPostRepository.findByUserIdOrderByCreatedAtDesc(userId)
        return assemble(posts)
    }

    /**
     * 帖子列表(最近 50 条,批量联查)
     */
    fun list(): List<HubPostResponse> {
        val posts = hubPostRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 50))
        return assemble(posts.content)
    }

    private fun assemble(posts: List<HubPost>): List<HubPostResponse> {
        if (posts.isEmpty()) return emptyList()
        val userDict = hubUserInfoService.getDict(posts.map { it.userId })
        return posts.map { post ->
            HubPostResponse.of(post, userDict[post.userId]?.userName)
        }
    }
}
