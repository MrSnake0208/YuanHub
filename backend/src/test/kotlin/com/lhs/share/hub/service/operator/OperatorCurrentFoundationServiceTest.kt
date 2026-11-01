package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.operator.request.OperatorDiscRequest
import com.lhs.share.hub.controller.operator.request.OperatorEntryRequest
import com.lhs.share.hub.controller.operator.request.OperatorExchangeAccountDto
import com.lhs.share.hub.controller.operator.request.OperatorImportRequest
import com.lhs.share.hub.controller.operator.request.OperatorRecordRequest
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCombatDisplayMode
import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorDisc
import com.lhs.share.hub.repository.entity.OperatorDiscCatalog
import com.lhs.share.hub.repository.entity.OperatorDiscLoadout
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.hub.repository.entity.OperatorRecord
import com.lhs.share.hub.repository.entity.OperatorRecordEntry
import com.lhs.share.hub.repository.entity.OperatorStarStone
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class OperatorCurrentFoundationServiceTest {
    private val accountRepository = mockk<SubAccountRepository>()
    private val currentRepository = mockk<OperatorCurrentRepository>()
    private val recordRepository = mockk<OperatorRecordRepository>()
    private val catalogRepository = mockk<OperatorCatalogRepository>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val correctionRepository = mockk<OperatorCorrectionRecordRepository>()
    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        },
    )
    private val service = OperatorService(
        accountRepository,
        currentRepository,
        recordRepository,
        catalogRepository,
        catalogService,
        transactionTemplate,
        correctionRepository,
        mockk<com.lhs.share.hub.service.star.StarStateService>(relaxed = true),
    )
    private val mapper = jacksonObjectMapper()
    private lateinit var stored: OperatorCurrent
    private var rarity = 5
    private var spOf: String? = null
    private var specialOddityName: String? = "增伤值"
    private var lastCorrection: OperatorCorrectionRecord? = null
    private var lastCasGame: String? = null

    @BeforeEach
    fun setUp() {
        lastCorrection = null
        lastCasGame = null
        specialOddityName = "增伤值"
        stored = OperatorCurrent(
            id = "current-1",
            userId = "u1",
            accountId = "acc1",
            game = "代号鸢",
            entries = mapOf("op1" to baseEntry()),
        )
        every { accountRepository.findByUserIdAndAccountId("u1", "acc1") } returns
            SubAccount(userId = "u1", accountId = "acc1", name = "账号", game = "代号鸢")
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { stored }
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "universal") } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "*") } returns null
        every { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) } answers {
            lastCasGame = arg(2)
            val updates = arg<Map<String, OperatorEntry>>(5)
            stored = stored.copy(entries = stored.entries + updates, updatedAt = arg(6))
            stored
        }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { stored = it } }
        every { correctionRepository.save(any()) } answers {
            firstArg<OperatorCorrectionRecord>().also { lastCorrection = it }
        }
        every { catalogService.getOperator("op1") } answers { catalog("op1", rarity, spOf) }
        every { catalogService.spFormsOf(any()) } returns emptyList()
    }

    @Test
    fun `orphan cleanup removes only the requested id in all account versions and is repeatable`() {
        val oldId = "char_130_zhoutai"
        val newId = "char_129_zhoutai"
        val original = baseEntry()
        val documents = mutableMapOf(
            "代号鸢" to stored.copy(entries = mapOf(oldId to original, newId to original)),
            "universal" to stored.copy(id = "generic", game = "universal", entries = mapOf(oldId to original)),
        )
        val corrections = mutableListOf<OperatorCorrectionRecord>()
        every { catalogService.getOperator(oldId) } returns null
        every { currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "acc1") } answers { documents.values.toList() }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { documents[it.game] = it } }
        every { correctionRepository.save(any()) } answers { firstArg<OperatorCorrectionRecord>().also(corrections::add) }

        service.removeOrphanCurrent("u1", "acc1", oldId)
        service.removeOrphanCurrent("u1", "acc1", oldId)

        assertEquals(mapOf(newId to original), documents.getValue("代号鸢").entries)
        assertEquals(emptyMap<String, OperatorEntry>(), documents.getValue("universal").entries)
        assertEquals(2, corrections.size)
        assertEquals(setOf("catalog_removed"), corrections.map { it.reason }.toSet())
        assertEquals(original.level, corrections.first().level)
        verify(exactly = 0) { recordRepository.delete(any()) }
    }

    @Test
    fun `orphan cleanup rejects active catalog ids and foreign accounts before changing current`() {
        val active = assertThrows(OperatorApiException::class.java) { service.removeOrphanCurrent("u1", "acc1", "op1") }
        assertEquals("operator_still_in_catalog", active.code)
        every { accountRepository.findByUserIdAndAccountId("u2", "acc1") } returns null
        val foreign = assertThrows(OperatorApiException::class.java) { service.removeOrphanCurrent("u2", "acc1", "op1") }
        assertEquals("account_not_found", foreign.code)
        verify(exactly = 0) { currentRepository.save(any()) }
        verify(exactly = 0) { correctionRepository.save(any()) }
    }

    @Test
    fun `legacy current entry derives first loadout and new defaults`() {
        val legacy = OperatorCurrent(
            userId = "u1",
            accountId = "acc1",
            game = "代号鸢",
            entries = mapOf(
                "op1" to OperatorEntry(
                    elite = 1,
                    starLevel = 2,
                    level = 10,
                    discs = listOf(OperatorDisc("盘A")),
                ),
            ),
        )

        val entry = OperatorCurrentResponse.of(legacy).entries.getValue("op1")

        assertEquals("命盘一", entry.discLoadouts.single().name)
        assertEquals(entry.discs, entry.discLoadouts.single().discs)
        assertNull(entry.combatStats)
        assertEquals(0, entry.revision)
        assertNull(entry.updatedAt)
    }

    @Test
    fun `patch merges present fields normalizes loadouts and clears manual value with null`() {
        val request = mapper.readTree(
            """
            {
              "disc_loadouts": [
                {"id":"one","name":"  主力  ","discs":[{"ot_name":"盘A"}]},
                {"id":"two","name":null,"discs":[]}
              ],
              "combat_stats": {
                "manual_attack": null,
                "oddities": {"attack":{"current":500,"max":999999}}
              },
              "expected_revision": 7,
              "reason": "manual_correction"
            }
            """.trimIndent(),
        ) as com.fasterxml.jackson.databind.node.ObjectNode

        val result = service.patchCurrent("u1", "acc1", "代号鸢", "op1", request)

        assertEquals(8, result.revision)
        assertEquals("主力", result.discLoadouts[0].name)
        assertEquals("命盘二", result.discLoadouts[1].name)
        assertEquals(result.discs, result.discLoadouts[0].discs)
        assertNull(result.combatStats?.manualAttack)
        assertEquals(500.0, result.combatStats?.oddities?.get("attack")?.current)
        assertEquals("stale", result.combatStats?.observedStatus)
    }

    @Test
    fun `dual targets save independently without changing actual discs or observations and survive old scan patches`() {
        val before = stored.entries.getValue("op1")
        val saved = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"disc_loadouts":[
                  {"id":"one","name":"命盘一","discs":[{"ot_name":"盘A"}],"status":"reroll","target_discs":[{"ot_name":"盘B"},{"ot_name":"盘C"}]},
                  {"id":"two","name":"命盘二","discs":[{"ot_name":"盘B"}],"status":"reroll","target_discs":[{"ot_name":"盘A"}]}
                ]""",
            ),
        )
        assertEquals(before.discs, saved.discs)
        assertEquals(before.combatStats, saved.combatStats)
        assertEquals(listOf("盘B", "盘C"), saved.discLoadouts[0].targetDiscs.map { it.otName })
        assertEquals(listOf("盘A"), saved.discLoadouts[1].targetDiscs.map { it.otName })
        assertEquals(saved.discLoadouts, lastCorrection!!.discLoadouts)
        assertEquals(saved.discLoadouts, stored.entries.getValue("op1").discLoadouts)
        val scanned = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""disc_loadouts":[{"id":"scan-id","discs":[{"ot_name":"盘C"}]}]""", revision = saved.revision),
        )
        assertEquals(listOf("盘C"), scanned.discs.map { it.otName })
        assertEquals(saved.discLoadouts.map { it.targetDiscs }, scanned.discLoadouts.map { it.targetDiscs })
        assertEquals(listOf("reroll", "reroll"), scanned.discLoadouts.map { it.status })
        val cleared = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""disc_loadouts":[]""", revision = scanned.revision),
        )
        assertEquals(emptyList<OperatorDisc>(), cleared.discs)
        assertEquals(saved.discLoadouts.map { it.targetDiscs }, cleared.discLoadouts.map { it.targetDiscs })
    }

    @Test
    fun `changing status retains targets and explicit empty targets clear only their own slot`() {
        val original = baseEntry().copy(
            discLoadouts = baseEntry().discLoadouts.map { it.copy(status = "reroll", targetDiscs = listOf(OperatorDisc("盘C"))) },
        )
        stored = stored.copy(entries = mapOf("op1" to original))
        val saved = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"disc_loadouts":[
                  {"id":"one","discs":[{"ot_name":"盘A"}],"status":"perfect"},
                  {"id":"two","discs":[{"ot_name":"盘B"}],"status":"unmarked","target_discs":[]}
                ]""",
            ),
        )
        assertEquals("perfect", saved.discLoadouts[0].status)
        assertEquals(original.discLoadouts[0].targetDiscs, saved.discLoadouts[0].targetDiscs)
        assertEquals("unmarked", saved.discLoadouts[1].status)
        assertEquals(emptyList<OperatorDisc>(), saved.discLoadouts[1].targetDiscs)
    }

    @Test
    fun `invalid targets and foreign account cannot write current or correction`() {
        for (extra in listOf(
            """"status":"automatic"""",
            """"status":null""",
            """"target_discs":null""",
            """"target_discs":[{"ot_name":"foreign"}]""",
            """"target_discs":[{"ot_name":"盘A"},{"ot_name":"盘A"}]""",
            """"target_discs":[{"ot_name":"盘A"},{"ot_name":"盘B"},{"ot_name":"盘C"},{"ot_name":"盘A"}]""",
        )) {
            val error = assertThrows(OperatorApiException::class.java) {
                service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch(""""disc_loadouts":[{"id":"one","discs":[],$extra}]"""))
            }
            assertEquals("invalid_disc_loadout", error.code)
        }
        every { accountRepository.findByUserIdAndAccountId("u2", "acc1") } returns null
        every { accountRepository.findByUserIdAndAccountId("u1", "acc2") } returns null
        for ((user, account) in listOf("u2" to "acc1", "u1" to "acc2")) {
            val error = assertThrows(OperatorApiException::class.java) {
                service.patchCurrent(user, account, "代号鸢", "op1", patch(""""disc_loadouts":[]"""))
            }
            assertEquals("account_not_found", error.code)
        }
        verify(exactly = 0) { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { correctionRepository.save(any()) }
    }

    @Test
    fun `patch rejects active semantics null loadouts and stale revision`() {
        val active = patch(""""disc_loadouts":[],"active_disc_loadout_id":"one"""")
        val nullLoadouts = patch(""""disc_loadouts":null""")
        val stale = patch(""""level":20,"expected_revision":6""", includeRevision = false)

        val activeError = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", active)
        }
        val nullError = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", nullLoadouts)
        }
        val staleError = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", stale)
        }

        assertEquals("schema_validation_failed", activeError.code)
        assertEquals("invalid_disc_loadout", nullError.code)
        assertEquals(HttpStatus.CONFLICT, staleError.status)
        assertEquals("operator_revision_conflict", staleError.code)
    }

    @Test
    fun `rarity limits and stable oddity keys are enforced`() {
        val limits = mapOf(3 to Triple(300, 1560, 9), 4 to Triple(350, 1820, 11), 5 to Triple(500, 2600, 15))
        limits.forEach { (testedRarity, values) ->
            rarity = testedRarity
            stored = stored.copy(entries = mapOf("op1" to baseEntry()))
            val valid = patch(
                """"combat_stats":{"oddities":{"attack":{"current":${values.first}},"hp":{"current":${values.second}},"special":{"current":${values.third}}}}""",
            )
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", valid)
            assertEquals(values.third.toDouble(), stored.entries.getValue("op1").combatStats?.oddities?.get("special")?.current)
        }
        rarity = 4
        stored = stored.copy(entries = mapOf("op1" to baseEntry()))
        val overflow = patch(""""combat_stats":{"oddities":{"attack":{"current":351}}}""")
        val unknown = patch(""""combat_stats":{"oddities":{"damage":{"current":1}}}""")

        assertEquals(
            "invalid_combat_stats",
            assertThrows(OperatorApiException::class.java) {
                service.patchCurrent("u1", "acc1", "代号鸢", "op1", overflow)
            }.code,
        )
        assertEquals(
            "invalid_combat_stats",
            assertThrows(OperatorApiException::class.java) {
                service.patchCurrent("u1", "acc1", "代号鸢", "op1", unknown)
            }.code,
        )
    }

    @Test
    fun `special accepts tenths and persists correction while omitted oddities remain unchanged`() {
        every { currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc("u1", "acc1") } answers { listOf(stored) }
        for (value in listOf("0.1", "0.5", "3.2", "0", "15", "0.50")) {
            setUp()
            val result = service.patchCurrent(
                "u1",
                "acc1",
                "代号鸢",
                "op1",
                patch(""""combat_stats":{"oddities":{"special":{"current":$value}}}"""),
            )
            assertEquals(value.toDouble(), result.combatStats?.oddities?.get("special")?.current)
            assertEquals(value.toDouble(), lastCorrection?.combatStats?.oddities?.get("special")?.current)
            assertEquals(100.0, stored.entries.getValue("op1").combatStats?.oddities?.get("attack")?.current)
            assertEquals(8, result.revision)
            assertEquals(
                value.toDouble(),
                service.current("u1", "acc1", "代号鸢").single().entries.getValue("op1")
                    .combatStats?.oddities?.get("special")?.current,
            )
        }
    }

    @Test
    fun `invalid oddity precision types and bounds never write or advance revision`() {
        val cases = listOf(
            "special" to "0.55", "special" to "-0.5", "special" to "15.1",
            "special" to "\"0.5\"", "special" to "null", "special" to "true",
            "attack" to "0.5", "hp" to "0.5", "attack" to "1.0",
        )
        cases.forEach { (key, value) ->
            val error = assertThrows(OperatorApiException::class.java) {
                service.patchCurrent(
                    "u1",
                    "acc1",
                    "代号鸢",
                    "op1",
                    patch(""""combat_stats":{"oddities":{"$key":{"current":$value}}}"""),
                )
            }
            assertEquals("invalid_combat_stats", error.code)
            assertEquals("combat_stats.oddities.$key.current", error.fieldPath)
            assertEquals(7, stored.entries.getValue("op1").revision)
            assertNull(lastCorrection)
        }
        verify(exactly = 0) { correctionRepository.save(any()) }
        verify(exactly = 0) { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `decimal correction cannot overwrite a newer revision`() {
        val error = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent(
                "u1",
                "acc1",
                "代号鸢",
                "op1",
                patch(""""combat_stats":{"oddities":{"special":{"current":0.5}}}""", revision = 6),
            )
        }
        assertEquals("operator_revision_conflict", error.code)
        assertEquals(7, stored.entries.getValue("op1").revision)
        assertNull(lastCorrection)
        verify(exactly = 0) { correctionRepository.save(any()) }
        verify(exactly = 0) { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `equal special numeric inputs preserve signature while a tenth change marks scan stale`() {
        val entry = baseEntry().copy(levelBreakthroughStage = 0)
        stored = stored.copy(entries = mapOf("op1" to entry))
        fun observation(value: String) = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"level":10,"level_breakthrough_stage":0,"combat_stats":{"observed_attack":1000,"source":"scan","oddities":{"special":{"current":$value}}}""",
            ),
        )
            .after
        assertEquals(observation("1").combatStats?.combatInputSignature, observation("1.0").combatStats?.combatInputSignature)
        val before = observation("0.5")
        stored = stored.copy(entries = mapOf("op1" to entry.copy(combatStats = before.combatStats, revision = before.revision)))
        specialOddityName = "自定义第三项"
        val same = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""combat_stats":{"oddities":{"special":{"current":0.50}}}""", revision = before.revision),
        ).after
        assertEquals("valid", same.combatStats?.observedStatus)
        val changed = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""combat_stats":{"oddities":{"special":{"current":0.6}}}""", revision = before.revision),
        ).after
        assertEquals("stale", changed.combatStats?.observedStatus)
    }

    @Test
    fun `editing a movie syncs base and siblings without copying ownership or observations`() {
        spOf = "base"
        every { catalogService.getOperator("base") } returns catalog("base", 4, null)
        every { catalogService.getOperator("sibling") } returns catalog("sibling", 5, "base")
        every { catalogService.spFormsOf("base") } returns listOf("op1", "sibling")
        val before = baseEntry()
        stored = stored.copy(entries = stored.entries + ("base" to before.copy(starLevel = 31)))
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level\":100"))
        assertEquals(100, stored.entries.getValue("base").level)
        assertEquals(31, stored.entries.getValue("base").starLevel)
        assertEquals(before.revision + 1, stored.entries.getValue("base").revision)
        assertEquals("stale", stored.entries.getValue("base").combatStats?.observedStatus)
        assertEquals(100, stored.entries.getValue("sibling").level)
        assertEquals(0, stored.entries.getValue("sibling").starLevel)
        assertEquals(3, stored.entries.getValue("op1").starLevel)
    }

    @Test
    fun `creating a movie through star-only patch inherits base growth and full import retains zero-star relations`() {
        spOf = "base"
        every { catalogService.getOperator("base") } returns catalog("base", 4, null)
        every { catalogService.spFormsOf("base") } returns listOf("op1")
        stored = stored.copy(entries = mapOf("base" to baseEntry().copy(level = 100, elite = 17)))
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"star_level\":2", revision = 0))
        assertEquals(100, stored.entries.getValue("op1").level)
        assertEquals(17, stored.entries.getValue("op1").elite)
        assertEquals(2, stored.entries.getValue("op1").starLevel)
        service.completeFullImport("u1", "acc1", "代号鸢", setOf("op1"), java.time.Instant.now())
        assertEquals(0, stored.entries.getValue("base").starLevel)
        assertEquals(100, stored.entries.getValue("base").level)
    }

    @Test
    fun `new movie preserves owned generic base while materializing shared growth`() {
        spOf = "base"
        every { catalogService.getOperator("base") } returns catalog("base", 4, null)
        every { catalogService.spFormsOf("base") } returns listOf("op1")
        val genericBase = baseEntry().copy(level = 90, starLevel = 31)
        val generic = stored.copy(game = "universal", entries = mapOf("base" to genericBase))
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "universal") } returns generic
        stored = stored.copy(entries = emptyMap())
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"star_level\":2", revision = 0))
        assertEquals(90, stored.entries.getValue("op1").level)
        assertEquals(31, stored.entries.getValue("base").starLevel)
        assertEquals(genericBase.discLoadouts, stored.entries.getValue("base").discLoadouts)
        assertEquals(1, stored.entries.getValue("base").revision)
        assertEquals(7, generic.entries.getValue("base").revision)
    }

    @Test
    fun `deleting last v2 record replays purchased growth and zero-star relations`() {
        val target = history("remove", "2026-08-21T00:00:00Z", "2026-08-21T00:00:01Z")
        every { catalogService.spFormsOf("op1") } returns listOf("movie")
        var replayed: OperatorCurrent? = stored
        every { recordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "remove") } returns target
        every { recordRepository.delete(target) } just runs
        every { currentRepository.deleteByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed = null }
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { replayed = it } }
        every { recordRepository.findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc("u1", "acc1", "代号鸢") } returns emptyList()
        every { correctionRepository.findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCorrectionRecord(
                userId = "u1", accountId = "acc1", game = "代号鸢", operatorId = "op1",
                reason = "quick_upgrade", fields = setOf("level", "elite", "star_level"),
                level = 91, elite = 16, starLevel = 3, createdAt = Instant.parse("2026-08-22T00:00:00Z"),
            ),
        )
        service.deleteRecord("u1", "acc1", "remove")
        assertEquals(91, replayed!!.entries.getValue("op1").level)
        assertEquals(3, replayed!!.entries.getValue("op1").starLevel)
        assertEquals(91, replayed!!.entries.getValue("movie").level)
        assertEquals(0, replayed!!.entries.getValue("movie").starLevel)
    }

    @Test
    fun `SP star level is direct 0 through 5 and independent`() {
        spOf = "base"
        every { catalogService.getOperator("base") } returns catalog("base", 4, null)
        every { catalogService.spFormsOf("base") } returns listOf("op1")
        val invalid = patch(""""star_level":6""")

        val error = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", invalid)
        }

        assertEquals("invalid_star_level", error.code)
        assertEquals("star_level", error.fieldPath)
        assertEquals(3, stored.entries.getValue("op1").starLevel)
    }

    @Test
    fun `patch replaces star stones, preserves omission, clears explicitly, and marks observation stale`() {
        val replace = patch(
            """
            "star_stones":[
              {"type":"main1","name":"攻击力","level":60},
              {"type":"main2","name":"攻击力2","level":60},
              {"type":"main3","name":"攻击力3","level":60},
              {"type":"assist1","name":"生命值","level":50},
              {"type":"assist2","name":"生命值2","level":50},
              {"type":"assist3","name":"生命值3","level":50}
            ]
            """.trimIndent(),
        )
        val replaced = service.patchCurrent("u1", "acc1", "代号鸢", "op1", replace)

        assertEquals(8, replaced.revision)
        assertEquals(
            listOf("main1", "main2", "main3", "assist1", "assist2", "assist3"),
            replaced.starStones.map { it.type },
        )
        assertEquals(listOf("攻击力", "攻击力2", "攻击力3", "生命值", "生命值2", "生命值3"), replaced.starStones.map { it.name })
        assertEquals("stale", replaced.combatStats?.observedStatus)

        val omission = patch(""""level":91,"expected_revision":8""", includeRevision = false)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", omission)
        assertEquals(6, stored.entries.getValue("op1").starStones.size)

        val clear = patch(""""star_stones":[],"expected_revision":9""", includeRevision = false)
        val cleared = service.patchCurrent("u1", "acc1", "代号鸢", "op1", clear)
        assertEquals(emptyList<OperatorStarStone>(), cleared.starStones)
    }

    @Test
    fun `new scan observation without signature is valid for final growth inputs`() {
        stored = stored.copy(entries = emptyMap())
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """
                "level":93,
                "elite":14,
                "star_level":3,
                "star_stones":[],
                "combat_stats":{
                  "observed_attack":4001,
                  "observed_hp":20245,
                  "source":"scan",
                  "observed_status":"valid",
                  "oddities":{
                    "attack":{"current":0},
                    "hp":{"current":0},
                    "special":{"current":15}
                  }
                }
                """.trimIndent(),
                revision = 0,
            ),
        )

        assertEquals("valid", result.combatStats?.observedStatus)
        assertEquals(4001, result.combatStats?.observedAttack)
        assertEquals(20245, result.combatStats?.observedHp)
        assertEquals(4001, result.combatStats?.manualAttack)
        assertEquals(20245, result.combatStats?.manualHp)
        assertEquals("manual", result.combatStats?.displayMode?.attack)
        assertEquals("manual", result.combatStats?.displayMode?.hp)
        assertNotNull(result.combatStats?.combatInputSignature)
        assertEquals(93, result.combatStats?.observedInputs?.level)
        assertEquals(14, result.combatStats?.observedInputs?.elite)
        assertEquals(3, result.combatStats?.observedInputs?.starLevel)
        assertNotNull(result.combatStats?.observedInputs?.odditiesSignature)
        assertNotNull(result.combatStats?.observedInputs?.equippedStarStonesSignature)
    }

    @Test
    fun `scan can change growth inputs and observations in the same patch`() {
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """
                "level":93,
                "elite":14,
                "star_level":4,
                "star_stones":[{"type":"assist1","name":"生命值","level":60}],
                "combat_stats":{
                  "observed_attack":4001,
                  "observed_hp":20245,
                  "source":"scan",
                  "oddities":{"attack":{"current":0},"hp":{"current":0},"special":{"current":15}}
                }
                """.trimIndent(),
            ),
        )

        assertEquals("valid", result.combatStats?.observedStatus)
        assertEquals(4001, result.combatStats?.manualAttack)
        assertEquals(20245, result.combatStats?.manualHp)
        assertEquals("manual", result.combatStats?.displayMode?.attack)
        assertEquals("manual", result.combatStats?.displayMode?.hp)
        assertNotEquals("scan-input-v1", result.combatStats?.combatInputSignature)
        assertEquals(93, result.combatStats?.observedInputs?.level)
        assertEquals(14, result.combatStats?.observedInputs?.elite)
        assertEquals(4, result.combatStats?.observedInputs?.starLevel)
    }

    @Test
    fun `scan can refresh only observed values without a signature`() {
        stored = stored.copy(entries = mapOf("op1" to baseEntry().copy(level = 11)))
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""combat_stats":{"observed_attack":4001,"observed_hp":20245,"source":"scan"}"""),
        )

        assertEquals("valid", result.combatStats?.observedStatus)
        assertEquals(4001, result.combatStats?.observedAttack)
        assertEquals(20245, result.combatStats?.observedHp)
        assertEquals(4001, result.combatStats?.manualAttack)
        assertEquals(20245, result.combatStats?.manualHp)
        assertEquals("manual", result.combatStats?.displayMode?.attack)
        assertEquals("manual", result.combatStats?.displayMode?.hp)
        assertNotEquals("scan-input-v1", result.combatStats?.combatInputSignature)
    }

    @Test
    fun `scan keeps legacy signature and panel values without claiming new verification`() {
        stored = stored.copy(
            entries = mapOf(
                "op1" to baseEntry().copy(
                    combatStats = checkNotNull(baseEntry().combatStats).copy(
                        manualHp = 7777,
                        displayMode = OperatorCombatDisplayMode("auto", "auto"),
                    ),
                ),
            ),
        )
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"combat_stats":{"observed_attack":4001,"source":"scan","combat_input_signature":"collector-v2"}""",
            ),
        )

        assertEquals("stale", result.combatStats?.observedStatus)
        assertNull(result.combatStats?.observedInputs?.huaji)
        assertEquals("collector-v2", result.combatStats?.combatInputSignature)
        assertEquals(4001, result.combatStats?.manualAttack)
        assertEquals("manual", result.combatStats?.displayMode?.attack)
        assertEquals(7777, result.combatStats?.manualHp)
        assertEquals("auto", result.combatStats?.displayMode?.hp)
    }

    @Test
    fun `existing observation becomes stale when only a growth input changes`() {
        val result = service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch(""""level":93"""))

        assertEquals("stale", result.combatStats?.observedStatus)
    }

    @Test
    fun `canonical combat signature is stable and covers every combat input`() {
        fun signature(
            level: Int = 10,
            elite: Int = 1,
            breakthroughStage: Int = (level - 1) / 10,
            starLevel: Int = 3,
            attackOddity: Int = 100,
            firstType: String = "main1",
            firstName: String = "攻击力",
            firstLevel: Int = 10,
            reverseStones: Boolean = false,
            includeOddityMax: Boolean = false,
        ): String {
            val stones = listOf(
                "{\"type\":\"$firstType\",\"name\":\"$firstName\",\"level\":$firstLevel}",
                "{\"type\":\"assist1\",\"name\":\"生命值\",\"level\":20}",
            ).let { if (reverseStones) it.reversed() else it }
            val max = if (includeOddityMax) ",\"max\":500" else ""
            val request = patch(
                """
                "level":$level,
                "level_breakthrough_stage":$breakthroughStage,
                "elite":$elite,
                "star_level":$starLevel,
                "star_stones":[${stones.joinToString()}],
                "combat_stats":{
                  "observed_attack":4001,
                  "observed_inputs":{"level":$level,"level_breakthrough_stage":$breakthroughStage},
                  "source":"scan",
                  "oddities":{
                    "attack":{"current":$attackOddity$max},
                    "hp":{"current":0},
                    "special":{"current":15}
                  }
                }
                """.trimIndent(),
            )
            return checkNotNull(
                service.previewCurrentPatch("u1", "acc1", "代号鸢", "op1", request)
                    .after.combatStats?.combatInputSignature,
            )
        }

        val baseline = signature()
        assertEquals("sha256:28172395b7096cfae13a58b8cb11575f1135e018b4ffb96f9856ec4716b41bb5", baseline)
        assertEquals(baseline, signature(reverseStones = true, includeOddityMax = true))
        specialOddityName = "增伤值（新展示名）"
        assertEquals(baseline, signature())
        assertNotEquals(baseline, signature(breakthroughStage = 1))
        assertNotEquals(baseline, signature(level = 11))
        assertNotEquals(baseline, signature(elite = 2))
        assertNotEquals(baseline, signature(starLevel = 4))
        assertNotEquals(baseline, signature(attackOddity = 101))
        assertNotEquals(baseline, signature(firstType = "main2"))
        assertNotEquals(baseline, signature(firstName = "攻击力 II"))
        assertNotEquals(baseline, signature(firstLevel = 11))
    }

    @Test
    fun `patch rejects invalid star stone slots names and levels`() {
        val duplicate = patch(
            """"star_stones":[{"type":"main1","name":"攻击力","level":1},{"type":"main1","name":"生命值","level":1}]""",
        )
        val invalidSlot = patch(""""star_stones":[{"type":"main","name":"攻击力","level":1}]""")
        val invalidName = patch(""""star_stones":[{"type":"main1","name":" ","level":1}]""")
        val invalidLevel = patch(""""star_stones":[{"type":"main1","name":"攻击力","level":-1}]""")

        listOf(duplicate, invalidSlot, invalidName, invalidLevel).forEach { request ->
            val error = assertThrows(OperatorApiException::class.java) {
                service.patchCurrent("u1", "acc1", "代号鸢", "op1", request)
            }
            assertEquals("invalid_equipped_star_stones", error.code)
            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
        }
    }

    @Test
    fun `patch star stones uses revision and correction replay`() {
        val request = patch(
            """"star_stones":[{"type":"main1","name":"攻击力","level":60}]""",
        )
        val result = service.patchCurrent("u1", "acc1", "代号鸢", "op1", request)

        assertEquals(8, result.revision)
        val correction = checkNotNull(lastCorrection)
        assertEquals(setOf("star_stones"), correction.fields)
        assertEquals("main1", correction.starStones?.single()?.type)

        val stale = patch(""""star_stones":[],"expected_revision":7""", includeRevision = false)
        val error = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", stale)
        }
        assertEquals("operator_revision_conflict", error.code)
    }

    @Test
    fun `patch materializes a generic entry into the requested game document`() {
        val generic = OperatorCurrent(
            userId = "u1",
            accountId = "acc1",
            game = "*",
            entries = mapOf("op1" to baseEntry()),
        )
        stored = stored.copy(entries = emptyMap())
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "*") } returns generic

        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""star_stones":[{"type":"main1","name":"攻击力","level":60}]"""),
        )

        assertEquals("代号鸢", lastCasGame)
        assertEquals(8, result.revision)
        assertEquals("main1", stored.entries.getValue("op1").starStones.single().type)
        assertEquals("命盘二", result.discLoadouts[1].name)
        assertEquals(1000, result.combatStats?.observedAttack)
        assertEquals(7, generic.entries.getValue("op1").revision)
    }

    @Test
    fun `patch creates the requested game document when only generic current exists`() {
        val generic = OperatorCurrent(
            userId = "u1",
            accountId = "acc1",
            game = "universal",
            entries = mapOf("op1" to baseEntry()),
        )
        stored = stored.copy(entries = emptyMap())
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "universal") } returns generic

        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""star_stones":[{"type":"main1","name":"攻击力","level":60}]"""),
        )

        assertEquals("代号鸢", stored.game)
        assertEquals(8, result.revision)
        assertEquals("main1", stored.entries.getValue("op1").starStones.single().type)
        assertEquals("命盘二", result.discLoadouts[1].name)
        assertEquals(1000, result.combatStats?.observedAttack)
    }

    @Test
    fun `first patch creates a default entry when account has no current document`() {
        stored = stored.copy(entries = emptyMap())
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "*") } returns null

        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """
                "level":0,
                "elite":0,
                "star_level":0,
                "disc_loadouts":[],
                "star_stones":[],
                "combat_stats":{
                  "manual_attack":null,
                  "manual_hp":null,
                  "display_mode":{"attack":"auto","hp":"manual"},
                  "oddities":{
                    "attack":{"current":0},
                    "hp":{"current":0},
                    "special":{"current":0}
                  }
                }
                """.trimIndent(),
                revision = 0,
            ),
        )

        assertEquals("代号鸢", stored.game)
        assertEquals(1, result.revision)
        assertEquals(0, result.level)
        assertEquals(0, result.elite)
        assertEquals(0, result.starLevel)
        assertEquals(emptyList<OperatorDiscLoadout>(), result.discLoadouts)
        assertEquals(emptyList<OperatorStarStone>(), result.starStones)
        assertEquals("auto", result.combatStats?.displayMode?.attack)
        assertEquals("manual", result.combatStats?.displayMode?.hp)
        assertEquals(0.0, result.combatStats?.oddities?.get("special")?.current)
    }

    @Test
    fun `full v3 completion removes outside entries and preserves retained supplemental fields`() {
        val retained = baseEntry()
        stored = stored.copy(
            entries = mapOf(
                "op1" to retained,
                "outside" to OperatorEntry(elite = 1, starLevel = 2, level = 30),
            ),
        )
        val effectiveAt = Instant.parse("2026-08-21T02:30:00Z")

        service.completeFullImport("u1", "acc1", "代号鸢", setOf("op1"), effectiveAt)

        assertEquals(setOf("op1"), stored.entries.keys)
        assertEquals(retained.discLoadouts, stored.entries.getValue("op1").discLoadouts)
        assertEquals(retained.combatStats, stored.entries.getValue("op1").combatStats)
        assertEquals(effectiveAt, stored.fullBaselineAt)
    }

    @Test
    fun `missing entry in existing game document is created only at revision zero`() {
        stored = stored.copy(entries = mapOf("other" to baseEntry()))
        every { catalogService.getOperator("op2") } returns catalog("op2", rarity, null)
        every { catalogService.getOperator("op3") } returns catalog("op3", rarity, null)

        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op2",
            patch(""""star_stones":[]""", revision = 0),
        )

        assertEquals(1, result.revision)
        assertEquals(2, stored.entries.size)
        assertEquals(7, stored.entries.getValue("other").revision)

        val conflict = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op3", patch(""""star_stones":[]""", revision = 7))
        }
        assertEquals(HttpStatus.CONFLICT, conflict.status)
        assertEquals("operator_revision_conflict", conflict.code)
        assertNull(stored.entries["op3"])
    }

    @Test
    fun `display mode is locally merged, persisted, and does not stale observations`() {
        val first = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""combat_stats":{"display_mode":{"attack":"auto","hp":"manual"}}"""),
        )
        assertEquals("auto", first.combatStats?.displayMode?.attack)
        assertEquals("manual", first.combatStats?.displayMode?.hp)
        assertEquals(900, first.combatStats?.manualAttack)
        assertEquals("valid", first.combatStats?.observedStatus)

        val second = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""combat_stats":{"display_mode":{"attack":null}}""", revision = first.revision),
        )
        assertNull(second.combatStats?.displayMode?.attack)
        assertEquals("manual", second.combatStats?.displayMode?.hp)
        assertEquals(900, second.combatStats?.manualAttack)
        assertEquals("valid", second.combatStats?.observedStatus)
    }

    @Test
    fun `independent awakening changes signature and stale while legacy signature never becomes freshly verified`() {
        stored = stored.copy(entries = mapOf("op1" to baseEntry().copy(level = 11)))
        val before = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""huaji":{"owned":true,"stage":25,"awakened":false},"combat_stats":{"source":"scan","observed_attack":100}"""),
        )
        val preview = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""huaji":{"awakened":true}""", revision = before.revision),
        )
        assertEquals(25, preview.after.huaji?.stage)
        assertEquals(true, preview.stale)
        assertEquals("stale", preview.after.combatStats?.observedStatus)
        val fresh = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""huaji":{"awakened":true},"combat_stats":{"source":"scan","observed_attack":100}""", revision = before.revision),
        )
        assertNotEquals(before.combatStats?.combatInputSignature, fresh.combatStats?.combatInputSignature)
        assertEquals(true, fresh.combatStats?.observedInputs?.huaji?.awakened)
        val legacy = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"combat_stats":{"source":"scan","observed_attack":100,"combat_input_signature":"legacy-signature"}""",
                revision = fresh.revision,
            ),
        )
        assertEquals("stale", legacy.after.combatStats?.observedStatus)
        assertEquals("legacy-signature", legacy.after.combatStats?.combatInputSignature)
    }

    @Test
    fun `legacy 31 and explicit facts reject only actual conflicts without any writes`() {
        val before = stored
        val contradictory = patch(""""star_level":31,"huaji":{"awakened":false}""")
        val error = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", contradictory)
        }
        assertEquals("huaji_conflict", error.code)
        assertEquals(before, stored)
        assertNull(lastCorrection)
        verify(exactly = 0) { currentRepository.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) }
        val compatible = service.previewCurrentPatch(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(""""star_level":31,"huaji":{"stage":25,"awakened":true}"""),
        )
        assertEquals(25, compatible.after.huaji?.stage)
        assertEquals(true, compatible.after.huaji?.awakened)
        assertEquals(before, stored)
    }

    @Test
    fun `v2 listed updates first loadout preserves second and marks observation stale`() {
        every { accountRepository.findAllByUserIdAndAccountIdIn("u1", setOf("acc1")) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号", game = "代号鸢"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }
        val request = OperatorImportRequest(
            format = "myshare-operator-exchange",
            version = 2,
            exportedAt = "2026-08-21T00:00:00Z",
            producer = ProducerDto("test", "1"),
            accounts = listOf(OperatorExchangeAccountDto("acc1")),
            records = listOf(
                OperatorRecordRequest(
                    accountId = "acc1",
                    recordId = "rec-v2",
                    recordType = "operator_snapshot",
                    game = "代号鸢",
                    effectiveAt = "2026-08-21T00:00:00Z",
                    snapshotScope = "listed",
                    entries = listOf(
                        OperatorEntryRequest(
                            id = "op1",
                            elite = 2,
                            starLevel = 4,
                            level = 20,
                            discs = listOf(OperatorDiscRequest("盘C")),
                        ),
                    ),
                ),
            ),
        )

        service.import("u1", request)

        val entry = stored.entries.getValue("op1")
        assertEquals(listOf("盘C"), entry.discLoadouts[0].discs.map { it.otName })
        assertEquals("命盘二", entry.discLoadouts[1].name)
        assertEquals("stale", entry.combatStats?.observedStatus)
        assertEquals(8, entry.revision)
    }

    @Test
    fun `v2 full with empty discs clears only first loadout and preserves combat data`() {
        every { accountRepository.findAllByUserIdAndAccountIdIn("u1", setOf("acc1")) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号", game = "代号鸢"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }
        val request = OperatorImportRequest(
            format = "myshare-operator-exchange",
            version = 2,
            exportedAt = "2026-08-21T00:00:00Z",
            producer = ProducerDto("test", "1"),
            accounts = listOf(OperatorExchangeAccountDto("acc1")),
            records = listOf(
                OperatorRecordRequest(
                    accountId = "acc1",
                    recordId = "rec-full-v2",
                    recordType = "operator_snapshot",
                    game = "代号鸢",
                    effectiveAt = "2026-08-21T00:00:00Z",
                    snapshotScope = "full",
                    entries = listOf(OperatorEntryRequest(id = "op1", elite = 1, starLevel = 3, level = 10)),
                ),
            ),
        )

        service.import("u1", request)

        val entry = stored.entries.getValue("op1")
        assertEquals(emptyList<OperatorDisc>(), entry.discLoadouts[0].discs)
        assertEquals("命盘二", entry.discLoadouts[1].name)
        assertEquals(1000, entry.combatStats?.observedAttack)
        assertEquals("auto", entry.combatStats?.displayMode?.attack)
        assertEquals("stale", entry.combatStats?.observedStatus)
    }

    @Test
    fun `delete replay reapplies independent correction records after remaining v2 records`() {
        val target = history("remove", "2026-08-21T00:00:00Z", "2026-08-21T00:00:01Z")
        val remaining = history("keep", "2026-08-21T00:01:00Z", "2026-08-21T00:01:01Z")
        val correction = OperatorCorrectionRecord(
            id = "correction-1",
            userId = "u1",
            accountId = "acc1",
            game = "代号鸢",
            operatorId = "op1",
            reason = "manual_correction",
            fields = setOf("disc_loadouts", "star_stones", "combat_stats", "level_breakthrough_stage"),
            levelBreakthroughStage = 1,
            discLoadouts = baseEntry().discLoadouts,
            starStones = baseEntry().starStones,
            combatStats = baseEntry().combatStats!!.copy(oddities = mapOf("special" to OperatorOddityValue(0.5))),
            createdAt = Instant.parse("2026-08-21T00:02:00Z"),
        )
        var replayed: OperatorCurrent? = stored
        every { recordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "remove") } returns target
        every { recordRepository.delete(target) } just runs
        every { currentRepository.deleteByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed = null }
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { replayed = it } }
        every {
            recordRepository.findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc("u1", "acc1", "代号鸢")
        } returns listOf(remaining)
        every {
            correctionRepository.findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc("u1", "acc1", "代号鸢")
        } returns listOf(correction)
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }

        service.deleteRecord("u1", "acc1", "remove")

        val entry = replayed!!.entries.getValue("op1")
        assertEquals("命盘二", entry.discLoadouts[1].name)
        assertEquals("main1", entry.starStones.single().type)
        assertEquals(1000, entry.combatStats?.observedAttack)
        assertEquals(0.5, entry.combatStats?.oddities?.get("special")?.current)
        assertEquals(1, entry.levelBreakthroughStage)
        assertEquals(1, entry.revision)
    }

    @Test
    fun `history replay preserves orphan removal instead of restoring a deleted catalog entry`() {
        val target = history("remove", "2026-08-21T00:00:00Z", "2026-08-21T00:00:01Z")
        val remaining = history("keep", "2026-08-21T00:01:00Z", "2026-08-21T00:01:01Z")
        val correction = OperatorCorrectionRecord(
            userId = "u1",
            accountId = "acc1",
            game = "代号鸢",
            operatorId = "op1",
            reason = "catalog_removed",
            fields = emptySet(),
            createdAt = Instant.parse("2026-08-21T00:02:00Z"),
        )
        var replayed: OperatorCurrent? = stored
        every { catalogService.getOperator("op1") } returns null
        every { recordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "remove") } returns target
        every { recordRepository.delete(target) } just runs
        every { currentRepository.deleteByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed = null }
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "代号鸢") } answers { replayed }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { replayed = it } }
        every { recordRepository.findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc("u1", "acc1", "代号鸢") } returns listOf(remaining)
        every { correctionRepository.findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc("u1", "acc1", "代号鸢") } returns listOf(correction)
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }

        service.deleteRecord("u1", "acc1", "remove")

        assertEquals(emptyMap<String, OperatorEntry>(), replayed!!.entries)
    }

    @Test
    fun `boundary breakthrough preserves omission clears explicit null and invalidates old capture`() {
        val inputs = com.lhs.share.hub.repository.entity.OperatorObservedInputs(level = 90, levelBreakthroughStage = 8)
        stored = stored.copy(
            entries = mapOf(
                "op1" to baseEntry().copy(
                    level = 90,
                    levelBreakthroughStage = 8,
                    combatStats = baseEntry().combatStats!!.copy(observedInputs = inputs),
                ),
            ),
        )
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"elite\":2"))
        assertEquals(8, stored.entries.getValue("op1").levelBreakthroughStage)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level_breakthrough_stage\":9", revision = 8))
        assertEquals(9, stored.entries.getValue("op1").levelBreakthroughStage)
        assertEquals("stale", stored.entries.getValue("op1").combatStats!!.observedStatus)
        assertEquals(inputs, stored.entries.getValue("op1").combatStats!!.observedInputs)
        assertEquals(9, lastCorrection!!.levelBreakthroughStage)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level_breakthrough_stage\":null", revision = 9))
        assertNull(stored.entries.getValue("op1").levelBreakthroughStage)
        assertEquals(setOf("level_breakthrough_stage"), lastCorrection!!.fields)
    }

    @Test
    fun `level changes infer only uniquely implied stages and invalid stage never writes`() {
        stored = stored.copy(entries = mapOf("op1" to baseEntry().copy(level = 90, levelBreakthroughStage = 9)))
        val invalid = assertThrows(OperatorApiException::class.java) {
            service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level_breakthrough_stage\":7"))
        }
        assertEquals("invalid_level_breakthrough", invalid.code)
        assertNull(lastCorrection)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level\":91"))
        assertEquals(9, stored.entries.getValue("op1").levelBreakthroughStage)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level\":80", revision = 8))
        assertNull(stored.entries.getValue("op1").levelBreakthroughStage)
    }

    @Test
    fun `unknown boundary observation stays unknown after current breakthrough confirmation`() {
        stored = stored.copy(entries = mapOf("op1" to baseEntry().copy(level = 90)))
        service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                "\"combat_stats\":{\"observed_attack\":1234,\"source\":\"scan\"}",
            ),
        )
        assertEquals("unverified", stored.entries.getValue("op1").combatStats!!.observedStatus)
        assertNull(stored.entries.getValue("op1").combatStats!!.observedInputs!!.levelBreakthroughStage)
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level_breakthrough_stage\":9", revision = 8))
        assertNull(stored.entries.getValue("op1").combatStats!!.observedInputs!!.levelBreakthroughStage)
        assertEquals("stale", stored.entries.getValue("op1").combatStats!!.observedStatus)
    }

    @Test
    fun `v5 imported captures preserve overrides display mode and historical inputs`() {
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"level":90,"level_breakthrough_stage":9,"combat_stats":{
            "source":"manual","observed_attack":1234,"manual_attack":321,"observed_status":"unverified",
            "observed_inputs":{"level":90,"level_breakthrough_stage":null},"display_mode":{"attack":"auto"}}""",
            ),
        )
        assertEquals(321, result.combatStats!!.manualAttack)
        assertEquals(1234, result.combatStats.observedAttack)
        assertEquals("auto", result.combatStats.displayMode!!.attack)
        assertEquals("unverified", result.combatStats.observedStatus)
        assertNull(result.combatStats.observedInputs!!.levelBreakthroughStage)
        assertNull(result.combatStats.observedInputs!!.elite)
    }

    @Test
    fun `new same-record boundary capture is valid and exact provided snapshots are retained`() {
        val result = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                """"level":90,"level_breakthrough_stage":9,"combat_stats":{"source":"scan","observed_attack":1234}""",
            ),
        )
        assertEquals("valid", result.combatStats!!.observedStatus)
        assertEquals(9, result.combatStats.observedInputs!!.levelBreakthroughStage)
        val inputs = """{"level":90,"level_breakthrough_stage":9,"huaji":{"owned":true,"stage":3,"awakened":null}}"""
        val refreshed = service.patchCurrent(
            "u1",
            "acc1",
            "代号鸢",
            "op1",
            patch(
                "\"combat_stats\":{\"source\":\"scan\",\"observed_attack\":1235,\"observed_inputs\":$inputs}",
                revision = 8,
            ),
        )
        assertEquals("valid", refreshed.combatStats!!.observedStatus)
        assertNull(refreshed.combatStats.observedInputs!!.elite)
        assertEquals(9, refreshed.combatStats.observedInputs!!.levelBreakthroughStage)
    }

    @Test
    fun `base and SP share breakthrough while capture and ownership stay form local`() {
        every { catalogService.spFormsOf("op1") } returns listOf("sp1")
        every { catalogService.getOperator("sp1") } returns catalog("sp1", 5, "op1")
        stored = stored.copy(
            entries = mapOf(
                "op1" to baseEntry().copy(level = 90, levelBreakthroughStage = 8),
                "sp1" to baseEntry().copy(level = 90, levelBreakthroughStage = 8, starLevel = 0),
            ),
        )
        val spBefore = stored.entries.getValue("sp1")
        service.patchCurrent("u1", "acc1", "代号鸢", "op1", patch("\"level_breakthrough_stage\":9"))
        val spAfter = stored.entries.getValue("sp1")
        assertEquals(9, spAfter.levelBreakthroughStage)
        assertEquals(spBefore.revision + 1, spAfter.revision)
        assertEquals(0, spAfter.starLevel)
        assertEquals(spBefore.combatStats!!.observedInputs, spAfter.combatStats!!.observedInputs)
    }

    private fun patch(
        fields: String,
        includeRevision: Boolean = true,
        revision: Long = 7,
    ): com.fasterxml.jackson.databind.node.ObjectNode {
        val revisionJson = if (includeRevision) ",\"expected_revision\":$revision" else ""
        return mapper.readTree("{$fields$revisionJson,\"reason\":\"manual_correction\"}") as com.fasterxml.jackson.databind.node.ObjectNode
    }

    private fun baseEntry() = OperatorEntry(
        elite = 1,
        starLevel = 3,
        level = 10,
        discs = listOf(OperatorDisc("盘A")),
        starStones = listOf(OperatorStarStone("石", "main1", 1)),
        discLoadouts = listOf(
            OperatorDiscLoadout("one", "命盘一", listOf(OperatorDisc("盘A"))),
            OperatorDiscLoadout("two", "命盘二", listOf(OperatorDisc("盘B"))),
        ),
        combatStats = OperatorCombatStats(
            observedAttack = 1000,
            observedHp = 5000,
            manualAttack = 900,
            source = "scan",
            observedStatus = "valid",
            displayMode = OperatorCombatDisplayMode("auto", "manual"),
            combatInputSignature = "scan-input-v1",
            oddities = mapOf("attack" to OperatorOddityValue(100.0)),
        ),
        revision = 7,
    )

    private fun catalog(id: String, rarity: Int, spOf: String?) = OperatorCatalogEntity(
        operatorId = id,
        name = id,
        rarity = rarity,
        specialOddityName = specialOddityName,
        prof = emptyList(),
        subProf = emptyList(),
        games = listOf("代号鸢"),
        discs = listOf("盘A", "盘B", "盘C").map { OperatorDiscCatalog(it) },
        starStones = emptyList(),
        spOf = spOf,
        catalogVersion = "test",
    )

    private fun history(recordId: String, effectiveAt: String, receivedAt: String) = OperatorRecord(
        recordId = recordId,
        userId = "u1",
        accountId = "acc1",
        recordType = "operator_snapshot",
        game = "代号鸢",
        snapshotScope = "full",
        effectiveAt = Instant.parse(effectiveAt),
        receivedAt = Instant.parse(receivedAt),
        producer = ProducerInfo("test", "1"),
        entries = listOf(OperatorRecordEntry("op1", elite = 1, starLevel = 3, level = 10)),
    )
}
