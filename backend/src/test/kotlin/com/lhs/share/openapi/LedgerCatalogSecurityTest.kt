package com.lhs.share.openapi

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AccessDeniedHandlerImpl
import com.lhs.share.config.security.AuthenticationEntryPointImpl
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.JwtAuthenticationTokenFilter
import com.lhs.share.config.security.SecurityConfig
import com.lhs.share.hub.controller.ledger.AdminLedgerCatalogController
import com.lhs.share.hub.controller.ledger.LedgerCatalogController
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.repository.entity.LedgerCatalogPackage
import com.lhs.share.hub.repository.entity.LedgerCatalogSettings
import com.lhs.share.hub.service.admin.AdminAuditService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.ledger.LedgerCatalogService
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtAuthToken
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant

@ActiveProfiles("test")
@WebMvcTest(controllers = [LedgerCatalogController::class, AdminLedgerCatalogController::class])
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SecurityConfig::class,
    JwtAuthenticationTokenFilter::class,
    AuthenticationHelper::class,
    AuthenticationEntryPointImpl::class,
    AccessDeniedHandlerImpl::class,
    DataTransferService::class,
    LedgerCatalogService::class,
)
class LedgerCatalogSecurityTest {
    @Autowired lateinit var mvc: MockMvc

    @MockitoBean lateinit var repository: LedgerCatalogRepository

    @MockitoBean lateinit var audit: AdminAuditService

    @MockitoBean lateinit var authorization: AdminAuthorizationService

    @MockitoBean lateinit var betaService: BetaService

    @MockitoBean lateinit var recruitmentAccessService: RecruitmentAccessService

    @MockitoBean lateinit var jwtService: JwtService

    @MockitoBean lateinit var stringRedisTemplate: StringRedisTemplate

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyValue(): T {
        any<T>()
        return null as T
    }

    private val body = """{"game":"ru","name":"礼包","points":60,"draws":0.6,"limit":2,"price_cny":6,"category":"其他"}"""
    private fun token(permission: Boolean) {
        val now = Instant.now()
        val token = JwtAuthToken("editor", "synthetic", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("synthetic")).thenReturn(token)
        `when`(authorization.hasPermission("editor", AdminPermission.LEDGER_CATALOG_WRITE)).thenReturn(permission)
    }

    @Test
    fun `anonymous public GET returns usable data with no cache but every admin operation requires JWT`() {
        `when`(repository.packages()).thenReturn(emptyList())
        `when`(repository.campaigns()).thenReturn(emptyList())
        `when`(repository.settings()).thenReturn(LedgerCatalogSettings(version = 0))
        mvc.perform(get("/hub/ledger/catalog")).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.settings.exchange_rate").value(6.7))
        listOf(
            get("/v1/admin/ledger"),
            post("/v1/admin/ledger/packages"),
            put("/v1/admin/ledger/packages/ru:1"),
            post("/v1/admin/ledger/campaigns"),
            post("/v1/admin/ledger/campaigns/preview"),
            put("/v1/admin/ledger/campaigns/test"),
            put("/v1/admin/ledger/settings"),
            post("/hub/ledger/catalog"),
        ).forEach { mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized) }
        verifyNoInteractions(audit, authorization)
    }

    @Test
    fun `authenticated non editor cannot call any admin read preview or write`() {
        token(false)
        listOf(
            get("/v1/admin/ledger"),
            post("/v1/admin/ledger/packages"),
            put("/v1/admin/ledger/packages/ru:1"),
            post("/v1/admin/ledger/campaigns"),
            post("/v1/admin/ledger/campaigns/preview"),
            put("/v1/admin/ledger/campaigns/test"),
            put("/v1/admin/ledger/settings"),
        ).forEach {
            mvc.perform(
                it.header("Authorization", "Bearer synthetic").contentType(MediaType.APPLICATION_JSON).content(body),
            ).andExpect(status().isForbidden)
        }
        verifyNoInteractions(repository, audit)
    }

    @Test
    fun `editor can create decimal package while invalid inputs and stale versions return actual HTTP errors`() {
        token(true)
        `when`(repository.nextId("ru")).thenReturn(1000000L)
        `when`(repository.insert(anyValue<LedgerCatalogPackage>())).thenAnswer { it.getArgument<LedgerCatalogPackage>(0).copy(version = 0) }
        mvc.perform(
            post(
                "/v1/admin/ledger/packages",
            ).header("Authorization", "Bearer synthetic").contentType(MediaType.APPLICATION_JSON).content(body),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.content_id").value(1000000)).andExpect(jsonPath("$.data.draws").value(0.6))
        for (bad in listOf(
            body.replace("\"points\":60", "\"points\":-1"),
            body.replace("\"draws\":0.6", "\"draws\":\"0.6\""),
            body.replace("\"name\":\"礼包\"", "\"name\":123"),
            body.replace("\"game\"", "\"id\":99,\"game\""),
        )) {
            mvc.perform(
                post(
                    "/v1/admin/ledger/packages",
                ).header("Authorization", "Bearer synthetic").contentType(MediaType.APPLICATION_JSON).content(bad),
            ).andExpect(status().isUnprocessableEntity)
        }
        `when`(
            repository.findPackage("ru:1"),
        ).thenReturn(LedgerCatalogPackage("ru:1", "ru", 1, "旧", 1, 0.6, 1, priceCny = 6.0, category = "其他", version = 2))
        mvc.perform(
            put(
                "/v1/admin/ledger/packages/ru:1",
            ).header(
                "Authorization",
                "Bearer synthetic",
            ).contentType(MediaType.APPLICATION_JSON).content(body.replace("\"game\"", "\"expected_version\":1,\"game\"")),
        )
            .andExpect(status().isConflict).andExpect(jsonPath("$.message").value("数据已被其他管理员修改，请返回列表刷新后重试"))
        verify(repository, times(1)).insert(anyValue<LedgerCatalogPackage>())
        verify(audit, times(1)).record(anyValue())
    }
}
