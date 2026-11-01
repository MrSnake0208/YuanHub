package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorHuaji
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OperatorHuajiRulesTest {
    private val mapper = jacksonObjectMapper()
    private val ordinary = OperatorCatalogEntity(
        operatorId = "op", name = "测试密探", rarity = 5, prof = listOf("风"),
        subProf = emptyList(), games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
    )

    @Test
    fun `legacy 25 through 30 preserve both confirmed awakening values`() {
        for (raw in 25..30) {
            for (awake in listOf(true, false, null)) {
                assertEquals(OperatorHuaji(true, 25, awake), OperatorHuajiRules.legacy(raw, ordinary, OperatorHuaji(true, 24, awake)))
            }
        }
    }

    @Test
    fun `confirmed awakening and legacy 31 imply five stars without rewriting storage`() {
        assertEquals(OperatorHuaji(true, 25, true), OperatorHuajiRules.legacy(31, ordinary))
        assertEquals(OperatorHuaji(true, 25, true), OperatorHuajiRules.legacy(31, ordinary, OperatorHuaji(true, 19, false)))
        val stored = OperatorEntry(17, 31, 100, huaji = OperatorHuaji(true, null, true))
        assertEquals(OperatorHuaji(true, 25, true), OperatorHuajiRules.read(stored, ordinary))
        assertEquals(null, stored.huaji!!.stage)
    }

    @Test
    fun `hidden historical invalid scalars stay unknown and raw is untouched`() {
        val hidden = ordinary.copy(rarity = 3)
        for (raw in (20..25).toList() + listOf(30, 31)) {
            val entry = OperatorEntry(17, raw, 100)
            assertEquals(OperatorHuaji(true, null, null), OperatorHuajiRules.read(entry, hidden))
            assertEquals(raw, entry.starLevel)
        }
        assertEquals(OperatorHuaji(true, null, null), OperatorHuajiRules.read(OperatorEntry(17, 31, 100), null))
        assertEquals(19, OperatorHuajiRules.maximum(hidden))
        assertThrows(OperatorApiException::class.java) {
            OperatorHuajiRules.patch(mapper.readTree("{\"stage\":25}"), hidden, OperatorHuaji(true, 24, null))
        }
        assertThrows(OperatorApiException::class.java) {
            OperatorHuajiRules.patch(mapper.readTree("{\"awakened\":true}"), hidden, OperatorHuaji(true, 24, null))
        }
    }

    @Test
    fun `three star historical normalized nodes keep raw trace and known SP supports independent awakening`() {
        val hidden = ordinary.copy(rarity = 3)
        val entry = OperatorEntry(1, 20, 1, huaji = OperatorHuaji(true, 20, null))
        assertEquals(null, OperatorHuajiRules.read(entry, hidden).stage)
        assertEquals(20, OperatorHuajiRules.trace(entry, hidden).raw)
        assertEquals(20, entry.huaji!!.stage)
        for (id in listOf("char_084_chendengsp", "char_085_shizimiaosp")) {
            val sp = ordinary.copy(operatorId = id, spOf = "base")
            assertEquals(
                OperatorHuaji(true, 25, true),
                OperatorHuajiRules.patch(mapper.readTree("{\"awakened\":true}"), sp, OperatorHuaji(true, 25, false)),
            )
            assertThrows(OperatorApiException::class.java) {
                OperatorHuajiRules.patch(mapper.readTree("{\"awakened\":true}"), sp, OperatorHuaji(true, 19, false))
            }
        }
    }

    @Test
    fun `SP uses sparse stages and shared growth never implies ownership`() {
        val sp = ordinary.copy(spOf = "base")
        for (raw in 1..5) assertEquals(6 * (raw - 1) + 1, OperatorHuajiRules.legacy(raw, sp).stage)
        assertEquals(false, OperatorHuajiRules.read(OperatorEntry(17, 0, 100), sp).owned)
        assertThrows(OperatorApiException::class.java) {
            OperatorHuajiRules.patch(mapper.readTree("{\"stage\":2}"), sp, OperatorHuaji(true, 1, null))
        }
    }

    @Test
    fun `missing preserves facts explicit null means unknown and owned stage may be unknown`() {
        val prior = OperatorHuaji(true, 25, true)
        assertEquals(prior, OperatorHuajiRules.patch(mapper.readTree("{\"owned\":true}"), ordinary, prior))
        assertEquals(
            OperatorHuaji(true, null, null),
            OperatorHuajiRules.patch(mapper.readTree("{\"stage\":null,\"awakened\":null}"), ordinary, prior),
        )
        assertThrows(OperatorApiException::class.java) {
            OperatorHuajiRules.patch(mapper.readTree("{\"owned\":false}"), ordinary, prior)
        }
        assertThrows(OperatorApiException::class.java) {
            OperatorHuajiRules.patch(mapper.readTree("{\"stage\":19}"), ordinary, prior)
        }
        assertEquals(
            OperatorHuaji(true, 19, false),
            OperatorHuajiRules.patch(mapper.readTree("{\"stage\":19,\"awakened\":false}"), ordinary, prior),
        )
    }
}
