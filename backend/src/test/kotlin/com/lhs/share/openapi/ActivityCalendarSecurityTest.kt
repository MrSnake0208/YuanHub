package com.lhs.share.openapi

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AccessDeniedHandlerImpl
import com.lhs.share.config.security.AuthenticationEntryPointImpl
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.JwtAuthenticationTokenFilter
import com.lhs.share.config.security.SecurityConfig
import com.lhs.share.hub.controller.calendar.ActivityCalendarController
import com.lhs.share.hub.controller.calendar.ActivityCalendarSubscriptionController
import com.lhs.share.hub.controller.calendar.ActivityCalendarSuggestionController
import com.lhs.share.hub.controller.calendar.AdminActivityCalendarController
import com.lhs.share.hub.controller.calendar.AdminActivityCalendarSuggestionController
import com.lhs.share.hub.controller.calendar.CalendarPrivateItemController
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionSubmitRequest
import com.lhs.share.hub.controller.calendar.request.ActivityCalendarWriteRequest
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarAdminResponse
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarResponse
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionPage
import com.lhs.share.hub.controller.calendar.response.ActivityCalendarSuggestionResponse
import com.lhs.share.hub.controller.calendar.response.CalendarSubscriptionSummaryResponse
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionOriginal
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import com.lhs.share.hub.service.calendar.ActivityCalendarSubscriptionService
import com.lhs.share.hub.service.calendar.ActivityCalendarSuggestionService
import com.lhs.share.hub.service.calendar.CalendarPrivateItemService
import com.lhs.share.service.DataTransferService
import com.lhs.share.service.jwt.JwtAuthToken
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.reset
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant
import java.time.LocalDate

@ActiveProfiles("test")
@WebMvcTest(
    controllers = [
        CalendarPrivateItemController::class,
        ActivityCalendarSubscriptionController::class,
        ActivityCalendarController::class, AdminActivityCalendarController::class,
        ActivityCalendarSuggestionController::class, AdminActivityCalendarSuggestionController::class,
    ],
)
@EnableConfigurationProperties(ShareProperties::class)
@Import(
    SecurityConfig::class,
    JwtAuthenticationTokenFilter::class,
    AuthenticationHelper::class,
    AuthenticationEntryPointImpl::class,
    AccessDeniedHandlerImpl::class,
    DataTransferService::class,
    com.lhs.share.config.BetaWebMvcConfiguration::class,
    com.lhs.share.config.security.BetaAccessInterceptor::class,
)
class ActivityCalendarSecurityTest {
    @Autowired lateinit var mvc: MockMvc

    @MockitoBean lateinit var privateItems: CalendarPrivateItemService

    @MockitoBean lateinit var subscriptions: ActivityCalendarSubscriptionService

    @MockitoBean lateinit var importer: com.lhs.share.hub.service.calendar.ActivityCalendarImportService

    @MockitoBean lateinit var classificationExchange: com.lhs.share.hub.service.calendar.ActivityCalendarClassificationExchangeService

    @MockitoBean lateinit var service: ActivityCalendarService

    @MockitoBean lateinit var suggestions: ActivityCalendarSuggestionService

    @MockitoBean lateinit var authorization: AdminAuthorizationService

    @MockitoBean lateinit var betaService: BetaService

    @MockitoBean lateinit var recruitmentAccessService: com.lhs.share.hub.service.recruitment.RecruitmentAccessService

    @MockitoBean lateinit var jwtService: JwtService

    @MockitoBean lateinit var stringRedisTemplate: StringRedisTemplate

    @Test
    fun `real security chain rejects anonymous calendar reads management and suggestions`() {
        mvc.perform(get("/v1/activity-calendar")).andExpect(status().isUnauthorized)
        mvc.perform(get("/v1/admin/activity-calendar")).andExpect(status().isUnauthorized)
        mvc.perform(get("/v1/admin/activity-calendar/export")).andExpect(status().isUnauthorized)
        listOf("preview", "commit").forEach {
            mvc.perform(post("/v1/admin/activity-calendar/classification-import/$it").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized)
        }
        mvc.perform(post("/v1/admin/activity-calendar")).andExpect(status().isUnauthorized)
        mvc.perform(
            post("/v1/admin/activity-calendar/import/preview").contentType(MediaType.APPLICATION_JSON).content("{}"),
        ).andExpect(status().isUnauthorized)
        mvc.perform(
            post("/v1/admin/activity-calendar/import/commit").contentType(MediaType.APPLICATION_JSON).content("{}"),
        ).andExpect(status().isUnauthorized)
        mvc.perform(put("/v1/admin/activity-calendar/evt_test")).andExpect(status().isUnauthorized)
        mvc.perform(post("/v1/activity-calendar")).andExpect(status().isUnauthorized)
        verifyNoInteractions(service, importer, classificationExchange, authorization, stringRedisTemplate)
    }

