package com.lhs.share.openapi

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorPanelResponse
import com.lhs.share.hub.repository.OperatorMatchConnectionRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorHuaji
import com.lhs.share.hub.repository.entity.OperatorMatchConnection
import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorPanelService
import com.lhs.share.hub.service.operator.OperatorService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class OperatorMatchServiceTest {
    private val repository = mockk<OperatorMatchConnectionRepository>()
    private val beta = mockk<BetaService>(relaxed = true)
    private val connections = OperatorMatchConnectionService(repository, beta)
    private val accounts = mockk<SubAccountRepository>()
    private val operators = mockk<OperatorService>()
    private val panels = mockk<OperatorPanelService>()
    private val permissions = mockk<AdminAuthorizationService>()
    private val stars = mockk<StarStateCurrentRepository>()
    private val loadouts = mockk<StarLoadoutCurrentRepository>()
    private val service = OperatorMatchService(connections, accounts, operators, panels, permissions, stars, loadouts)
    private val token = "ymatch_" + "a".repeat(32)
    private val connection = OperatorMatchConnection("c", "owner", token)

    @Test
    fun `creation has fixed purpose and reuses the existing user connection`() {
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns null
        every { repository.insert(any<OperatorMatchConnection>()) } answers { firstArg() }
        val created = connections.create("owner")
        assertTrue(created.token.matches(Regex("ymatch_[a-f0-9]{32}")))
        verify { beta.requireAccess("owner") }
        verify { repository.insert(match<OperatorMatchConnection> { it.userId == "owner" && it.id == "operator-match:owner" && it.token == created.token }) }
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns connection
        assertEquals(OperatorMatchSecret(connection.id, connection.token), connections.create("owner"))
        verify(exactly = 1) { repository.insert(any<OperatorMatchConnection>()) }
    }

    @Test
    fun `each request authenticates current connection and account ownership before reading roster`() {
        every { repository.findByToken(token) } returns connection
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns connection
        every { accounts.findByUserIdAndAccountId("owner", "other") } returns null
        assertThrows(InventoryApiException::class.java) { service.roster("Bearer $token", "other") }
        verify(exactly = 0) { operators.current(any(), any(), any()) }
        every { repository.findByToken(token) } returns null
        assertThrows(InventoryApiException::class.java) { service.accounts("Bearer $token") }
        assertThrows(InventoryApiException::class.java) { service.accounts("Bearer old-account-token") }
        verify(exactly = 0) { accounts.findAllByUserIdOrderByCreatedAtAsc(any()) }
    }

    @Test
    fun `same connection sees newly added owned accounts without recreating a token`() {
        every { repository.findByToken(token) } returns connection
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns connection
        val account = SubAccount(userId = "owner", accountId = "a", name = "大号")
        every { accounts.findAllByUserIdOrderByCreatedAtAsc("owner") } returnsMany
            listOf(listOf(account), listOf(account, account.copy(accountId = "b", name = "小号")))
        assertEquals(listOf("a"), service.accounts("Bearer $token").accounts.map { it.id })
        assertEquals(listOf("a", "b"), service.accounts("Bearer $token").accounts.map { it.id })
        verify(exactly = 2) { beta.requireAccess("owner") }
    }

    @Test
    fun `secret and revocation are scoped to owner and never touch roster`() {
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("other") } returns null
        assertThrows(InventoryApiException::class.java) { connections.secret("other", "c") }
        assertThrows(InventoryApiException::class.java) { connections.revoke("other", "c") }
        verify(exactly = 0) { repository.deleteAllByUserId(any()) }
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns connection
        every { repository.deleteAllByUserId("owner") } returns Unit
        connections.revoke("owner", "c")
        verify(exactly = 1) { repository.deleteAllByUserId("owner") }
    }

    @Test
    fun `roster uses canonical huaji actual loadouts and permitted calculated panels`() {
        every { repository.findByToken(token) } returns connection
        every { repository.findFirstByUserIdOrderByCreatedAtAscIdAsc("owner") } returns connection
        every { accounts.findByUserIdAndAccountId("owner", "a") } returns
            SubAccount(userId = "owner", accountId = "a", name = "大号", game = "如鸢")
        val entry = OperatorCurrentEntryDto(
            elite = 0, starLevel = 31, level = 1, discs = emptyList(), starStones = emptyList(),
            discLoadouts = listOf(OperatorDiscLoadout("one", "一", listOf(OperatorDisc("实际")), targetDiscs = listOf(OperatorDisc("目标")))),
            combatStats = null, revision = 1, listedBaselineAt = null, updatedAt = null, huaji = OperatorHuaji(true, 7, false),
        )
        every { operators.current("owner", "a", "如鸢") } returns
            listOf(OperatorCurrentResponse("owner", "a", "universal", null, mapOf("op" to entry), Instant.EPOCH))
        every { stars.findByUserIdAndAccountId("owner", "a") } returns null
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns null
        every { permissions.hasPermission("owner", AdminPermission.OPERATOR_PANEL_USE) } returns false
        val first = service.roster("Bearer $token", "a")
        assertEquals("如鸢", first.account.game)
        assertEquals(2, first.operators.getValue("op").stars)
        assertEquals(0, first.operators.getValue("op").elite)
        assertEquals(listOf(listOf("实际")), first.operators.getValue("op").discs)
        assertEquals("一", first.operators.getValue("op").discLoadouts.single().name)
        assertEquals(listOf("实际"), first.operators.getValue("op").discLoadouts.single().discs)
        assertNull(first.operators.getValue("op").starSlots)
        assertNull(first.operators.getValue("op").panel.attack)
        verify(exactly = 0) { panels.saved(any(), any(), any()) }
        every { permissions.hasPermission("owner", AdminPermission.OPERATOR_PANEL_USE) } returns true
        every { panels.saved("owner", "a", setOf("op")) } returns mapOf("op" to OperatorPanelResponse("calculated", 123, 456))
        assertEquals(123L, service.roster("Bearer $token", "a").operators.getValue("op").panel.attack)
        val state = StarStateCurrent(
            userId = "owner", accountId = "a", generation = 2, revision = 1,
            inventory = listOf(StarStateEntry("star1", "main", "天府", "orange", 1), StarStateEntry("star2", "main", "天府", "orange", 1)),
            planTargets = emptyList(), experience = StarStateExperience(),
            bag = StarStateBag(), updatedAt = Instant.EPOCH,
        )
        val equipped = StarLoadoutCurrent(
            userId = "owner",
            accountId = "a",
            generation = 2,
            loadouts = listOf(StarOperatorLoadout("op", StarLoadoutSlots(main2 = "star1", main3 = "star2"))),
        )
        every { stars.findByUserIdAndAccountId("owner", "a") } returns state
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns equipped
        assertEquals(listOf("天府", "天府"), service.roster("Bearer $token", "a").operators.getValue("op").mainStars)
        val slots = service.roster("Bearer $token", "a").operators.getValue("op").starSlots!!
        assertNull(slots["main1"])
        assertEquals("天府", slots["main2"])
        assertEquals("天府", slots["main3"])
        assertEquals(6, slots.size)
        val json = jacksonObjectMapper().findAndRegisterModules()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .valueToTree<JsonNode>(service.roster("Bearer $token", "a"))
        assertTrue(json.at("/operators/op/star_slots/main1").isNull)
        assertEquals("天府", json.at("/operators/op/star_slots/main3").asText())
        assertEquals("一", json.at("/operators/op/disc_loadouts/0/name").asText())
        assertEquals("实际", json.at("/operators/op/disc_loadouts/0/discs/0").asText())
        assertTrue(json.at("/operators/op/disc_loadouts/0/target_discs").isMissingNode)
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns equipped.copy(
            loadouts = listOf(StarOperatorLoadout("op", StarLoadoutSlots(main1 = "missing"))),
        )
        assertNull(service.roster("Bearer $token", "a").operators.getValue("op").starSlots)
        every { loadouts.findByUserIdAndAccountId("owner", "a") } returns equipped.copy(generation = 1)
        assertEquals(emptyList<String>(), service.roster("Bearer $token", "a").operators.getValue("op").mainStars)
        assertNull(service.roster("Bearer $token", "a").operators.getValue("op").starSlots)
    }
}
