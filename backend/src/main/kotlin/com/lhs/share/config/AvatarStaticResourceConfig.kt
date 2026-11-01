package com.lhs.share.config

import com.lhs.share.config.external.ShareProperties
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.nio.file.Path

/**
 * 密探头像静态资源映射：路径前缀 /avatar/ → file:{share.avatar.dir}/。
 *
 * 图鉴本就公开（无需登录），头像随目录对外发布；Spring 静态资源自带 Last-Modified 协商缓存。
 */
@Configuration
class AvatarStaticResourceConfig(private val properties: ShareProperties) : WebMvcConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        val base = Path.of(properties.avatar.dir).toAbsolutePath().toUri().toString()
        val location = if (base.endsWith('/')) base else base + '/'
        registry.addResourceHandler("/avatar/**")
            .addResourceLocations(location)
            .setCachePeriod(86400)
    }
}
