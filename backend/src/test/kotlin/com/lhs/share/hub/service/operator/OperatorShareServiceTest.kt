package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorPanelResponse
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorAnnotation
import com.lhs.share.hub.repository.entity.OperatorCombatDisplayMode
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.OperatorStarStone
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import java.time.Instant

class OperatorShareServiceTest {
    private val accountRepository = mockk<SubAccountRepository>()
    private val operatorService = mockk<OperatorService>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val annotationRepository = mockk<OperatorAnnotationRepository>(relaxed = true)
    private val organizationService = mockk<OperatorOrganizationService>()
    private val authorization = mockk<com.lhs.share.hub.service.admin.AdminAuthorizationService>(relaxed = true)
    private val panels = mockk<OperatorPanelService>(relaxed = true)
    private val service =
        OperatorShareService(
            accountRepository,
            operatorService,
            catalogService,
            annotationRepository,
            organizationService,
            panels,
            authorization,
        )

    @AfterEach
    fun `sharing never replaces or upserts the account document`() {
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `public tags require consent and expose only shared members with no private classification`(enabled: Boolean) {
        val account = account("code").copy(shareScopes = if (enabled) listOf("operator", "operator_tags") else listOf("operator"))
        every { accountRepository.findByShareToken("code") } returns account
        every { catalogService.currentCatalogVersion() } returns "fixture"
        every { operatorService.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse(
                userId = "u1",
                accountId = "acc1",
                game = "代号鸢",
                fullBaselineAt = Instant.EPOCH,
                entries = mapOf("owned" to entry(starLevel = 3), "unowned" to entry(starLevel = 0)),
                updatedAt = Instant.EPOCH,
            ),
        )
        every { organizationService.get("u1", "acc1") } returns jacksonObjectMapper().readTree(
            """{"pinned_ids":["private"],"status_order":["skip"],"revision":9,"tags":[
              {"id":"main","name":"主力","operator_ids":["owned","unowned","absent"]},
              {"id":"hidden","name":"私人空标签","operator_ids":["unowned"]}
            ]}""",
        ) as com.fasterxml.jackson.databind.node.ObjectNode
        val view = service.view("code", "viewer")
        assertEquals(setOf("owned"), view.entries.keys)
        assertEquals(if (enabled) 1 else 0, view.tags.size)
        if (enabled) {
            assertEquals("主力", view.tags.single().name)
            assertEquals(listOf("owned"), view.tags.single().operatorIds)
        }
        val json = jacksonObjectMapper().registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).valueToTree<com.fasterxml.jackson.databind.JsonNode>(view)
        assertEquals(setOf("game", "catalog_version", "updated_at", "entries", "tags"), json.fieldNames().asSequence().toSet())
        if (enabled) assertEquals(setOf("id", "name", "operator_ids"), json.path("tags")[0].fieldNames().asSequence().toSet())
        verify(exactly = if (enabled) 1 else 0) { organizationService.get("u1", "acc1") }
        verify(exactly = if (enabled) 1 else 0) { organizationService.get(any(), any()) }
        verify(exactly = 0) { organizationService.put(any(), any(), any()) }
        verify(exactly = 0) { accountRepository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `create is idempotent and regenerate replaces the old code`() {
        val withoutCode = account()
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns withoutCode
        every { accountRepository.updateShareAuthorization("u1", "acc1", any(), any(), any(), any(), any()) } answers
            { account(args[4] as String?) }

        val created = service.create("u1", "acc1")
        assertTrue(created.active)
        assertTrue(created.shareCode!!.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")))

        val current = account(created.shareCode)
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns current
        val reused = service.create("u1", "acc1")
        val regenerated = service.regenerate("u1", "acc1")

        assertEquals(created.shareCode, reused.shareCode)
        assertNotEquals(created.shareCode, regenerated.shareCode)
        verify(exactly = 2) { accountRepository.updateShareAuthorization("u1", "acc1", any(), any(), any(), any(), any()) }
    }

    @Test
    fun `revoke is idempotent and account ownership is enforced`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns account("code")
        every { accountRepository.updateShareAuthorization("u1", "acc1", "code", any(), null, any(), any()) } returns account()

        val revoked = service.revoke("u1", "acc1")
        assertEquals(false, revoked.active)
        assertEquals(null, revoked.shareCode)

        every { accountRepository.findByUserIdAndAccountId("u1", "missing") } returns null
        val error = assertThrows(OperatorApiException::class.java) { service.get("u1", "missing") }
        assertEquals(HttpStatus.NOT_FOUND, error.status)
        assertEquals("account_not_found", error.code)
    }

    @ParameterizedTest
    @ValueSource(strings = ["active", "graduated", "skip", "discarded"])
    fun `public view filters un recruited entries and omits private current fields`(state: String) {
        every { authorization.hasPermission("viewer", com.lhs.share.hub.service.admin.AdminPermission.OPERATOR_PANEL_USE) } returns true
        val panel = OperatorPanelResponse("calculated", 123, 456, ruleVersion = "synthetic")
        every { panels.saved("u1", "acc1", setOf("recruited")) } returns mapOf("recruited" to panel)
        every { accountRepository.findByShareToken("code") } returns account("code")
        every { catalogService.currentCatalogVersion() } returns "2026-09-03"
        every { annotationRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc("u1", "acc1") } returns listOf(
            OperatorAnnotation(userId = "u1", accountId = "acc1", operatorId = "recruited", growthState = state),
        )
        every { operatorService.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse(
                userId = "u1",
                accountId = "acc1",
                game = "代号鸢",
                fullBaselineAt = Instant.EPOCH,
                entries = mapOf(
                    "unrecruited" to entry(starLevel = 0),
                    "recruited" to entry(starLevel = 27),
                ),
                updatedAt = Instant.parse("2026-09-03T08:00:00Z"),
            ),
        )

        val view = service.view("code", "viewer")

        assertEquals("代号鸢", view.game)
        assertEquals("2026-09-03", view.catalogVersion)
        assertEquals(setOf("recruited"), view.entries.keys)
        assertEquals(27, view.entries.getValue("recruited").starLevel)
        assertEquals(9, view.entries.getValue("recruited").levelBreakthroughStage)
        assertEquals(state, view.entries.getValue("recruited").growthState)
        assertEquals(panel, view.entries.getValue("recruited").panel)
        verify(exactly = 1) { panels.saved("u1", "acc1", setOf("recruited")) }
        val json = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .writeValueAsString(view)
        val values = jacksonObjectMapper().readTree(json).path("entries").path("recruited").path("combat_stats").path("oddities")
        val sharedLoadout = jacksonObjectMapper().readTree(json).path("entries").path("recruited").path("disc_loadouts")[0]
        assertEquals("技能增伤", sharedLoadout.path("discs")[0].path("ot_name").asText())
        assertTrue(!sharedLoadout.has("target_discs"))
        assertEquals("reroll", sharedLoadout.path("status").asText())
        assertTrue("仅自己可见" !in json)
        assertEquals(0.5, values.path("special").path("current").doubleValue())
        assertTrue(values.path("attack").path("current").isIntegralNumber)
        listOf(
            "user_id",
            "account_id",
            "revision",
            "listed_baseline_at",
            "source",
            "observed_at",
            "combat_input_signature",
            "display_mode",
            "potential_extra",
            "kizunas",
            "source_id",
        ).forEach { field -> assertTrue("\"$field\":" !in json, "$field must stay private") }
        verify { operatorService.current("u1", "acc1", "代号鸢") }
    }

    @Test
    fun `public view returns an empty response without current data`() {
        every { accountRepository.findByShareToken("code") } returns account("code")
        every { catalogService.currentCatalogVersion() } returns "2026-09-03"
        every { operatorService.current("u1", "acc1", "代号鸢") } returns emptyList()

        val view = service.view("code", "viewer")

        assertTrue(view.entries.isEmpty())
        assertEquals(null, view.updatedAt)
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `shared display honors account and per stat preferences without altering original values`(enabled: Boolean) {
        every { accountRepository.findByShareToken("code") } returns account("code").copy(operatorPanelAutoFill = enabled)
        every { catalogService.currentCatalogVersion() } returns "fixture"
        val manual = OperatorCombatStats(manualAttack = 9000, manualHp = 30000, observedStatus = "stale")
        val rows = mapOf(
            "manual" to entry(3).copy(combatStats = manual),
            "partial" to entry(3).copy(combatStats = OperatorCombatStats(manualHp = 30000)),
            "observed" to entry(3).copy(combatStats = OperatorCombatStats(observedAttack = 8000, observedHp = 20000)),
            "auto" to entry(3).copy(combatStats = manual.copy(displayMode = OperatorCombatDisplayMode("auto", "manual"))),
            "unavailable" to entry(3).copy(combatStats = manual.copy(displayMode = OperatorCombatDisplayMode("auto", "auto"))),
            "empty_manual" to entry(3).copy(combatStats = OperatorCombatStats(displayMode = OperatorCombatDisplayMode("manual", "manual"))),
        )
        every { operatorService.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse("u1", "acc1", "代号鸢", null, rows, Instant.EPOCH),
        )
        every { panels.saved("u1", "acc1", rows.keys) } returns rows.mapValues { (id, _) ->
            if (id == "unavailable") OperatorPanelResponse("incomplete") else OperatorPanelResponse("calculated", 1000, 2000)
        }
        every { authorization.hasPermission("viewer", com.lhs.share.hub.service.admin.AdminPermission.OPERATOR_PANEL_USE) } returns true
        val entries = service.view("code", "viewer").entries
        fun values(id: String) = entries.getValue(id).displayPanel!!.let { it.attack to it.hp }
        assertEquals(9000L to 30000L, values("manual"))
        assertEquals((if (enabled) 1000L else null) to 30000L, values("partial"))
        assertEquals(8000L to 20000L, values("observed"))
        assertEquals(1000L to 30000L, values("auto"))
        assertEquals(9000L to 30000L, values("unavailable"))
        assertEquals(null to null, values("empty_manual"))
        assertEquals("calculated", entries.getValue("auto").displayPanel!!.attackSource)
        assertEquals(9000L, entries.getValue("auto").combatStats!!.manualAttack)
        assertEquals("stale", rows.getValue("manual").combatStats!!.observedStatus)
        every { authorization.hasPermission("viewer", com.lhs.share.hub.service.admin.AdminPermission.OPERATOR_PANEL_USE) } returns false
        for (viewer in listOf(null, "viewer")) {
            val restricted = service.view("code", viewer).entries
            assertTrue(restricted.values.all { it.panel == null })
            assertEquals(9000L, restricted.getValue("auto").displayPanel!!.attack)
            assertEquals("manual", restricted.getValue("auto").displayPanel!!.attackSource)
        }
        verify(exactly = 1) { panels.saved("u1", "acc1", rows.keys) }
        verify(exactly = 0) { accountRepository.updateOperatorPanelAutoFill(any(), any(), any()) }
    }

    @Test
    fun `invalid public code has one stable error and never exposes account data`() {
        every { accountRepository.findByShareToken("bad") } returns null

        val error = assertThrows(OperatorApiException::class.java) { service.view("bad") }

        assertEquals(HttpStatus.NOT_FOUND, error.status)
        assertEquals("share_not_found", error.code)
        assertTrue(error.message!!.contains("not found"))
        verify(exactly = 0) { operatorService.current(any(), any(), any()) }
        verify(exactly = 0) { panels.saved(any(), any(), any()) }
    }

    @Test
    fun `share code collisions stop after a bounded number of attempts`() {
        val account = account()
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns account
        every { accountRepository.updateShareAuthorization("u1", "acc1", null, any(), any(), any(), any()) } throws
            DuplicateKeyException("collision")

        val error = assertThrows(OperatorApiException::class.java) { service.create("u1", "acc1") }

        assertEquals(HttpStatus.CONFLICT, error.status)
        assertEquals("share_code_generation_failed", error.code)
        verify(exactly = 3) { accountRepository.updateShareAuthorization("u1", "acc1", null, any(), any(), any(), any()) }
    }

    @Test
    fun `regenerate and revoke invalidate codes without crossing accounts`() {
        val accounts = mutableMapOf(
            "acc1" to account(),
            "acc2" to account("other", accountId = "acc2"),
        )
        every { accountRepository.findByUserIdAndAccountId(any(), any()) } answers { accounts[secondArg()] }
        every { accountRepository.updateShareAuthorization(any(), any(), any(), any(), any(), any(), any()) } answers {
            accounts[secondArg()]?.takeIf {
                it.userId == firstArg<String>() && it.shareToken == args[2]
            }?.copy(shareToken = args[4] as String?, shareScopes = args[5] as List<String>)?.also {
                accounts[it.accountId] =
                    it
            }
        }
        every { accountRepository.findByShareToken(any()) } answers {
            val code = firstArg<String>()
            accounts.values.firstOrNull { it.shareToken == code }
        }
        every { catalogService.currentCatalogVersion() } returns "2026-09-03"
        every { operatorService.current(any(), any(), any()) } returns emptyList()

        val oldCode = service.create("u1", "acc1").shareCode!!
        val newCode = service.regenerate("u1", "acc1").shareCode!!
        val otherCode = service.create("u1", "acc2").shareCode!!

        assertNotEquals(oldCode, newCode)
        assertNotEquals(newCode, otherCode)
        assertThrows(OperatorApiException::class.java) { service.view(oldCode) }
        service.view(otherCode)
        verify { operatorService.current("u1", "acc2", "代号鸢") }

        service.revoke("u1", "acc2")
        assertThrows(OperatorApiException::class.java) { service.view(otherCode) }
    }

    @Test
    fun `concurrent create reuses the atomic winner while regenerate compares the latest token`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account(), account("winner"))
        every { accountRepository.updateShareAuthorization("u1", "acc1", null, any(), any(), any(), any()) } returns null
        assertEquals("winner", service.create("u1", "acc1").shareCode)

        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account("old"), account("winner"))
        every { accountRepository.updateShareAuthorization("u1", "acc1", "old", any(), any(), any(), any()) } returns null
        every { accountRepository.updateShareAuthorization("u1", "acc1", "winner", any(), any(), any(), any()) } answers
            { account(args[4] as String?) }
        assertNotEquals("winner", service.regenerate("u1", "acc1").shareCode)
        verify(exactly = 1) { accountRepository.updateShareAuthorization("u1", "acc1", "winner", any(), any(), any(), any()) }
    }

