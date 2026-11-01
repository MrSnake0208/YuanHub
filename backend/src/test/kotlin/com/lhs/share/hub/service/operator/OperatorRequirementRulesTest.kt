package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OperatorRequirementRulesTest {
    @Test
    fun `level fixed sample matches frontend rules`() {
        val result = OperatorRequirementRules.level(9, 11, catalog(prof = "火", subProf = "pojun"))

        assertEquals(200, result.experience)
        assertEquals(20_000, result.money)
        assertEquals(mapOf("jianjia" to 4L), result.items)
    }

    @Test
    fun `elite fixed sample uses attribute material group`() {
        val result = OperatorRequirementRules.elite(16, 17, catalog(prof = "风", subProf = "shenji"))

        assertEquals(350_000, result.money)
        assertEquals(mapOf("xianmenshan" to 750L, "beihuifengshan" to 1200L), result.items)
    }

    @Test
    fun `huaji reaches five stars once and does not price legacy awakening`() {
        val result = OperatorRequirementRules.huaji(24, 25)
        assertEquals(80, result.heart)
        assertEquals(160_000, result.money)
        assertEquals(emptyMap<String, Long>(), result.items)
        for (target in 25..30) assertEquals(0, OperatorRequirementRules.huaji(25, target).heart)
        assertThrows(IllegalArgumentException::class.java) { OperatorRequirementRules.huaji(24, 31) }
    }

    @Test
    fun `ordinary early huaji nodes consume their stage costs`() {
        val result = OperatorRequirementRules.huaji(1, 5)

        assertEquals(15, result.heart)
        assertEquals(30_000, result.money)
        assertEquals(emptyMap<String, Long>(), result.items)
    }

    @Test
    fun `book selection minimizes overflow and has stable high value tie break`() {
        val minimal = OperatorRequirementRules.chooseBooks(
            1_050,
            mapOf("liutaobingshu" to 1, "bingshuquanjuan" to 1, "bingshucanjuan" to 1),
        )
        assertEquals(1_100, minimal?.suppliedExperience)
        assertEquals(mapOf("bingshuquanjuan" to 1L, "bingshucanjuan" to 1L), minimal?.items)

        val stable = OperatorRequirementRules.chooseBooks(
            11_000,
            mapOf("liutaobingshu" to 1, "bingshuquanjuan" to 11),
        )
        assertEquals(mapOf("liutaobingshu" to 1L, "bingshuquanjuan" to 1L), stable?.items)
    }

    @Test
    fun `awakening has a separate fixed cost without a fake huaji stage`() {
        val result = OperatorRequirementRules.awakening()
        assertEquals(100, result.heart)
        assertEquals(300_000, result.money)
        assertEquals(mapOf("zhuangjinboli" to 1L), result.items)
    }

    private fun catalog(prof: String, subProf: String) = OperatorCatalogEntity(
        operatorId = "op1",
        name = "密探",
        rarity = 5,
        prof = listOf(prof),
        subProf = listOf(subProf),
        games = listOf("如鸢"),
        discs = emptyList(),
        starStones = emptyList(),
        catalogVersion = "1",
    )
}
