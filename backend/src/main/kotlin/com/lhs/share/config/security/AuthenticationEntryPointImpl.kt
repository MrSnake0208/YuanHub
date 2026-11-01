package com.lhs.share.config.security

import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.hub.controller.inventory.response.InventoryError
import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import com.lhs.share.service.DataTransferService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.security.core.AuthenticationException
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.stereotype.Component
import java.io.IOException

/**
 * 未认证访问受保护接口时,返回 401 JSON 响应
 */
@Component
class AuthenticationEntryPointImpl(
    private val dataTransferService: DataTransferService,
) : AuthenticationEntryPoint {
    @Throws(IOException::class)
    override fun commence(request: HttpServletRequest, response: HttpServletResponse, authException: AuthenticationException) {
        val result = if (request.isInventoryRequest()) {
            InventoryErrorResponse(InventoryError("unauthorized", "Authentication is required"))
        } else {
            fail(HttpStatus.UNAUTHORIZED.value(), "未登录或登录已过期")
        }
        dataTransferService.writeJson(response, result, HttpStatus.UNAUTHORIZED.value())
    }

    private fun HttpServletRequest.isInventoryRequest(): Boolean = requestURI.startsWith("/v1/inventory") ||
        requestURI.startsWith("/v1/star-state") ||
        requestURI.startsWith("/v1/star-loadout") ||
        requestURI.startsWith("/v1/recruitment") ||
        requestURI.startsWith("/open-api/inventory")
}
