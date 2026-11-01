package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

class RecruitmentCatalogTest {
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val repository = mockk<RecruitmentCatalogRepository>()
    private val operators = mockk<OperatorCatalogRepository>()
    private val saved = mutableMapOf<String, RecruitmentCatalogPool>()
    private val catalog = RecruitmentCatalog(mapper, repository, operators)

    init {
        every { repository.all() } answers { saved.values.toList() }
        every { repository.find(any()) } answers { saved[firstArg()] }
        every { repository.save(any(), any()) } answers {
            val next = firstArg<RecruitmentCatalogPool>()
            if ((saved[next.poolId]?.revision ?: 0) != next.revision - 1) {
                false
            } else {
                saved[next.poolId] = next
                true
            }
        }
        every { operators.findByOperatorId(any()) } returns null
        every { operators.findAllByOrderByOperatorIdAsc() } returns emptyList()
        every { operators.count() } returns 0L
    }

    @Test fun `personal wishlist projects independently from fixed catalog and other accounts without writes`() {
        saved["wish"] = RecruitmentCatalogPool("wish", "如鸢", "心愿池", allowCustomUp = true)
        val personal = RecruitmentPool(
            "personal",
            RecruitmentPoolSnapshot("旧名", "如鸢", catalogPoolId = "wish"),
            wishAgentIds = listOf("char_001_yangxiu", "char_002_jiaxu"),
        )
        val projected = catalog.projectPools(listOf(personal)).single()
        assertEquals(personal.wishAgentIds, projected.snapshot.upAgentIds)
        assertEquals(personal.wishAgentIds, projected.snapshot.upAgents.map { it.id })
        assertEquals("verified", projected.snapshot.upStatus)
        assertTrue(catalog.projectPools(listOf(personal.copy(wishAgentIds = emptyList()))).single().snapshot.upAgents.isEmpty())
        assertTrue(catalog.catalog("如鸢").path("pools").first().path("up_agents").isEmpty)
        saved["wish"] = saved.getValue("wish").copy(
            upAgents = listOf(RecruitmentUpAgent("wish:up:legacy", "杨修", "char_001_yangxiu")),
        )
        assertEquals(
            listOf("wish:up:legacy", "char_002_jiaxu"),
            catalog.projectPools(listOf(personal)).single().snapshot.upAgents.map {
                it.id
            },
        )
        val updated = catalog.update("admin", "wish", RecruitmentCatalogWriteRequest("wish", "如鸢", "新名", 0))
        assertTrue(updated.allowCustomUp)
        verify(exactly = 1) { repository.save(any(), any()) }
    }

    @Test fun `catalog import accepts explicit wishlist mode but rejects non-boolean mode`() {
        catalog.importCatalog(
            "admin",
            mapper.readTree("""{"pools":[{"pool_id":"wish-import","game":"如鸢","name":"心愿池","allow_custom_up":true}]}"""),
        )
        assertTrue(saved.getValue("wish-import").allowCustomUp)
        listOf("null", "\"true\"", "1").forEach { value ->
            assertThrows(RecruitmentApiException::class.java) {
                catalog.importCatalog(
                    "admin",
                    mapper.readTree("""{"pools":[{"pool_id":"bad","game":"如鸢","name":"错误池","allow_custom_up":$value}]}"""),
                )
            }
        }
    }

    @Test
    fun `four star and movie recruits retain catalog rarity and game eligibility`() {
        assertEquals(5, catalog.operator("如鸢", "char_084_chendengsp").rarity)
        assertEquals(4, catalog.operator("代号鸢", "char_043_xiaoqiao").rarity)
        assertThrows(RecruitmentApiException::class.java) { catalog.operator("other", "char_043_xiaoqiao") }
        assertThrows(RecruitmentApiException::class.java) { catalog.operator("如鸢", "char_006_eshi") }
    }

