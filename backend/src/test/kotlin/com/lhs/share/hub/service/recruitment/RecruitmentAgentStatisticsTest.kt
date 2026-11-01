package com.lhs.share.hub.service.recruitment

import com.lhs.share.hub.repository.RecruitmentStatisticEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentTemporaryAgent
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

class RecruitmentAgentStatisticsTest {
    private val limited = RecruitmentPool("limited", RecruitmentPoolSnapshot("限定池", "如鸢", poolType = "限定"))
    private val permanent = RecruitmentPool("permanent", RecruitmentPoolSnapshot("绣衣天下", "如鸢", poolType = "常驻"))
    private fun event(id: String, pool: String = "limited", status: String = "non_up", rarity: Int? = 5) =
        RecruitmentStatisticEvent(pool, rarity, null, status, id, "密探$id")

    @Test fun `all tied leaders count unknown spans gold only and sort by stable identity`() {
        val stats = RecruitmentAgentStatistics(listOf(limited), emptyList())
        assertTrue(stats.mostObtained.isEmpty())
        assertTrue(stats.mostNonUp.isEmpty())
        assertTrue(stats.mostPermanent.isEmpty())
        listOf(event("b"), event("a"), event("b"), event("a"), event("four", rarity = 4), event("unknown", rarity = null))
            .forEach(stats::add)
        assertEquals(listOf("a", "b"), stats.mostObtained.map { it.agentId })
        assertEquals(listOf(2L, 2L), stats.mostObtained.map { it.count })
        assertEquals(stats.mostObtained, stats.mostNonUp)
    }

    @Test fun `non UP leaders exclude permanent unknown UP and unknown pools`() {
        val stats = RecruitmentAgentStatistics(listOf(limited, permanent), emptyList())
        listOf(
            event("common", "permanent"),
            event("common", "permanent"),
            event("common", "permanent"),
            event("off"),
            event("off"),
            event("up", status = "up"),
            event("unknown", status = "unknown"),
            event("orphan", "missing"),
        ).forEach(stats::add)
        assertEquals("common", stats.mostObtained.single().agentId)
        assertEquals(3L, stats.mostObtained.single().count)
        assertEquals("off", stats.mostNonUp.single().agentId)
        assertEquals(2L, stats.mostNonUp.single().count)
    }

    @Test fun `bound slots and mapped temporary agents merge by identity while same names and SP stay separate`() {
        val bound = limited.copy(mappedSnapshot = limited.snapshot.copy(upAgents = listOf(RecruitmentUpAgent("slot", "新名字", "formal"))))
        val stats = RecruitmentAgentStatistics(listOf(bound, permanent), listOf(RecruitmentTemporaryAgent("temp", "旧名", "formal", "新名字")))
        listOf(event("slot"), event("formal", "permanent"), event("temp"), event("sp"), event("other").copy(agentName = "新名字"))
            .forEach(stats::add)
        assertEquals("formal", stats.mostObtained.single().agentId)
        assertEquals(3L, stats.mostObtained.single().count)
        assertEquals("新名字", stats.mostObtained.single().name)
        assertEquals("formal", stats.mostNonUp.single().agentId)
        assertEquals(2L, stats.mostNonUp.single().count)
    }

    @Test fun `permanent pool aliases follow UI rules and dated or untyped pools do not qualify`() {
        listOf("permanent", " STANDARD ", "常驻", "常驻卡池", "常驻招募").forEach { type ->
            assertTrue(isPermanentRecruitmentPool(permanent.snapshot.copy(poolType = type)))
        }
        assertFalse(isPermanentRecruitmentPool(permanent.snapshot.copy(endDate = LocalDate.parse("2026-10-14"))))
        assertFalse(isPermanentRecruitmentPool(permanent.snapshot.copy(poolType = null)))
        assertFalse(isPermanentRecruitmentPool(permanent.snapshot.copy(poolType = "自选")))
    }

    @Test fun `permanent leaders combine all permanent pools and exclude limited untyped missing and non gold results`() {
        val historical = permanent.copy(poolId = "historical", snapshot = permanent.snapshot.copy(poolType = " STANDARD "))
        val dated = permanent.copy(
            poolId = "dated",
            snapshot = permanent.snapshot.copy(name = "常驻池", endDate = LocalDate.parse("2026-10-14")),
        )
        val untyped = permanent.copy(poolId = "untyped", snapshot = permanent.snapshot.copy(poolType = null))
        val stats = RecruitmentAgentStatistics(listOf(limited, permanent, historical, dated, untyped), emptyList())
        listOf(
            event("b", "permanent", status = "unknown"),
            event("a", "permanent", status = "up"),
            event("b", "historical"),
            event("a", "historical"),
            event("a", "permanent", rarity = 4),
            event("a", "permanent", rarity = null),
            event("missing-id", "permanent").copy(agentId = null),
            event("a", "dated"),
            event("a", "untyped"),
            event("a", "missing"),
        ).forEach(stats::add)
        repeat(10) { stats.add(event("c")) }
        assertEquals(listOf("a", "b"), stats.mostPermanent.map { it.agentId })
        assertEquals(listOf(2L, 2L), stats.mostPermanent.map { it.count })
        assertEquals("c", stats.mostObtained.single().agentId)
        assertEquals("c", stats.mostNonUp.single().agentId)
        assertEquals(10L, stats.mostNonUp.single().count)
    }

    @Test fun `permanent leaders use mapped pool snapshot and merge bound and temporary identities`() {
        val bound = limited.copy(mappedSnapshot = permanent.snapshot.copy(upAgents = listOf(RecruitmentUpAgent("slot", "甲", "a"))))
        val mappedLimited = permanent.copy(poolId = "mapped-limited", mappedSnapshot = limited.snapshot)
        val stats = RecruitmentAgentStatistics(
            listOf(bound, permanent, mappedLimited),
            listOf(RecruitmentTemporaryAgent("temp", "临时甲", "a", "甲")),
        )
        listOf(event("slot"), event("temp", "permanent"), event("a", "permanent"), event("a", "mapped-limited"))
            .forEach(stats::add)
        assertEquals("a", stats.mostPermanent.single().agentId)
        assertEquals(3L, stats.mostPermanent.single().count)
    }
}
