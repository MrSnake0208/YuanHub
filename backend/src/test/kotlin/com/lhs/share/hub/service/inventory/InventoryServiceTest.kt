package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.inventory.request.InventoryEntryRequest
import com.lhs.share.hub.controller.inventory.request.InventoryExchangeAccountDto
import com.lhs.share.hub.controller.inventory.request.InventoryImportRequest
import com.lhs.share.hub.controller.inventory.request.InventoryRecordRequest
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import com.lhs.share.hub.controller.inventory.response.InventoryCatalogResponse
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryDeletedRecord
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.ProducerInfo
import com.lhs.share.hub.repository.entity.RecordEntry
import com.lhs.share.hub.repository.entity.SubAccount
import com.mongodb.MongoException
import com.mongodb.client.AggregateIterable
import com.mongodb.client.MongoCollection
import com.mongodb.client.MongoCursor
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.bson.Document
import org.bson.conversions.Bson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

class InventoryServiceTest {
    private val accountRepository = mockk<SubAccountRepository>()
    private val currentRepository = mockk<InventoryCurrentRepository>()
    private val recordRepository = mockk<InventoryRecordRepository>()
    private val deletedRecordRepository = mockk<InventoryDeletedRecordRepository>()
    private val revisionRepository = mockk<InventoryRevisionRepository>()
    private val catalogService = mockk<EntityCatalogService>()
    private val mongoTemplate = mockk<MongoTemplate>()
    private val accounts = mutableMapOf<Pair<String, String>, SubAccount>()
    private val currents = mutableMapOf<Triple<String, String, String>, InventoryCurrent>()
    private val records = mutableMapOf<Triple<String, String, String>, InventoryRecord>()
    private val deletedRecords = mutableMapOf<Triple<String, String, String>, InventoryDeletedRecord>()
    private val revisions = mutableMapOf<Pair<String, String>, InventoryRevision>()
    private var nextRecordId = 1

    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

            override fun commit(status: TransactionStatus) = Unit

