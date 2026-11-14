package com.lhs.share.config

import com.lhs.share.config.external.ShareProperties
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.nio.file.Path

@Configuration
class PortraitStaticResourceConfig(private val properties: ShareProperties) : WebMvcConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        val base = Path.of(properties.portrait.dir).toAbsolutePath().toUri().toString()
        registry.addResourceHandler("/portraits/**")
            .addResourceLocations(if (base.endsWith('/')) base else "$base/")
            .setCachePeriod(300)
    }
}
