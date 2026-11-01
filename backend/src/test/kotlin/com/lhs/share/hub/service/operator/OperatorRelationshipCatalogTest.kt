package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.io.ClassPathResource

class OperatorRelationshipCatalogTest {
    private val mapper = jacksonObjectMapper()
    private val catalog = mockk<OperatorCatalogService>()
    private val rules = OperatorRelationshipCatalog(mapper, catalog)
    private fun entry(id: String, name: String, rarity: Int = 5, spOf: String? = null, games: List<String> = listOf("如鸢", "代号鸢")) =
        OperatorCatalogEntryResponse.of(
            OperatorCatalogEntity(
                operatorId = id, name = name, rarity = rarity, spOf = spOf, games = games,
                prof = emptyList(), subProf = emptyList(), discs = emptyList(), starStones = emptyList(), catalogVersion = "fixture",
            ),
        )
    private fun use(vararg entries: OperatorCatalogEntryResponse) {
        every { catalog.catalog() } returns OperatorCatalogResponse(catalogVersion = "same-version", operators = entries.toList())
    }
    private fun totals(rule: JsonNode): Map<String, Int> = rule.path("milestones").flatMap { it.path("rewards").toList() }
        .groupBy { it.path("item_key").asText() }.mapValues { (_, items) -> items.sumOf { it.path("quantity").asInt() } }

    @Test
    fun `real data caps hidden agents at 15 levels and resolves server-only identities in both games`() {
        use(entry("hidden", "严颜", 3), entry("server-only", "魏延"), entry("normal", "陈登", 4), entry("movie", "陈登·黍王", spOf = "normal"))
        val ry = rules.snapshot("如鸢")
        val dhy = rules.snapshot("代号鸢")
        assertEquals(ry.operators, dhy.operators)
        val short = ry.operators.path("hidden").path("trust")
        assertEquals(2000, short.path("max").asInt())
        assertEquals(15, short.path("milestones").size())
        assertEquals(mapOf("item:110001" to 75, "item:3" to 100, "item:806001" to 3, "item:806002" to 1), totals(short))
        val full = ry.operators.path("server-only").path("trust")
        assertEquals(40, full.path("milestones").size())
        assertEquals(10000, full.path("max").asInt())
        assertEquals(mapOf("item:110001" to 200, "item:3" to 260, "item:806001" to 7, "item:806002" to 4), totals(full))
        assertEquals("normal", ry.operators.path("movie").path("trust_owner_id").asText())
        assertEquals(ry.operators.path("normal").path("trust"), ry.operators.path("movie").path("trust"))
        assertTrue(ry.operators.all { it.path("rumors").isNull })
    }

    @Test
    fun `resolved content changes version even when public catalog version does not change`() {
        use(entry("a", "严颜", 3))
        val before = rules.snapshot("如鸢")
        use(entry("a", "魏延"))
        assertNotEquals(before.version, rules.snapshot("如鸢").version)
        use(entry("b", "陈登"), entry("a", "严颜", 3))
        val ordered = rules.snapshot("如鸢")
        use(entry("a", "严颜", 3), entry("b", "陈登"))
        assertEquals(ordered.version, rules.snapshot("如鸢").version)
    }

    @Test
    fun `ambiguous names missing roots and foreign game entries cannot fabricate rules`() {
        use(
            entry("a", "陈登"),
            entry("b", "陈登"),
            entry("unknown", "未知密探"),
            entry("dangling", "陈登·黍王", spOf = "gone"),
            entry("foreign", "魏延", games = listOf("代号鸢")),
        )
        val result = rules.snapshot("如鸢").operators
        assertTrue(result.path("a").path("trust").isNull)
        assertTrue(result.path("b").path("trust").isNull)
        assertTrue(result.path("unknown").path("trust").isNull)
        assertFalse(result.has("dangling"))
        assertFalse(result.has("foreign"))
    }

    @Test
    fun `every exported subject including five missing local seeds resolves against a full server catalog`() {
        val source = ClassPathResource("operator/relationships.json").inputStream.use { mapper.readTree(it) }
        val subjects = source.path("subjects").map { entry("server_${it.path("warrior_id").asText()}", it.path("name").asText()) }
        use(*subjects.toTypedArray())
        val resolved = rules.snapshot("代号鸢").operators
        assertEquals(124, resolved.size())
        assertEquals(22, resolved.count { it.path("trust").path("max").asInt() == 2000 })
        assertEquals(102, resolved.count { it.path("trust").path("max").asInt() == 10000 })
    }
}