    @Test
    fun `spreadsheet placeholders bind unique catalog names including four star and SP without replacing slot identities`() {
        val document = mapper.readTree(
            """{"pools":[{"pool_id":"sheet","game":"如鸢","name":"表格池","up_status":"partial","up_agents":[
            {"id":"sheet:up:1","name":"杨修","operator_id":null},
            {"id":"sheet:up:2","name":"小乔","operator_id":null},
            {"id":"sheet:up:3","name":"陈登·黍王","operator_id":null},
            {"id":"sheet:up:4","name":"待收录密探","operator_id":null}]}]}""",
        )
        catalog.importCatalog("admin", document)
        val slots = saved.getValue("sheet").upAgents
        assertEquals(listOf("sheet:up:1", "sheet:up:2", "sheet:up:3", "sheet:up:4"), slots.map { it.id })
        assertEquals(listOf("char_001_yangxiu", "char_043_xiaoqiao", "char_084_chendengsp", null), slots.map { it.operatorId })
        assertEquals(1, catalog.importCatalog("admin", document).skippedCount)
        assertEquals(slots, saved.getValue("sheet").upAgents)
    }

    @Test fun `catalog reads persisted pools only scopes by game and keeps pool owned identities`() {
        saved["yuan-pool"] = RecruitmentCatalogPool(
            "yuan-pool",
            "代号鸢",
            "代号鸢池",
            revision = 3,
            upAgents = listOf(RecruitmentUpAgent("yuan-pool:up:1", "杨修", "char_001_yangxiu")),
            upStatus = "verified",
        )
        saved["ru-pool"] = RecruitmentCatalogPool("ru-pool", "如鸢", "如鸢池", revision = 1)
        val response = catalog.catalog("代号鸢")
        val pools = response.path("pools")
        assertEquals(1, pools.size())
        assertEquals("yuan-pool", pools.first().path("pool_id").asText())
        assertTrue(response.path("catalog_revision").asText().startsWith("db:"))
        assertEquals(listOf("char_001_yangxiu"), pools.first().path("up_agent_ids").map { it.asText() })
        assertEquals("yuan-pool:up:1", pools.first().path("up_agents").first().path("id").asText())
        assertEquals("yuan-pool", catalog.snapshot("代号鸢", "yuan-pool").catalogPoolId)
        assertEquals(1, catalog.catalog("如鸢").path("pools").size())
        verify(exactly = 0) { repository.save(any(), any()) }
        verify(exactly = 0) { operators.save(any()) }
        assertThrows(RecruitmentApiException::class.java) { catalog.catalog("other") }
        assertThrows(RecruitmentApiException::class.java) { catalog.snapshot("如鸢", "yuan-pool") }
    }

    @Test fun `legacy json import creates only missing pools and converts stable legacy slots`() {
        saved["existing"] = RecruitmentCatalogPool("existing", "如鸢", "已存在", revision = 4)
        val document = mapper.readTree(
            """
            {
              "catalog_revision":"legacy",
              "pools":[
                {"pool_id":"existing","game":"如鸢","name":"旧文件中的同ID","up_agent_ids":[],"up_agent_names":[]},
                {"pool_id":"legacy-pool","game":"如鸢","name":"迁移池","pool_type":"限定","up_status":"verified",
                 "up_agent_ids":["char_001_yangxiu"],"up_agent_names":["杨修"],"source_up_agent_names":["杨修"],
                 "source_url":"https://example.invalid/source","source_revision":115070,
                 "source_pages":[{"url":"https://example.invalid/source","revision":115070}],"source_note":"legacy source"}
              ]
            }
            """.trimIndent(),
        )
        val result = catalog.importCatalog("admin", document)
        assertEquals(1, result.createdCount)
        assertEquals(listOf("legacy-pool"), result.createdPoolIds)
        assertEquals(listOf("existing"), result.skippedPoolIds)
        assertEquals("已存在", saved.getValue("existing").name)
        val imported = saved.getValue("legacy-pool")
        assertEquals(1L, imported.revision)
        assertEquals("legacy-pool:up:1", imported.upAgents.single().id)
        assertEquals("char_001_yangxiu", imported.upAgents.single().operatorId)
        assertEquals("verified", imported.upStatus)
        assertEquals("admin", imported.updatedBy)
        assertEquals("https://example.invalid/source", imported.sourceUrl)
        assertEquals(115070L, imported.sourceRevision)
        assertEquals("https://example.invalid/source", imported.sourcePages.single().url)
        assertEquals("legacy source", imported.sourceNote)
        assertEquals(
            "https://example.invalid/source",
            catalog.catalog("如鸢").path("pools").first {
                it.path("pool_id").asText() ==
                    "legacy-pool"
            }.path("source_url").asText(),
        )
        assertTrue(catalog.catalog("如鸢").path("catalog_revision").asText().startsWith("db:"))
    }

