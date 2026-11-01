package com.lhs.share.config.accesslimit

import com.lhs.share.common.utils.IpUtil
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.service.DataTransferService
import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.io.ClassPathResource
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.http.HttpStatus
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor

/**
 * [AccessLimit] 注解的拦截器实现。
 *
 * 已认证请求按 userId + HTTP 方法 + 接口路径计数；匿名请求回退为真实 IP。
 * Redis 计数使用固定时间窗口：仅第一次请求设置 TTL，后续请求不会续期窗口。
 */
class AccessLimitInterceptor(
    private val stringRedisTemplate: StringRedisTemplate,
    private val dataTransferService: DataTransferService,
    private val authenticationHelper: AuthenticationHelper,
) : HandlerInterceptor {
    private val log = KotlinLogging.logger { }

    private val incrementFixedWindowScript: RedisScript<Long> = RedisScript.of(
        ClassPathResource("redis-lua/accessLimitIncrementFixedWindow.lua"),
        Long::class.java,
    )

    @Throws(Exception::class)
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        val ann = (handler as? HandlerMethod)?.method?.getAnnotation(AccessLimit::class.java) ?: return true
        val userId = authenticationHelper.obtainUserId()
        val identity = if (userId != null) "user:$userId" else "ip:${IpUtil.getIpAddr(request)}"
        val key = "access-limit:$identity:${request.method}:${request.requestURI}"

        val count = stringRedisTemplate.execute(
            incrementFixedWindowScript,
            listOf(key),
            ann.second.toString(),
        ) ?: 1L

        if (count > ann.times) {
            val identityType = if (userId != null) "user" else "ip"
            log.info { "$identityType ${request.method} ${request.requestURI} 请求过于频繁 ($count/${ann.times})" }
            val result = fail(HttpStatus.TOO_MANY_REQUESTS.value(), "请求过于频繁")
            response.setHeader("Retry-After", ann.second.toString())
            dataTransferService.writeJson(response, result, HttpStatus.TOO_MANY_REQUESTS.value())
            return false
        }

        return true
    }
}
