package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.BetaAccessPolicy
import com.lhs.share.hub.controller.bond.request.BondRequests
import com.lhs.share.hub.repository.entity.BondEntry
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

internal fun bondMapper() =
    jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
internal fun bondEntry(
    number: Int = 1,
    weather: String = "sunny",
    action: String = "arson",
    status: String = "active",
    game: String = "代号鸢",
) = BondEntry(
    "bond_${number.toString(16).padStart(32, '0')}",
    game,
    listOf("char_test_a", "char_test_b"),
    action,
    weather,
    "negative",
    status,
)

class BondRulesTest {
    private val mapper = bondMapper()

    @Test
    fun `unordered members unique but action weather and game are identities`() {
        val a = bondEntry()
        assertEquals(BondRules.identity(a), BondRules.identity(a.copy(members = a.members.reversed())))
        assertThrows(InventoryApiException::class.java) {
            BondRules.validate(listOf(a, a.copy(bondId = bondEntry(2).bondId, members = a.members.reversed())), a.game)
        }
        val entries = listOf(a, bondEntry(2, "rain"), bondEntry(3, action = "poison"))
        BondRules.validate(entries, a.game)
        val records = BondRules.apply(emptyList(), entries.map { it.bondId to true }, "manual", Instant.EPOCH)
        assertEquals(3, BondRules.summary(entries, records).triggeredCount)
        assertEquals(records, BondRules.apply(records, listOf(a.bondId to true), "import", Instant.now()))
        assertEquals(
            2,
            BondRules.summary(entries, BondRules.apply(records, listOf(a.bondId to false), "manual", Instant.now())).triggeredCount,
        )
        assertEquals(
            2,
            BondRules.summary(
                entries.mapIndexed { i, e ->
                    e.copy(
                        status = if (i ==
                            0
                        ) {
                            "retired"
                        } else if (i == 1) {
                            "invalid"
                        } else {
                            "active"
                        },
                    )
                },
                records,
            ).triggeredCount,
        )
        assertThrows(InventoryApiException::class.java) { BondRules.summary(emptyList(), records) }
    }

    @Test
    fun `strict request rejects totals timestamps and malformed fields`() {
        val body = mapper.readTree(
            """{"account_id":"a","expected_revision":0,"catalog_version":"v","records":[{"bond_id":"x","triggered":true}]}""",
        )
        assertEquals(listOf("x" to true), BondRequests.write(body).records)
        for (extra in listOf("total", "source", "updated_at", "game", "linked_metrics")) {
            val bad = body.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put(extra, 1)
            assertThrows(InventoryApiException::class.java) { BondRequests.write(bad) }
        }
        assertTrue(BetaAccessPolicy.requiresBeta("POST", "/v1/bonds/batch"))
        assertTrue(BetaAccessPolicy.requiresBeta("GET", "/v1/bonds/archive"))
        assertFalse(BetaAccessPolicy.requiresBeta("GET", "/v1/bonds/catalog"))
    }
}
