package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorHuaji
import com.lhs.share.hub.repository.entity.StarLoadoutCurrent
import com.lhs.share.hub.repository.entity.StarLoadoutSlots
import com.lhs.share.hub.repository.entity.StarOperatorLoadout
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.SubAccountService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import java.time.Instant

class OperatorPanelServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountService>()
    private val catalogs = mockk<OperatorCatalogRepository>()
    private val currents = mockk<OperatorCurrentRepository>()
    private val stars = mockk<StarStateCurrentRepository>()
    private val loadouts = mockk<StarLoadoutCurrentRepository>()
    private val rules = mockk<PanelRuleService>()
    private val service = OperatorPanelService(accounts, catalogs, currents, stars, loadouts, rules)
    private val entry = OperatorEntry(3, 1, 11, huaji = OperatorHuaji(true, 1, false))
    private val catalog = OperatorCatalogEntity(
        operatorId = "operator.test", name = "Synthetic", rarity = 5, prof = listOf("风"), subProf = listOf("破军"),
        games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
    )
    private val state = StarStateCurrent(
        userId = "u", accountId = "a", generation = 1, revision = 1,
        inventory = listOf(StarStateEntry("mine", "main", "test.102", "orange", 10, 1)),
        planTargets = emptyList(), experience = StarStateExperience(), bag = StarStateBag(), updatedAt = Instant.EPOCH,
    )

    @BeforeEach fun setup() {
        every { accounts.requireAccount("u", "a") } returns SubAccount(userId = "u", accountId = "a", name = "A", game = "如鸢")
        every { catalogs.findAllByOrderByOperatorIdAsc() } returns listOf(catalog)
        every { currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u", "a") } returns listOf(
            OperatorCurrent(userId = "u", accountId = "a", game = "如鸢", entries = mapOf("operator.test" to entry)),
        )
        every { stars.findByUserIdAndAccountId("u", "a") } returns state
        every { loadouts.findByUserIdAndAccountId("u", "a") } returns StarLoadoutCurrent(
            userId = "u",
            accountId = "a",
            generation = 1,
            loadouts = listOf(StarOperatorLoadout("operator.test", StarLoadoutSlots(main1 = "mine"))),
        )
        every { rules.snapshot("如鸢") } returns panelRules()
    }

    private fun preview(): ObjectNode = mapper.readTree(
        """{"account_id":"a","operator_id":"operator.test","level":11,"elite":3,"huaji":{"owned":true,"stage":1,"awakened":false},"oddities":{"hp":0,"attack":0}}""",
    ) as ObjectNode

    @Test fun `omitted null and false awakening calculate normally for saved and preview panels`() {
        for (stage in listOf(1, 19, 24, 25)) {
            val explicit = preview().apply { (get("huaji") as ObjectNode).put("stage", stage) }
            val expected = service.preview("u", explicit)
            assertEquals("calculated", expected.status)
            for (awakened in listOf(false, null)) {
                every { currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u", "a") } returns listOf(
                    OperatorCurrent(
                        userId = "u",
                        accountId = "a",
                        game = "如鸢",
                        entries = mapOf(
                            "operator.test" to entry.copy(huaji = OperatorHuaji(true, stage, awakened)),
                        ),
                    ),
                )
                assertEquals(expected, service.saved("u", "a", setOf("operator.test")).getValue("operator.test"))
            }
            val nullable = explicit.deepCopy().apply { (get("huaji") as ObjectNode).putNull("awakened") }
            assertEquals(expected, service.preview("u", nullable))
            (nullable.get("huaji") as ObjectNode).remove("awakened")
            assertEquals(expected, service.preview("u", nullable))
        }
    }

    @Test fun `awakening implies five stars and rejects contradictory lower stages`() {
        val awakened = preview().apply { (get("huaji") as ObjectNode).put("stage", 25).put("awakened", true) }
        val expected = service.preview("u", awakened)
        assertEquals("calculated", expected.status)
        val unawakened = awakened.deepCopy().apply { (get("huaji") as ObjectNode).put("awakened", false) }
        assertTrue(expected.hp!! > service.preview("u", unawakened).hp!!)
        (awakened.get("huaji") as ObjectNode).putNull("stage")
        assertEquals(expected, service.preview("u", awakened))
        (awakened.get("huaji") as ObjectNode).put("stage", 24)
        assertThrows(OperatorApiException::class.java) { service.preview("u", awakened) }
    }

    @Test fun `saved and preview use identical private snapshot and expose only final values`() {
        val saved = service.saved("u", "a", setOf("operator.test")).getValue("operator.test")
        assertEquals(saved, service.preview("u", preview()))
        assertEquals("calculated", saved.status)
        val expected = OperatorPanelCalculator.calculate(panelRules(), "operator.test", panelInput(), listOf(PanelStone("1025", 10, 1)))
        assertEquals(expected.attack, saved.attack)
        assertEquals(expected.hp, saved.hp)
        assertEquals(
            setOf("status", "attack", "hp", "missingFields", "reason", "ruleVersion"),
            mapper.valueToTree<JsonNode>(saved).fieldNames().asSequence().toSet(),
        )
    }

    @Test fun `batch is bounded resolves repositories once and hides nonpublished source IDs`() {
        val result = service.current("u", mapper.readTree("""{"account_id":"a","operator_ids":["operator.test","123"]}"""))
        assertEquals("unsupported", result.getValue("123").status)
        verify(exactly = 1) {
            rules.snapshot("如鸢")
            catalogs.findAllByOrderByOperatorIdAsc()
            stars.findByUserIdAndAccountId("u", "a")
        }
        val tooMany = mapper.createObjectNode().put("account_id", "a").apply {
            putArray("operator_ids").also { array -> (1..101).forEach { array.add("op$it") } }
        }
        assertThrows(OperatorApiException::class.java) { service.current("u", tooMany) }
    }

    @Test fun `account authorization runs before reading any private state or rules`() {
        every { accounts.requireAccount("stranger", "a") } throws OperatorApiException(HttpStatus.FORBIDDEN, "forbidden", "Forbidden")
        assertThrows(OperatorApiException::class.java) { service.preview("stranger", preview()) }
        verify(exactly = 0) {
            rules.snapshot(any())
            catalogs.findAllByOrderByOperatorIdAsc()
            currents.findByUserIdAndAccountIdOrderByUpdatedAtDesc(any(), any())
        }
    }

    @Test fun `unknown node states and legacy invalid history never manufacture values`() {
        every { stars.findByUserIdAndAccountId("u", "a") } returns
            state.copy(inventory = state.inventory.map { it.copy(breakthroughStage = null) })
        val result = service.preview("u", preview())
        assertEquals("incomplete", result.status)
        assertEquals(listOf("loadout.main1.breakthrough_stage"), result.missingFields)
        assertEquals(null, result.attack)
        val unknown = preview().apply { (get("huaji") as ObjectNode).putNull("stage") }
        assertTrue("huaji.stage" in service.preview("u", unknown).missingFields)
    }

    @Test fun `unowned foreign instance duplicate slots decimal and coefficient injection are rejected`() {
        for (payload in listOf(
            preview().apply { putObject("loadout").put("main1", "someone-elses") },
            preview().apply { putObject("loadout").put("main1", "mine").put("main2", "mine") },
            preview().apply { put("level", 11.5) },
            preview().apply { put("extra", 10000) },
        )) {
            assertThrows(OperatorApiException::class.java) { service.preview("u", payload) }
        }
    }

    @Test fun `game availability restrictions stale generation and unavailable rules fail closed`() {
        every { catalogs.findAllByOrderByOperatorIdAsc() } returns listOf(catalog.copy(games = listOf("代号鸢")))
        assertEquals("unsupported", service.preview("u", preview()).status)
        every { catalogs.findAllByOrderByOperatorIdAsc() } returns listOf(catalog)
        every { stars.findByUserIdAndAccountId("u", "a") } returns state.copy(generation = 2)
        assertEquals(listOf("loadout"), service.preview("u", preview()).missingFields)
        every { rules.snapshot("如鸢") } returns null
        assertEquals("rules_unavailable", service.preview("u", preview()).reason)
    }

    @Test fun `server validates profession codes for equipped stars`() {
        every { rules.snapshot("如鸢") } returns panelRules().let { bundle ->
            bundle.copy(stars = bundle.stars.map { if (it.series == 102) it.copy(name = "天机") else it })
        }
        every { stars.findByUserIdAndAccountId("u", "a") } returns state.copy(inventory = state.inventory.map { it.copy(name = "天机") })
        assertThrows(OperatorApiException::class.java) { service.preview("u", preview()) }
        every { catalogs.findAllByOrderByOperatorIdAsc() } returns listOf(catalog.copy(subProf = listOf("shenji")))
        assertEquals("calculated", service.preview("u", preview()).status)
    }
}
