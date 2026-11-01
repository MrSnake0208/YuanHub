package com.lhs.share.config.security

import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.hub.controller.inventory.response.InventoryError
import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import com.lhs.share.service.DataTransferService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.stereotype.Component
import java.io.IOException

/**
 * 已认证但权限不足时,返回 403 JSON 响应
 */
@Component
class AccessDeniedHandlerImpl(private val dataTransferService: DataTransferService) : AccessDeniedHandler {
    @Throws(IOException::class)
    override fun handle(request: HttpServletRequest, response: HttpServletResponse, accessDeniedException: AccessDeniedException) {
        val result = if (request.isInventoryRequest()) {
            InventoryErrorResponse(InventoryError("forbidden", "Permission denied"))
        } else {
            fail(HttpStatus.FORBIDDEN.value(), "权限不足")
        }
        dataTransferService.writeJson(response, result, HttpStatus.FORBIDDEN.value())
    }

    private fun HttpServletRequest.isInventoryRequest(): Boolean = requestURI.startsWith("/v1/inventory") ||
        requestURI.startsWith("/v1/star-state") ||
        requestURI.startsWith("/v1/star-loadout") ||
        requestURI.startsWith("/v1/recruitment") ||
        requestURI.startsWith("/open-api/inventory")
}
