package com.lhs.share.hub.service.achievement

import com.lhs.share.hub.controller.achievement.response.AchievementPointTier
import com.lhs.share.hub.controller.achievement.response.AchievementPointTrack
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AchievementPrivateDataTest {
    private val mapper = achievementMapper()
    private val config = CatalogContent(
        "代号鸢",
        categories = listOf(CatalogCategory("cat_test", "测试分类")),
        rewardItems = fixtureRewardItems(),
        pointTracks = listOf(AchievementPointTrack("cat_test", "test_coin", listOf(AchievementPointTier(7, "测试奖励", 2, "coins")))),
        rewardFilterKeys = listOf("test_coin"),
    )

    @Test
    fun `absent catalog remains virtual through repeated public and admin reads`() {
        val repository = mockk<AchievementCatalogRepository>()
        every { repository.find(any()) } returns null
        every { repository.published(any()) } returns null
        val service = AchievementCatalogService(mapper, repository)
        val admin = AchievementCatalogAdminService(service, repository, mapper)
        repeat(2) {
            assertTrue(service.catalog("代号鸢").entries.isEmpty())
            assertEquals(0, admin.read("代号鸢").revision)
        }
        verify(exactly = 0) { repository.insert(any()) }
        verify(exactly = 0) { repository.replace(any(), any()) }
        every { repository.find(any()) } throws IllegalStateException("database failed")
        assertThrows(IllegalStateException::class.java) { service.load("代号鸢") }
    }

    @Test
    fun `settings roundtrip strictly and private dictionary stays out of player projection`() {
        assertTrue(AchievementCatalogRules.errors(config, false).isEmpty())
        assertEquals(config, AchievementCatalogDecoder.content(mapper.valueToTree(config), mapper))
        val published = mapper.readTree(mapper.writeValueAsBytes(config.publicCatalog("v1")))
        assertFalse(published.has("reward_items"))
        assertEquals(7, published["point_tracks"][0]["tiers"][0]["at"].asInt())
        assertEquals("测试币", published["reward_filters"][0].asText())
        val wrong = config.copy(pointTracks = listOf(config.pointTracks.single().copy(categoryId = "unknown")))
        assertTrue(AchievementCatalogRules.errors(wrong, false).isNotEmpty())
        assertTrue(AchievementCatalogRules.errors(config.copy(rewardItems = emptyList()), false).isNotEmpty())
        val node = mapper.readTree(mapper.writeValueAsBytes(config))
        (node["point_tracks"][0]["tiers"][0] as com.fasterxml.jackson.databind.node.ObjectNode).put("at", 7.5)
        assertThrows(InventoryApiException::class.java) { AchievementCatalogDecoder.content(node, mapper) }
    }

    @Test
    fun `combined manual import remaps categories and requires explicit publication`() {
        val repository = mockk<AchievementCatalogRepository>()
        var stored: com.lhs.share.hub.repository.entity.AchievementCatalog? = null
        every { repository.find(any()) } answers { stored }
        every { repository.published(any()) } answers { stored?.published }
        every { repository.replace(any(), any()) } answers {
            if (stored?.revision != secondArg<Long>()) {
                false
            } else {
                stored = firstArg()
                true
            }
        }
        every { repository.insert(any()) } answers {
            stored = firstArg()
            stored!!
        }
        val service = AchievementCatalogService(mapper, repository)
        val admin = AchievementCatalogAdminService(service, repository, mapper)
        val node = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(
            config.copy(
                categories = listOf(CatalogCategory("import_group", "测试分类")),
                pointTracks = config.pointTracks.map {
                    it.copy(categoryId = "import_group")
                },
            ),
        )
        node.withArray("entries").addObject().put("game", "代号鸢").put("category_id", "import_group").put("name", "测试成就")
        val preview = admin.importPreview("代号鸢", 0, "owner", node, "keep")
        assertTrue(preview.items.none { it.outcome in setOf("invalid", "unmatched") })
        assertNull(stored)
        val saved = admin.importConfirm("代号鸢", 0, "owner", node, "keep", preview.previewToken)
        assertEquals(saved.draft.entries.single().categoryId, saved.draft.pointTracks.single().categoryId)
        assertTrue(saved.draft.pointTracks.single().categoryId.startsWith("cat_"))
        assertTrue(service.catalog("代号鸢").pointTracks.isEmpty())
        admin.publish("代号鸢", saved.revision, "owner")
        assertEquals(7L, service.catalog("代号鸢").pointTracks.single().tiers.single().at)
        assertThrows(InventoryApiException::class.java) { admin.save("代号鸢", saved.revision, saved.draft) }
    }
}
