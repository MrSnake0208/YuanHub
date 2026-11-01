package com.lhs.share.config.security

import com.lhs.share.hub.service.beta.BetaService
import jakarta.servlet.DispatcherType
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping

@Component
class BetaAccessInterceptor(
    private val beta: BetaService,
    private val helper: AuthenticationHelper,
) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        // The initial REQUEST was authenticated. SSE completion/error redispatch must not rewrite a committed response.
        if (request.dispatcherType == DispatcherType.ASYNC || request.dispatcherType == DispatcherType.ERROR) return true
        if (handler !is HandlerMethod) return true
        val pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE)?.toString() ?: request.servletPath
        if (BetaAccessPolicy.requiresBeta(request.method, pattern)) {
            response.setHeader("Cache-Control", "no-store")
            beta.requireAccess(helper.requireUserId())
        }
        return true
    }
}
