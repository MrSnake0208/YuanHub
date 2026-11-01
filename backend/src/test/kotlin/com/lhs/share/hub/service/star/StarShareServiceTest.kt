package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorShareService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class StarShareServiceTest {
    @Test
    fun `tag permission is never advertised as a third share view`() {
        every { accounts.findByShareToken("code") } returns account.copy(shareScopes = listOf("operator", "operator_tags", "star"))
        every { states.findByUserIdAndAccountId("owner", "a") } returns null
        assertEquals(listOf("operator", "star"), service.view("code").availableViews)
    }

    private val accounts = mockk<SubAccountRepository>()
    private val states = mockk<StarStateCurrentRepository>()
    private val service = StarShareService(OperatorShareService(accounts, mockk(), mockk(), mockk(), mockk(), mockk(), mockk()), states)
    private val account =
        SubAccount(userId = "owner", accountId = "a", name = "Private name", game = "如鸢", shareToken = "code", shareScopes = listOf("star"))
    private fun state(generation: Long, level: Int) = StarStateCurrent(
        userId = "owner", accountId = "a", generation = generation,
        revision =
        generation + 5,
        inventory = listOf(
            StarStateEntry("private-1", "main", "字典外名称", "purple", level),
            StarStateEntry("private-2", "main", "字典外名称", "purple", level),
        ),
        planTargets = listOf(
            StarStatePlanTarget("private-1", 60),
        ),
        experience = StarStateExperience(999), bag = StarStateBag(2, 100), updatedAt = Instant.EPOCH.plusSeconds(generation),
    )

    @Test
    fun `same code reads latest generation and preserves duplicates with exact public fields`() {
        every { accounts.findByShareToken("code") } returns account
        every { states.findByUserIdAndAccountId("owner", "a") } returnsMany listOf(state(1, 10), state(2, 20))
        assertEquals(10, service.view("code").inventory.first().level)
        val latest = service.view("code")
        assertEquals(2, latest.inventory.size)
        assertEquals(20, latest.inventory.last().level)
        assertEquals(Instant.EPOCH.plusSeconds(2), latest.updatedAt)
        val json = jacksonObjectMapper().registerModule(
            JavaTimeModule(),
        ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).valueToTree<com.fasterxml.jackson.databind.JsonNode>(latest)
        assertEquals(setOf("game", "available_views", "has_state", "updated_at", "inventory"), json.fieldNames().asSequence().toSet())
        json["inventory"].forEach {
            assertEquals(setOf("kind", "name", "quality", "level", "breakthrough_stage"), it.fieldNames().asSequence().toSet())
        }
        assertFalse(json.toString().contains("private"))
        verify(exactly = 2) { states.findByUserIdAndAccountId("owner", "a") }
    }

    @Test
    fun `missing document differs from a saved empty inventory`() {
        every { accounts.findByShareToken("code") } returns account
        every { states.findByUserIdAndAccountId("owner", "a") } returnsMany
            listOf(null, state(1, 10).copy(inventory = emptyList(), planTargets = emptyList()))
        val missing = service.view("code")
        assertFalse(missing.hasState)
        assertNull(missing.updatedAt)
        val empty = service.view("code")
        assertTrue(empty.hasState)
        assertTrue(empty.inventory.isEmpty())
        assertNotNull(empty.updatedAt)
    }

    @Test
    fun `invalid revoked and unauthorized codes never query private state`() {
        every { accounts.findByShareToken("bad") } returns null
        every { accounts.findByShareToken("code") } returns account.copy(shareScopes = null)
        assertEquals("share_not_found", assertThrows(OperatorApiException::class.java) { service.view("bad") }.code)
        assertEquals("share_not_authorized", assertThrows(OperatorApiException::class.java) { service.view("code") }.code)
        verify(exactly = 0) { states.findByUserIdAndAccountId(any(), any()) }
    }

    @Test
    fun `database errors propagate instead of pretending the bag is empty`() {
        every { accounts.findByShareToken("code") } returns account
        every { states.findByUserIdAndAccountId("owner", "a") } throws IllegalStateException("database unavailable")
        assertThrows(IllegalStateException::class.java) { service.view("code") }
    }
}
