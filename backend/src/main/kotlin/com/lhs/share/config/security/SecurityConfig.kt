package com.lhs.share.config.security

import jakarta.servlet.DispatcherType
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer
import org.springframework.security.config.annotation.web.configurers.ExceptionHandlingConfigurer
import org.springframework.security.config.annotation.web.configurers.SessionManagementConfigurer
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter

/**
 * Spring Security 配置
 *
 * 认证方式:无状态 JWT,通过 [JwtAuthenticationTokenFilter] 解析请求头中的 token
 *
 * 新增接口时:
 * - 匿名可访问(登录/注册):加入 [URL_WHITELIST](anonymous)
 * - 公开接口(无需登录):加入 [URL_PERMIT_ALL]
 * - 需要登录的接口:保持默认(authenticated),可加 @RequireJwt 展示文档
 */
@Configuration
class SecurityConfig(
    private val authenticationConfiguration: AuthenticationConfiguration,
    private val jwtAuthenticationTokenFilter: JwtAuthenticationTokenFilter,
    private val authenticationEntryPoint: AuthenticationEntryPointImpl,
    private val accessDeniedHandler: AccessDeniedHandlerImpl,
) {
    @Bean
    fun passwordEncoder() = BCryptPasswordEncoder()

    @Bean
    @Throws(Exception::class)
    fun authenticationManager(): AuthenticationManager = authenticationConfiguration.authenticationManager

    @Bean
    @Throws(Exception::class)
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        // 关闭 CSRF,使用无状态会话
        http
            .csrf { obj: CsrfConfigurer<HttpSecurity> -> obj.disable() }
            .sessionManagement { sessionManagement: SessionManagementConfigurer<HttpSecurity?> ->
                sessionManagement.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            }

        http.authorizeHttpRequests { authorize ->
            authorize
                // 首次 REQUEST 已完成鉴权；SSE 完成/异常后的容器二次调度不能再次改写已提交响应。
                .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR)
                .permitAll()
                .requestMatchers(*URL_WHITELIST)
                .anonymous()
                .requestMatchers(*URL_PERMIT_ALL)
                .permitAll()
                .requestMatchers(HttpMethod.GET, "/v1/works/mine")
                .authenticated()
                .requestMatchers(HttpMethod.GET, "/v1/works", "/v1/works/**")
                .permitAll()
                .requestMatchers(HttpMethod.POST, "/v1/works/compatibility")
                .permitAll()
                .requestMatchers(HttpMethod.POST, "/v1/activity-calendar/suggestions")
                .authenticated()
                .requestMatchers(HttpMethod.GET, "/v1/activity-calendar/suggestions/mine", "/v1/activity-calendar/suggestions/*")
                .authenticated()
                .requestMatchers(HttpMethod.GET, "/v1/admin/activity-calendar/suggestions")
                .authenticated()
                .requestMatchers(
                    HttpMethod.POST,
                    "/v1/admin/activity-calendar/suggestions/*/accept",
                    "/v1/admin/activity-calendar/suggestions/*/reject",
                )
                .authenticated()
                // Hub 库业务:查询公开,写操作需登录(未放行的方法默认 authenticated)
                .requestMatchers(HttpMethod.GET, "/hub/post/**")
                .permitAll()
                .requestMatchers("/v1/activity-calendar/subscriptions", "/v1/activity-calendar/subscriptions/**")
                .authenticated()
                .requestMatchers(HttpMethod.GET, "/v1/activity-calendar")
                .authenticated()
                .requestMatchers(HttpMethod.GET, "/hub/ledger/catalog")
                .permitAll()
                .requestMatchers(HttpMethod.GET, "/v1/development-goals")
                .permitAll()
                .anyRequest()
                .authenticated()
        }
        // 添加 JWT 过滤器
        http.addFilterBefore(jwtAuthenticationTokenFilter, UsernamePasswordAuthenticationFilter::class.java)

        // 配置认证失败 / 权限不足的 JSON 响应
        http.exceptionHandling { exceptionHandling: ExceptionHandlingConfigurer<HttpSecurity?> ->
            exceptionHandling
                .authenticationEntryPoint(authenticationEntryPoint)
                .accessDeniedHandler(accessDeniedHandler)
        }

        // 开启跨域请求
        http.cors(Customizer.withDefaults())
        return http.build()
    }

    companion object {
        /**
         * 匿名可访问接口(即使已登录也按匿名处理)
         */
        private val URL_WHITELIST =
            arrayOf(
                "/user/login",
                "/user/register",
                "/user/sendRegistrationToken",
            )

        /**
         * 公开接口,不需要登录即可访问
         */
        private val URL_PERMIT_ALL =
            arrayOf(
                "/",
                "/error",
                "/version",
                "/actuator/health",
                "/actuator/health/**",
                "/v1/beta/status",
                "/demo/**",
                "/user/info",
                "/user/search",
                "/user/password/reset_request",
                "/user/password/reset",
                "/user/refresh",
                "/swagger-ui.html",
                "/v3/api-docs/**",
                "/swagger-ui/**",
                "/v1/inventory/catalog",
                "/v1/operator/catalog",
                "/v1/recruitment/catalog",
                "/v1/level/catalog",
                "/v1/level/catalog/**",
                "/v1/changelog/**",
                "/v1/reports/public",
                "/v1/reports/public/**",
                "/v1/operator/share/view/**",
                "/v1/star/share/view/**",
                "/avatar/**",
                "/media/**",
                "/user/open-api/permissions",
                "/open-api/**",
            )
    }
}
