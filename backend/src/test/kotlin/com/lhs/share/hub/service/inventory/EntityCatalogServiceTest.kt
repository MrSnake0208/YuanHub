package com.lhs.share.hub.service.inventory

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import com.lhs.share.hub.repository.EntityCatalogRepository
import com.lhs.share.hub.repository.entity.EntityCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.service.operator.OperatorCatalogService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource
import org.springframework.core.io.ClassPathResource

class EntityCatalogServiceTest {
    private val repository = mockk<EntityCatalogRepository>()
    private val rows = linkedMapOf<Pair<String, String>, EntityCatalogEntity>()
    private val operatorCatalog = mockk<OperatorCatalogService>()
    private var operators = emptyList<OperatorCatalogEntity>()
    private val service = EntityCatalogService(repository, jacksonObjectMapper(), operatorCatalog)

    @BeforeEach
    fun setUp() {
        rows.clear()
        operators = emptyList()
        every { operatorCatalog.catalog() } answers {
            OperatorCatalogResponse(catalogVersion = "2026-09-19T10:00:00Z", operators = operators.map(OperatorCatalogEntryResponse::of))
        }
        every { operatorCatalog.exists(any()) } answers { operators.any { it.operatorId == firstArg<String>() } }
        every { operatorCatalog.getOperator(any()) } answers { operators.find { it.operatorId == firstArg<String>() } }
        every { repository.findByEntityTypeAndEntityId(any(), any()) } answers {
            rows[firstArg<String>() to secondArg<String>()]
        }
        every { repository.save(any()) } answers {
            val entity = firstArg<EntityCatalogEntity>()
            rows[entity.entityType to entity.entityId] = entity
            entity
        }
        every { repository.findByEntityTypeOrderByEntityIdAsc(any()) } answers {
            val entityType = firstArg<String>()
            rows.values.filter { it.entityType == entityType }.sortedBy { it.entityId }
        }
    }

    @Test
    fun `annotation catalog checks never seed an empty catalog`() {
        every { operatorCatalog.getOperatorReadOnly(any()) } returns null
        assertEquals(false, service.existsReadOnly("item", "baijinbi"))
        assertEquals(false, service.existsReadOnly("agent", "char_001_yangxiu"))
        assertEquals(false, service.agentMatchesGameReadOnly("char_001_yangxiu", "代号鸢"))
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { operatorCatalog.exists(any()) }
        verify(exactly = 0) { operatorCatalog.getOperator(any()) }
    }

    @Test
    fun `packaged items preserve category metadata`() {
        service.seedFromResources(ClassPathResource("inventory/items.json"))

        val fuchuan = rows.getValue("item" to "fuchuan")
        val tianji = rows.getValue("item" to "tianjifuchuan")
        val baijinbi = rows.getValue("item" to "baijinbi")
        assertEquals("符传", fuchuan.name)
        assertEquals("招募道具", fuchuan.category)
        assertEquals("天机符传", tianji.name)
        assertEquals("招募道具", tianji.category)
        assertEquals("货币", baijinbi.category)

        val responseById = service.catalog().entities.associateBy { it.id }
        assertEquals("招募道具", responseById.getValue("fuchuan").category)
        assertEquals("货币", responseById.getValue("baijinbi").category)
    }

    @Test
    fun `catalog seeding fills missing category without overriding maintained metadata`() {
        rows["item" to "baijinbi"] = EntityCatalogEntity(
            entityType = "item",
            entityId = "baijinbi",
            name = "白金币",
            catalogVersion = "previous",
        )
        rows["item" to "fuchuan"] = EntityCatalogEntity(
            entityType = "item",
            entityId = "fuchuan",
            name = "运维名称",
            category = "运维分类",
            catalogVersion = "previous",
        )

        service.seedFromResources(
            resource(
                """
                [
                    {"id":"baijinbi","name":"白金币","category":"货币"},
                    {"id":"fuchuan","name":"符传","category":"招募道具"},
                    {"id":"mazi","name":"麻籽"}
                ]
                """.trimIndent(),
            ),
        )

        assertEquals("货币", rows.getValue("item" to "baijinbi").category)
        assertEquals("运维名称", rows.getValue("item" to "fuchuan").name)
        assertEquals("运维分类", rows.getValue("item" to "fuchuan").category)
        assertNull(rows.getValue("item" to "mazi").category)
    }

