package com.lhs.share.openapi

import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AccessDeniedHandlerImpl
import com.lhs.share.config.security.AuthenticationEntryPointImpl
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.JwtAuthenticationTokenFilter
import com.lhs.share.config.security.SecurityConfig
import com.lhs.share.hub.controller.development.AdminDevelopmentGoalController
import com.lhs.share.hub.controller.development.DevelopmentGoalController
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.development.DevelopmentGoalService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ActiveProfiles("test")
@WebMvcTest(controllers = [DevelopmentGoalController::class, AdminDevelopmentGoalController::class])
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SecurityConfig::class,
    JwtAuthenticationTokenFilter::class,
    AuthenticationHelper::class,
    AuthenticationEntryPointImpl::class,
    AccessDeniedHandlerImpl::class,
    DataTransferService::class,
)
class DevelopmentGoalSecurityTest {
    @MockitoBean lateinit var authorization: com.lhs.share.hub.service.admin.AdminAuthorizationService

    @Autowired lateinit var mvc: MockMvc

    @MockitoBean lateinit var service: DevelopmentGoalService

    @MockitoBean lateinit var betaService: BetaService

    @MockitoBean
    lateinit var recruitmentAccessService: com.lhs.share.hub.service.recruitment.RecruitmentAccessService

    @MockitoBean lateinit var jwtService: JwtService

    @MockitoBean lateinit var stringRedisTemplate: StringRedisTemplate

    @Test
    fun `访客可读公开目标而不能读取或写入管理接口`() {
        `when`(service.list(1, 12, null)).thenReturn(PagedDTO(false, 1, 0, emptyList()))
        mvc.perform(get("/v1/development-goals")).andExpect(status().isOk)
        mvc.perform(get("/v1/admin/development-goals")).andExpect(status().isUnauthorized)
        mvc.perform(post("/v1/admin/development-goals")).andExpect(status().isUnauthorized)
        mvc.perform(put("/v1/admin/development-goals/goal_1")).andExpect(status().isUnauthorized)
        verifyNoInteractions(stringRedisTemplate)
    }
}
