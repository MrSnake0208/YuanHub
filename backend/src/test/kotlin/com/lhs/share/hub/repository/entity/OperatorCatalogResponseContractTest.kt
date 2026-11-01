package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * 公共图鉴契约锁定：GET /v1/operator/catalog 只回答"有哪些密探、长什么样"，
 * 不携带任何用户养成信息。每条密探不得出现 starStones（目录里每个密探都是同一份
 * "主星石/辅星石" 模板），否则前端会把模板星石当真实养成数据展示；
 * id 必须是业务密探 id（operatorId），不得泄漏 Mongo _id。
 */
class OperatorCatalogResponseContractTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

    private fun response() = OperatorCatalogResponse(
        catalogVersion = "2026-08-16",
        operators = listOf(
            OperatorCatalogEntryResponse.of(
                OperatorCatalogEntity(
                    id = "6a83e6760776fc2dc6dbe5bb", // Mongo _id，不应出现在 JSON
                    operatorId = "char_001_yangxiu",
                    name = "杨修",
                    rarity = 5,
                    specialOddityName = "增伤值",
                    prof = listOf("阳"),
                    subProf = emptyList(),
                    games = listOf("如鸢", "代号鸢"),
                    discs = listOf(OperatorDiscCatalog("初始能量+2", "初始+2", "金", null)),
                    starStones = listOf(
                        OperatorStarStoneCatalog("主星石", "main"),
                        OperatorStarStoneCatalog("辅星石", "assist"),
                    ),
                    catalogVersion = "2026-08-16",
                ),
            ),
        ),
    )

    @Test
    fun `catalog entry serializes business id and discs but never starStones`() {
        val json = objectMapper.writeValueAsString(response())
        assertTrue(json.contains("\"id\":\"char_001_yangxiu\""), json)
        assertFalse(json.contains("6a83e6760776fc2dc6dbe5bb"), json)
        assertFalse(json.contains("operatorId"), json)
        assertTrue(json.contains("\"ot_name\":\"初始能量+2\""), json)
        assertTrue(json.contains("\"special_oddity_name\":\"增伤值\""), json)
        assertTrue(json.contains("\"oddity_schema\":{\"attack\":{\"name\":\"攻击力\",\"max\":500}"), json)
        assertTrue(json.contains("\"special\":{\"name\":\"增伤值\",\"max\":15}"), json)
        assertTrue(json.contains("\"incomplete_fields\":[]"), json)
        assertFalse(json.contains("starStones"), json)
        assertFalse(json.contains("主星石"), json)
        assertFalse(json.contains("辅星石"), json)
    }

    @Test
    fun `catalog entry exposes the base operator id of an SP form`() {
        val json = objectMapper.writeValueAsString(
            OperatorCatalogResponse(
                catalogVersion = "2026-08-16",
                operators = listOf(
                    OperatorCatalogEntryResponse.of(
                        OperatorCatalogEntity(
                            operatorId = "char_085_shizimiaosp",
                            name = "史子眇·赴烛",
                            rarity = 5,
                            prof = listOf("混沌"),
                            subProf = emptyList(),
                            games = listOf("如鸢", "代号鸢"),
                            discs = emptyList(),
                            starStones = emptyList(),
                            spOf = "char_023_shizimiao",
                            catalogVersion = "2026-08-16",
                        ),
                    ),
                ),
            ),
        )
        assertTrue(json.contains("\"sp_of\":\"char_023_shizimiao\""), json)
        assertFalse(json.contains("operatorId"), json)
    }

    @Test
    fun `missing special name returns an explicit degraded schema and incomplete field`() {
        val entry = OperatorCatalogEntryResponse.of(
            OperatorCatalogEntity(
                operatorId = "char_999_missing",
                name = "待维护密探",
                rarity = 5,
                prof = listOf("阳"),
                subProf = emptyList(),
                games = listOf("代号鸢"),
                discs = emptyList(),
                starStones = emptyList(),
                specialOddityName = null,
                catalogVersion = "2026-08-16",
            ),
        )

        val json = objectMapper.writeValueAsString(entry)

        assertTrue(json.contains("\"special_oddity_name\":null"), json)
        assertTrue(json.contains("\"special\":{\"name\":\"第三属性（图鉴待维护）\",\"max\":15}"), json)
        assertTrue(json.contains("\"incomplete_fields\":[\"special_oddity_name\"]"), json)
    }
}
