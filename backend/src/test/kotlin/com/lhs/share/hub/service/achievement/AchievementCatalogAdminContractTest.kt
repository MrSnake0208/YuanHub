package com.lhs.share.hub.service.achievement

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.achievement.AchievementCatalogAdminController
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.MediaType
import org.springframework.http.converter.ByteArrayHttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class AchievementCatalogAdminContractTest {
    private val mapper = achievementMapper()
    private val service = mockk<AchievementCatalogAdminService>()
    private val auth = mockk<AdminAuthorizationService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mvc = MockMvcBuilders.standaloneSetup(AchievementCatalogAdminController(service, auth, helper, mapper))
        .setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(ByteArrayHttpMessageConverter(), MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/v1/admin/achievement-catalogs"

    @Test
    fun `anonymous and ordinary players cannot read or invoke any admin action`() {
        for (user in listOf(null, "ordinary")) {
            every { helper.obtainUserId() } returns user
            if (user != null) every { auth.hasPermission(user, AdminPermission.ACHIEVEMENT_CATALOG_WRITE) } returns false
            val expected = if (user == null) 401 else 403
            mvc.perform(get(path).param("game", "代号鸢")).andExpect(status().`is`(expected))
            mvc.perform(get("$path/export").param("game", "代号鸢").param("scope", "draft")).andExpect(status().`is`(expected))
            for (action in listOf("draft", "entries", "categories", "discard", "preview", "publish", "import-preview", "import-confirm")) {
                mvc.perform(
                    post("$path/$action").param("game", "代号鸢").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expected_revision\":0}"),
                ).andExpect(status().`is`(expected))
            }
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `admin route bypasses player beta gate and strict revision rejects coercion`() {
        every { helper.obtainUserId() } returns "admin"
        every { auth.hasPermission("admin", AdminPermission.ACHIEVEMENT_CATALOG_WRITE) } returns true
        assertFalse(BetaAccessPolicy.requiresBeta("POST", "$path/publish"))
        for (revision in listOf("\"0\"", "-1", "0.5", "null", "1e30")) {
            mvc.perform(
                post("$path/publish").param("game", "代号鸢").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"expected_revision\":$revision}"),
            ).andExpect(status().isUnprocessableEntity)
        }
        verify { service wasNot io.mockk.Called }
    }

    @Test
    fun `decoder rejects coercion invalid source shapes unknown fields and null collections`() {
        val entry = fixtureCatalog().entries.first().copy(rewards = emptyList())
        val base = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(entry)
        for ((key, json) in listOf(
            "sort" to "\"1\"",
            "is_hidden" to "1",
            "aliases" to "[1]",
            "sources" to "[null]",
            "aliases" to "null",
            "extra" to "true",
        )) {
            val node = base.deepCopy().set<com.fasterxml.jackson.databind.node.ObjectNode>(key, mapper.readTree(json))
            assertThrows(InventoryApiException::class.java) { AchievementCatalogDecoder.entry(node, mapper) }
        }
    }

    @Test
    fun `existing database never reads seed and failures never create fallback empty catalog`() {
        val repository = mockk<AchievementCatalogRepository>()
        val noSeedMapper = mockk<com.fasterxml.jackson.databind.ObjectMapper>()
        val content = CatalogContent("代号鸢", coverage = "数据库目录")
        val state = com.lhs.share.hub.repository.entity.AchievementCatalog(
            "代号鸢",
            published = com.lhs.share.hub.repository.entity.CatalogPublication("db-v1", content, java.time.Instant.EPOCH, "seed"),
            draft = content,
        )
        every { repository.published("代号鸢") } returns state.published
        every { repository.find("代号鸢") } returns state
        val real = AchievementCatalogService(noSeedMapper, repository)
        assertEquals("db-v1", real.catalog("代号鸢").catalogVersion)
        verify { noSeedMapper wasNot io.mockk.Called }
        every { repository.published("代号鸢") } throws IllegalStateException("DB unavailable")
        assertThrows(IllegalStateException::class.java) { real.catalog("代号鸢") }
        verify(exactly = 0) { repository.insert(any()) }
    }

    @Test
    fun `read never seeds and competing first manual write reports conflict`() {
        val repository = mockk<AchievementCatalogRepository>()
        every { repository.find("代号鸢") } returns null
        every { repository.published("代号鸢") } returns null
        val real = AchievementCatalogService(mapper, repository)
        assertEquals(0, real.catalog("代号鸢").entries.size)
        verify(exactly = 0) { repository.insert(any()) }
        val admin = AchievementCatalogAdminService(real, repository, mapper)
        every { repository.replace(any(), 0L) } returns false
        every { repository.insert(any()) } throws DuplicateKeyException("concurrent")
        assertThrows(InventoryApiException::class.java) { admin.addCategory("代号鸢", 0, "测试分类") }
        verify(exactly = 1) { repository.replace(any(), 0L) }
    }
}
