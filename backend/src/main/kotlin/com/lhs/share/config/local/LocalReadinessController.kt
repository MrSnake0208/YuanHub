package com.lhs.share.config.local

import com.lhs.share.controller.response.ApiResult
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/** Local profile readiness endpoint used by the integration workflow. */
@Profile("local")
@RestController
class LocalReadinessController {
    @GetMapping("/ready")
    fun ready(): ApiResult<Nothing> = ApiResult.success("Share Server is Ready", null)
}

/** Makes only the local readiness endpoint public without changing production security. */
@Profile("local")
@Configuration
class LocalReadinessSecurityConfig {
    @Bean
    @Order(0)
    fun localReadinessFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .securityMatcher("/ready")
        .authorizeHttpRequests { authorize -> authorize.anyRequest().permitAll() }
        .build()
}