    @Test
    fun `stale revoke cannot remove a newly regenerated code and already revoked winner is idempotent`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account("old"), account("new"))
        every { accountRepository.updateShareAuthorization("u1", "acc1", "old", any(), null, any(), any()) } returns null
        val changed = assertThrows(OperatorApiException::class.java) { service.revoke("u1", "acc1") }
        assertEquals("share_code_changed", changed.code)
        assertEquals(HttpStatus.CONFLICT, changed.status)
        verify(exactly = 0) { accountRepository.updateShareAuthorization("u1", "acc1", "new", any(), null, any(), any()) }

        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account("old"), account())
        assertEquals(false, service.revoke("u1", "acc1").active)
    }

    @Test
    fun `late share create cannot revive an account deleted after the initial read`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account(), null)
        every { accountRepository.updateShareAuthorization("u1", "acc1", null, any(), any(), any(), any()) } returns null
        val deleted = assertThrows(OperatorApiException::class.java) { service.create("u1", "acc1") }
        assertEquals("account_not_found", deleted.code)
    }

    @Test
    fun `late share regenerate and revoke cannot revive deleted accounts`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account("old"), null)
        every { accountRepository.updateShareAuthorization("u1", "acc1", "old", any(), any(), any(), any()) } returns null
        assertEquals("account_not_found", assertThrows(OperatorApiException::class.java) { service.regenerate("u1", "acc1") }.code)

        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returnsMany listOf(account("old"), null)
        assertEquals("account_not_found", assertThrows(OperatorApiException::class.java) { service.revoke("u1", "acc1") }.code)
    }

    private fun account(shareToken: String? = null, accountId: String = "acc1") = SubAccount(
        id = "mongo-id",
        userId = "u1",
        accountId = accountId,
        name = "大号",
        game = "代号鸢",
        shareToken = shareToken,
    )

    @ParameterizedTest
    @ValueSource(strings = ["unmarked", "perfect", "reroll"])
    fun `public disc states preserve manual marks and legacy defaults without exposing targets`(discStatus: String) {
        every { accountRepository.findByShareToken("code") } returns account("code")
        every { catalogService.currentCatalogVersion() } returns "fixture"
        val current = entry(27)
        every { operatorService.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse(
                userId = "u1",
                accountId = "acc1",
                game = "代号鸢",
                fullBaselineAt = Instant.EPOCH,
                entries = mapOf(
                    "owned" to current.copy(
                        discLoadouts = listOf(
                            current.discLoadouts.first().copy(status = discStatus),
                            OperatorDiscLoadout("disc_2", "旧命盘", emptyList()),
                        ),
                    ),
                ),
                updatedAt = Instant.EPOCH,
            ),
        )
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val json = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(service.view("code"))
        val loadouts = json.path("entries").path("owned").path("disc_loadouts")
        assertEquals(discStatus, loadouts[0].path("status").asText())
        assertEquals("unmarked", loadouts[1].path("status").asText())
        loadouts.forEach { loadout ->
            assertEquals(setOf("id", "name", "discs", "status"), loadout.fieldNames().asSequence().toSet())
        }
        assertTrue("仅自己可见" !in json.toString())
    }

    private fun entry(starLevel: Int) = OperatorCurrentEntryDto(
        elite = 17,
        starLevel = starLevel,
        level = 90,
        levelBreakthroughStage = 9,
        discs = listOf(OperatorDisc("技能增伤")),
        starStones = listOf(OperatorStarStone("攻击力", "main1", 60)),
        discLoadouts = listOf(
            OperatorDiscLoadout(
                "disc_1",
                "命盘一",
                listOf(OperatorDisc("技能增伤")),
                "reroll",
                listOf(OperatorDisc("仅自己可见")),
            ),
        ),
        combatStats = OperatorCombatStats(
            observedAttack = 8186,
            observedHp = 28704,
            manualAttack = null,
            manualHp = null,
            source = "scan",
            observedAt = Instant.EPOCH,
            observedStatus = "valid",
            combatInputSignature = "private-signature",
            displayMode = OperatorCombatDisplayMode("auto", "manual"),
            oddities = mapOf("attack" to OperatorOddityValue(500.0), "special" to OperatorOddityValue(0.5)),
        ),
        revision = 8,
        listedBaselineAt = Instant.EPOCH,
        updatedAt = Instant.parse("2026-09-03T08:00:00Z"),
    )
}
