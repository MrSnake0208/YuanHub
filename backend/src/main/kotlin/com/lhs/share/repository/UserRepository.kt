package com.lhs.share.repository

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.repository.entity.MaaUser
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository
import org.springframework.data.mongodb.repository.Query

/**
 * 用户仓储
 *
 * 与 MaaYuan-Share-Backend 共用 maa_user 集合,字段与索引注解保持一致,
 * 账号的注册/登录/改密等写操作与原项目语义一致。
 */
interface UserRepository : MongoRepository<MaaUser, String> {
    /**
     * 根据邮箱(用户唯一登录凭据)查询
     */
    fun findByEmail(email: String): MaaUser?

    /** 完整邮箱精确匹配, 忽略大小写。 */
    fun findByEmailIgnoreCase(email: String): MaaUser?

    /**
     * 按 userId 查询用户
     */
    fun findByUserId(userId: String): MaaUser?

    /**
     * 用户名是否存在(用户名非唯一索引,需应用层校验)
     */
    fun existsByUserName(userName: String): Boolean

    /**
     * 用户名模糊搜索(仅返回 status=1 的已激活用户,正则匹配、大小写不敏感)
     */
    @Query("{ 'userName': { '\$regex': ?0, '\$options': 'i' }, 'status': 1 }")
    fun searchUsers(userName: String, pageable: Pageable): Page<MaaUserInfo>

    /** 反馈权限配置专用搜索: 不复用公开用户信息接口, 只查 status >= 1 的已激活用户。 */
    @Query("{ '\$or': [ { 'userName': { '\$regex': ?0, '\$options': 'i' } }, { 'email': { '\$regex': ?0, '\$options': 'i' } } ], 'status': { '\$gte': 1 } }")
    fun searchFeedbackAccessUsers(query: String, pageable: Pageable): Page<MaaUser>
}
