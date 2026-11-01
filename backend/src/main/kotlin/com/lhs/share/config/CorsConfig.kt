package com.lhs.share.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/**
 * 跨域配置。
 *
 * 本地开发默认允许任意来源；生产环境必须通过
 * SHARE_CORS_ALLOWED_ORIGIN_PATTERNS 收敛为实际前端域名。
 */
@Configuration
class CorsConfig(
    @Value("\${share.cors.allowed-origin-patterns:*}")
    private val configuredOriginPatterns: String,
) : WebMvcConfigurer {
    override fun addCorsMappings(registry: CorsRegistry) {
        val originPatterns =
            configuredOriginPatterns
                .split(",")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .ifEmpty { listOf("*") }

        registry.addMapping("/**")
            .allowedOriginPatterns(*originPatterns.toTypedArray())
            .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600)
    }
}
