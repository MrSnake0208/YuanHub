package com.lhs.share.config.security

import com.lhs.share.common.utils.IpUtil
import com.lhs.share.service.jwt.JwtAuthToken
import com.lhs.share.service.model.LoginUser
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.server.ResponseStatusException

/**
 * Auth 助手,统一认证信息的设置和获取
 */
@Component
class AuthenticationHelper {
    /**
     * 设置当前认证信息,即 [SecurityContextHolder.getContext().setAuthentication] 的集中调用
     */
    fun setAuthentication(authentication: Authentication?) {
        SecurityContextHolder.getContext().authentication = authentication
    }

    /**
     * 要求用户 id,否则抛出未认证异常
     */
    @Throws(ResponseStatusException::class)
    fun requireUserId(): String = obtainUserId() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)

    /**
     * 获取当前用户 id,未认证时返回 null
     */
    fun obtainUserId(): String? {
        val auth = SecurityContextHolder.getContext().authentication ?: return null
        return when (auth) {
            is UsernamePasswordAuthenticationToken -> (auth.principal as? LoginUser)?.userId
            is JwtAuthToken -> auth.subject
            else -> null
        }
    }

    /**
     * 获取已认证用户 id,未认证时获取 IP 地址
     */
    fun obtainUserIdOrIpAddress(): String {
        val id = obtainUserId()
        if (id != null) return id

        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request
        return checkNotNull(request).run(IpUtil::getIpAddr)
    }
}
