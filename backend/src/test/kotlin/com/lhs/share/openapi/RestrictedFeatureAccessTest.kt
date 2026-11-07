package com.lhs.share.openapi

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.BetaAccessInterceptor
import com.lhs.share.config.security.RestrictedFeatureInterceptor
import com.lhs.share.handler.BetaExceptionHandler
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.achievement.AchievementCatalogAdminController
import com.lhs.share.hub.controller.achievement.AchievementController
import com.lhs.share.hub.controller.achievement.AchievementSuggestionController
import com.lhs.share.hub.controller.achievement.response.AchievementArchiveResponse
import com.lhs.share.hub.controller.achievement.response.AchievementCatalogResponse
import com.lhs.share.hub.controller.achievement.response.AchievementSuggestionOptions
import com.lhs.share.hub.controller.bond.BondCatalogAdminController
import com.lhs.share.hub.controller.bond.BondController
import com.lhs.share.hub.controller.operator.OperatorPanelController
import com.lhs.share.hub.controller.operator.OperatorRelationshipController
import com.lhs.share.hub.controller.operator.OperatorReserveWorkspaceController
import com.lhs.share.hub.controller.operator.response.OperatorPanelResponse
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.service.achievement.AchievementCatalogService
import com.lhs.share.hub.service.achievement.AchievementService
import com.lhs.share.hub.service.achievement.AchievementSuggestionService
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.beta.BetaApiException
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.bond.BondArchiveResponse
import com.lhs.share.hub.service.bond.BondCatalogService
import com.lhs.share.hub.service.bond.BondService
import com.lhs.share.hub.service.bond.BondSummary
import com.lhs.share.hub.service.operator.OperatorPanelService
import com.lhs.share.hub.service.operator.OperatorRelationshipService
import com.lhs.share.hub.service.operator.OperatorReserveWorkspaceService
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.ByteArrayHttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class RestrictedFeatureAccessTest {
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val beta = mockk<BetaService>(relaxed = true)
    private val achievements = mockk<AchievementService>()
    private val achievementCatalog = mockk<AchievementCatalogService>()
    private val achievementSuggestions = mockk<AchievementSuggestionService>()
    private val bonds = mockk<BondService>()
    private val bondCatalog = mockk<BondCatalogService>()
    private val panels = mockk<OperatorPanelService>()
    private val relationships = mockk<OperatorRelationshipService>()
    private val reserves = mockk<OperatorReserveWorkspaceService>()
    private val mapper = jacksonObjectMapper()
    private val mvc = MockMvcBuilders.standaloneSetup(
        AchievementController(achievements, achievementCatalog, helper, mapper),
        AchievementSuggestionController(achievementSuggestions, helper, mapper),
        BondController(bonds, bondCatalog, helper, mapper),
        AchievementCatalogAdminController(mockk(), authorization, helper, mapper),
        BondCatalogAdminController(bondCatalog, authorization, helper, mapper),
        OperatorPanelController(panels, helper),
        OperatorRelationshipController(relationships, helper),
        OperatorReserveWorkspaceController(reserves, helper),
    ).addInterceptors(RestrictedFeatureInterceptor(authorization, helper), BetaAccessInterceptor(beta, helper))
        .setControllerAdvice(BetaExceptionHandler(), InventoryExceptionHandler(), OperatorExceptionHandler())
        .setMessageConverters(ByteArrayHttpMessageConverter(), MappingJackson2HttpMessageConverter(mapper)).build()

    @Test
    fun `anonymous users and ungranted users of restricted features cannot read write import or calculate`() {
        for (user in listOf(null, "ordinary", "beta-member", "historical-usage-role")) {
            every { helper.obtainUserId() } returns user
            every { authorization.hasPermission(any(), any()) } returns false
            val expected = if (user == null) 401 else 403
            val roots = if (user == null) listOf("/v1/achievements", "/v1/bonds") else emptyList()
            for (root in roots) {
                for (suffix in listOf("/catalog?game=如鸢", "/archive?account_id=a", "/export?account_id=a")) {
                    mvc.perform(get(root + suffix)).andExpect(status().`is`(expected))
                }
                for (suffix in listOf("/batch", "/import/preview", "/import/confirm")) {
                    mvc.perform(post(root + suffix).contentType(MediaType.APPLICATION_JSON).content("{}"))
                        .andExpect(status().`is`(expected))
                }
                mvc.perform(patch("$root/records/id").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().`is`(expected))
            }
            for (path in listOf("/v1/admin/achievement-catalogs", "/v1/admin/bonds/catalog")) {
                mvc.perform(get(path).param("game", "如鸢")).andExpect(status().`is`(expected))
            }
            for (suffix in listOf("preview", "current")) {
                mvc.perform(post("/v1/operator/panel/$suffix").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().`is`(expected))
            }
            mvc.perform(get("/v1/operator/relationships/catalog").param("game", "如鸢"))
                .andExpect(status().`is`(expected))
            mvc.perform(get("/v1/operator/relationships").param("account_id", "a"))
                .andExpect(status().`is`(expected))
            mvc.perform(get("/v1/operator/reserve-workspace").param("account_id", "a"))
                .andExpect(status().`is`(expected))
            mvc.perform(
                put("/v1/operator/reserve-workspace").param("account_id", "a").contentType(MediaType.APPLICATION_JSON).content("{}"),
            )
                .andExpect(status().`is`(expected))
            mvc.perform(
                patch("/v1/operator/relationships").param("account_id", "a")
                    .contentType(MediaType.APPLICATION_JSON).content("{}"),
            )
                .andExpect(status().`is`(expected))
        }
        verify { listOf(achievements, achievementCatalog, bonds, bondCatalog, panels, relationships, reserves) wasNot Called }
    }

    @Test
    fun `grants are independent and revocation rejects the next request`() {
        every { helper.obtainUserId() } returns "member"
        every { helper.requireUserId() } returns "member"
        every { authorization.hasPermission("member", any()) } returns false
        every { authorization.hasPermission("member", AdminPermission.ARCHIVE_ACCESS) } returns true
        every { achievementCatalog.catalog("如鸢") } returns
            AchievementCatalogResponse("v", "如鸢", "ready", "fixture", emptyList(), emptyList())
        every { bondCatalog.catalog("如鸢") } returns BondPublication("v", "如鸢")
        mvc.perform(get("/v1/achievements/catalog").param("game", "如鸢")).andExpect(status().isOk)
        mvc.perform(get("/v1/bonds/catalog").param("game", "如鸢")).andExpect(status().isOk)
        mvc.perform(get("/v1/admin/bonds/catalog").param("game", "如鸢")).andExpect(status().isForbidden)
        mvc.perform(post("/v1/operator/panel/preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden)
        every { authorization.hasPermission("member", AdminPermission.ARCHIVE_ACCESS) } returns false
        every { authorization.hasPermission("member", AdminPermission.OPERATOR_PANEL_USE) } returns true
        every { panels.preview("member", any()) } returns OperatorPanelResponse("calculated", 10, 20)
        mvc.perform(post("/v1/operator/panel/preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk)
        mvc.perform(get("/v1/achievements/catalog").param("game", "如鸢")).andExpect(status().isOk)
        mvc.perform(get("/v1/bonds/catalog").param("game", "如鸢")).andExpect(status().isOk)
        every { authorization.hasPermission("member", AdminPermission.OPERATOR_RELATIONSHIP_USE) } returns true
        every { relationships.catalog("如鸢") } returns emptyMap()
        mvc.perform(get("/v1/operator/relationships/catalog").param("game", "如鸢")).andExpect(status().isOk)
        every { authorization.hasPermission("member", AdminPermission.OPERATOR_RELATIONSHIP_USE) } returns false
        mvc.perform(get("/v1/operator/relationships/catalog").param("game", "如鸢")).andExpect(status().isForbidden)
        every { authorization.hasPermission("member", AdminPermission.OPERATOR_RESERVE_USE) } returns true
        every { reserves.workspace("member", "a") } returns mapper.createObjectNode().put("revision", 0)
        mvc.perform(get("/v1/operator/reserve-workspace").param("account_id", "a")).andExpect(status().isOk)
        every { authorization.hasPermission("member", AdminPermission.OPERATOR_RESERVE_USE) } returns false
        mvc.perform(get("/v1/operator/reserve-workspace").param("account_id", "a")).andExpect(status().isForbidden)
    }

    @Test
    fun `ordinary beta members can read and save bonds without archive grants but cannot manage catalogs`() {
        every { helper.obtainUserId() } returns "beta-member"
        every { helper.requireUserId() } returns "beta-member"
        every { authorization.hasPermission("beta-member", any()) } returns false
        every { bondCatalog.catalog("如鸢") } returns BondPublication("v", "如鸢")
        val archive = BondArchiveResponse("a", "如鸢", 0, "v", emptyList(), BondSummary(0, 0, 0))
        every { bonds.archive("beta-member", "a") } returns archive
        every { bonds.update("beta-member", "a", 0, "v", listOf("fixture" to true)) } returns archive.copy(revision = 1)
        mvc.perform(get("/v1/bonds/catalog").param("game", "如鸢")).andExpect(status().isOk)
        mvc.perform(get("/v1/bonds/archive").param("account_id", "a")).andExpect(status().isOk)
        mvc.perform(
            post("/v1/bonds/batch").contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"account_id":"a","expected_revision":0,"catalog_version":"v","records":[{"bond_id":"fixture","triggered":true}]}""",
                ),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(1))
        verify(exactly = 3) { beta.requireAccess("beta-member") }
        verify { authorization wasNot Called }
        verify { bonds.update("beta-member", "a", 0, "v", listOf("fixture" to true)) }
        mvc.perform(get("/v1/admin/bonds/catalog").param("game", "如鸢")).andExpect(status().isForbidden)
    }

    @Test
    fun `bond catalog reads writes and backups fail closed when beta is missing revoked or unavailable`() {
        every { helper.obtainUserId() } returns "member"
        every { helper.requireUserId() } returns "member"
        val errors = listOf(
            BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "join first"),
            BetaApiException(HttpStatus.FORBIDDEN, "beta_service_closed", "maintenance"),
            BetaApiException(HttpStatus.SERVICE_UNAVAILABLE, "beta_temporarily_unavailable", "retry"),
        )
        for (error in errors) {
            every { beta.requireAccess("member") } throws error
            val requests = listOf(
                get("/v1/bonds/catalog").param("game", "如鸢"),
                get("/v1/bonds/archive").param("account_id", "a"),
                get("/v1/bonds/export").param("account_id", "a"),
                patch("/v1/bonds/records/id"),
                post("/v1/bonds/batch"),
                post("/v1/bonds/import/preview"),
                post("/v1/bonds/import/confirm"),
            )
            for (request in requests) {
                mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().`is`(error.status.value()))
                    .andExpect(jsonPath("$.error.code").value(error.code))
                    .andExpect(header().string("Cache-Control", "no-store"))
            }
        }
        verify { listOf(bonds, bondCatalog, authorization) wasNot Called }
    }

    @Test
    fun `ordinary users can read and save own achievements without archive grants but cannot manage catalogs`() {
        every { helper.obtainUserId() } returns "ordinary"
        every { helper.requireUserId() } returns "ordinary"
        every { authorization.hasPermission("ordinary", any()) } returns false
        every { achievementCatalog.catalog("如鸢") } returns
            AchievementCatalogResponse("v", "如鸢", "ready", "fixture", emptyList(), emptyList())
        every { achievements.archive("ordinary", "a") } returns AchievementArchiveResponse("a", "如鸢", 0, emptyList())
        every { achievements.update("ordinary", "a", 0, any()) } returns AchievementArchiveResponse("a", "如鸢", 1, emptyList())
        mvc.perform(get("/v1/achievements/catalog").param("game", "如鸢")).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
        mvc.perform(get("/v1/achievements/archive").param("account_id", "a")).andExpect(status().isOk)
        mvc.perform(
            patch("/v1/achievements/records/yh_fixture_1").contentType(MediaType.APPLICATION_JSON)
                .content("""{"account_id":"a","expected_revision":0,"status":"completed"}"""),
        ).andExpect(status().isOk)
        verify { achievements.update("ordinary", "a", 0, any()) }
        verify(exactly = 0) { authorization.hasPermission("ordinary", AdminPermission.ARCHIVE_ACCESS) }
        mvc.perform(get("/v1/admin/achievement-catalogs").param("game", "如鸢")).andExpect(status().isForbidden)
        mvc.perform(
            post("/v1/admin/achievement-catalogs/publish").param("game", "如鸢")
                .contentType(MediaType.APPLICATION_JSON).content("{}"),
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `achievement suggestion options allow ordinary users but still reject anonymous requests`() {
        every { helper.obtainUserId() } returns "ordinary"
        every { helper.requireUserId() } returns "ordinary"
        every { achievementSuggestions.options("如鸢") } returns AchievementSuggestionOptions(
            AchievementCatalogResponse("v", "如鸢", "ready", "fixture", emptyList(), emptyList()),
            emptyList(),
        )
        mvc.perform(get("/v1/achievements/suggestions/options").param("game", "如鸢")).andExpect(status().isOk)
        verify { authorization wasNot Called }
        every { helper.obtainUserId() } returns null
        mvc.perform(get("/v1/achievements/suggestions/options").param("game", "如鸢")).andExpect(status().isUnauthorized)
        verify(exactly = 1) { achievementSuggestions.options("如鸢") }
    }
}