    @Test fun `account view includes all same game pools preserves saved identities and keeps export projection scoped`() {
        saved["public-a"] = RecruitmentCatalogPool("public-a", "如鸢", "池A")
        saved["public-b"] = RecruitmentCatalogPool("public-b", "如鸢", "停用池", enabled = false)
        saved["other-game"] = RecruitmentCatalogPool("other-game", "代号鸢", "另一游戏")
        val existing = listOf(RecruitmentPool("old-id", RecruitmentPoolSnapshot("旧名字", "如鸢", "public-a"), 8))
        val view = catalog.projectPools(existing, "如鸢")
        assertEquals(setOf("public-a", "public-b"), view.map { it.snapshot.catalogPoolId }.toSet())
        assertEquals("old-id", view.single { it.snapshot.catalogPoolId == "public-a" }.poolId)
        assertEquals(8L, view.single { it.poolId == "old-id" }.progress)
        assertNull(view.single { it.snapshot.catalogPoolId == "public-b" }.progress)
        assertEquals(view, catalog.projectPools(existing, "如鸢"))
        assertEquals(listOf("old-id"), catalog.projectPools(existing).map { it.poolId })
        assertEquals(listOf("old-id"), existing.map { it.poolId })
        verify(exactly = 0) { repository.save(any(), any()) }
    }

    @Test fun `automatic identities cannot collide with a retained legacy pool`() {
        saved["public-a"] = RecruitmentCatalogPool("public-a", "如鸢", "公共池")
        val old = RecruitmentPool("catalog:public-a", RecruitmentPoolSnapshot("旧临时池", "如鸢"), 4)
        val view = catalog.projectPools(listOf(old), "如鸢")
        assertEquals(2, view.map { it.poolId }.toSet().size)
        assertEquals(old, view.first())
        assertEquals(view, catalog.projectPools(listOf(old), "如鸢"))
    }

    @Test fun `administrator can bind placeholders retire missing slots and edit with CAS without changing slot identity`() {
        val request = RecruitmentCatalogWriteRequest(
            "test_pool",
            "如鸢",
            "新池",
            0,
            upAgents = listOf(RecruitmentUpAgent("test_pool:up:1", "占位1"), RecruitmentUpAgent("test_pool:up:2", "占位2")),
        )
        val created = catalog.create("admin", request)
        val beforeVersion = catalog.catalog("如鸢").path("catalog_revision").asText()
        assertEquals(1L, created.revision)
        assertNull(created.upAgents.first().operatorId)
        val bound = catalog.update(
            "admin",
            "test_pool",
            request.copy(
                expectedRevision = 1,
                upAgents = listOf(request.upAgents.first().copy(operatorId = "char_001_yangxiu")),
            ),
        )
        assertEquals("test_pool:up:1", bound.upAgents.first().id)
        assertEquals("杨修", bound.upAgents.first().name)
        assertEquals("char_001_yangxiu", bound.upAgents.first().operatorId)
        assertFalse(bound.upAgents.last().active)
        assertEquals(listOf("char_001_yangxiu"), catalog.snapshot("如鸢", "test_pool").upAgentIds)
        assertTrue(beforeVersion != catalog.catalog("如鸢").path("catalog_revision").asText())
        assertEquals(
            409,
            assertThrows(RecruitmentApiException::class.java) {
                catalog.update("admin", "test_pool", request.copy(expectedRevision = 1))
            }.status.value(),
        )
        assertThrows(RecruitmentApiException::class.java) { catalog.slot("如鸢", "test_pool", "test_pool:up:2") }
        assertNull(catalog.slot("如鸢", "test_pool", "another_pool:up:1"))
        val disabled = catalog.update("admin", "test_pool", request.copy(expectedRevision = 2, enabled = false, upAgents = bound.upAgents))
        assertFalse(disabled.enabled)
        assertThrows(RecruitmentApiException::class.java) { catalog.snapshot("如鸢", "test_pool") }
        assertEquals(2, catalog.snapshot("如鸢", "test_pool", requireEnabled = false).upAgents.size)
        assertFalse(catalog.catalog("如鸢").path("pools").first().path("enabled").asBoolean())
    }

