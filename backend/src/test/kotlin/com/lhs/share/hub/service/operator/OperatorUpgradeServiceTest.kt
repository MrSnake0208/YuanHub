package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.operator.request.OperatorUpgradeExecuteRequest
import com.lhs.share.hub.controller.operator.request.OperatorUpgradeRequest
import com.lhs.share.hub.controller.operator.response.OperatorUpgradeEvent
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorUpgradeTransactionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorUpgradeTransaction
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate

class OperatorUpgradeServiceTest {
    private val accounts = mockk<SubAccountRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val operators = mockk<OperatorCurrentRepository>()
    private val inventories = mockk<InventoryCurrentRepository>()
    private val records = mockk<InventoryRecordRepository>()
    private val revisions = mockk<InventoryRevisionRepository>()
    private val upgrades = mockk<OperatorUpgradeTransactionRepository>()
    private val events = mockk<AccountEventService>()
    private var operatorCurrent = current(starLevel = 21)
    private val inventoryCurrent = mutableMapOf<String, InventoryCurrent>()
    private val storedRecords = mutableListOf<InventoryRecord>()
    private val storedUpgrades = mutableMapOf<String, OperatorUpgradeTransaction>()
    private var inventoryRevision = 42L
    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        },
    )
    private val corrections = mockk<com.lhs.share.hub.repository.OperatorCorrectionRecordRepository>(relaxed = true)
    private val service = OperatorUpgradeService(
        accounts,
        catalog,
        operators,
        inventories,
        records,
        revisions,
        upgrades,
        events,
        transactionTemplate,
        corrections,
    )

    @BeforeEach
    fun setUp() {
        every {
            corrections.save(any<com.lhs.share.hub.repository.entity.OperatorCorrectionRecord>())
        } answers { firstArg() }
        every { catalog.spFormsOf(any()) } returns emptyList()
        operatorCurrent = current(starLevel = 21)
        inventoryCurrent.clear()
        inventoryCurrent["item"] = stock("item", mapOf("zhuangjinboli" to 1))
        inventoryCurrent["agent"] = stock("agent", mapOf("op1" to 52))
        storedRecords.clear()
        storedUpgrades.clear()
        inventoryRevision = 42
        every { accounts.findByUserIdAndAccountId("u1", "a1") } returns
            SubAccount(userId = "u1", accountId = "a1", name = "账号", game = "如鸢")
        every { catalog.getOperator("op1") } returns OperatorCatalogEntity(
            operatorId = "op1",
            name = "密探",
            rarity = 5,
            prof = listOf("火"),
            subProf = listOf("pojun"),
            games = listOf("如鸢"),
            discs = emptyList(),
            starStones = emptyList(),
            catalogVersion = "1",
        )
        every { operators.findByUserIdAndAccountIdAndGame("u1", "a1", "如鸢") } answers { operatorCurrent }
        every { operators.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) } answers {
            val expected = arg<Long>(4)
            if (operatorCurrent.entries.getValue("op1").revision != expected) {
                null
            } else {
                operatorCurrent = operatorCurrent.copy(entries = operatorCurrent.entries + arg<Map<String, OperatorEntry>>(5))
                operatorCurrent
            }
        }
        every { inventories.findByUserIdAndAccountIdAndEntityType("u1", "a1", any()) } answers {
            inventoryCurrent[thirdArg<String>()]
        }
        every { inventories.save(any()) } answers {
            firstArg<InventoryCurrent>().also { inventoryCurrent[it.entityType] = it }
        }
        every { records.save(any()) } answers { firstArg<InventoryRecord>().also(storedRecords::add) }
        every { revisions.findByUserIdAndAccountId("u1", "a1") } answers {
            InventoryRevision("u1:a1", "u1", "a1", inventoryRevision)
        }
        every { revisions.save(any()) } answers {
            firstArg<InventoryRevision>().also { inventoryRevision = it.revision }
        }
        every { upgrades.findByUserIdAndAccountIdAndIdempotencyKey("u1", "a1", any()) } answers {
            storedUpgrades[thirdArg<String>()]
        }
        every { upgrades.save(any()) } answers {
            firstArg<OperatorUpgradeTransaction>().also { storedUpgrades[it.idempotencyKey] = it }
        }
        every { events.publish(any(), any(), any(), any(), any()) } just runs
    }

    @Test
    fun `SP huaji preview and stale-token execute reject without inventory or growth writes`() {
        operatorCurrent = current(starLevel = 1)
        val preview = service.preview("u1", request(target = 5))
        val original = catalog.getOperator("op1")!!
        every { catalog.getOperator("op1") } returns original.copy(spOf = "base")
        val error = assertThrows(OperatorApiException::class.java) { service.preview("u1", request(target = 5)) }
        assertEquals("sp_huaji_upgrade_not_supported", error.code)
        val executeError = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "sp-denied", executeRequest(preview.previewToken, 5))
        }
        assertEquals("sp_huaji_upgrade_not_supported", executeError.code)
        assertEquals(1, operatorCurrent.entries.getValue("op1").starLevel)
        assertEquals(42, inventoryRevision)
        assertTrue(storedRecords.isEmpty())
        assertTrue(storedUpgrades.isEmpty())
        verify(exactly = 0) { inventories.save(any()) }
        verify(exactly = 0) { operators.compareAndSetEntries(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { corrections.save(any()) }
        verify(exactly = 0) { events.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `level upgrade synchronizes a missing movie without granting ownership and records replay growth`() {
        operatorCurrent = operatorCurrent.copy(entries = mapOf("op1" to operatorCurrent.entries.getValue("op1").copy(level = 90)))
        val before = operatorCurrent.entries.getValue("op1")
        val movie = catalog.getOperator("op1")!!.copy(operatorId = "movie", spOf = "op1")
        every { catalog.getOperator("movie") } returns movie
        every { catalog.spFormsOf("op1") } returns listOf("movie")
        inventoryCurrent["item"] = stock("item", mapOf("liutaobingshu" to 10000))
        val target = before.level + 1
        val request = request(target).copy(dimension = "level", skipBreakthroughMaterials = true)
        val preview = service.preview("u1", request)
        service.execute(
            "u1",
            "shared-level",
            executeRequest(preview.previewToken, target).copy(dimension = "level", skipBreakthroughMaterials = true),
        )
        assertEquals(target, operatorCurrent.entries.getValue("movie").level)
        assertEquals(0, operatorCurrent.entries.getValue("movie").starLevel)
        assertEquals(target, operatorCurrent.entries.getValue("op1").level)
        verify(exactly = 1) { corrections.save(match { it.reason == "quick_upgrade" && it.level == target }) }
    }

    @Test
    fun `huaji preview and execute atomically consume this operator heart paper`() {
        val preview = service.preview("u1", request(target = 22))
        assertTrue(preview.available)
        assertEquals(40, preview.requirements.single().required)
        assertEquals("agent", preview.requirements.single().entityType)
        assertEquals("op1", preview.requirements.single().id)

        val event = slot<OperatorUpgradeEvent>()
        every { events.publish("u1", "a1", OperatorUpgradeService.UPGRADE_EVENT_NAME, any(), capture(event)) } just runs
        val execute = executeRequest(preview.previewToken, target = 22)
        val first = service.execute("u1", "key-1", execute)
        val repeated = service.execute("u1", "key-1", execute)

        assertEquals(first, repeated)
        assertEquals(22, first.operator.starLevel)
        assertEquals(8, first.operator.revision)
        assertEquals(12, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
        assertEquals(43, first.inventoryRevision)
        assertEquals(1, storedRecords.size)
        assertEquals("consumption_delta", storedRecords.single().recordType)
        assertEquals(first.transactionId, storedRecords.single().transactionId)
        assertEquals(listOf(40L), storedRecords.single().entries.map { it.count })
        assertEquals(first.transactionId, event.captured.transactionId)
        verify(exactly = 1) { events.publish("u1", "a1", OperatorUpgradeService.UPGRADE_EVENT_NAME, any(), any()) }
    }

    @Test
    fun `ordinary final stage consumes only last node and terminal upgrades have zero side effects`() {
        operatorCurrent = current(starLevel = 24)
        inventoryCurrent["agent"] = stock("agent", mapOf("op1" to 180))
        val preview = service.preview("u1", request(target = 25))
        assertTrue(preview.available)
        assertEquals(listOf("agent" to "op1"), preview.requirements.map { it.entityType to it.id })
        assertEquals(80, preview.requirements.single().required)
        val result = service.execute("u1", "five-star", executeRequest(preview.previewToken, target = 25))
        assertEquals(100, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
        assertEquals(1, inventoryCurrent.getValue("item").entries.getValue("zhuangjinboli").count)
        assertEquals(25, operatorCurrent.entries.getValue("op1").huaji?.stage)
        assertEquals(1, storedRecords.size)
        assertTrue(storedRecords.all { it.transactionId == result.transactionId })
        val before = operatorCurrent
        val stockBefore = inventoryCurrent.toMap()
        for (target in 26..31) {
            assertThrows(OperatorApiException::class.java) { service.preview("u1", request(target = target)) }
        }
        assertEquals(before, operatorCurrent)
        assertEquals(stockBefore, inventoryCurrent)
        assertEquals(1, storedRecords.size)
        assertEquals(1, storedUpgrades.size)
    }

    @Test
    fun `insufficient inventory changes no current or records`() {
        inventoryCurrent["agent"] = stock("agent", mapOf("op1" to 39))
        val preview = service.preview("u1", request(target = 22))
        assertFalse(preview.available)

        val error = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "insufficient", executeRequest(preview.previewToken, target = 22))
        }
        assertEquals("insufficient_inventory", error.code)
        assertEquals(21, operatorCurrent.entries.getValue("op1").starLevel)
        assertEquals(39, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
        assertTrue(storedRecords.isEmpty())
        assertTrue(storedUpgrades.isEmpty())
        assertEquals(42, inventoryRevision)
    }

    @Test
    fun `preview becomes stale after inventory revision changes`() {
        val preview = service.preview("u1", request(target = 22))
        inventoryRevision = 43

        val error = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "stale", executeRequest(preview.previewToken, target = 22))
        }
        assertEquals("inventory_state_stale", error.code)
        assertEquals(52, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
    }

    @Test
    fun `two previews competing for the same material cannot both execute on the old revision`() {
        val firstPreview = service.preview("u1", request(target = 22))
        val secondPreview = service.preview("u1", request(target = 22))

        service.execute("u1", "first", executeRequest(firstPreview.previewToken, target = 22))
        val stale = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "second", executeRequest(secondPreview.previewToken, target = 22))
        }

        assertTrue(stale.code in setOf("operator_state_stale", "inventory_state_stale"))
        assertEquals(12, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
        assertTrue(inventoryCurrent.values.flatMap { it.entries.values }.all { it.count >= 0 })
    }

    @Test
    fun `level execute deducts stable books and breakthrough items but never money`() {
        operatorCurrent = current(starLevel = 21).copy(
            entries = mapOf("op1" to OperatorEntry(elite = 0, starLevel = 21, level = 9, revision = 7)),
        )
        inventoryCurrent["item"] = stock(
            "item",
            mapOf("bingshucanjuan" to 2, "jianjia" to 4, "wuzhuqian" to 999_999),
        )
        val request = OperatorUpgradeRequest("a1", "如鸢", "op1", "level", 11, 7)
        val preview = service.preview("u1", request)

        assertTrue(preview.available)
        assertEquals(20_000, preview.moneyRequired)
        assertEquals(setOf("bingshucanjuan", "jianjia"), preview.requirements.map { it.id }.toSet())
        val result = service.execute(
            "u1",
            "level",
            OperatorUpgradeExecuteRequest("a1", "如鸢", "op1", "level", 11, 7, 42, preview.previewToken),
        )

        assertEquals(11, result.operator.level)
        assertEquals(0, inventoryCurrent.getValue("item").entries.getValue("bingshucanjuan").count)
        assertEquals(0, inventoryCurrent.getValue("item").entries.getValue("jianjia").count)
        assertEquals(999_999, inventoryCurrent.getValue("item").entries.getValue("wuzhuqian").count)
        assertTrue(result.consumed.none { it.id == "wuzhuqian" })
    }

    @Test
    fun `confirmed breakthrough drives default preview and contradictory skip never consumes stock`() {
        operatorCurrent = current(starLevel = 21).copy(
            entries = mapOf("op1" to OperatorEntry(elite = 0, starLevel = 21, level = 90, revision = 7, levelBreakthroughStage = 9)),
        )
        inventoryCurrent["item"] = stock("item", mapOf("liutaobingshu" to 10000))
        val preview = service.preview("u1", OperatorUpgradeRequest("a1", "如鸢", "op1", "level", 95, 7))
        assertTrue(preview.available)
        assertEquals(0, preview.moneyRequired)
        operatorCurrent =
            operatorCurrent.copy(entries = operatorCurrent.entries.mapValues { (_, entry) -> entry.copy(levelBreakthroughStage = 8) })
        val before = inventoryCurrent.toMap()
        val error = assertThrows(OperatorApiException::class.java) {
            service.preview("u1", OperatorUpgradeRequest("a1", "如鸢", "op1", "level", 95, 7, skipBreakthroughMaterials = true))
        }
        assertEquals("level_breakthrough_conflict", error.code)
        assertEquals(before, inventoryCurrent)
        assertTrue(storedUpgrades.isEmpty())
    }

    @Test
    fun `already broken through preview and execute only consume experience books`() {
        operatorCurrent = current(starLevel = 21).copy(
            entries = mapOf("op1" to OperatorEntry(elite = 0, starLevel = 21, level = 10, revision = 7)),
        )
        inventoryCurrent["item"] = stock("item", mapOf("bingshucanjuan" to 4, "jianjia" to 1))
        val request = OperatorUpgradeRequest("a1", "如鸢", "op1", "level", 12, 7, skipBreakthroughMaterials = true)
        assertFalse(service.preview("u1", request.copy(skipBreakthroughMaterials = false)).available)
        val preview = service.preview("u1", request)
        assertTrue(preview.available)
        assertEquals(0, preview.moneyRequired)
        assertEquals(listOf("bingshucanjuan"), preview.requirements.map { it.id })
        val execute = OperatorUpgradeExecuteRequest(
            "a1", "如鸢", "op1", "level", 12, 7, 42, preview.previewToken, skipBreakthroughMaterials = true,
        )
        val mismatch = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "wrong-option", execute.copy(skipBreakthroughMaterials = false))
        }
        assertEquals("preview_expired", mismatch.code)
        val result = service.execute("u1", "books-only", execute)
        assertEquals(12, result.operator.level)
        assertEquals(1, result.operator.levelBreakthroughStage)
        assertEquals(listOf("bingshucanjuan"), result.consumed.map { it.id })
        assertEquals(0, inventoryCurrent.getValue("item").entries.getValue("bingshucanjuan").count)
        assertEquals(1, inventoryCurrent.getValue("item").entries.getValue("jianjia").count)
        assertEquals(result, service.execute("u1", "books-only", execute))
        val conflict = assertThrows(OperatorApiException::class.java) {
            service.execute("u1", "books-only", execute.copy(skipBreakthroughMaterials = false))
        }
        assertEquals("idempotency_conflict", conflict.code)
        assertTrue(storedRecords.all { record -> record.entries.all { it.id == "bingshucanjuan" } })
    }

    @Test
    fun `awakening consumes own heart and glass once while retaining stage and leaving money untouched`() {
        operatorCurrent = current(starLevel = 25)
        inventoryCurrent["agent"] = stock("agent", mapOf("op1" to 120, "other" to 999))
        inventoryCurrent["item"] = stock("item", mapOf("zhuangjinboli" to 1, "wuzhuqian" to 999_999))
        val request = OperatorUpgradeRequest("a1", "如鸢", "op1", "awakening", 1, 7)
        val preview = service.preview("u1", request)
        assertTrue(preview.available)
        assertEquals(0, preview.from)
        assertEquals(1, preview.to)
        assertEquals(300_000, preview.moneyRequired)
        assertEquals(mapOf("op1" to 100L, "zhuangjinboli" to 1L), preview.requirements.associate { it.id to it.required })
        assertTrue(storedRecords.isEmpty())
        val execute = OperatorUpgradeExecuteRequest("a1", "如鸢", "op1", "awakening", 1, 7, 42, preview.previewToken)
        val result = service.execute("u1", "awakening", execute)
        assertEquals(result, service.execute("u1", "awakening", execute))
        assertEquals(25, result.operator.starLevel)
        assertEquals(com.lhs.share.hub.repository.entity.OperatorHuaji(true, 25, true), result.operator.huaji)
        assertEquals(8, result.operator.revision)
        assertEquals(20, inventoryCurrent.getValue("agent").entries.getValue("op1").count)
        assertEquals(999, inventoryCurrent.getValue("agent").entries.getValue("other").count)
        assertEquals(0, inventoryCurrent.getValue("item").entries.getValue("zhuangjinboli").count)
        assertEquals(999_999, inventoryCurrent.getValue("item").entries.getValue("wuzhuqian").count)
        assertEquals(43, inventoryRevision)
        assertEquals(2, storedRecords.size)
        assertTrue(storedRecords.all { it.recordType == "consumption_delta" && it.transactionId == result.transactionId })
        assertEquals(1, storedUpgrades.size)
        val conflict = assertThrows(OperatorApiException::class.java) { service.execute("u1", "awakening", execute.copy(target = 25)) }
        assertEquals("idempotency_conflict", conflict.code)
    }

    @Test
    fun `awakening missing either material blocks execution without writes`() {
        for ((heart, glass) in listOf(99L to 1L, 100L to 0L)) {
            operatorCurrent = current(starLevel = 25)
            val operatorBefore = operatorCurrent
            inventoryCurrent["agent"] = stock("agent", mapOf("op1" to heart))
            inventoryCurrent["item"] = stock("item", mapOf("zhuangjinboli" to glass))
            val before = inventoryCurrent.toMap()
            val preview = service.preview("u1", OperatorUpgradeRequest("a1", "如鸢", "op1", "awakening", 1, 7))
            assertFalse(preview.available)
            val error = assertThrows(OperatorApiException::class.java) {
                service.execute(
                    "u1",
                    "insufficient-awake",
                    OperatorUpgradeExecuteRequest("a1", "如鸢", "op1", "awakening", 1, 7, 42, preview.previewToken),
                )
            }
            assertEquals("insufficient_inventory", error.code)
            assertEquals(before, inventoryCurrent)
            assertEquals(operatorBefore, operatorCurrent)
            assertTrue(storedRecords.isEmpty())
            assertTrue(storedUpgrades.isEmpty())
            assertEquals(42, inventoryRevision)
        }
    }

    @Test
    fun `awakening validates independent state catalog target and owner before writes`() {
        val request = OperatorUpgradeRequest("a1", "如鸢", "op1", "awakening", 1, 7)
        val original = catalog.getOperator("op1")!!
        for (huaji in listOf(
            com.lhs.share.hub.repository.entity.OperatorHuaji(false, 0, null),
            com.lhs.share.hub.repository.entity.OperatorHuaji(true, null, null),
            com.lhs.share.hub.repository.entity.OperatorHuaji(true, 24, false),
            com.lhs.share.hub.repository.entity.OperatorHuaji(true, 25, true),
        )) {
            operatorCurrent = current(25).copy(entries = mapOf("op1" to current(25).entries.getValue("op1").copy(huaji = huaji)))
            assertEquals("awakening_not_available", assertThrows(OperatorApiException::class.java) { service.preview("u1", request) }.code)
        }
        operatorCurrent = current(25).copy(
            entries = mapOf(
                "op1" to current(25).entries.getValue("op1").copy(
                    huaji = com.lhs.share.hub.repository.entity.OperatorHuaji(true, 25, false),
                ),
            ),
        )
        assertFalse(service.preview("u1", request).available)
        for (invalidCatalog in listOf(original.copy(rarity = 3), original.copy(spOf = "base"))) {
            every { catalog.getOperator("op1") } returns invalidCatalog
            if (invalidCatalog.spOf != null) every { catalog.getOperator("base") } returns original
            assertEquals("awakening_not_available", assertThrows(OperatorApiException::class.java) { service.preview("u1", request) }.code)
        }
        every { catalog.getOperator("op1") } returns original
        for (target in listOf(0, 2, 25, 31)) {
            assertEquals(
                "invalid_upgrade_target",
                assertThrows(OperatorApiException::class.java) {
                    service.preview("u1", request.copy(target = target))
                }.code,
            )
        }
        every { accounts.findByUserIdAndAccountId("other-user", "a1") } returns null
        assertEquals("account_not_found", assertThrows(OperatorApiException::class.java) { service.preview("other-user", request) }.code)
        assertTrue(storedRecords.isEmpty())
        assertTrue(storedUpgrades.isEmpty())
        assertEquals(42, inventoryRevision)
        for (rarity in listOf(3, 4, 5)) {
            val ordinary = com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse.of(original.copy(rarity = rarity))
            assertEquals(rarity != 3, checkNotNull(ordinary.huajiCapabilities).awakeningUpgradeSupported)
        }
        assertFalse(
            com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse.of(
                original.copy(spOf = "base"),
            ).huajiCapabilities!!.awakeningUpgradeSupported,
        )
    }

    private fun request(target: Int) = OperatorUpgradeRequest("a1", "如鸢", "op1", "huaji", target, 7)

    private fun executeRequest(token: String, target: Int) = OperatorUpgradeExecuteRequest("a1", "如鸢", "op1", "huaji", target, 7, 42, token)

    private fun current(starLevel: Int) = OperatorCurrent(
        id = "current",
        userId = "u1",
        accountId = "a1",
        game = "如鸢",
        entries = mapOf("op1" to OperatorEntry(elite = 17, starLevel = starLevel, level = 100, revision = 7)),
    )

    private fun stock(entityType: String, entries: Map<String, Long>) = InventoryCurrent(
        id = "stock-$entityType",
        userId = "u1",
        accountId = "a1",
        entityType = entityType,
        entries = entries.mapValues { StockEntry(it.value) },
    )
}
