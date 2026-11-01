package com.lhs.share.config

import com.lhs.share.config.security.RestrictedFeatureInterceptor
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class RestrictedFeatureConfiguration(private val interceptor: RestrictedFeatureInterceptor) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(interceptor).order(-110)
    }
}
