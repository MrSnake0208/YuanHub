package com.lhs.share.hub.service.star

import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarStateEntry
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Pure matching checks; no database or transaction stand-ins. */
class StarOcrLoadoutInheritanceTest {
    private val service = StarStateService(mockk(), mockk(), mockk(), mockk(), mockk(), mockk())
    private fun star(id: String, kind: String = "main", name: String = "天府", quality: String = "orange", level: Int = 40) =
        StarStateEntry(id, kind, name, quality, level)

    private fun inherit(
        old: List<StarStateEntry>,
        next: List<StarStateEntry>,
        source: List<StarOperatorLoadout> = listOf(StarOperatorLoadout("op.a", StarLoadoutSlots(main1 = "old"))),
        operators: Set<String> = setOf("op.a", "op.b"),
    ) = service.inheritOcrLoadouts(source, old, next, operators)

    @Test fun `all six slots inherit distinct new instances ignoring breakthrough stage`() {
        val old = (1..6).map { star("old$it", if (it <= 3) "main" else "support", if (it <= 3) "天府" else "文曲") }
        val next = old.mapIndexed { i, entry -> entry.copy(instanceId = "new$i", breakthroughStage = 0) }
        val source = listOf(StarOperatorLoadout("op.a", StarLoadoutSlots("old1", "old2", "old3", "old4", "old5", "old6")))
        val result = inherit(old, next, source).single().slots.values().map { it.second }
        assertEquals(next.map { it.instanceId }, result)
        assertEquals(6, result.toSet().size)
        assertTrue(result.none { it in old.map { entry -> entry.instanceId } })
    }

    @Test fun `partial match clears only missing slots`() {
        val source = listOf(StarOperatorLoadout("op.a", StarLoadoutSlots(main1 = "old", support1 = "support")))
        val result = inherit(listOf(star("old"), star("support", "support", "文曲")), listOf(star("new")), source)
        assertEquals(StarLoadoutSlots(main1 = "new"), result.single().slots)
    }

    @Test fun `duplicates remain separate and shortage follows operator then slot order not UUID sorting`() {
        val old = listOf(star("old1"), star("old2"), star("old3"))
        val source = listOf(
            StarOperatorLoadout("op.b", StarLoadoutSlots(main1 = "old3")),
            StarOperatorLoadout("op.a", StarLoadoutSlots(main1 = "old1", main2 = "old2")),
        )
        val next = listOf(star("z-first"), star("a-second"), star("m-third"))
        val full = inherit(old, next, source)
        assertEquals(StarLoadoutSlots(main1 = "z-first", main2 = "a-second"), full[0].slots)
        assertEquals("m-third", full[1].slots.main1)
        val short = inherit(old, next.take(1), source)
        assertEquals(listOf(StarOperatorLoadout("op.a", StarLoadoutSlots(main1 = "z-first"))), short)
        assertEquals(short, inherit(old, next.take(1), source.reversed()))
    }

    @Test fun `current level quality kind and exact normalized name must all match`() {
        val old = listOf(star("old"))
        for (candidate in listOf(
            star("new", level = 50),
            star("new", quality = "purple"),
            star("new", kind = "support"),
            star("new", name = "天同"),
            star("new", name = "天府星"),
        )) {
            assertTrue(inherit(old, listOf(candidate)).isEmpty(), "Unexpected match: $candidate")
        }
        assertEquals("new", inherit(old, listOf(star("new", name = " 天府 "))).single().slots.main1)
    }

    @Test fun `invalid old references missing operators wrong slots and duplicate old occupancy do not consume candidates`() {
        val old = listOf(star("old"), star("support", "support", "文曲"))
        val source = listOf(
            StarOperatorLoadout("deleted", StarLoadoutSlots(main1 = "old")),
            StarOperatorLoadout("op.b", StarLoadoutSlots(main1 = "old")),
            StarOperatorLoadout("op.a", StarLoadoutSlots(main1 = "missing", main2 = "support", main3 = "old", support1 = "support")),
        )
        val result = inherit(old, listOf(star("new1"), star("new2"), star("newS", "support", "文曲")), source)
        assertEquals(listOf(StarOperatorLoadout("op.a", StarLoadoutSlots(main3 = "new1", support1 = "newS"))), result)
    }

    @Test fun `empty new inventory and zero matches clear all wear`() {
        assertTrue(inherit(listOf(star("old")), emptyList()).isEmpty())
        assertTrue(inherit(listOf(star("old")), listOf(star("new", name = "天同"))).isEmpty())
        assertTrue(inherit(emptyList(), listOf(star("new"))).isEmpty())
    }
}
