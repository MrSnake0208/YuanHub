package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.controller.achievement.response.AchievementReward
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AchievementTenFieldTest {
    private val mapper = achievementMapper()
    private val entry = fixtureCatalog().entries.first()
    private fun content() = CatalogContent(
        "代号鸢",
        "partial",
        categories = listOf(CatalogCategory("test", "测试")),
        entries = listOf(entry),
        rewardItems = fixtureRewardItems(),
    )

    @Test
    fun `public entry has exactly ten fields and rewards retain unknown empty or structured states`() {
        val expected =
            setOf("achievement_id", "game", "category_id", "name", "condition", "sort", "is_hidden", "rewards", "target", "linked_metric")
        for (rewards in listOf(null, emptyList(), listOf(AchievementReward("test_coin", "测试币", 10)))) {
            val value = entry.copy(rewards = rewards)
            val node = mapper.valueToTree<ObjectNode>(value)
            assertEquals(expected, node.fieldNames().asSequence().toSet())
            assertEquals(value, AchievementCatalogDecoder.entry(node, mapper))
        }
    }

    @Test
    fun `strict nested decoder rejects removed fields coercion decimal targets and malformed rewards`() {
        for (json in listOf(
            "{\"rewards\":[null]}",
            "{\"rewards\":[{}]}",
            "{\"rewards\":[{\"item_key\":\"test_coin\",\"name\":\"测试币\",\"quantity\":\"1\"}]}",
            "{\"rewards\":[{\"item_key\":\"test_coin\",\"name\":\"测试币\",\"quantity\":1.1}]}",
            "{\"rewards\":[{\"item_key\":\"test_coin\",\"name\":\"测试币\",\"quantity\":1,\"source\":\"x\"}]}",
            "{\"target\":1.1}",
            "{\"target\":\"10\"}",
            "{\"target\":9223372036854775808}",
        ) +
            listOf(
                "aliases", "operators", "chapter", "reward", "method", "spoiler", "sources", "verified_at",
                "data_status", "progress_kind", "unit",
            ).map {
                "{\"$it\":null}"
            }) {
            val node = mapper.valueToTree<ObjectNode>(entry)
            node.setAll<ObjectNode>(mapper.readTree(json) as ObjectNode)
            assertThrows(InventoryApiException::class.java, { AchievementCatalogDecoder.entry(node, mapper) }, json)
        }
    }

    @Test
    fun `reward identity game names duplicates safe quantity and totals are validated`() {
        val good = AchievementReward("test_coin", "测试币", 10)
        val bad = listOf(
            listOf(good.copy(itemKey = "unknown")),
            listOf(good.copy(name = "伪造名称")),
            listOf(good, good),
            listOf(good.copy(quantity = 0)),
            listOf(good.copy(quantity = -1)),
            listOf(good.copy(quantity = AchievementRewards.MAX_SAFE_INTEGER + 1)),
            listOf(good.copy(quantity = AchievementRewards.MAX_SAFE_INTEGER), AchievementReward("test_ticket", "测试券", 1)),
        )
        assertTrue(AchievementCatalogRules.errors(content().copy(entries = listOf(entry.copy(rewards = listOf(good)))), true).isEmpty())
        bad.forEach { rewards ->
            assertTrue(AchievementCatalogRules.errors(content().copy(entries = listOf(entry.copy(rewards = rewards))), false).isNotEmpty())
        }
        assertTrue(
            AchievementCatalogRules.errors(
                content().copy(rewardItems = emptyList(), entries = listOf(entry.copy(rewards = listOf(good)))),
                true,
            ).isNotEmpty(),
        )
    }

    @Test
    fun `only explicit positive targets enable progress and imported positive bond thresholds link`() {
        for (target in listOf(0L, -1L, AchievementCatalogRules.MAX_TARGET + 1)) {
            assertTrue(AchievementCatalogRules.errors(content().copy(entries = listOf(entry.copy(target = target))), false).isNotEmpty())
        }
        for (target in listOf(2L, 9L, 77L)) {
            assertTrue(
                AchievementCatalogRules.errors(
                    content().copy(entries = listOf(entry.copy(target = target, linkedMetric = "yuan_bond_variants"))),
                    true,
                ).isEmpty(),
            )
        }
        for (value in listOf(
            entry.copy(linkedMetric = "unknown"),
            entry.copy(target = null, linkedMetric = "yuan_bond_variants"),
        )) {
            assertTrue(AchievementCatalogRules.errors(content().copy(entries = listOf(value)), false).isNotEmpty())
        }
        assertTrue(AchievementCatalogRules.compatibility(content(), mapOf(entry.achievementId to entry.copy(target = null))).isEmpty())
        assertTrue(
            AchievementCatalogRules.compatibility(
                content().copy(entries = listOf(entry.copy(target = null)), retiredIds = setOf(entry.achievementId)),
                mapOf(
                    entry.achievementId to entry,
                ),
            ).isNotEmpty(),
        )
    }

    @Test
    fun `personal decoder rejects fractional and unsafe progress but accepts old whole number backups`() {
        for (value in listOf("-1", "1.5", "9007199254740992", "\"1\"")) {
            val node = mapper.readTree("""{"achievement_id":"${entry.achievementId}","progress":$value}""")
            assertThrows(InventoryApiException::class.java) { AchievementRequestDecoder.patch(node, true) }
        }
        for (value in listOf("0", "10.0", "9007199254740991")) {
            val patch = AchievementRequestDecoder.patch(
                mapper.readTree("""{"achievement_id":"${entry.achievementId}","progress":$value}"""),
                true,
            )
            assertEquals(value.toDouble(), patch.progress)
        }
    }

    @Test
    fun `category order then group sort then stable ID precedes pagination`() {
        val value = content().copy(
            categories = listOf(CatalogCategory("late", "后", 2), CatalogCategory("test", "先", 1)),
            entries = listOf(
                entry.copy(achievementId = "yh_z", categoryId = "late", sort = 0),
                entry.copy(achievementId = "yh_b", sort = 2),
                entry.copy(achievementId = "yh_a", sort = 2),
            ),
        )
        assertEquals(listOf("yh_a", "yh_b", "yh_z"), value.publicCatalog("v").entries.map { it.achievementId })
        assertEquals(5000, AchievementCatalogRules.MAX_ENTRIES)
        assertEquals(5000, AchievementRequestDecoder.MAX_IMPORT)
        assertEquals(16 * 1024 * 1024, AchievementRequestDecoder.MAX_BYTES)
    }
}
