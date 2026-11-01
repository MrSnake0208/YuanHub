package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.fixtures.TestFixtures
import com.lhs.share.hub.service.inventory.EntityCatalogService
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class OperatorCoreInvariantTest {
    private val mapper = ObjectMapper()
    private val validator = OperatorPlannerValidator(mockk<OperatorCatalogService>(), mockk<EntityCatalogService>(), mapper)

    @Test
    fun `zero growth requires no resources across every valid boundary`() {
        for (level in 0..100) {
            assertEquals(
                OperatorRequirementRules.Cost(emptyMap()),
                OperatorRequirementRules.level(level, level, TestFixtures.operator()),
            )
        }
        for (elite in 0..17) {
            assertEquals(
                OperatorRequirementRules.Cost(emptyMap()),
                OperatorRequirementRules.elite(elite, elite, TestFixtures.operator()),
            )
        }
        for (star in 0..30) assertEquals(OperatorRequirementRules.Cost(emptyMap()), OperatorRequirementRules.huaji(star, star))
        assertThrows(IllegalArgumentException::class.java) { OperatorRequirementRules.huaji(31, 31) }
    }

    @Test
    fun `split level upgrades conserve the same experience money and materials as one upgrade`() {
        for (middle in 1..99) {
            val first = OperatorRequirementRules.level(0, middle, TestFixtures.operator())
            val second = OperatorRequirementRules.level(middle, 100, TestFixtures.operator())
            val total = OperatorRequirementRules.level(0, 100, TestFixtures.operator())
            assertEquals(total.experience, first.experience + second.experience)
            assertEquals(total.money, first.money + second.money)
            val combined = (first.items.keys + second.items.keys).associateWith {
                first.items.getOrDefault(it, 0) +
                    second.items.getOrDefault(it, 0)
            }
            assertEquals(total.items, combined)
        }
    }

    @Test
    fun `completed starting breakthrough never skips later nodes or experience`() {
        for (target in 11..100) {
            val standard = OperatorRequirementRules.level(10, target, TestFixtures.operator())
            val completed = OperatorRequirementRules.level(10, target, TestFixtures.operator(), false, 1)
            val later = OperatorRequirementRules.level(11, target, TestFixtures.operator())
            assertEquals(standard.experience, completed.experience)
            assertEquals(later.money, completed.money)
            assertEquals(later.items, completed.items)
            assertEquals(standard, OperatorRequirementRules.level(10, target, TestFixtures.operator(), true, 0))
        }
        assertEquals(
            OperatorRequirementRules.level(9, 21, TestFixtures.operator()),
            OperatorRequirementRules.level(9, 21, TestFixtures.operator(), true),
        )
    }

    @Test
    fun `book choice agrees with exhaustive small-stock enumeration not another optimized implementation`() {
        for (high in 0L..3L) {
            for (medium in 0L..3L) {
                for (low in 0L..3L) {
                    val stock = mapOf("liutaobingshu" to high, "bingshuquanjuan" to medium, "bingshucanjuan" to low)
                    for (required in listOf(1L, 100L, 999L, 1000L, 1101L, 10001L, 32100L, 33301L)) {
                        val choices = buildList {
                            for (a in 0..high) {
                                for (b in 0..medium) {
                                    for (c in 0..low) {
                                        if (a * 10000 + b * 1000 + c * 100 >= required) add(Triple(a, b, c))
                                    }
                                }
                            }
                        }
                        val best = choices.minWithOrNull(
                            compareBy<Triple<Long, Long, Long>> {
                                it.first * 10000 + it.second * 1000 + it.third * 100
                            }
                                .thenByDescending { it.first }.thenByDescending { it.second },
                        )
                        val result = OperatorRequirementRules.chooseBooks(required, stock)
                        if (best == null) {
                            assertNull(result)
                        } else {
                            checkNotNull(result)
                            assertEquals(best.first * 10000 + best.second * 1000 + best.third * 100, result.suppliedExperience)
                            assertEquals(
                                mapOf(
                                    "liutaobingshu" to best.first,
                                    "bingshuquanjuan" to best.second,
                                    "bingshucanjuan" to best.third,
                                ).filterValues {
                                    it >
                                        0
                                },
                                result.items,
                            )
                            assertTrue(result.items.all { (id, count) -> count <= stock.getValue(id) && count > 0 })
                        }
                    }
                }
            }
        }
    }

    @Test
    fun `zero and negative experience never consume books`() {
        for (required in listOf(
            -1L,
            0L,
            Long.MIN_VALUE,
        )) {
            assertEquals(OperatorRequirementRules.BookChoice(emptyMap(), 0), OperatorRequirementRules.chooseBooks(required, emptyMap()))
        }
    }

    @Test
    fun `revision boundaries reject missing fractional textual negative and overflow-prone values`() {
        for (value in listOf(null, true, "0", -1, 0.5, Long.MAX_VALUE)) {
            val request = mapper.createObjectNode().set<com.fasterxml.jackson.databind.node.ObjectNode>(
                "expected_revision",
                mapper.valueToTree(value),
            )
            assertThrows(OperatorApiException::class.java) { validator.revision(request) }
        }
        for (value in listOf(
            0L,
            1L,
            Long.MAX_VALUE - 1,
        )) {
            assertEquals(value, validator.revision(mapper.createObjectNode().put("expected_revision", value)))
        }
    }

    @Test
    fun `business date changes at local five rather than midnight in every supported zone`() {
        for (zone in listOf("Asia/Shanghai", "Asia/Jakarta", "America/New_York", "UTC")) {
            val start = ZonedDateTime.of(2026, 9, 22, 5, 0, 0, 0, ZoneId.of(zone))
            assertEquals(start.toLocalDate().minusDays(1), validator.businessDate(start.minusNanos(1)))
            assertEquals(start.toLocalDate(), validator.businessDate(start))
            assertEquals(start.toLocalDate(), validator.businessDate(start.plusHours(18)))
        }
    }

    @Test
    fun `normalized empty workspace and schedule are stable and do not persist CAS input`() {
        for (request in listOf(validator.emptyWorkspace(), validator.emptySchedule())) {
            request.put("expected_revision", 0)
            val normalize = if (request.has("plans")) validator::workspace else validator::schedule
            val normalized = normalize(request)
            assertFalse(normalized.has("expected_revision"))
            assertEquals(normalized, normalize(normalized.deepCopy().put("expected_revision", 1)))
        }
    }
}
