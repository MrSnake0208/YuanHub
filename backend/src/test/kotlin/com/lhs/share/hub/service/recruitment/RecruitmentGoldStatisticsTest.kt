package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RecruitmentGoldStatisticsTest {
    private fun event(status: String?, span: Long? = null, rarity: Int? = 5) = RecruitmentStatisticEvent("p", rarity, span, status)
    private fun stats(vararg events: RecruitmentStatisticEvent) = RecruitmentGoldStatistics().also { stats -> events.forEach(stats::add) }

    @Test fun `average uses only known positive gold spans even when pity is invalid`() {
        val stats = stats(event("unknown", 39), event("up", 38), event("up"), event("up", 1, 4), event("up", 0))
        assertEquals(38.5, stats.averageGoldPulls)
        assertNull(stats.smallPityWinRate)
        assertNull(stats(event("up"), event("up", 0), event("up", 5, 4)).averageGoldPulls)
        assertEquals(1.3, stats(event("up", 1), event("up", 1), event("up", 2)).averageGoldPulls)
    }

    @Test fun `account average rounds original spans to two decimals while pool keeps one`() {
        val stats = stats(event("unknown", 1), event("up", 1), event("up", 2), event("up"), event("up", 99, 4), event("up", 0))
        assertEquals(1.33, stats.accountAverageGoldPulls)
        assertEquals(1.3, stats.averageGoldPulls)
        assertEquals(1.67, stats(event("up", 1), event("up", 2), event("up", 2)).accountAverageGoldPulls)
        val half = stats(*Array(8) { event("up", if (it == 0) 2L else 1L) })
        assertEquals(1.13, half.accountAverageGoldPulls)
        assertEquals(1.1, half.averageGoldPulls)
        assertEquals(12.0, stats(event("up", 12)).accountAverageGoldPulls)
        assertNull(stats().accountAverageGoldPulls)
        assertNull(stats(event("up"), event("up", 0), event("up", 5, 4)).accountAverageGoldPulls)
    }

    @Test fun `first gold assumes small pity and guaranteed UP is excluded regardless of spans`() {
        assertEquals(66.7, stats(event("up"), event("non_up", 1), event("up", 40), event("up")).smallPityWinRate)
        assertEquals(0.0, stats(event("non_up")).smallPityWinRate)
        assertEquals(0.0, stats(event("non_up"), event("up")).smallPityWinRate)
        assertEquals(100.0, stats(event("up"), event("up")).smallPityWinRate)
        assertEquals(50.0, stats(event("non_up"), event("unknown", 1, 4), event("up"), event("up")).smallPityWinRate)
    }

    @Test fun `empty unknown or inconsistent pity stays unknown and order matters`() {
        assertNull(stats().smallPityWinRate)
        assertNull(stats(event("up", rarity = 4)).smallPityWinRate)
        assertNull(stats(event("unknown"), event("up")).smallPityWinRate)
        assertNull(stats(event(null)).smallPityWinRate)
        assertNull(stats(event("up", rarity = null)).smallPityWinRate)
        assertNull(stats(event("non_up"), event("non_up")).smallPityWinRate)
        assertEquals(66.7, stats(event("up"), event("up"), event("non_up")).smallPityWinRate)
        assertEquals(50.0, stats(event("non_up"), event("up"), event("up")).smallPityWinRate)
    }

    @Test fun `total UP includes guaranteed gold while small pity excludes it`() {
        val stats = stats(event("non_up"), event("up"), event("up"))
        assertEquals(2L, stats.upGoldCount)
        assertEquals(3L, stats.knownUpGoldCount)
        assertEquals(0L, stats.unknownUpGoldCount)
        assertEquals(66.7, stats.totalUpRate)
        assertEquals(1L, stats.guaranteedGoldCount)
        assertEquals(50.0, stats.smallPityWinRate)
        assertEquals("first_gold_small_pity", stats.pityHistoryAssumption)
        assertEquals("inferred", stats.pityStatus)
    }

    @Test fun `consecutive UPs never trigger guaranteed gold`() {
        val stats = stats(event("up"), event("up"))
        assertEquals(2L, stats.upGoldCount)
        assertEquals(2L, stats.knownUpGoldCount)
        assertEquals(0L, stats.unknownUpGoldCount)
        assertEquals(100.0, stats.totalUpRate)
        assertEquals(0L, stats.guaranteedGoldCount)
        assertEquals(100.0, stats.smallPityWinRate)
    }

    @Test fun `unknown gold does not dilute total UP or stop later attribution`() {
        val stats = stats(event("unknown"), event("up"))
        assertEquals(1L, stats.upGoldCount)
        assertEquals(1L, stats.knownUpGoldCount)
        assertEquals(1L, stats.unknownUpGoldCount)
        assertEquals(100.0, stats.totalUpRate)
        assertNull(stats.guaranteedGoldCount)
        assertNull(stats.smallPityWinRate)
        assertEquals("insufficient_history", stats.pityStatus)

        stats.add(event("non_up"))
        stats.add(event("up"))
        stats.add(event("unknown"))
        assertEquals(2L, stats.upGoldCount)
        assertEquals(3L, stats.knownUpGoldCount)
        assertEquals(2L, stats.unknownUpGoldCount)
        assertEquals(66.7, stats.totalUpRate)
        assertNull(stats.guaranteedGoldCount)
        assertNull(stats.smallPityWinRate)
    }

    @Test fun `invalid guarantee sequence invalidates pity but preserves attribution`() {
        val stats = stats(event("non_up"), event("non_up"))
        assertEquals(0L, stats.upGoldCount)
        assertEquals(2L, stats.knownUpGoldCount)
        assertEquals(0L, stats.unknownUpGoldCount)
        assertEquals(0.0, stats.totalUpRate)
        assertNull(stats.guaranteedGoldCount)
        assertNull(stats.smallPityWinRate)
        assertEquals("insufficient_history", stats.pityStatus)
        stats.add(event("up"))
        assertEquals(33.3, stats.totalUpRate)
        assertNull(stats.guaranteedGoldCount)
    }

    @Test fun `empty or four star only history has zero guarantees and no rate samples`() {
        for (stats in listOf(stats(), stats(event("up", 10, 4), event("unknown", 3, 4)))) {
            assertEquals(0L, stats.upGoldCount)
            assertEquals(0L, stats.knownUpGoldCount)
            assertEquals(0L, stats.unknownUpGoldCount)
            assertNull(stats.totalUpRate)
            assertEquals(0L, stats.guaranteedGoldCount)
            assertEquals("no_samples", stats.pityStatus)
            assertNull(stats.averageGoldPulls)
            assertNull(stats.smallPityWinRate)
        }
    }

    @Test fun `missing attribution is unknown gold while missing rarity is not a gold sample`() {
        val unknown = stats(event(null), event("unexpected"))
        assertEquals(0L, unknown.upGoldCount)
        assertEquals(0L, unknown.knownUpGoldCount)
        assertEquals(2L, unknown.unknownUpGoldCount)
        assertNull(unknown.totalUpRate)
        assertNull(unknown.guaranteedGoldCount)
        assertEquals("insufficient_history", unknown.pityStatus)

        val noRarity = stats(event("up", rarity = null), event("up"))
        assertEquals(1L, noRarity.upGoldCount)
        assertEquals(1L, noRarity.knownUpGoldCount)
        assertEquals(0L, noRarity.unknownUpGoldCount)
        assertEquals(100.0, noRarity.totalUpRate)
        assertNull(noRarity.guaranteedGoldCount)
    }

    @Test fun `only actual guaranteed gold is counted and four stars do not consume it`() {
        val stats = stats(event("non_up"), event("unknown", rarity = 4))
        assertEquals(0L, stats.guaranteedGoldCount)
        stats.add(event("up"))
        assertEquals(1L, stats.guaranteedGoldCount)
        stats.add(event("non_up"))
        assertEquals(1L, stats.guaranteedGoldCount)
        stats.add(event("up"))
        assertEquals(2L, stats.guaranteedGoldCount)
        stats.add(event("unknown"))
        assertNull(stats.guaranteedGoldCount)
        assertEquals("insufficient_history", stats.pityStatus)
    }

    @Test fun `separate pools do not borrow guaranteed state`() {
        val poolA = stats(RecruitmentStatisticEvent("a", 5, null, "non_up"))
        val poolB = stats(RecruitmentStatisticEvent("b", 5, null, "up"))
        assertEquals(1L, poolA.knownUpGoldCount)
        assertEquals(1L, poolB.upGoldCount)
        assertEquals(1L, poolB.knownUpGoldCount)
        assertEquals(0L, poolA.guaranteedGoldCount)
        assertEquals(0L, poolB.guaranteedGoldCount)
        assertEquals(0.0, poolA.smallPityWinRate)
        assertEquals(100.0, poolB.smallPityWinRate)
    }
}
