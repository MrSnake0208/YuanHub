package com.lhs.share.config.security

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.service.jwt.JwtService
import com.lhs.share.service.jwt.LoginSessions
import com.mongodb.MongoException
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.dao.DataAccessException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.io.IOException

/**
 * JWT 认证过滤器:从请求头提取 Bearer token,验证通过后写入 SecurityContext
 */
@Component
class JwtAuthenticationTokenFilter(
    private val helper: AuthenticationHelper,
    private val properties: ShareProperties,
    private val jwtService: JwtService,
    private val sessions: LoginSessions,
) : OncePerRequestFilter() {
    @Throws(IOException::class, ServletException::class)
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        try {
            val token = extractToken(request)
            val authToken = jwtService.verifyAndParseAuthToken(token)
            sessions.requireAccess(authToken)
            helper.setAuthentication(authToken)
        } catch (_: DataAccessException) {
            response.sendError(503)
            return
        } catch (_: MongoException) {
            response.sendError(503)
            return
        } catch (ex: Exception) {
            logger.trace(ex.message)
        }
        filterChain.doFilter(request, response)
    }

    @Throws(Exception::class)
    private fun extractToken(request: HttpServletRequest): String {
        if (SecurityContextHolder.getContext().authentication != null) throw Exception("no need to auth")
        val head = request.getHeader(properties.jwt.header)
        if (head == null || !head.startsWith("Bearer ")) throw Exception("token not found")
        return head.substring(7)
    }
}