    @Test fun `catalog rejects wrong pool slots duplicate active bindings game mismatch and unavailable dictionary agents`() {
        val valid = RecruitmentCatalogWriteRequest(
            "pool",
            "如鸢",
            "池",
            0,
            upAgents = listOf(RecruitmentUpAgent("pool:up:1", "占位")),
        )
        val wrongGame = OperatorCatalogEntity(
            operatorId = "other", name = "其他游戏", rarity = 5, games = listOf("代号鸢"),
            prof = emptyList(), subProf = emptyList(), discs = emptyList(), starStones = emptyList(), catalogVersion = "v",
        )
        every { operators.findByOperatorId("other") } returns wrongGame
        listOf(
            valid.copy(upAgents = listOf(RecruitmentUpAgent("another:up:1", "串池"))),
            valid.copy(upAgents = listOf(valid.upAgents.first().copy(operatorId = "other"))),
            valid.copy(
                upAgents = listOf(
                    valid.upAgents.first().copy(operatorId = "char_001_yangxiu"),
                    RecruitmentUpAgent("pool:up:2", "重复", "char_001_yangxiu"),
                ),
            ),
            valid.copy(upAgents = listOf(valid.upAgents.first().copy(operatorId = "missing"))),
            valid.copy(startDate = LocalDate.parse("2026-10-02"), endDate = LocalDate.parse("2026-10-01")),
        ).forEach { input -> assertThrows(RecruitmentApiException::class.java) { catalog.create("admin", input) } }
        verify(exactly = 0) { repository.save(any(), any()) }
        catalog.create("admin", valid)
        assertThrows(RecruitmentApiException::class.java) {
            catalog.update("admin", "pool", valid.copy(expectedRevision = 1, game = "代号鸢"))
        }
        every { operators.count() } returns 1L
        assertThrows(RecruitmentApiException::class.java) { catalog.operator("如鸢", "char_001_yangxiu") }
        verify(exactly = 0) { operators.save(any()) }
    }

