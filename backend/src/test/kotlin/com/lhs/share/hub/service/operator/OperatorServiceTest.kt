package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.operator.request.OperatorEntryRequest
import com.lhs.share.hub.controller.operator.request.OperatorExchangeAccountDto
import com.lhs.share.hub.controller.operator.request.OperatorImportRequest
import com.lhs.share.hub.controller.operator.request.OperatorRecordRequest
import com.lhs.share.hub.controller.operator.request.OperatorStarStoneRequest
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorRecord
import com.lhs.share.hub.repository.entity.OperatorRecordEntry
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class OperatorServiceTest {
    private val accountRepository = mockk<SubAccountRepository>()
    private val currentRepository = mockk<OperatorCurrentRepository>()
    private val recordRepository = mockk<OperatorRecordRepository>()
    private val catalogRepository = mockk<OperatorCatalogRepository>()
    private val catalogService = mockk<OperatorCatalogService>()
    private val correctionRepository = mockk<OperatorCorrectionRecordRepository>()
    private val transactionTemplate = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
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

    private fun catalog(spOf: String? = null) = OperatorCatalogEntity(
        operatorId = "op1",
        name = "密探",
        rarity = 5,
        prof = emptyList(),
        subProf = emptyList(),
        games = listOf("如鸢", "代号鸢"),
        discs = emptyList(),
        starStones = emptyList(),
        spOf = spOf,
        catalogVersion = "2026-08-16",
    )

    private fun importRequest(starStones: List<OperatorStarStoneRequest>): OperatorImportRequest = OperatorImportRequest(
        format = "myshare-operator-exchange",
        version = 2,
        exportedAt = "2026-08-16T10:00:00+08:00",
        producer = ProducerDto(platform = "test-client", version = "1.0.0"),
        accounts = listOf(OperatorExchangeAccountDto(id = "acc1")),
        records = listOf(
            OperatorRecordRequest(
                accountId = "acc1",
                recordId = "rec1",
                recordType = "operator_snapshot",
                game = "代号鸢",
                effectiveAt = "2026-08-16T10:00:00+08:00",
                snapshotScope = "full",
                entries = listOf(
                    OperatorEntryRequest(
                        id = "op1",
                        elite = 0,
                        starLevel = 0,
                        level = 1,
                        starStones = starStones,
                    ),
                ),
            ),
        ),
    )

    private fun setUpHappyPath() {
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号"))
        every { catalogService.getOperator("op1") } returns catalog()
        every { catalogService.spFormsOf(any()) } returns emptyList()
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame(any(), any(), any()) } returns null
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>() }
    }

    @Test
    fun `import accepts three main and three assist star stone slots`() {
        setUpHappyPath()
        val starStones = listOf(
            OperatorStarStoneRequest("定远", "main1", 2),
            OperatorStarStoneRequest("昭华", "main2", 1),
            OperatorStarStoneRequest("玄圭", "main3", 1),
            OperatorStarStoneRequest("白珩", "assist1", 2),
            OperatorStarStoneRequest("苍珮", "assist2", 1),
            OperatorStarStoneRequest("青圭", "assist3", 1),
        )
        val result = service.import("u1", importRequest(starStones))
        assertEquals(1, result.accepted)
        assertEquals(0, result.duplicates)
    }

    @Test
    fun `legacy main and assist star stone types remain valid`() {
        setUpHappyPath()
        val starStones = listOf(
            OperatorStarStoneRequest("定远", "main", 2),
            OperatorStarStoneRequest("白珩", "assist", 1),
        )
        val result = service.import("u1", importRequest(starStones))
        assertEquals(1, result.accepted)
    }

    @Test
    fun `duplicate star stone type within a record is still rejected`() {
        setUpHappyPath()
        val starStones = listOf(
            OperatorStarStoneRequest("定远", "main1", 2),
            OperatorStarStoneRequest("昭华", "main1", 1),
        )
        val e = assertThrows(OperatorApiException::class.java) { service.import("u1", importRequest(starStones)) }
        assertEquals("invalid_star_stone", e.code)
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
    }

    // ---------- SP 形态校验（本体必须同快照 + 等级/修为一致） ----------

    private fun entry(id: String, level: Int, elite: Int = 0, starLevel: Int = 0) =
        OperatorEntryRequest(id = id, elite = elite, starLevel = starLevel, level = level)

    private fun record(entries: List<OperatorEntryRequest>, recordId: String = "rec1", game: String? = "代号鸢", scope: String = "full") =
        OperatorRecordRequest(
            accountId = "acc1",
            recordId = recordId,
            recordType = "operator_snapshot",
            game = game,
            effectiveAt = "2026-08-16T10:00:00+08:00",
            snapshotScope = scope,
            entries = entries,
        )

    private fun importRequestWithRecords(records: List<OperatorRecordRequest>): OperatorImportRequest = OperatorImportRequest(
        format = "myshare-operator-exchange",
        version = 2,
        exportedAt = "2026-08-16T10:00:00+08:00",
        producer = ProducerDto(platform = "test-client", version = "1.0.0"),
        accounts = listOf(OperatorExchangeAccountDto(id = "acc1")),
        records = records,
    )

    private fun catalog(id: String, spOf: String?) = OperatorCatalogEntity(
        operatorId = id,
        name = id,
        rarity = 5,
        prof = emptyList(),
        subProf = emptyList(),
        games = listOf("如鸢", "代号鸢"),
        discs = emptyList(),
        starStones = emptyList(),
        spOf = spOf,
        catalogVersion = "2026-08-16",
    )

    /** 本体 + SP 都在目录里存在的常规 SP mock */
    private fun setUpSpRelation(baseId: String, spId: String) {
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { currentRepository.findByUserIdAndAccountIdAndGame(any(), any(), any()) } returns null
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>() }
        every { catalogService.getOperator(baseId) } returns catalog(baseId, null)
        every { catalogService.getOperator(spId) } returns catalog(spId, baseId)
        every { catalogService.spFormsOf(any()) } returns emptyList()
        every { catalogService.spFormsOf(baseId) } returns listOf(spId)
    }

    /** 同上，但 current 仓库按 (account, game) 真实持久化，跨 record 之间可见前一条写入 */
    private fun setUpSpRelationPersistent(baseId: String, spId: String) {
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        val store = mutableMapOf<String, OperatorCurrent>()
        every { currentRepository.findByUserIdAndAccountIdAndGame(any(), any(), any()) } answers { store[arg<String>(2)] }
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { store[it.game] = it } }
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }
        every { catalogService.getOperator(baseId) } returns catalog(baseId, null)
        every { catalogService.getOperator(spId) } returns catalog(spId, baseId)
        every { catalogService.spFormsOf(any()) } returns emptyList()
        every { catalogService.spFormsOf(baseId) } returns listOf(spId)
    }

    @Test
    fun `full and listed snapshots reject conflicting shared growth without writes`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        for (scope in listOf("full", "listed")) {
            val request =
                importRequestWithRecords(listOf(record(listOf(entry("op2", 100, 17), entry("op1", 90, 15))).copy(snapshotScope = scope)))
            val error = assertThrows(OperatorApiException::class.java) { service.import("u1", request) }
            assertEquals("shared_growth_conflict", error.code)
        }
        io.mockk.verify(exactly = 0) { currentRepository.save(any()) }
        io.mockk.verify(exactly = 0) { recordRepository.save(any()) }
    }

    @Test
    fun `SP submitted alone materializes its base with synced level and elite`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        service.import("u1", importRequestWithRecords(listOf(record(listOf(entry("op1", 100, 17)), scope = "listed"))))
        val base = saved!!.entries.getValue("op2")
        assertEquals(100, base.level) // 本体从 SP 补齐
        assertEquals(17, base.elite)
        val sp = saved!!.entries.getValue("op1")
        assertEquals(100, sp.level)
        assertEquals(17, sp.elite)
    }

    @Test
    fun `starLevel above awakening cap 31 is rejected`() {
        setUpHappyPath()
        val e = assertThrows(OperatorApiException::class.java) {
            service.import("u1", importRequestWithRecords(listOf(record(listOf(entry("op1", 10, elite = 0, starLevel = 32))))))
        }
        assertEquals("invalid_star_level", e.code)
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
    }

    @Test
    fun `starLevel 31 awakening and 30 max node are accepted`() {
        setUpHappyPath()
        val result = service.import(
            "u1",
            importRequestWithRecords(
                listOf(
                    record(listOf(entry("op1", 10, elite = 0, starLevel = 30)), recordId = "rec1"), // 5星·5
                    record(listOf(entry("op1", 10, elite = 1, starLevel = 31)), recordId = "rec2"), // 觉醒
                ),
            ),
        )
        assertEquals(2, result.accepted)
    }

    @Test
    fun `storing the base alone materializes and syncs its SP`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        service.import("u1", importRequestWithRecords(listOf(record(listOf(entry("op2", 20, 1)), scope = "listed"))))
        val sp = saved!!.entries.getValue("op1")
        assertEquals(20, sp.level) // 本体落库时 SP 自动显形
        assertEquals(1, sp.elite)
        assertEquals(0, sp.starLevel) // 自动生成的 SP 星级默认 0
    }

    @Test
    fun `editing the SP updates the base level and elite in both directions`() {
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { catalogService.getOperator("op2") } returns catalog("op2", null)
        every { catalogService.getOperator("op1") } returns catalog("op1", "op2")
        every { catalogService.spFormsOf(any()) } returns emptyList()
        every { catalogService.spFormsOf("op2") } returns listOf("op1")
        every { currentRepository.findByUserIdAndAccountIdAndGame(any(), any(), any()) } returns OperatorCurrent(
            id = "u1:acc1:*",
            userId = "u1",
            accountId = "acc1",
            game = "*",
            fullBaselineAt = null,
            entries = mapOf(
                "op2" to OperatorEntry(elite = 1, starLevel = 5, level = 10),
                "op1" to OperatorEntry(elite = 1, starLevel = 3, level = 10),
            ),
        )
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }

        // 只编辑 SP：level 20 / elite 2 —— 本体也跟随（双向同步）；星级各自独立
        val result = service.import(
            "u1",
            importRequestWithRecords(listOf(record(listOf(entry("op1", 20, 2, starLevel = 4)), scope = "listed"))),
        )
        assertEquals(1, result.accepted)
        val base = saved!!.entries.getValue("op2")
        assertEquals(20, base.level)
        assertEquals(2, base.elite)
        assertEquals(5, base.starLevel) // 本体星级独立
        val sp = saved!!.entries.getValue("op1")
        assertEquals(4, sp.starLevel) // SP 星级保留独立编辑
    }

    @Test
    fun `SP matching base level and elite is accepted regardless of star level`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        val result = service.import(
            "u1",
            importRequestWithRecords(listOf(record(listOf(entry("op2", 10, 2, starLevel = 5), entry("op1", 10, 2, starLevel = 0))))),
        )
        assertEquals(1, result.accepted)
        assertEquals(0, result.duplicates)
    }

    @Test
    fun `updating base in a listed snapshot re-syncs the stored SP`() {
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号"))
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } returns null
        every { catalogService.getOperator("op2") } returns catalog("op2", null)
        every { catalogService.getOperator("op1") } returns catalog("op1", "op2")
        every { catalogService.spFormsOf(any()) } returns emptyList()
        every { catalogService.spFormsOf("op2") } returns listOf("op1")
        every { currentRepository.findByUserIdAndAccountIdAndGame(any(), any(), any()) } returns OperatorCurrent(
            id = "u1:acc1:*",
            userId = "u1",
            accountId = "acc1",
            game = "*",
            fullBaselineAt = null,
            entries = mapOf(
                "op2" to OperatorEntry(elite = 1, starLevel = 5, level = 10),
                "op1" to OperatorEntry(elite = 1, starLevel = 3, level = 10),
            ),
        )
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }

        // 只更新本体（listed 快照），SP 不随文档上传 —— 落库时 SP 自动跟本体同步
        val result = service.import(
            "u1",
            importRequestWithRecords(listOf(record(listOf(entry("op2", 20, 2, starLevel = 6)), scope = "listed"))),
        )
        assertEquals(1, result.accepted)
        val sp = saved!!.entries.getValue("op1")
        assertEquals(20, sp.level) // 本体升到 20，SP 自动同步
        assertEquals(2, sp.elite) // 修为同步
        assertEquals(3, sp.starLevel) // 星级保持独立
    }

    @Test
    fun `SP and base split across records of the same snapshot are accepted`() {
        setUpSpRelationPersistent(baseId = "op2", spId = "op1")
        val result = service.import(
            "u1",
            importRequestWithRecords(
                listOf(
                    record(listOf(entry("op2", 10, 2)), recordId = "rec1", scope = "listed"),
                    record(listOf(entry("op1", 10, 2)), recordId = "rec2", scope = "listed"),
                ),
            ),
        )
        assertEquals(2, result.accepted)
    }

    @Test
    fun `account game mismatch is rejected before operator data is written`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        val error = assertThrows(OperatorApiException::class.java) {
            service.import(
                "u1",
                importRequestWithRecords(listOf(record(listOf(entry("op1", 10, 2)), game = "如鸢"))),
            )
        }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
        assertEquals("account_game_mismatch", error.code)
        io.mockk.verify(exactly = 0) { currentRepository.save(any()) }
        io.mockk.verify(exactly = 0) { recordRepository.save(any()) }
    }

    @Test
    fun `new operator writes cannot fall back to generic null game`() {
        setUpHappyPath()

        val error = assertThrows(OperatorApiException::class.java) {
            service.import("u1", importRequestWithRecords(listOf(record(listOf(entry("op1", 10)), game = null))))
        }

        assertEquals("account_game_mismatch", error.code)
        io.mockk.verify(exactly = 0) { currentRepository.save(any()) }
        io.mockk.verify(exactly = 0) { recordRepository.save(any()) }
    }

    @Test
    fun `deleting legacy history can still replay remaining null game records into generic current`() {
        val target = legacyRecord("legacy-1", "2026-08-16T01:00:00Z")
        val remaining = legacyRecord("legacy-2", "2026-08-16T02:00:00Z")
        every { recordRepository.findByUserIdAndAccountIdAndRecordId("u1", "acc1", "legacy-1") } returns target
        every { recordRepository.delete(target) } just runs
        every { currentRepository.deleteByUserIdAndAccountIdAndGame("u1", "acc1", "*") } just runs
        every { recordRepository.findByUserIdAndAccountIdAndGameOrderByEffectiveAtAsc("u1", "acc1", null) } returns listOf(remaining)
        every { correctionRepository.findByUserIdAndAccountIdAndGameOrderByCreatedAtAsc("u1", "acc1", "*") } returns emptyList()
        every { currentRepository.findByUserIdAndAccountIdAndGame("u1", "acc1", "*") } returns null
        every { catalogService.getOperator("op1") } returns catalog()
        every { catalogService.spFormsOf("op1") } returns emptyList()
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        every { recordRepository.save(any()) } answers { firstArg<OperatorRecord>() }

        service.deleteRecord("u1", "acc1", "legacy-1")

        assertEquals("*", saved?.game)
        assertEquals(10, saved?.entries?.get("op1")?.level)
    }

    private fun legacyRecord(recordId: String, effectiveAt: String) = OperatorRecord(
        recordId = recordId,
        userId = "u1",
        accountId = "acc1",
        recordType = "operator_snapshot",
        game = null,
        snapshotScope = "full",
        effectiveAt = Instant.parse(effectiveAt),
        producer = ProducerInfo("legacy", "1"),
        entries = listOf(OperatorRecordEntry(id = "op1", elite = 1, starLevel = 1, level = 10)),
    )

    @Test
    fun `SP submitted under a specific game materializes its base in that same game`() {
        setUpSpRelation(baseId = "op2", spId = "op1")
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } returns
            listOf(SubAccount(userId = "u1", accountId = "acc1", name = "账号", game = "如鸢"))
        var saved: OperatorCurrent? = null
        every { currentRepository.save(any()) } answers { firstArg<OperatorCurrent>().also { saved = it } }
        service.import("u1", importRequestWithRecords(listOf(record(listOf(entry("op1", 5, 6)), game = "如鸢", scope = "listed"))))

        val sp = saved!!.entries.getValue("op1")
        assertEquals(5, sp.level)
        assertEquals(6, sp.elite)
        val base = saved!!.entries.getValue("op2")
        assertEquals(5, base.level) // 本体在同一 game 单元补齐
        assertEquals(6, base.elite)
    }
}
