package com.lhs.share.config

import com.lhs.share.config.external.ShareProperties
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.nio.file.Path

/**
 * 媒体文件静态资源映射：路径前缀 /media/ → file:{share.media.dir}/。
 *
 * 上传的媒体文件通过此映射对外公开访问，Spring 静态资源自带 Last-Modified 协商缓存。
 */
@Configuration
class MediaStaticResourceConfig(private val properties: ShareProperties) : WebMvcConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        val base = Path.of(properties.media.dir).toAbsolutePath().toUri().toString()
        val location = if (base.endsWith('/')) base else base + '/'
        registry.addResourceHandler("/media/**")
            .addResourceLocations(location)
            .setCachePeriod(3600)
    }
}