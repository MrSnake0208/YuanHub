package com.lhs.share.hub.service.achievement

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.achievement.AchievementController
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.controller.achievement.response.AchievementArchiveResponse
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.ByteArrayHttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class AchievementContractTest {
    private val mapper = achievementMapper()
    private val service = mockk<AchievementService>()
    private val catalog = mockk<AchievementCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mvc: MockMvc
    private val path = "/v1/achievements"

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "jwt-owner"
        mvc = MockMvcBuilders.standaloneSetup(AchievementController(service, catalog, helper, mapper))
            .setControllerAdvice(InventoryExceptionHandler())
            .setMessageConverters(ByteArrayHttpMessageConverter(), MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `public catalog requires no actor and private archive has no store and snake case`() {
        every { catalog.catalog("代号鸢") } returns fixtureCatalog()
        every { service.archive("jwt-owner", "a") } returns AchievementArchiveResponse("a", "代号鸢", 0, emptyList())
        mvc.perform(get("$path/catalog").param("game", "代号鸢")).andExpect(status().isOk)
        verify(exactly = 0) { helper.requireUserId() }
        mvc.perform(get("$path/archive").param("account_id", "a")).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("a")).andExpect(jsonPath("$.data.user_id").doesNotExist())
        assertFalse(BetaAccessPolicy.requiresBeta("GET", "$path/catalog"))
        for (route in listOf("/archive", "/export", "/batch", "/records/{id}", "/import/preview", "/import/confirm")) {
            assertTrue(BetaAccessPolicy.requiresBeta("POST", path + route))
        }
    }

    @Test
    fun `strict updates reject forged ownership sources coercions dates and bounds before service`() {
        val body = """{"account_id":"a","expected_revision":0,"status":"completed"}"""
        val invalid = listOf(
            body.replace("\"completed\"", "true"), body.replace("\"completed\"", "\"unknown\""),
            body.replace(
                "\"expected_revision\":0",
                "\"expected_revision\":1.5",
            ),
            body.replace("\"expected_revision\":0", "\"expected_revision\":-1"),
            body.dropLast(1) + ",\"user_id\":\"other\"}", body.dropLast(1) + ",\"game\":\"如鸢\"}",
            body.dropLast(1) + ",\"source\":\"external\"}", body.dropLast(1) + ",\"favorite\":1}",
            body.dropLast(1) + ",\"note\":null}", body.dropLast(1) + ",\"note\":\"${"文".repeat(501)}\"}",
            body.dropLast(1) + ",\"progress\":-1}", body.dropLast(1) + ",\"progress\":1.5}",
            body.dropLast(1) + ",\"progress\":1.0000000000000001}", body.dropLast(1) + ",\"progress\":\"10\"}",
            body.dropLast(1) + ",\"progress\":1e999}", body.dropLast(1) + ",\"completed_on\":\"2026-02-30\"}",
            body.dropLast(1) + ",\"completed_on\":\"0000-01-01\"}",
        )
        invalid.forEach {
            mvc.perform(
                patch("$path/records/yh_fixture_dhy_1").contentType(MediaType.APPLICATION_JSON).content(it),
            ).andExpect(status().isUnprocessableEntity)
        }
        mvc.perform(
            post(
                "$path/batch",
            ).contentType(MediaType.APPLICATION_JSON).content("""{"account_id":"a","expected_revision":0,"records":[]}"""),
        )
            .andExpect(status().isUnprocessableEntity)
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `single patch dispatches only provided fields to authenticated owner`() {
        every { service.update("jwt-owner", "a", 2, any()) } returns AchievementArchiveResponse("a", "代号鸢", 3, emptyList())
        mvc.perform(
            patch("$path/records/yh_fixture_dhy_1").contentType(MediaType.APPLICATION_JSON)
                .content("""{"account_id":"a","expected_revision":2,"note":"保留纯文本 <b>内容</b>"}"""),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(3))
        verify { service.update("jwt-owner", "a", 2, match { it.single().fields == setOf("note") }) }
    }

    @Test
    fun `import request rejects malformed JSON unsupported envelope and oversized raw input`() {
        mvc.perform(post("$path/import/preview").contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isBadRequest).andExpect(jsonPath("$.error.code").value("invalid_json"))
        mvc.perform(
            post("$path/import/preview").contentType(MediaType.APPLICATION_JSON).content(
                " ".repeat(
                    AchievementRequestDecoder.MAX_BYTES + 4097,
                ),
            ),
        )
            .andExpect(status().isPayloadTooLarge)
        mvc.perform(
            post(
                "$path/import/preview",
            ).contentType(MediaType.APPLICATION_JSON).content("""{"account_id":"a","document":{},"skip_unknown":1}"""),
        )
            .andExpect(status().isUnprocessableEntity)
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `real production catalogs are explicitly empty and no fixtures are seeded`() {
        val repository = mockk<com.lhs.share.hub.repository.AchievementCatalogRepository>()
        every { repository.published(any()) } returns null
        every { repository.find(any()) } returns null
        every { repository.insert(any()) } answers { firstArg() }
        val real = AchievementCatalogService(mapper, repository)
        for (game in listOf("代号鸢", "如鸢")) {
            val response = real.catalog(game)
            assertEquals("empty", response.dataStatus)
            assertTrue(response.entries.isEmpty())
        }
        assertThrows(InventoryApiException::class.java) { real.catalog("unknown") }
    }
}