    @Test
    fun `beta eligibility replaces admin testing while management still requires calendar write permission`() {
        val now = Instant.now()
        val token = JwtAuthToken("tester", "testing-token", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("testing-token")).thenReturn(token)
        doThrow(com.lhs.share.hub.service.beta.BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("tester")
        mvc.perform(get("/v1/activity-calendar").header("Authorization", "Bearer testing-token"))
            .andExpect(status().isForbidden)
        verifyNoInteractions(service, importer)
        reset(betaService)
        `when`(service.publicItems(null, null, null, null)).thenReturn(ActivityCalendarResponse(emptyList()))
        mvc.perform(get("/v1/activity-calendar").header("Authorization", "Bearer testing-token"))
            .andExpect(status().isOk)
        `when`(authorization.hasPermission("tester", AdminPermission.ACTIVITY_CALENDAR_WRITE)).thenReturn(false)
        mvc.perform(get("/v1/admin/activity-calendar").header("Authorization", "Bearer testing-token"))
            .andExpect(status().isForbidden)
        verify(betaService, org.mockito.Mockito.atLeastOnce()).requireAccess("tester")
        verifyNoInteractions(stringRedisTemplate)
    }

    @Test
    fun `authenticated caller still needs calendar permission and editor can read management`() {
        val now = Instant.now()
        val token = JwtAuthToken("editor", "synthetic", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("synthetic")).thenReturn(token)
        `when`(authorization.hasPermission("editor", AdminPermission.ACTIVITY_CALENDAR_WRITE)).thenReturn(false)
        val body = """{"game":"如鸢","title":"活动","category":"ACTIVITY","start_date":"2026-10-03","end_date":"2026-10-10"}"""
        listOf(
            get("/v1/admin/activity-calendar"),
            get("/v1/admin/activity-calendar/export"),
            post("/v1/admin/activity-calendar/classification-import/preview"),
            post("/v1/admin/activity-calendar/classification-import/commit"),
            post("/v1/admin/activity-calendar"),
            post("/v1/admin/activity-calendar/import/preview"),
            post("/v1/admin/activity-calendar/import/commit"),
            put("/v1/admin/activity-calendar/evt_test"),
        ).forEach {
            mvc.perform(it.header("Authorization", "Bearer synthetic").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden)
        }
        verifyNoInteractions(service, importer, classificationExchange)
        `when`(authorization.hasPermission("editor", AdminPermission.ACTIVITY_CALENDAR_WRITE)).thenReturn(true)
        `when`(service.adminItems(null, null, null, null, null, null)).thenReturn(ActivityCalendarAdminResponse(emptyList()))
        mvc.perform(get("/v1/admin/activity-calendar").header("Authorization", "Bearer synthetic")).andExpect(status().isOk)
        verifyNoInteractions(stringRedisTemplate)
    }

    @Test
    fun `suggestion methods require JWT and beta while calendar write permission remains independent`() {
        val path = "/v1/activity-calendar/suggestions"
        val admin = "/v1/admin/activity-calendar/suggestions"
        listOf(
            post(path),
            get("$path/mine"),
            get("$path/sug_one"),
            get(admin),
            post("$admin/sug_one/accept"),
            post("$admin/sug_one/reject"),
        ).forEach {
            mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized)
        }
        verifyNoInteractions(suggestions, authorization)
        val now = Instant.now()
        val token = JwtAuthToken("ordinary", "suggestion-token", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("suggestion-token")).thenReturn(token)
        `when`(suggestions.mine("ordinary", null, 1, 20)).thenReturn(ActivityCalendarSuggestionPage(emptyList(), 0, 1, 20))
        doThrow(com.lhs.share.hub.service.beta.BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("ordinary")
        listOf(get("$path/mine"), get("$path/sug_one")).forEach {
            mvc.perform(it.header("Authorization", "Bearer suggestion-token")).andExpect(status().isForbidden)
        }
        verifyNoInteractions(suggestions)
        reset(betaService)
        mvc.perform(get("$path/mine").header("Authorization", "Bearer suggestion-token")).andExpect(status().isOk)
        val day = LocalDate.parse("2026-10-03")
        val event =
            ActivityCalendarWriteRequest("如鸢", "活动", ActivityCalendarCategory.ACTIVITY, day, day, sourceUrl = "https://example.com/source")
        val request = ActivityCalendarSuggestionSubmitRequest(event, null, "request-one")
        val response = ActivityCalendarSuggestionResponse(
            "sug_one", "ordinary", now,
            ActivityCalendarSuggestionOriginal("如鸢", "活动", ActivityCalendarCategory.ACTIVITY, day, day, sourceUrl = event.sourceUrl!!),
            null, ActivityCalendarSuggestionStatus.PENDING, 0, null, null, null, null, null, null,
        )
        `when`(suggestions.submit("ordinary", request)).thenReturn(response)
        val body = """
            {"game":"如鸢","title":"活动","category":"ACTIVITY",
            "start_date":"2026-10-03","end_date":"2026-10-03","source_url":"https://example.com/source",
            "client_request_id":"request-one"}
        """.trimIndent()
        doThrow(com.lhs.share.hub.service.beta.BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("ordinary")
        mvc.perform(post(path).header("Authorization", "Bearer suggestion-token").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden)
        reset(betaService)
        mvc.perform(post(path).header("Authorization", "Bearer suggestion-token").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk)
        verifyNoInteractions(stringRedisTemplate)
        `when`(authorization.hasPermission("ordinary", AdminPermission.ACTIVITY_CALENDAR_WRITE)).thenReturn(false)
        listOf(get(admin), post("$admin/sug_one/accept"), post("$admin/sug_one/reject")).forEach {
            mvc.perform(it.header("Authorization", "Bearer suggestion-token").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden)
        }
    }

    @Test
    fun `subscription paths require real JWT and beta without calendar write permission`() {
        val path = "/v1/activity-calendar/subscriptions"
        listOf(
            get(path).param("account_id", "a"),
            get("$path/summary").param("account_id", "a"),
            get("$path/event").param("account_id", "a"),
            put("$path/event"),
            put("$path/event/progress"),
            put("$path/event/completion"),
        ).forEach {
            mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized)
        }
        verifyNoInteractions(subscriptions)
        val now = Instant.now()
        val token = JwtAuthToken("owner", "subscription-token", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("subscription-token")).thenReturn(token)
        doThrow(com.lhs.share.hub.service.beta.BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("owner")
        mvc.perform(
            get("$path/summary").param("account_id", "a").header("Authorization", "Bearer subscription-token"),
        ).andExpect(status().isForbidden)
        mvc.perform(
            put("$path/event/completion").header("Authorization", "Bearer subscription-token")
                .contentType(MediaType.APPLICATION_JSON).content("""{"account_id":"a","expected_version":0,"completed":true}"""),
        ).andExpect(status().isForbidden)
        verifyNoInteractions(subscriptions)
        reset(betaService)
        `when`(subscriptions.summary("owner", "a")).thenReturn(CalendarSubscriptionSummaryResponse(emptyList(), 0, 0))
        mvc.perform(
            get("$path/summary").param("account_id", "a").header("Authorization", "Bearer subscription-token"),
        ).andExpect(status().isOk)
        verifyNoInteractions(stringRedisTemplate)
    }

    @Test
    fun `private item CRUD requires real JWT and beta before any data access`() {
        val path = "/v1/activity-calendar/private-items"
        val id = "pci_00000000-0000-0000-0000-000000000001"
        fun requests() = listOf(
            get(path).param("account_id", "a").param("from", "2026-10-01").param("to", "2026-10-31"),
            get("$path/$id").param("account_id", "a"),
            post(path),
            put("$path/$id"),
            delete("$path/$id").param("account_id", "a").param("expected_version", "0"),
        )
        val body = """{"account_id":"a","title":"私人计划","start_date":"2026-10-12","end_date":"2026-10-20","expected_version":0}"""
        requests().forEach { mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized) }
        verifyNoInteractions(privateItems)
        val now = Instant.now()
        val token = JwtAuthToken("owner", "private-token", now, now.plusSeconds(3600), now, emptyList(), ByteArray(32) { 1 })
        token.isAuthenticated = true
        `when`(jwtService.verifyAndParseAuthToken("private-token")).thenReturn(token)
        doThrow(com.lhs.share.hub.service.beta.BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("owner")
        requests().forEach {
            mvc.perform(it.header("Authorization", "Bearer private-token").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden)
        }
        verifyNoInteractions(privateItems, service, subscriptions, suggestions)
        reset(betaService)
        `when`(privateItems.list("owner", "a", LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31")))
            .thenReturn(com.lhs.share.hub.controller.calendar.response.CalendarPrivateItemsResponse(emptyList()))
        mvc.perform(requests().first().header("Authorization", "Bearer private-token")).andExpect(status().isOk)
        verifyNoInteractions(stringRedisTemplate, service, subscriptions, suggestions)
    }
}
