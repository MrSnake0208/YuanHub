package com.lhs.share.config

import com.lhs.share.config.external.ShareProperties
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.nio.file.Path

@Configuration
class XinzhiStaticResourceConfig(private val properties: ShareProperties) : WebMvcConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        val base = Path.of(properties.xinzhi.dir).toAbsolutePath().toUri().toString()
        registry.addResourceHandler("/xinzhi/**")
            .addResourceLocations(if (base.endsWith('/')) base else "$base/")
            .setCachePeriod(300)
    }
}
