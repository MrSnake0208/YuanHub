package com.lhs.share.openapi

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AccessDeniedHandlerImpl
import com.lhs.share.config.security.AuthenticationEntryPointImpl
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.JwtAuthenticationTokenFilter
import com.lhs.share.config.security.SecurityConfig
import com.lhs.share.hub.controller.notification.NotificationController
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.notification.NotificationEventService
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtAuthToken
import com.lhs.share.service.jwt.JwtService
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.verify
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
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant

@ActiveProfiles("test")
@WebMvcTest(controllers = [NotificationController::class])
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SecurityConfig::class,
    JwtAuthenticationTokenFilter::class,
    AuthenticationHelper::class,
    AuthenticationEntryPointImpl::class,
    AccessDeniedHandlerImpl::class,
    DataTransferService::class,
)
class NotificationEventsControllerContractTest {
    @MockitoBean lateinit var authorization: com.lhs.share.hub.service.admin.AdminAuthorizationService

    @Autowired lateinit var mvc: MockMvc

    @MockitoBean lateinit var service: NotificationService

    @MockitoBean lateinit var events: NotificationEventService

    @MockitoBean lateinit var betaService: BetaService

    @MockitoBean lateinit var recruitmentAccessService: RecruitmentAccessService

    @MockitoBean lateinit var jwtService: JwtService

    @MockitoBean lateinit var stringRedisTemplate: StringRedisTemplate

    @BeforeEach
    fun clearStartupEvents() {
        // BetaService also receives ApplicationReadyEvent; assertions below concern HTTP requests.
        clearInvocations(betaService, recruitmentAccessService, stringRedisTemplate, events)
    }

    @Test
    fun `anonymous and URL tokens cannot subscribe`() {
        mvc.perform(get("/v1/notifications/events")).andExpect(status().isUnauthorized)
        mvc.perform(get("/v1/notifications/events?token=synthetic&access_token=synthetic"))
            .andExpect(status().isUnauthorized)
        `when`(jwtService.verifyAndParseAuthToken("invalid")).thenThrow(IllegalArgumentException("invalid"))
        mvc.perform(get("/v1/notifications/events").header("Authorization", "Bearer invalid"))
            .andExpect(status().isUnauthorized)
        verifyNoInteractions(events)
    }

    @Test
    fun `JWT subject owns the stream regardless of supplied user ID and beta access`() {
        val now = Instant.now()
        val token = JwtAuthToken("owner", "synthetic", now, now.plusSeconds(600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("synthetic")).thenReturn(token)
        val emitter = NotificationEventService().subscribe("owner")
        `when`(events.subscribe("owner")).thenReturn(emitter)
        mvc.perform(get("/v1/notifications/events?userId=outsider").header("Authorization", "Bearer synthetic"))
            .andExpect(status().isOk)
            .andExpect(request().asyncStarted())
            .andExpect(header().string("Cache-Control", containsString("no-store")))
            .andExpect(header().string("X-Accel-Buffering", "no"))
        verify(events).subscribe("owner")
        verifyNoInteractions(betaService, recruitmentAccessService, stringRedisTemplate)
        emitter.complete()
    }
}
