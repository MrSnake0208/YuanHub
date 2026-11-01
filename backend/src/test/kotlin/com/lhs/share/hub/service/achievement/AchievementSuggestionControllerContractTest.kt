package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.config.security.RestrictedFeatureInterceptor
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.achievement.AchievementSuggestionController
import com.lhs.share.hub.controller.achievement.AdminAchievementSuggestionController
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.AchievementSuggestionRepository
import com.lhs.share.hub.repository.entity.AchievementCandidate
import com.lhs.share.hub.repository.entity.AchievementSuggestion
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class AchievementSuggestionControllerContractTest {
    private val mapper = achievementMapper()
    private val helper = mockk<AuthenticationHelper>()
    private val auth = mockk<AdminAuthorizationService>()
    private val repo = mockk<AchievementSuggestionRepository>()
    private val catalogs = mockk<AchievementCatalogRepository>()
    private val service = AchievementSuggestionService(repo, catalogs, mockk(), auth, mockk<TransactionTemplate>())
    private val mvc = MockMvcBuilders.standaloneSetup(
        AchievementSuggestionController(service, helper, mapper),
        AdminAchievementSuggestionController(service, helper, mapper),
    )
        .setControllerAdvice(InventoryExceptionHandler()).addInterceptors(RestrictedFeatureInterceptor(auth, helper))
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val player = "/v1/achievements/suggestions"
    private val admin = "/v1/admin/achievement-catalogs/suggestions"

    @BeforeEach
    fun prepare() {
        every { helper.requireUserId() } returns "other"
        every { helper.obtainUserId() } returns "other"
        every { auth.hasPermission("other", AdminPermission.ARCHIVE_ACCESS) } returns true
        every { auth.hasPermission("other", AdminPermission.ACHIEVEMENT_CATALOG_WRITE) } returns false
    }

    @Test
    fun `cross user detail and calendar only reviewers cannot expose originals`() {
        every { repo.find("s1") } returns
            AchievementSuggestion(
                "s1",
                "owner",
                "key",
                Instant.EPOCH,
                AchievementCandidate("如鸢", "cat", "秘密", "条件"),
                "https://example.com/private",
                "私人备注",
            )
        mvc.perform(get("$player/s1")).andExpect(status().isNotFound)
        for (url in listOf(admin, "$admin/s1", "$admin/options?game=如鸢")) mvc.perform(get(url)).andExpect(status().isForbidden)
        for (action in listOf("accept", "reject")) {
            mvc.perform(post("$admin/s1/$action").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden)
        }
        verify(exactly = 0) {
            repo.list(any(), any(), any(), any(), any())
            repo.reject(any(), any(), any(), any())
        }
    }

    @Test
    fun `ordinary users can list own suggestions while administration and anonymous requests stay protected`() {
        every { auth.hasPermission("other", AdminPermission.ARCHIVE_ACCESS) } returns false
        every { repo.list("other", null, null, 1, 20) } returns (emptyList<AchievementSuggestion>() to 0L)
        mvc.perform(get(player)).andExpect(status().isOk)
        mvc.perform(get(admin)).andExpect(status().isForbidden)
        every { helper.obtainUserId() } returns null
        mvc.perform(get(player)).andExpect(status().isUnauthorized)
        assertTrue(BetaAccessPolicy.requiresBeta("GET", player))
        assertTrue(BetaAccessPolicy.requiresBeta("POST", player))
        assertFalse(BetaAccessPolicy.requiresBeta("POST", "$admin/s1/accept"))
        verify(exactly = 1) { repo.list("other", null, null, 1, 20) }
    }

    @Test
    fun `strict candidate fields prevent id sort owner and removed metadata injection`() {
        val body = mapper.readTree(
            """{"client_request_id":"key","candidate":{"game":"如鸢","category_id":"cat","name":"新条目","condition":"条件"},"source_url":"https://example.com"}""",
        ) as ObjectNode
        for ((key, raw) in listOf(
            "achievement_id" to "\"yh_existing\"",
            "sort" to "0",
            "sources" to "[]",
            "target" to "1.5",
            "is_hidden" to "\"true\"",
        )) {
            val modified = body.deepCopy()
            (modified["candidate"] as ObjectNode).set<ObjectNode>(key, mapper.readTree(raw))
            mvc.perform(
                post(player).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(modified)),
            ).andExpect(status().isUnprocessableEntity)
        }
        body.put("submitter_id", "victim")
        mvc.perform(
            post(player).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body)),
        ).andExpect(status().isUnprocessableEntity)
        verify { repo wasNot io.mockk.Called }
    }

    @Test
    fun `empty owner lists have snake case pagination and no store cache policy`() {
        every { repo.list("other", null, null, 1, 20) } returns (emptyList<AchievementSuggestion>() to 0L)
        mvc.perform(get(player)).andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.page_size").value(20)).andExpect(jsonPath("$.data.total").value(0))
        verify { catalogs wasNot io.mockk.Called }
    }
}
