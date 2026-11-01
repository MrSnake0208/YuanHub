package com.lhs.share.config

import com.lhs.share.config.security.BetaAccessInterceptor
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.time.Clock

@Configuration
class BetaClockConfiguration {
    @Bean("betaClock")
    fun betaClock(): Clock = Clock.systemUTC()
}

@Configuration
class BetaWebMvcConfiguration(private val interceptor: BetaAccessInterceptor) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(interceptor).order(-100)
    }
}