            override fun rollback(status: TransactionStatus) = Unit
        },
    )

    private lateinit var service: InventoryService

    @BeforeEach
    fun setUp() {
        currents.clear()
        records.clear()
        deletedRecords.clear()
        accounts.clear()
        revisions.clear()
        accounts["u1" to "main"] = SubAccount(id = "a1", userId = "u1", accountId = "main", name = "大号")
        accounts["u1" to "alt"] = SubAccount(id = "a2", userId = "u1", accountId = "alt", name = "小号")
        accounts["u2" to "main"] = SubAccount(id = "a3", userId = "u2", accountId = "main", name = "导入账号")
        accounts["u2" to "foreign"] = SubAccount(id = "a4", userId = "u2", accountId = "foreign", name = "他人账号")
        nextRecordId = 1
        every { catalogService.exists(any(), any()) } returns true
        every { catalogService.agentMatchesGame(any(), any()) } returns true
        every { catalogService.existsReadOnly(any(), any()) } returns true
        every { catalogService.agentMatchesGameReadOnly(any(), any()) } returns true
        every { accountRepository.fenceRecruitmentWrite(any(), any(), any()) } returns true
        every { revisionRepository.compareAndIncrement(any(), any(), any(), any()) } answers {
            val key = firstArg<String>() to secondArg<String>()
            val expected = thirdArg<Long>()
            if ((revisions[key]?.revision ?: 0L) != expected) {
                null
            } else {
                InventoryRevision(id = "${key.first}:${key.second}", userId = key.first, accountId = key.second, revision = expected + 1)
                    .also { revisions[key] = it }
            }
        }
        every { catalogService.catalog() } returns InventoryCatalogResponse(catalogVersion = "2026-08-16", entities = emptyList())
        every { accountRepository.findByUserIdAndAccountId(any(), any()) } answers {
            accounts[firstArg<String>() to secondArg<String>()]
        }
        every { accountRepository.findAllByUserIdAndAccountIdIn(any(), any()) } answers {
            val userId = firstArg<String>()
            val ids = secondArg<Collection<String>>()
            accounts.values.filter { it.userId == userId && it.accountId in ids }
        }
        every { accountRepository.findAllByUserIdOrderByCreatedAtAsc(any()) } answers {
            val userId = firstArg<String>()
            accounts.values.filter { it.userId == userId }.sortedBy { it.createdAt }
        }
        every { currentRepository.findByUserIdAndAccountIdAndEntityType(any(), any(), any()) } answers {
            currents[Triple(firstArg(), secondArg(), thirdArg())]
        }
        every { currentRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(any(), any()) } answers {
            val userId = firstArg<String>()
            val accountId = secondArg<String>()
            currents.values.filter { it.userId == userId && it.accountId == accountId }.sortedByDescending { it.updatedAt }
        }
        every { currentRepository.save(any()) } answers {
            val value = firstArg<InventoryCurrent>()
            val saved = if (value.id == null) value.copy(id = "current:${value.userId}:${value.accountId}:${value.entityType}") else value
            currents[Triple(saved.userId, saved.accountId, saved.entityType)] = saved
            saved
        }
        every { currentRepository.deleteById(any()) } answers {
            val id = firstArg<String>()
            currents.entries.removeIf { it.value.id == id }
        }
        every { recordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } answers {
            records[Triple(firstArg(), secondArg(), thirdArg())]
        }
        every { deletedRecordRepository.findByUserIdAndAccountIdAndRecordId(any(), any(), any()) } answers {
            deletedRecords[Triple(firstArg(), secondArg(), thirdArg())]
        }
        every { deletedRecordRepository.save(any()) } answers {
            val value = firstArg<InventoryDeletedRecord>()
            val saved = if (value.id == null) value.copy(id = "deleted:${value.recordId}") else value
            deletedRecords[Triple(saved.userId, saved.accountId, saved.recordId)] = saved
            saved
        }
        every { deletedRecordRepository.deleteById(any()) } answers {
            val id = firstArg<String>()
            deletedRecords.entries.removeIf { it.value.id == id }
        }
        every { recordRepository.save(any()) } answers {
            val value = firstArg<InventoryRecord>()
            val saved = if (value.id == null) value.copy(id = "%024x".format(nextRecordId++)) else value
            records[Triple(saved.userId, saved.accountId, saved.recordId)] = saved
            saved
        }
        every { recordRepository.deleteById(any()) } answers {
            val id = firstArg<String>()
            records.entries.removeIf { it.value.id == id }
        }
        every { recordRepository.findByUserIdAndAccountIdOrderByEffectiveAtAsc(any(), any()) } answers {
            val userId = firstArg<String>()
            val accountId = secondArg<String>()
            records.values.filter { it.userId == userId && it.accountId == accountId }.sortedBy { it.effectiveAt }
        }
        every { recordRepository.findByUserIdAndAccountIdOrderByEffectiveAtDesc(any(), any()) } answers {
            val userId = firstArg<String>()
            val accountId = secondArg<String>()
            records.values.filter { it.userId == userId && it.accountId == accountId }.sortedByDescending { it.effectiveAt }
        }
        every { revisionRepository.findByUserIdAndAccountId(any(), any()) } answers {
            revisions[firstArg<String>() to secondArg<String>()]
        }
        every { revisionRepository.save(any()) } answers {
            firstArg<InventoryRevision>().also { revisions[it.userId to it.accountId] = it }
        }
        service = InventoryService(
            accountRepository,
            currentRepository,
            recordRepository,
            deletedRecordRepository,
            catalogService,
            mongoTemplate,
            transactionTemplate,
            revisionRepository,
        )
    }

    @Test
    fun `pending concurrent writer keeps annotation result unknown until a revision change is visible`() {
        service.import("u1", document(snapshot("base", "2026-10-23T10:00:00Z", "full", InventoryEntryRequest("baijinbi", count = 100))))
        val request = document(reward("annotation", "2026-10-23T09:00:00Z", "baijinbi", 3))
        val expected = checkNotNull(revisions["u1" to "main"]).revision
        every { revisionRepository.compareAndIncrement(any(), any(), any(), any()) } throws MongoException(112, "WriteConflict")
        val error = assertThrows(InventoryApiException::class.java) { service.annotateRewards("u1", request, expected) }
        assertEquals("annotation_result_unknown", error.code)
        assertEquals(503, error.status.value())
        assertEquals(null, records[Triple("u1", "main", "annotation")])
        revisions["u1" to "main"] = checkNotNull(revisions["u1" to "main"]).copy(revision = expected + 1)
        assertEquals(
            "inventory_state_stale",
            assertThrows(InventoryApiException::class.java) {
                service.annotateRewards("u1", request, expected)
            }.code,
        )
    }

    @Test
    fun `annotation preview covers all entries without writes or catalog seeding`() {
        service.import("u1", document(snapshot("base", "2026-10-23T10:00:00Z", "listed", InventoryEntryRequest("baijinbi", count = 100))))
        val before = revisions["u1" to "main"]
        val request = document(
            reward("annotation", "2026-10-23T09:00:00Z", "baijinbi", 3).copy(
                entries = listOf(InventoryEntryRequest("baijinbi", count = 3), InventoryEntryRequest("zhuyu", count = 1)),
            ),
        )
        val preview = service.previewRewardAnnotations("u1", request)
        assertEquals(listOf(true, false), preview.entries.map { it.historyOnly })
        assertEquals(false, preview.canConfirm)
        assertEquals(null, preview.entries.last().baselineAt)
        assertEquals(before, revisions["u1" to "main"])
        assertEquals(1, records.size)
        verify(exactly = 0) { catalogService.exists("item", "zhuyu") }
    }

    @Test
    fun `annotations keep stock unchanged and exact retry ignores old revision without bumping it`() {
        service.import("u1", document(snapshot("base", "2026-10-23T10:00:00Z", "full", InventoryEntryRequest("baijinbi", count = 100))))
        val request = document(reward("annotation", "2026-10-23T09:00:00Z", "baijinbi", 3))
        val preview = service.previewRewardAnnotations("u1", request)
        assertEquals(true, preview.canConfirm)
        val before = currents.toMap()
        assertEquals(1, service.annotateRewards("u1", request, preview.expectedInventoryRevision).historyOnly)
        val revision = revisions["u1" to "main"]
        assertEquals(before, currents)
        assertEquals(1, service.annotateRewards("u1", request, preview.expectedInventoryRevision).duplicates)
        assertEquals(revision, revisions["u1" to "main"])
        assertEquals("history_only", records[Triple("u1", "main", "annotation")]?.stockEffect)
        assertEquals(
            "record_conflict",
            assertThrows(InventoryApiException::class.java) {
                service.annotateRewards(
                    "u1",
                    document(request.records.single().copy(entries = listOf(InventoryEntryRequest("baijinbi", count = 4)))),
                    0,
                )
            }.code,
        )
    }

    @Test
    fun `annotation rejects applied duplicates and non reward or mixed account documents`() {
        val request = document(reward("applied", "2026-10-23T09:00:00Z", "baijinbi", 3))
        service.import("u1", request)
        assertEquals(
            "annotation_would_change_stock",
            assertThrows(InventoryApiException::class.java) {
                service.annotateRewards("u1", request, 0)
            }.code,
        )
        assertEquals(
            "schema_validation_failed",
            assertThrows(InventoryApiException::class.java) {
                service.previewRewardAnnotations("u1", document(request.records.single(), request.records.single().copy(accountId = "alt")))
            }.code,
        )
        assertEquals(
            "schema_validation_failed",
            assertThrows(InventoryApiException::class.java) {
                service.previewRewardAnnotations("u1", document(snapshot("base", "2026-10-23T10:00:00Z", "full")))
            }.code,
        )
    }

    @Test
    fun `connection attribution is saved with real import and duplicate upload cannot claim a manual record`() {
        val request = document(reward("manual", "2026-08-16T10:00:00+08:00", "baijinbi", 5))
        service.import("u1", request)
        assertEquals(null, records[Triple("u1", "main", "manual")]?.sourceConnectionId)
        assertEquals(1, service.importFromConnection("u1", "main", "connection", request).duplicates)
        assertEquals(null, records[Triple("u1", "main", "manual")]?.sourceConnectionId)
        service.importFromConnection("u1", "main", "connection", document(reward("real", "2026-08-16T11:00:00+08:00", "baijinbi", 7)))
        assertEquals("connection", records[Triple("u1", "main", "real")]?.sourceConnectionId)
        assertEquals("applied", records[Triple("u1", "main", "real")]?.stockEffect)
        assertEquals(12, count("u1", "baijinbi"))
    }

    @Test
    fun `first sync queries exact owner account connection and only applied records`() {
        every {
            recordRepository.findFirstByUserIdAndAccountIdAndSourceConnectionIdAndStockEffectOrderByReceivedAtAsc(
                "u1",
                "main",
                "connection",
                "applied",
            )
        } returns null
        assertEquals(null, service.firstConnectionSync("u1", "main", "connection"))
        verify(exactly = 1) {
            recordRepository.findFirstByUserIdAndAccountIdAndSourceConnectionIdAndStockEffectOrderByReceivedAtAsc(
                "u1",
                "main",
                "connection",
                "applied",
            )
        }
    }

    @Test
    fun `retransmission is idempotent and changed body conflicts`() {
        val request = document(reward("reward-1", "2026-08-16T10:00:00+08:00", "baijinbi", 5))

        assertEquals(1, service.import("u1", request).accepted)
        assertEquals(1, service.import("u1", request).duplicates)
        assertEquals(5, count("u1", "baijinbi"))
        assertEquals(1, records.size)

        val conflict = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(reward("reward-1", "2026-08-16T10:00:00+08:00", "baijinbi", 6)))
        }
        assertEquals(409, conflict.status.value())
        assertEquals("record_conflict", conflict.code)
        assertEquals(5, count("u1", "baijinbi"))
    }

    @ParameterizedTest
    @ValueSource(longs = [60, 65, 80, 90])
    fun `monthly white coins accept actual integer amounts and keep the same daily id`(amount: Long) {
        val id = "yuanhub:daily-whitecoin:monthly-card:2026-08-16"
        val record = reward(id, "2026-08-16T10:00:00+08:00", "baijinbi", amount).copy(acquisitionChannel = "月卡奖励")
        assertEquals(1, service.import("u1", document(record)).accepted)
        assertEquals(amount, count("u1", "baijinbi"))
        assertEquals(1, service.import("u1", document(record)).duplicates)
        assertEquals(
            "record_conflict",
            assertThrows(InventoryApiException::class.java) {
                service.import("u1", document(record.copy(entries = listOf(entry("baijinbi", amount + 1)))))
            }.code,
        )
        assertEquals(amount, count("u1", "baijinbi"))
        assertEquals(1, records.size)
    }

    @Test
    fun `monthly 65 covered by an inventory snapshot only annotates income`() {
        service.import("u1", document(snapshot("scan", "2026-08-16T11:00:00Z", "full", entry("baijinbi", 100))))
        val record = reward("yuanhub:daily-whitecoin:monthly-card:2026-08-16", "2026-08-16T10:00:00Z", "baijinbi", 65)
            .copy(acquisitionChannel = "月卡奖励")
        assertEquals(1, service.import("u1", document(record)).historyOnly)
        assertEquals(100, count("u1", "baijinbi"))
        assertEquals(1, service.import("u1", document(record)).duplicates)
        assertEquals(100, count("u1", "baijinbi"))
    }

    @Test
    fun `dispatch reward requires and persists stamina cost`() {
        val dispatch = reward("dispatch", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(
            acquisitionChannel = "自动派遣",
            staminaCost = 80,
        )

        service.import("u1", document(dispatch))

        assertEquals(80, records[Triple("u1", "main", "dispatch")]?.staminaCost)
        val conflict = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(dispatch.copy(staminaCost = 40)))
        }
        assertEquals("record_conflict", conflict.code)
    }

    @Test
    fun `reward full and listed snapshots follow inventory semantics`() {
        service.import(
            "u1",
            document(
                reward("r1", "2026-08-16T10:00:00Z", "baimozhijiu", 5),
                snapshot("full-1", "2026-08-16T11:00:00Z", "full", entry("baijinbi", 10)),
                snapshot("listed-1", "2026-08-16T12:00:00Z", "listed", entry("baimozhijiu", 7)),
                reward("r2", "2026-08-16T13:00:00Z", "baijinbi", 2),
            ),
        )

        assertEquals(12, count("u1", "baijinbi"))
        assertEquals(7, count("u1", "baimozhijiu"))
        assertEquals(5, records[Triple("u1", "main", "r1")]!!.entries.single().count)
    }

    @Test
    fun `MaaY bag item sample overwrites listed stock and round trips through current export`() {
        accounts["u1" to "acc_demo"] = SubAccount(
            id = "a-demo",
            userId = "u1",
            accountId = "acc_demo",
            name = "联调账号",
        )
        service.import(
            "u1",
            document(
                snapshotForAccount(
                    "before-bag-items",
                    "2026-09-10T03:00:00Z",
                    "full",
                    "acc_demo",
                    entry("fuchuan", 100),
                    entry("tianjifuchuan", 80),
                    entry("baijinbi", 9000),
                    entry("mazi", 1),
                    entry("jizhi", 1),
                    entry("sherou", 1),
                    entry("zhuyu", 1),
                    entry("baimozhijiu", 44),
                ),
            ),
        )
        val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val sample = mapper.readValue(
            checkNotNull(javaClass.getResourceAsStream("/bag-items-stock-snapshot-v2.json")),
            InventoryImportRequest::class.java,
        )

        val imported = service.import("u1", sample)
        val duplicate = service.import("u1", sample)
        val current = service.current("u1", "acc_demo", "item").single()
        val exported = service.export(
            "u1",
            accountId = "acc_demo",
            scope = null,
            includeRewards = false,
            from = null,
            to = null,
        ).records.single { it.entityType == "item" }

        assertEquals(1, imported.accepted)
        assertEquals(1, duplicate.duplicates)
        assertEquals(
            mapOf(
                "fuchuan" to 2L,
                "tianjifuchuan" to 19L,
                "baijinbi" to 3177L,
                "mazi" to 29L,
                "jizhi" to 566L,
                "sherou" to 18L,
                "zhuyu" to 18L,
            ),
            BAG_ITEM_IDS.associateWith { current.entries.getValue(it).count },
        )
        assertEquals(44, current.entries.getValue("baimozhijiu").count)
        assertEquals("listed", records.getValue(Triple("u1", "acc_demo", BAG_SAMPLE_RECORD_ID)).snapshotScope)
        assertEquals("背包-物品", records.getValue(Triple("u1", "acc_demo", BAG_SAMPLE_RECORD_ID)).acquisitionChannel)
        assertTrue(records.values.none { it.accountId == "acc_demo" && it.recordType == "reward_delta" })
        assertEquals(
            BAG_ITEM_IDS.associateWith { current.entries.getValue(it).count },
            exported.entries.filter { it.id in BAG_ITEM_IDS }.associate { it.id to it.count },
        )
    }

    @Test
    fun `six item listed snapshot preserves omitted baijinbi count and baseline`() {
        service.import(
            "u1",
            document(
                snapshot(
                    "initial-items",
                    "2026-09-10T02:00:00Z",
                    "listed",
                    entry("fuchuan", 100),
                    entry("tianjifuchuan", 80),
                    entry("baijinbi", 9000),
                ),
            ),
        )
        val baijinbiBefore = currents.getValue(Triple("u1", "main", "item")).entries.getValue("baijinbi")
        val sixItems = snapshot(
            "bag-items-without-currency",
            "2026-09-10T04:00:00Z",
            "listed",
            entry("fuchuan", 2),
            entry("tianjifuchuan", 19),
            entry("mazi", 29),
            entry("jizhi", 566),
            entry("sherou", 18),
            entry("zhuyu", 18),
        ).copy(acquisitionChannel = "背包-物品")

        service.import("u1", document(sixItems))

        val current = currents.getValue(Triple("u1", "main", "item"))
        assertEquals(baijinbiBefore, current.entries.getValue("baijinbi"))
        assertEquals(2, current.entries.getValue("fuchuan").count)
        assertEquals(19, current.entries.getValue("tianjifuchuan").count)
    }

    @Test
    fun `explicit zero applies and legacy bag bird food channel remains valid`() {
        service.import(
            "u1",
            document(
                snapshot(
                    "initial-items",
                    "2026-09-10T02:00:00Z",
                    "listed",
                    entry("fuchuan", 9),
                    entry("tianjifuchuan", 8),
                    entry("baijinbi", 7),
                ),
            ),
        )
        service.import(
            "u1",
            document(
                snapshot(
                    "zero-items",
                    "2026-09-10T03:00:00Z",
                    "listed",
                    entry("fuchuan", 0),
                    entry("baijinbi", 0),
                ).copy(acquisitionChannel = "背包-物品"),
                snapshot(
                    "legacy-bird-food",
                    "2026-09-10T04:00:00Z",
                    "listed",
                    entry("mazi", 29),
                    entry("jizhi", 566),
                    entry("sherou", 18),
                    entry("zhuyu", 18),
                ).copy(acquisitionChannel = "背包-鸟食"),
            ),
        )

        val current = currents.getValue(Triple("u1", "main", "item"))
        assertTrue(current.entries.containsKey("fuchuan"))
        assertTrue(current.entries.containsKey("baijinbi"))
        assertEquals(0, current.entries.getValue("fuchuan").count)
        assertEquals(0, current.entries.getValue("baijinbi").count)
        assertEquals(8, current.entries.getValue("tianjifuchuan").count)
        assertEquals(29, current.entries.getValue("mazi").count)
        assertEquals("背包-鸟食", records.getValue(Triple("u1", "main", "legacy-bird-food")).acquisitionChannel)
    }

    @Test
    fun `inventory revision advances only when an import changes current stock`() {
        service.import("u1", document(snapshot("full", "2026-08-16T11:00:00Z", "full", entry("baijinbi", 10))))
        service.import("u1", document(reward("history", "2026-08-16T10:00:00Z", "baijinbi", 2)))
        service.import("u1", document(reward("applied", "2026-08-16T12:00:00Z", "baijinbi", 2)))

        assertEquals(2, revisions.getValue("u1" to "main").revision)
        assertEquals("history_only", records.getValue(Triple("u1", "main", "history")).stockEffect)
    }

    @Test
    fun `agent full and listed snapshots follow inventory semantics`() {
        service.import(
            "u1",
            document(
                agentSnapshot(
                    "agent-full-1",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "main",
                    entry("char_038_luxun", 4),
                    entry("char_102_jianyong", 8),
                ),
                agentSnapshot(
                    "agent-listed",
                    "2026-08-16T11:00:00Z",
                    "listed",
                    "main",
                    entry("char_102_jianyong", 12),
                ),
            ),
        )

        assertEquals(4, count("u1", "char_038_luxun", entityType = "agent"))
        assertEquals(12, count("u1", "char_102_jianyong", entityType = "agent"))

        service.import(
            "u1",
            document(
                agentSnapshot(
                    "agent-full-2",
                    "2026-08-16T12:00:00Z",
                    "full",
                    "main",
                    entry("char_102_jianyong", 3),
                ),
            ),
        )

        assertEquals(0, count("u1", "char_038_luxun", entityType = "agent"))
        assertEquals(3, count("u1", "char_102_jianyong", entityType = "agent"))
        assertEquals(
            3,
            service.current("u1", "main", "agent").single().entries.getValue("char_102_jianyong").count,
        )
    }

    @Test
    fun `new agent inventory rejects entries outside the account game before writing any record`() {
        accounts["u1" to "main"] = accounts.getValue("u1" to "main").copy(game = "如鸢")
        every { catalogService.agentMatchesGame("char_100_zhouzhong", "如鸢") } returns false
        every { catalogService.agentMatchesGame("char_125_zhaoyun", "如鸢") } returns false
        val request = document(
            reward("item-reward", "2026-08-16T10:00:00Z", "baijinbi", 1),
            agentSnapshot(
                "wrong-game",
                "2026-08-16T11:00:00Z",
                "listed",
                "main",
                entry("char_038_luxun", 4),
                entry("char_100_zhouzhong", 0),
                entry("char_125_zhaoyun", 2),
            ),
        )

        val error = assertThrows(InventoryApiException::class.java) { service.import("u1", request) }

        assertEquals(422, error.status.value())
        assertEquals("agent_game_mismatch", error.code)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
        assertTrue(revisions.isEmpty())
        verify(exactly = 0) { recordRepository.save(any()) }
        verify(exactly = 0) { currentRepository.save(any()) }
    }

    @ParameterizedTest
    @ValueSource(strings = ["full", "listed"])
    fun `mixed agent snapshots ignore cross game zeros preserve originals and clear supported zeros`(scope: String) {
        accounts["u1" to "main"] = accounts.getValue("u1" to "main").copy(game = "如鸢")
        every { catalogService.agentMatchesGame("char_100_zhouzhong", "如鸢") } returns false
        service.import(
            "u1",
            document(
                agentSnapshot(
                    "before",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "main",
                    entry("char_038_luxun", 9),
                    entry("char_102_jianyong", 8),
                ),
            ),
        )
        val snapshot = agentSnapshot(
            "mixed",
            "2026-08-16T11:00:00Z",
            scope,
            "main",
            entry("char_038_luxun", 4),
            entry("char_102_jianyong", 0),
            InventoryEntryRequest("char_100_zhouzhong", "周忠", 0),
        )
        val request = document(snapshot)
        val result = if (scope == "full") service.import("u1", "main", request) else service.import("u1", request)

        assertEquals(1, result.accepted)
        assertEquals(listOf("已忽略如鸢不支持的零值密探：周忠"), result.warnings)
        val current = currents.getValue(Triple("u1", "main", "agent"))
        assertEquals(4, current.entries.getValue("char_038_luxun").count)
        assertEquals(0, current.entries.getValue("char_102_jianyong").count)
        assertTrue("char_100_zhouzhong" !in current.entries)
        val original = records.getValue(Triple("u1", "main", "mixed"))
        assertEquals(snapshot.entries.map { RecordEntry(it.id, it.name, it.count) }, original.entries)

        // 已接收的原正文重传不再依赖当前目录；删除被忽略的原始 entry 仍属正文冲突。
        every { catalogService.exists("agent", "char_100_zhouzhong") } returns false
        assertEquals(1, service.import("u1", request).duplicates)
        assertEquals(current, currents.getValue(Triple("u1", "main", "agent")))
        assertEquals(2, revisions.getValue("u1" to "main").revision)
        assertEquals(original, records.getValue(Triple("u1", "main", "mixed")))
        val conflict = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(snapshot.copy(entries = snapshot.entries.dropLast(1))))
        }
        assertEquals("record_conflict", conflict.code)
    }

    @ParameterizedTest
    @ValueSource(strings = ["full", "listed"])
    fun `unknown zero agent still rejects the entire document`(scope: String) {
        every { catalogService.exists("agent", "unknown") } returns false
        every { catalogService.agentMatchesGame("unknown", any()) } returns false
        val error = assertThrows(InventoryApiException::class.java) {
            service.import(
                "u1",
                document(
                    reward("valid", "2026-08-16T10:00:00Z", "baijinbi", 1),
                    agentSnapshot("unknown", "2026-08-16T11:00:00Z", scope, "main", entry("unknown", 0)),
                ),
            )
        }

        assertEquals(422, error.status.value())
        assertEquals("unknown_entity_id", error.code)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
        assertTrue(revisions.isEmpty())
        verify(exactly = 0) { recordRepository.save(any()) }
        verify(exactly = 0) { currentRepository.save(any()) }
    }

    @ParameterizedTest
    @ValueSource(longs = [0, 1])
    fun `cross game reward deltas remain strictly rejected`(count: Long) {
        every { catalogService.agentMatchesGame("char_100_zhouzhong", any()) } returns false
        val record = reward("reward", "2026-08-16T10:00:00Z", "char_100_zhouzhong", count).copy(entityType = "agent")

        val error = assertThrows(InventoryApiException::class.java) { service.import("u1", document(record)) }

        assertEquals(422, error.status.value())
        assertEquals(if (count == 0L) "schema_validation_failed" else "agent_game_mismatch", error.code)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
        assertTrue(revisions.isEmpty())
    }

    @Test
    fun `fully ignored listed snapshot leaves stock baselines and revision unchanged`() {
        every { catalogService.agentMatchesGame("char_100_zhouzhong", any()) } returns false
        service.import(
            "u1",
            document(agentSnapshot("before", "2026-08-16T10:00:00Z", "full", "main", entry("char_038_luxun", 9))),
        )
        val before = currents.getValue(Triple("u1", "main", "agent"))
        val revision = revisions.getValue("u1" to "main")
        val request = document(
            agentSnapshot("ignored", "2026-08-16T11:00:00Z", "listed", "main", entry("char_100_zhouzhong", 0)),
        )

        val result = service.import("u1", request)

        assertEquals(1, result.accepted)
        assertEquals(1, result.historyOnly)
        assertEquals(listOf("已忽略代号鸢不支持的零值密探：char_100_zhouzhong"), result.warnings)
        assertEquals(before, currents.getValue(Triple("u1", "main", "agent")))
        assertEquals(revision, revisions.getValue("u1" to "main"))
        assertEquals("history_only", records.getValue(Triple("u1", "main", "ignored")).stockEffect)
        assertEquals(1, service.import("u1", request).duplicates)
        verify(exactly = 1) { currentRepository.save(any()) }
    }

    @Test
    fun `fully ignored listed snapshot does not create current stock`() {
        every { catalogService.agentMatchesGame("char_100_zhouzhong", any()) } returns false

        val result = service.import(
            "u1",
            document(agentSnapshot("ignored", "2026-08-16T10:00:00Z", "listed", "main", entry("char_100_zhouzhong", 0))),
        )

        assertEquals(1, result.historyOnly)
        assertEquals(1, records.size)
        assertTrue(currents.isEmpty())
        assertTrue(revisions.isEmpty())
        verify(exactly = 0) { currentRepository.save(any()) }
    }

    @Test
    fun `fully ignored full snapshot clears older stock preserves newer listed stock and advances full baseline`() {
        every { catalogService.agentMatchesGame("char_100_zhouzhong", any()) } returns false
        service.import(
            "u1",
            document(
                agentSnapshot(
                    "before",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "main",
                    entry("char_038_luxun", 9),
                    entry("char_102_jianyong", 8),
                ),
                agentSnapshot("newer", "2026-08-16T12:00:00Z", "listed", "main", entry("char_102_jianyong", 3)),
            ),
        )

        val result = service.import(
            "u1",
            document(agentSnapshot("ignored", "2026-08-16T11:00:00Z", "full", "main", entry("char_100_zhouzhong", 0))),
        )

        assertEquals(1, result.accepted)
        assertEquals(0, result.historyOnly)
        val current = currents.getValue(Triple("u1", "main", "agent"))
        assertEquals(setOf("char_102_jianyong"), current.entries.keys)
        assertEquals(3, current.entries.getValue("char_102_jianyong").count)
        assertEquals(Instant.parse("2026-08-16T12:00:00Z"), current.entries.getValue("char_102_jianyong").listedBaselineAt)
        assertEquals(Instant.parse("2026-08-16T11:00:00Z"), current.fullBaselineAt)

        val delayed = reward("delayed", "2026-08-16T10:30:00Z", "char_038_luxun", 2).copy(entityType = "agent")
        assertEquals(1, service.import("u1", document(delayed)).historyOnly)
        assertEquals(current, currents.getValue(Triple("u1", "main", "agent")))
        val older = agentSnapshot("older", "2026-08-16T09:00:00Z", "full", "main", entry("char_100_zhouzhong", 0))
        assertEquals(1, service.import("u1", document(older)).superseded)
        assertEquals(current, currents.getValue(Triple("u1", "main", "agent")))
    }

    @ParameterizedTest
    @ValueSource(strings = ["full", "listed"])
    fun `delete and restore replay filters zero padding while preserving original snapshots`(scope: String) {
        every { catalogService.agentMatchesGame("char_100_zhouzhong", any()) } returns false
        val snapshot = agentSnapshot(
            "mixed",
            "2026-08-16T10:00:00Z",
            scope,
            "main",
            entry("char_038_luxun", 4),
            entry("char_100_zhouzhong", 0),
        )
        val reward = reward("later", "2026-08-16T11:00:00Z", "char_038_luxun", 2).copy(entityType = "agent")
        service.import("u1", document(snapshot, reward))
        val original = records.getValue(Triple("u1", "main", "mixed"))
        // 新记录的未知 ID 由预检拒绝；已接收的补零不能因目录删除在重放时重新进入库存。
        every { catalogService.exists("agent", "char_100_zhouzhong") } returns false

        service.deleteRecord("u1", "main", "later")

        assertEquals(4, count("u1", "char_038_luxun", entityType = "agent"))
        assertTrue("char_100_zhouzhong" !in currents.getValue(Triple("u1", "main", "agent")).entries)
        assertEquals(original, records.getValue(Triple("u1", "main", "mixed")))

        service.restoreRecord("u1", "main", "later")

        assertEquals(6, count("u1", "char_038_luxun", entityType = "agent"))
        assertTrue("char_100_zhouzhong" !in currents.getValue(Triple("u1", "main", "agent")).entries)
        assertEquals(original, records.getValue(Triple("u1", "main", "mixed")))
    }

    @Test
    fun `same agent record stays idempotent after account game changes`() {
        val request = document(agentSnapshot("old-game", "2026-08-16T10:00:00Z", "listed", "main", entry("char_125_zhaoyun", 2)))
        assertEquals(1, service.import("u1", request).accepted)
        accounts["u1" to "main"] = accounts.getValue("u1" to "main").copy(game = "如鸢")
        every { catalogService.agentMatchesGame("char_125_zhaoyun", "如鸢") } returns false

        assertEquals(1, service.import("u1", request).duplicates)
        assertEquals(2, count("u1", "char_125_zhaoyun", entityType = "agent"))
    }

    @Test
    fun `agent snapshots do not affect items or another account`() {
        service.import(
            "u1",
            document(
                snapshot("item-full", "2026-08-16T10:00:00Z", "full", entry("baijinbi", 9)),
                agentSnapshot(
                    "agent-main",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "main",
                    entry("char_102_jianyong", 5),
                ),
                agentSnapshot(
                    "agent-alt",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "alt",
                    entry("char_102_jianyong", 17),
                ),
            ),
        )

        assertEquals(9, count("u1", "baijinbi"))
        assertEquals(5, count("u1", "char_102_jianyong", "main", "agent"))
        assertEquals(17, count("u1", "char_102_jianyong", "alt", "agent"))
    }

    @Test
    fun `agent snapshot name remains record display data only`() {
        service.import(
            "u1",
            document(
                agentSnapshot(
                    "agent-forged-name",
                    "2026-08-16T10:00:00Z",
                    "full",
                    "main",
                    InventoryEntryRequest("char_102_jianyong", "伪造名称", 12),
                ),
            ),
        )

        assertEquals(12, count("u1", "char_102_jianyong", entityType = "agent"))
        assertEquals("伪造名称", records[Triple("u1", "main", "agent-forged-name")]!!.entries.single().name)
        verify(exactly = 1) { catalogService.exists("agent", "char_102_jianyong") }
    }

    @Test
    fun `delayed reward is history only and newer listed value survives older full snapshot`() {
        service.import("u1", document(snapshot("full-1", "2026-08-16T11:00:00Z", "full", entry("baijinbi", 10))))
        val delayed = service.import("u1", document(reward("late", "2026-08-16T10:00:00Z", "baijinbi", 4)))
        service.import("u1", document(snapshot("listed", "2026-08-16T13:00:00Z", "listed", entry("baimozhijiu", 9))))
        service.import(
            "u1",
            document(
                snapshot(
                    "older-full",
                    "2026-08-16T12:00:00Z",
                    "full",
                    entry("baijinbi", 3),
                    entry("baimozhijiu", 1),
                ),
            ),
        )

        assertEquals(1, delayed.historyOnly)
        assertEquals("history_only", records[Triple("u1", "main", "late")]?.stockEffect)
        assertEquals(3, count("u1", "baijinbi"))
        assertEquals(9, count("u1", "baimozhijiu"))
    }

    @Test
    fun `empty full snapshot clears inventory`() {
        service.import("u1", document(snapshot("full-1", "2026-08-16T11:00:00Z", "full", entry("baijinbi", 10))))
        service.import("u1", document(snapshot("full-empty", "2026-08-16T12:00:00Z", "full")))

        assertTrue(currents[Triple("u1", "main", "item")]!!.entries.isEmpty())
    }

    @Test
    fun `same timestamp applies reward before snapshot`() {
        service.import(
            "u1",
            document(
                snapshot("snapshot", "2026-08-16T10:00:00Z", "full", entry("baijinbi", 4)),
                reward("reward", "2026-08-16T10:00:00Z", "baijinbi", 3),
            ),
        )

        assertEquals(4, count("u1", "baijinbi"))
    }

    @Test
    fun `accounts isolate idempotency baselines and delayed rewards`() {
        service.import(
            "u1",
            document(snapshot("baseline", "2026-08-16T12:00:00Z", "full", entry("baijinbi", 10))),
        )
        val result = service.import(
            "u1",
            document(
                reward("same-id", "2026-08-16T10:00:00Z", "baijinbi", 3),
                reward("same-id", "2026-08-16T10:00:00Z", "baijinbi", 4, accountId = "alt"),
            ),
        )

        assertEquals(2, result.accepted)
        assertEquals(1, result.historyOnly)
        assertEquals(10, count("u1", "baijinbi", "main"))
        assertEquals(4, count("u1", "baijinbi", "alt"))
        assertEquals(2, records.values.count { it.recordId == "same-id" })
    }

    @Test
    fun `automatic imports accept omitted accounts id-only accounts and stale names`() {
        val withoutAccounts = service.import(
            "u1",
            document(reward("without-directory", "2026-08-16T10:00:00Z", "baijinbi", 1)),
        )
        val idOnly = service.import(
            "u1",
            document(reward("id-only", "2026-08-16T11:00:00Z", "baijinbi", 1)).copy(
                accounts = listOf(InventoryExchangeAccountDto("main")),
            ),
        )
        val staleName = service.import(
            "u1",
            document(reward("stale-name", "2026-08-16T12:00:00Z", "baijinbi", 1, "alt")).copy(
                accounts = listOf(InventoryExchangeAccountDto("alt", "客户端旧名称")),
            ),
        )

        assertEquals(1, withoutAccounts.accepted)
        assertEquals(1, idOnly.accepted)
        assertEquals(1, staleName.accepted)
        assertEquals(2, count("u1", "baijinbi"))
        assertEquals(1, count("u1", "baijinbi", "alt"))
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @Test
    fun `unknown and other-user account ids reject the entire document without name matching`() {
        val unknown = assertThrows(InventoryApiException::class.java) {
            service.import(
                "u1",
                document(
                    reward("valid", "2026-08-16T10:00:00Z", "baijinbi", 1),
                    reward("unknown", "2026-08-16T11:00:00Z", "baijinbi", 1, "ghost"),
                ).copy(accounts = listOf(InventoryExchangeAccountDto("ghost", "大号"))),
            )
        }
        val foreign = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(reward("foreign", "2026-08-16T10:00:00Z", "baijinbi", 1, "foreign")))
        }

        assertEquals("unknown_account_id", unknown.code)
        assertEquals("unknown_account_id", foreign.code)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @Test
    fun `account-bound import rejects records for another owned account`() {
        val error = assertThrows(InventoryApiException::class.java) {
            service.import(
                "u1",
                "main",
                document(reward("wrong-account", "2026-08-16T10:00:00Z", "baijinbi", 1, accountId = "alt")),
            )
        }

        assertEquals(403, error.status.value())
        assertEquals("account_scope_mismatch", error.code)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
    }

    @Test
    fun `deleting a record replays only its account`() {
        service.import(
            "u1",
            document(
                reward("remove", "2026-08-16T10:00:00Z", "baijinbi", 3),
                reward("keep", "2026-08-16T10:00:00Z", "baijinbi", 7, accountId = "alt"),
            ),
        )

        service.deleteRecord("u1", "main", "remove")

        assertEquals(0, count("u1", "baijinbi", "main"))
        assertEquals(7, count("u1", "baijinbi", "alt"))
        assertTrue(records.containsKey(Triple("u1", "alt", "keep")))
    }

    @Test
    fun `deleted listed snapshot restores original scope and inventory`() {
        service.import(
            "u1",
            document(
                snapshotForAccount("baseline", "2026-08-16T09:00:00Z", "full", "main", entry("baijinbi", 8)),
                snapshotForAccount("listed", "2026-08-16T10:00:00Z", "listed", "main", entry("baijinbi", 3)),
            ),
        )
        val original = records.getValue(Triple("u1", "main", "listed"))
        service.deleteRecord("u1", "main", "listed")
        assertEquals(8, count("u1", "baijinbi"))
        assertEquals(original, deletedRecords.getValue(Triple("u1", "main", "listed")).record)

        service.restoreRecord("u1", "main", "listed")

        assertEquals(3, count("u1", "baijinbi"))
        assertEquals(original, records.getValue(Triple("u1", "main", "listed")))
        assertTrue(deletedRecords.isEmpty())
    }

    @Test
    fun `restore is scoped to owner and account and refuses an occupied record id`() {
        service.import("u1", document(reward("deleted", "2026-08-16T10:00:00Z", "baijinbi", 4)))
        service.deleteRecord("u1", "main", "deleted")
        for ((user, account) in listOf("u2" to "main", "u1" to "alt")) {
            val error = assertThrows(InventoryApiException::class.java) { service.restoreRecord(user, account, "deleted") }
            assertEquals(404, error.status.value())
        }
        records[Triple("u1", "main", "deleted")] = storedRecord("replacement", "deleted", "2026-08-16T11:00:00Z")
        val conflict = assertThrows(InventoryApiException::class.java) { service.restoreRecord("u1", "main", "deleted") }
        assertEquals("record_already_exists", conflict.code)
        assertTrue(deletedRecords.containsKey(Triple("u1", "main", "deleted")))
        records.remove(Triple("u1", "main", "deleted"))
        service.restoreRecord("u1", "main", "deleted")
        assertEquals(4, count("u1", "baijinbi"))
        assertEquals(
            404,
            assertThrows(InventoryApiException::class.java) {
                service.restoreRecord("u1", "main", "deleted")
            }.status.value(),
        )
    }

    @Test
    fun `acquired aggregation excludes bag snapshots and is scoped to one account`() {
        service.import(
            "u1",
            document(
                snapshotForAccount(
                    "bag-items",
                    "2026-08-16T10:00:00Z",
                    "listed",
                    "alt",
                    entry("fuchuan", 2),
                ).copy(acquisitionChannel = "背包-物品"),
            ),
        )
        val collection = mockk<MongoCollection<Document>>()
        val aggregate = mockk<AggregateIterable<Document>>()
        val cursor = mockk<MongoCursor<Document>>()
        val pipeline = mutableListOf<List<Bson>>()
        every { mongoTemplate.getCollection("inventory_records") } returns collection
        every { collection.aggregate(capture(pipeline)) } returns aggregate
        every { aggregate.iterator() } returns cursor
        every { cursor.hasNext() } returns false

        val response = service.acquired(
            "u1",
            "alt",
            "item",
            Instant.parse("2026-08-01T00:00:00Z"),
            Instant.parse("2026-09-01T00:00:00Z"),
        )
        val match = (pipeline.single().first() as Document).get("\$match", Document::class.java)

        assertEquals("alt", response.accountId)
        assertEquals("u1", match.getString("userId"))
        assertEquals("alt", match.getString("accountId"))
        assertEquals("reward_delta", match.getString("recordType"))
        assertEquals("stock_snapshot", records.getValue(Triple("u1", "alt", "bag-items")).recordType)
        assertTrue(response.acquired.isEmpty())
    }

    @Test
    fun `consumption delta replays as subtraction and cannot be deleted independently`() {
        val snapshot = InventoryRecord(
            id = "snapshot-id",
            recordId = "snapshot",
            userId = "u1",
            accountId = "main",
            recordType = "stock_snapshot",
            entityType = "item",
            snapshotScope = "full",
            effectiveAt = Instant.parse("2026-08-16T10:00:00Z"),
            producer = ProducerInfo("test"),
            entries = listOf(RecordEntry("baijinbi", count = 10)),
        )
        val consumption = InventoryRecord(
            id = "consumption-id",
            recordId = "upgrade:tx:item",
            userId = "u1",
            accountId = "main",
            recordType = "consumption_delta",
            entityType = "item",
            effectiveAt = Instant.parse("2026-08-16T11:00:00Z"),
            producer = ProducerInfo("myshare"),
            entries = listOf(RecordEntry("baijinbi", count = 4)),
            transactionId = "tx",
        )
        val removable = storedRecord("remove-id", "remove", "2026-08-16T09:00:00Z")
        listOf(snapshot, consumption, removable).forEach { records[Triple(it.userId, it.accountId, it.recordId)] = it }
        currents[Triple("u1", "main", "item")] = InventoryCurrent(
            id = "current",
            userId = "u1",
            accountId = "main",
            entityType = "item",
            entries = mapOf("baijinbi" to com.lhs.share.hub.repository.entity.StockEntry(7)),
        )

        service.deleteRecord("u1", "main", "remove")
        assertEquals(6, count("u1", "baijinbi"))

        val error = assertThrows(InventoryApiException::class.java) {
            service.deleteRecord("u1", "main", "upgrade:tx:item")
        }
        assertEquals("consumption_record_delete_forbidden", error.code)
        assertEquals(6, count("u1", "baijinbi"))
    }

    @Test
    fun `retired agent rejects new records but accepted originals still retry idempotently`() {
        val oldId = "char_130_zhoutai"
        val record = reward("old-agent", "2026-09-18T10:00:00Z", oldId, 2).copy(entityType = "agent")
        service.import("u1", document(record))
        every { catalogService.exists("agent", oldId) } returns false
        assertEquals(1, service.import("u1", document(record)).duplicates)
        val invalid = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(record.copy(recordId = "new-agent")))
        }
        assertEquals("unknown_entity_id", invalid.code)
        val conflict = assertThrows(InventoryApiException::class.java) {
            service.import("u1", document(record.copy(entries = listOf(InventoryEntryRequest(oldId, count = 9)))))
        }
        assertEquals("record_conflict", conflict.code)
        assertEquals(1, records.size)
    }

    @Test
    fun `entire document is validated before any write`() {
        every { catalogService.exists("item", "unknown") } returns false
        val error = assertThrows(InventoryApiException::class.java) {
            service.import(
                "u1",
                document(
                    reward("valid", "2026-08-16T10:00:00Z", "baijinbi", 1),
                    reward("invalid", "2026-08-16T11:00:00Z", "unknown", 1),
                ),
            )
        }

        assertEquals("unknown_entity_id", error.code)
        assertEquals("invalid", error.recordId)
        assertTrue(records.isEmpty())
        assertTrue(currents.isEmpty())
    }

    @Test
    fun `invalid times ids enums and snapshot scope are rejected`() {
        val invalid = listOf(
            document(reward("exported-time", "2026-08-16T10:00:00Z", "baijinbi", 1)).copy(
                exportedAt = "2026-08-16T09:00:00",
            ),
            document(reward("time", "2026-08-16T10:00:00", "baijinbi", 1)),
            document(reward("id", "2026-08-16T10:00:00Z", "", 1)),
            document(reward("count", "2026-08-16T10:00:00Z", "baijinbi", 0)),
            document(reward("channel", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(acquisitionChannel = "")),
            document(reward("dispatch-missing", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(acquisitionChannel = "派遣")),
            document(reward("non-dispatch", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(staminaCost = 80)),
            document(
                reward("negative-stamina", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(
                    acquisitionChannel = "派遣",
                    staminaCost = -1,
                ),
            ),
            document(snapshot("snapshot-stamina", "2026-08-16T10:00:00Z", "full").copy(staminaCost = 80)),
            document(
                reward("duplicate", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(
                    entries = listOf(entry("baijinbi", 1), entry("baijinbi", 2)),
                ),
            ),
            document(reward("enum", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(entityType = "equipment")),
            document(reward("scope", "2026-08-16T10:00:00Z", "baijinbi", 1).copy(snapshotScope = "full")),
            document(snapshot("listed", "2026-08-16T10:00:00Z", "listed")),
            document(reward("producer", "2026-08-16T10:00:00Z", "baijinbi", 1)).copy(producer = ProducerDto("")),
        )

        invalid.forEach { request ->
            assertEquals(
                "schema_validation_failed",
                assertThrows(InventoryApiException::class.java) { service.import("u1", request) }.code,
            )
        }
        assertTrue(records.isEmpty())
    }

    @Test
    fun `export is a complete protocol document and can be reimported unchanged`() {
        service.import("u1", document(snapshot("full", "2026-08-16T10:00:00Z", "full", entry("baijinbi", 8))))
        service.import(
            "u1",
            document(
                reward("reward", "2026-08-16T11:00:00Z", "baijinbi", 2).copy(
                    acquisitionChannel = "派遣",
                    staminaCost = 80,
                ),
            ),
        )

        val exported = service.export("u1", accountId = "main", scope = null, includeRewards = true, from = null, to = null)
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        val json = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(exported)
        val schemaDocument = mapper.readTree(checkNotNull(javaClass.getResourceAsStream("/inventory-exchange-v2.schema.json")))
        val schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaDocument)
        val request = mapper.treeToValue(json, InventoryImportRequest::class.java)
        val sameUser = service.import("u1", request)
        val imported = service.import("u2", request)

        assertEquals("myshare-inventory-exchange", exported.format)
        assertEquals("myshare", exported.producer.platform)
        assertEquals(listOf("main"), exported.accounts.map { it.id })
        assertEquals("大号", exported.accounts.single().name)
        assertTrue(exported.records.all { it.accountId == "main" })
        assertEquals(setOf("item", "agent"), exported.records.map { it.entityType }.toSet())
        assertEquals(80, exported.records.single { it.recordId == "reward" }.staminaCost)
        assertTrue(schema.validate(json).isEmpty())
        assertEquals(1, sameUser.duplicates)
        assertEquals(10, count("u1", "baijinbi"))
        assertEquals(3, imported.accepted)
        assertEquals(10, count("u2", "baijinbi"))
    }

    @Test
    fun `checked-in import example conforms to protocol v2 schema`() {
        val mapper = jacksonObjectMapper()
        val example = mapper.readTree(java.io.File("docs/inventory-import-example.json"))
        val schemaDocument = mapper.readTree(checkNotNull(javaClass.getResourceAsStream("/inventory-exchange-v2.schema.json")))
        val schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaDocument)

        assertTrue(schema.validate(example).isEmpty())
        val bagItemSample = mapper.readTree(checkNotNull(javaClass.getResourceAsStream("/bag-items-stock-snapshot-v2.json")))
        assertTrue(schema.validate(bagItemSample).isEmpty())
        val automaticReport = example.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().apply { remove("accounts") }
        val idOnlyDirectory = example.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().apply {
            (this["accounts"][0] as com.fasterxml.jackson.databind.node.ObjectNode).remove("name")
        }
        assertTrue(schema.validate(automaticReport).isEmpty())
        assertTrue(schema.validate(idOnlyDirectory).isEmpty())

        val dispatchWithoutStamina = example.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().apply {
            (this["records"][0] as com.fasterxml.jackson.databind.node.ObjectNode).remove("stamina_cost")
        }
        val nonDispatchWithStamina = example.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().apply {
            (this["records"][3] as com.fasterxml.jackson.databind.node.ObjectNode).put("stamina_cost", 80)
        }
        assertTrue(schema.validate(dispatchWithoutStamina).isNotEmpty())
        assertTrue(schema.validate(nonDispatchWithStamina).isNotEmpty())
    }

    @Test
    fun `all-account export preserves ownership and reimports without mixing`() {
        service.import(
            "u1",
            document(
                snapshot("main-stock", "2026-08-16T10:00:00Z", "full", entry("baijinbi", 8)),
                snapshotForAccount("alt-stock", "2026-08-16T10:00:00Z", "full", "alt", entry("baijinbi", 21)),
            ),
        )

        val exported = service.export("u1", accountId = null, scope = "all", includeRewards = false, from = null, to = null)
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        val json = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(exported)
        val schemaDocument = mapper.readTree(checkNotNull(javaClass.getResourceAsStream("/inventory-exchange-v2.schema.json")))
        val schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaDocument)

        assertTrue(schema.validate(json).isEmpty())
        assertEquals(setOf("main", "alt"), exported.accounts.map { it.id }.toSet())
        assertEquals(mapOf("main" to "大号", "alt" to "小号"), exported.accounts.associate { it.id to it.name })
        assertEquals(setOf("main", "alt"), exported.records.map { it.accountId }.toSet())
        service.import("u1", mapper.treeToValue(json, InventoryImportRequest::class.java))
        assertEquals(8, count("u1", "baijinbi", "main"))
        assertEquals(21, count("u1", "baijinbi", "alt"))
    }

    @Test
    fun `record cursor pages have no duplicates or omissions`() {
        val all = listOf(
            storedRecord("000000000000000000000003", "r3", "2026-08-16T12:00:00Z"),
            storedRecord("000000000000000000000002", "r2", "2026-08-16T12:00:00Z"),
            storedRecord("000000000000000000000001", "r1", "2026-08-16T11:00:00Z"),
        )
        val queries = mutableListOf<Query>()
        every { mongoTemplate.find(capture(queries), InventoryRecord::class.java, "inventory_records") } returnsMany
            listOf(all, listOf(all[2]))

        val first = service.listRecords("u1", "main", null, null, null, null, 2)
        val second = service.listRecords("u1", "main", null, null, null, checkNotNull(first.nextCursor), 2)
        val ids = first.items.map { it.recordId } + second.items.map { it.recordId }

        assertEquals(listOf("r3", "r2", "r1"), ids)
        assertEquals(ids.size, ids.toSet().size)
        assertEquals(null, second.nextCursor)
        assertTrue(queries.all { it.queryObject.getString("accountId") == "main" })
    }

    private fun document(vararg records: InventoryRecordRequest) = InventoryImportRequest(
        format = "myshare-inventory-exchange",
        version = 2,
        exportedAt = "2026-08-16T09:00:00Z",
        producer = ProducerDto("test", "1"),
        records = records.toList(),
    )

    private fun reward(id: String, at: String, entityId: String, count: Long, accountId: String = "main") = InventoryRecordRequest(
        accountId = accountId,
        recordId = id,
        recordType = "reward_delta",
        entityType = "item",
        effectiveAt = at,
        entries = listOf(entry(entityId, count)),
    )

    private fun snapshot(id: String, at: String, scope: String, vararg entries: InventoryEntryRequest) =
        snapshotForAccount(id, at, scope, "main", *entries)

    private fun snapshotForAccount(
        id: String,
        at: String,
        scope: String,
        accountId: String,
        vararg entries: InventoryEntryRequest,
    ): InventoryRecordRequest = InventoryRecordRequest(
        accountId = accountId,
        recordId = id,
        recordType = "stock_snapshot",
        entityType = "item",
        effectiveAt = at,
        snapshotScope = scope,
        entries = entries.toList(),
    )

    private fun agentSnapshot(
        id: String,
        at: String,
        scope: String,
        accountId: String,
        vararg entries: InventoryEntryRequest,
    ): InventoryRecordRequest = InventoryRecordRequest(
        accountId = accountId,
        recordId = id,
        recordType = "stock_snapshot",
        entityType = "agent",
        effectiveAt = at,
        snapshotScope = scope,
        entries = entries.toList(),
    )

    private fun entry(id: String, count: Long) = InventoryEntryRequest(id, null, count)

    private fun count(userId: String, entityId: String, accountId: String = "main", entityType: String = "item"): Long =
        currents[Triple(userId, accountId, entityType)]?.entries?.get(entityId)?.count ?: 0

    private fun storedRecord(id: String, recordId: String, effectiveAt: String) = InventoryRecord(
        id = id,
        recordId = recordId,
        userId = "u1",
        accountId = "main",
        recordType = "reward_delta",
        entityType = "item",
        effectiveAt = Instant.parse(effectiveAt),
        producer = ProducerInfo("test"),
        entries = listOf(RecordEntry("baijinbi", count = 1)),
    )

    companion object {
        private const val BAG_SAMPLE_RECORD_ID = "myshare:73e8a2f249bb493c8a34d51e5c72d109"
        private val BAG_ITEM_IDS = listOf("fuchuan", "tianjifuchuan", "baijinbi", "mazi", "jizhi", "sherou", "zhuyu")
    }
}
