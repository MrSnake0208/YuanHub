package com.lhs.share.hub.service.beta

import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.controller.beta.BetaMeResponse
import com.lhs.share.hub.controller.beta.BetaStatusResponse
import com.lhs.share.hub.repository.entity.BetaMode
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.recruitment.RecruitmentAccessService
import com.lhs.share.openapi.OpenApiTokenService
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant

/** Exercises the actual JWT filter, MVC gate and exception advice without creating any real accounts. */
@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(
    properties = [
        "spring.data.mongodb.uri=mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
        "spring.data.mongodb.auto-index-creation=false",
    ],
)
@AutoConfigureMockMvc
class BetaSecurityTest {
    @MockitoBean(answers = org.mockito.Answers.RETURNS_DEEP_STUBS)
    lateinit var redis: org.springframework.data.redis.core.StringRedisTemplate

    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var jwt: JwtService

    @MockitoBean lateinit var betaService: BetaService

    @MockitoBean lateinit var tokens: OpenApiTokenService

    @MockitoBean lateinit var recruitmentAccess: RecruitmentAccessService

    @MockitoBean lateinit var accounts: SubAccountService

    @Test
    fun `only status is anonymous and response uses existing snake case envelope without caching`() {
        `when`(betaService.status()).thenReturn(
            BetaStatusResponse(
                campaignId = "test", accessMode = BetaMode.CLOSED, admissionsPaused = true, pauseReason = null,
                startsAt = Instant.EPOCH, reservedUntil = Instant.EPOCH.plusSeconds(72 * 3600), serverNow = Instant.now(),
                announcementTimezone = "Asia/Shanghai", snapshotAt = null, rulesVersion = "v1", initialCapacity = 100,
                capacity = 100, reservedInitial = 25, reservedRemaining = 0, grantedCount = 0,
                publicRemaining = 100, publicState = "CLOSED",
            ),
        )
        mvc.perform(get("/v1/beta/status"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(jsonPath("$.status_code").value(200))
            .andExpect(jsonPath("$.data.access_mode").value("CLOSED"))
            .andExpect(jsonPath("$.data.reserved_initial").value(25))
        mvc.perform(get("/v1/beta/me")).andExpect(status().isUnauthorized)
        mvc.perform(post("/v1/beta/test-reset")).andExpect(status().isUnauthorized)
        mvc.perform(get("/v1/accounts")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `valid JWT without beta still gates inventory while token listing remains possible`() {
        val token = jwt.issueAuthToken("web-fixture", null, emptyList()).value
        doThrow(BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("web-fixture")
        mvc.perform(get("/v1/inventory/current").param("account_id", "main").header("Authorization", "Bearer $token"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("beta_access_required"))
        `when`(tokens.list("web-fixture")).thenReturn(emptyList())
        mvc.perform(get("/user/open-api/tokens").header("Authorization", "Bearer $token"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(200))
    }

    @Test
    fun `legacy recruitment grants cannot bypass beta on shared account endpoints`() {
        val token = jwt.issueAuthToken("recruitment-fixture", null, emptyList()).value
        doThrow(BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"))
            .`when`(betaService).requireAccess("recruitment-fixture")
        `when`(recruitmentAccess.canAccess("recruitment-fixture")).thenReturn(true)
        `when`(accounts.list("recruitment-fixture")).thenReturn(emptyList<SubAccountResponse>())

        mvc.perform(get("/v1/accounts").header("Authorization", "Bearer $token"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("beta_access_required"))
        org.mockito.Mockito.verifyNoInteractions(accounts)
    }

    @Test
    fun `calendar and recruitment private requests fail closed for missing beta maintenance and lookup failures`() {
        val token = jwt.issueAuthToken("beta-boundary", null, emptyList()).value
        val errors = listOf(
            BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"),
            BetaApiException(HttpStatus.FORBIDDEN, "beta_service_closed", "maintenance"),
            BetaApiException(HttpStatus.SERVICE_UNAVAILABLE, "beta_temporarily_unavailable", "retry"),
        )
        errors.forEach { error ->
            doThrow(error).`when`(betaService).requireAccess("beta-boundary")
            listOf(
                get("/v1/accounts"),
                get("/v1/activity-calendar"),
                get("/v1/activity-calendar/suggestions/mine"),
                post("/v1/activity-calendar/suggestions"),
                get("/v1/activity-calendar/subscriptions/summary").param("account_id", "a"),
                put("/v1/activity-calendar/subscriptions/evt_test"),
                put("/v1/activity-calendar/subscriptions/evt_test/progress"),
                get("/v1/activity-calendar/private-items").param("account_id", "a").param("from", "2026-10-01").param("to", "2026-10-31"),
                post("/v1/activity-calendar/private-items"),
                put("/v1/activity-calendar/private-items/pci_test"),
                delete("/v1/activity-calendar/private-items/pci_test").param("account_id", "a").param("expected_version", "0"),
                get("/v1/recruitment/archive").param("account_id", "a"),
                get("/v1/recruitment/events").param("account_id", "a"),
                post("/v1/recruitment/commands"),
                get("/v1/recruitment/export").param("account_id", "a"),
                post("/v1/recruitment/import/preview"),
                post("/v1/recruitment/import/commit"),
            ).forEach { request ->
                mvc.perform(request.header("Authorization", "Bearer $token").contentType("application/json").content("{}"))
                    .andExpect(status().`is`(error.status.value()))
                    .andExpect(jsonPath("$.error.code").value(error.code))
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            }
        }
        org.mockito.Mockito.verifyNoInteractions(accounts, recruitmentAccess)
    }

    @Test
    fun `lookup failure stays503 rather than pretending quota is full or deleting authentication`() {
        val token = jwt.issueAuthToken("web-fixture", null, emptyList()).value
        doThrow(BetaApiException(HttpStatus.SERVICE_UNAVAILABLE, "beta_temporarily_unavailable", "retry"))
            .`when`(betaService).requireAccess("web-fixture")
        mvc.perform(get("/v1/inventory/current").param("account_id", "main").header("Authorization", "Bearer $token"))
            .andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("$.error.code").value("beta_temporarily_unavailable"))
    }

    @Test
    fun `self-service local reset requires a JWT and reports the tester flag the service returns`() {
        val token = jwt.issueAuthToken("tester", null, emptyList()).value
        `when`(betaService.resetLocalSelf("tester")).thenReturn(
            BetaMeResponse(
                campaign = BetaStatusResponse(
                    campaignId = "yuanhub-beta-local", accessMode = BetaMode.BETA, admissionsPaused = false,
                    pauseReason = null, startsAt = Instant.EPOCH, reservedUntil = Instant.EPOCH.plusSeconds(72 * 3600),
                    serverNow = Instant.now(), announcementTimezone = "Asia/Shanghai", snapshotAt = Instant.EPOCH,
                    rulesVersion = "v1", initialCapacity = 100, capacity = 100, reservedInitial = 25,
                    reservedRemaining = 25, grantedCount = 0, publicRemaining = 75, publicState = "OPEN_REGISTRATION",
                    localTestMode = true,
                ),
                campaignId = "yuanhub-beta-local", accessMode = BetaMode.BETA, serverNow = Instant.now(),
                enrollmentStatus = "NOT_JOINED", shareSnapshotEligible = true, slotPool = null, joinedAt = null,
                grantedAt = null, waitReason = null, nextAction = "JOIN", canUseBetaFeatures = false,
                canResetLocalTest = true,
            ),
        )
        mvc.perform(post("/v1/beta/test-reset").header("Authorization", "Bearer $token"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(jsonPath("$.data.enrollment_status").value("NOT_JOINED"))
            .andExpect(jsonPath("$.data.can_reset_local_test").value(true))
    }
}
