package com.lhs.share.config.security

import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping

@Component
class RestrictedFeatureInterceptor(
    private val authorization: AdminAuthorizationService,
    private val helper: AuthenticationHelper,
) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod) return true
        val path = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE)?.toString() ?: return true
        val permission = when {
            path == "/v1/achievements" || path.startsWith("/v1/achievements/") -> null
            listOf("/v1/bonds", "/v1/admin/achievement-catalogs", "/v1/admin/bonds").any {
                path == it || path.startsWith("$it/")
            } -> AdminPermission.ARCHIVE_ACCESS
            path == "/v1/operator/panel" || path.startsWith("/v1/operator/panel/") -> AdminPermission.OPERATOR_PANEL_USE
            path == "/v1/operator/relationships" || path.startsWith("/v1/operator/relationships/") ->
                AdminPermission.OPERATOR_RELATIONSHIP_USE
            path == "/v1/operator/reserve-workspace" -> AdminPermission.OPERATOR_RESERVE_USE
            path == "/v1/star/scans" || path.startsWith("/v1/star/scans/") -> AdminPermission.STAR_SCAN_REVIEW
            else -> return true
        }
        response.setHeader("Cache-Control", "no-store")
        val userId = helper.obtainUserId()
            ?: throw InventoryApiException(HttpStatus.UNAUTHORIZED, "feature_unauthorized", "请先登录")
        if (permission != null && !authorization.hasPermission(userId, permission)) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "feature_forbidden", "没有该功能的访问权限")
        }
        return true
    }
}
