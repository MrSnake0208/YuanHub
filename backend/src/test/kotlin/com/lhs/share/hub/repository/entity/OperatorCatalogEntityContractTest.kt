package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * 目录契约锁定：JSON 中的 id 必须是密探业务 id（operatorId），
 * 不得泄漏 Mongo 内部 _id，否则前端会误把 ObjectId 当 entry id 提交，
 * 导致导入被 unknown_operator_id 拒绝。
 */
class OperatorCatalogEntityContractTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()

    private val entity = OperatorCatalogEntity(
        id = "6a83e6760776fc2dc6dbe5bb", // Mongo _id，不应出现在 JSON
        operatorId = "char_001_yangxiu",
        name = "杨修",
        rarity = 5,
        specialOddityName = "增伤值",
        prof = emptyList(),
        subProf = emptyList(),
        games = listOf("如鸢", "代号鸢"),
        discs = emptyList(),
        starStones = listOf(OperatorStarStoneCatalog("定远", "main1")),
        catalogVersion = "2026-08-16",
    )

    @Test
    fun `id serializes to the business operatorId, not the mongo _id`() {
        val json = objectMapper.writeValueAsString(entity)
        assertTrue(json.contains("\"id\":\"char_001_yangxiu\""), json)
        assertFalse(json.contains("6a83e6760776fc2dc6dbe5bb"), json)
        assertFalse(json.contains("operatorId"), json)
        assertTrue(json.contains("\"specialOddityName\":\"增伤值\""), json)
        assertFalse(json.contains("odditySchema"), json)
        assertFalse(json.contains("incompleteFields"), json)
    }
}
