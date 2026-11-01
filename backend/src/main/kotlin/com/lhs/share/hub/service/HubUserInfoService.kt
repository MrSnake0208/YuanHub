package com.lhs.share.hub.service

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.service.UserService
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Hub 业务跨库联查用户信息服务
 *
 * 用户数据在 MaaBackend(Hub 库无法 join),这里做应用层联查:
 * - 单查:走 Caffeine 缓存(@Cacheable,热点用户零数据库访问)
 * - 批量:一次 $in 查询解决 N+1(列表页用)
 */
@Service
class HubUserInfoService(
    private val userService: UserService,
) {
    /**
     * 单查用户公开信息(Caffeine 缓存 5 分钟,配置见 spring.cache.caffeine.spec)
     */
    @Cacheable(cacheNames = ["hubUserInfo"], key = "#userId")
    fun get(userId: String): MaaUserInfo? = userService.get(userId)

    /**
     * 批量联查用户公开信息,返回 userId -> MaaUserInfo 映射
     *
     * 底层是 UserService.findByUsersId(一次 findAllById,即 $in 查询),
     * 避免列表页对每条数据单独查一次用户的 N+1 问题。
     */
    fun getDict(userIds: Collection<String>): Map<String, MaaUserInfo> {
        if (userIds.isEmpty()) return emptyMap()
        return userService.findByUsersId(userIds)
            .entries()
            .associate { (id, user) -> id to MaaUserInfo(user) }
    }
}