    @Test fun `hidden state filters public reads preserves personal pools and survives old client updates`() {
        val request = RecruitmentCatalogWriteRequest("hidden-pool", "如鸢", "旧池", 0)
        val publicPool = catalog.create("admin", request)
        assertFalse(publicPool.hidden)
        val before = catalog.catalog("如鸢").path("catalog_revision").asText()
        val hidden = catalog.update("admin", request.poolId, request.copy(expectedRevision = 1, hidden = true))
        assertTrue(hidden.hidden)
        assertEquals(0, catalog.catalog("如鸢").path("pools").size())
        assertTrue(before != catalog.catalog("如鸢").path("catalog_revision").asText())
        assertTrue(catalog.listForAdmin().pools.single().hidden)
        assertTrue(catalog.projectPools(emptyList(), "如鸢").isEmpty())
        val personal = RecruitmentPool("stable-personal", catalog.snapshot("如鸢", request.poolId, false), 7)
        val projected = catalog.projectPools(listOf(personal), "如鸢").single()
        assertEquals("stable-personal", projected.poolId)
        assertEquals(7L, projected.progress)
        assertEquals(mapOf("stable-personal" to "hidden"), catalog.poolStates(listOf(personal)))
        assertThrows(RecruitmentApiException::class.java) { catalog.snapshot("如鸢", request.poolId) }
        val edited = catalog.update("admin", request.poolId, request.copy(expectedRevision = 2, name = "修正名称"))
        assertTrue(edited.hidden)
        val disabled = catalog.update("admin", request.poolId, request.copy(expectedRevision = 3, hidden = false, enabled = false))
        assertFalse(disabled.hidden)
        assertEquals(1, catalog.catalog("如鸢").path("pools").size())
        assertFalse(catalog.catalog("如鸢").path("pools").first().path("enabled").asBoolean())
        assertThrows(RecruitmentApiException::class.java) {
            catalog.update("admin", request.poolId, request.copy(expectedRevision = 3, hidden = false))
        }
        assertFalse(saved.getValue(request.poolId).enabled)
        assertTrue(catalog.update("admin", request.poolId, request.copy(expectedRevision = 4, hidden = false)).enabled)
    }

    @Test fun `unavailable unchanged UP bindings do not prevent metadata or status corrections and identities cannot be reused`() {
        val old = RecruitmentUpAgent("pool:up:old", "旧图鉴身份", "unavailable")
        saved["pool"] = RecruitmentCatalogPool("pool", "如鸢", "旧名称", revision = 2, upAgents = listOf(old))
        every { operators.count() } returns 1L
        val input = RecruitmentCatalogWriteRequest(
            "pool", "如鸢", "修正名称", 2,
            startDate = LocalDate.parse("2026-10-01"), endDate = LocalDate.parse("2026-10-02"),
            poolType = "限时", upAgents = listOf(old), hidden = true,
        )
        val updated = catalog.update("admin", "pool", input)
        assertEquals(old, updated.upAgents.single())
        assertTrue(updated.hidden)
        assertEquals(input.startDate, updated.startDate)
        assertThrows(RecruitmentApiException::class.java) {
            catalog.update("admin", "pool", input.copy(expectedRevision = 3, upAgents = listOf(old.copy(operatorId = null))))
        }
        val newSlot = RecruitmentUpAgent("pool:up:new", "新占位")
        val corrected = catalog.update("admin", "pool", input.copy(expectedRevision = 3, upAgents = listOf(newSlot)))
        assertTrue(corrected.hidden)
        assertEquals(old.copy(active = false), corrected.upAgents.first { it.id == old.id })
        assertEquals(newSlot, corrected.upAgents.first { it.id == newSlot.id })
    }

    @Test fun `import may hide new pools without overwriting existing hidden records`() {
        val json = mapper.readTree("""{"pools":[{"pool_id":"pool","game":"如鸢","name":"池","hidden":true}]}""")
        assertEquals(1, catalog.importCatalog("admin", json).createdCount)
        assertTrue(saved.getValue("pool").hidden)
        assertEquals(1, catalog.importCatalog("admin", json).skippedCount)
        listOf("\"false\"", "0", "null", "[]").forEach { token ->
            val invalid = mapper.readTree("""{"pools":[{"pool_id":"other","game":"如鸢","name":"池","hidden":$token}]}""")
            assertThrows(RecruitmentApiException::class.java) { catalog.importCatalog("admin", invalid) }
        }
    }

    @Test fun `editing persisted revision zero uses update instead of duplicate insertion`() {
        saved["legacy"] = RecruitmentCatalogPool("legacy", "如鸢", "旧池")
        val edited = catalog.update("admin", "legacy", RecruitmentCatalogWriteRequest("legacy", "如鸢", "修正", 0, hidden = true))
        assertEquals(1L, edited.revision)
        assertTrue(edited.hidden)
        verify { repository.save(match { it.poolId == "legacy" && it.revision == 1L }, true) }
    }
}