    @Test
    fun `agent catalog and validation follow public operators despite stale entity rows`() {
        listOf("char_130_zhoutai" to "周泰", "char_129_chenlin" to "陈琳").forEach { (id, name) ->
            rows["agent" to id] = EntityCatalogEntity(entityType = "agent", entityId = id, name = name, catalogVersion = "old")
        }
        operators = listOf(operator("char_129_zhoutai", "周泰"), operator("char_130_chenlin", "陈琳"))
        val beforeReadDate = java.time.LocalDate.now().toString()
        val catalog = service.catalog()
        assertEquals(listOf("char_129_zhoutai", "char_130_chenlin"), catalog.entities.filter { it.entityType == "agent" }.map { it.id })
        assertTrue(service.exists("agent", "char_129_zhoutai"))
        assertEquals(false, service.exists("agent", "char_130_zhoutai"))
        val possibleVersions = setOf(beforeReadDate, java.time.LocalDate.now().toString())
            .map { maxOf(it, "2026-09-19T10:00:00Z") }
        assertTrue(catalog.catalogVersion in possibleVersions)

        operators = listOf(operator("char_129_zhoutai", "改名"))
        assertEquals("改名", service.catalog().entities.single { it.entityType == "agent" }.name)
        operators = emptyList()
        assertTrue(service.catalog().entities.none { it.entityType == "agent" })
        assertEquals(false, service.exists("agent", "char_129_zhoutai"))
        // 公开读取不删除用于历史排查的旧目录实体。
        assertTrue(rows.containsKey("agent" to "char_130_zhoutai"))
    }

    @Test
    fun `agent game eligibility follows the current public catalog`() {
        operators = listOf(operator("char_125_zhaoyun", "赵云"))

        assertEquals(false, service.agentMatchesGame("char_125_zhaoyun", "如鸢"))
        assertEquals(true, service.agentMatchesGame("char_125_zhaoyun", "代号鸢"))
        assertEquals(false, service.agentMatchesGame("char_missing", "代号鸢"))
    }

    private fun operator(id: String, name: String) = OperatorCatalogEntity(
        operatorId = id, name = name, rarity = 5, prof = emptyList(), subProf = emptyList(),
        games = listOf("代号鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "2026-09-19T10:00:00Z",
    )

    @Test
    fun `failed catalog refresh preserves the previous valid catalog`() {
        val existing = EntityCatalogEntity(
            entityType = "agent",
            entityId = "char_102_jianyong",
            name = "简雍",
            catalogVersion = "previous",
        )
        rows[existing.entityType to existing.entityId] = existing
        val invalidItems = resource("""[{"id":"new_item","name":"新物品"},{"id":"bad-id","name":"伪造"}]""")

        assertThrows(IllegalStateException::class.java) {
            service.seedFromResources(invalidItems)
        }

        assertEquals(existing, rows["agent" to "char_102_jianyong"])
        assertTrue(("item" to "new_item") !in rows)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `duplicate item ids reject the complete catalog batch`() {
        val duplicateItems = resource(
            """
            [
              {"id":"baijinbi","name":"白金币"},
              {"id":"baijinbi","name":"重复"}
            ]
            """.trimIndent(),
        )

        val error = assertThrows(IllegalStateException::class.java) {
            service.seedFromResources(duplicateItems)
        }

        assertTrue(error.message.orEmpty().contains("Duplicate item catalog id"))
        assertTrue(rows.isEmpty())
        verify(exactly = 0) { repository.save(any()) }
    }

    private fun resource(json: String) = ByteArrayResource(json.toByteArray())
}
