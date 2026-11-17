package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.controller.achievement.response.AchievementEntry
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.BondCatalogRepository
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.entity.AchievementCatalog
import com.lhs.share.hub.repository.entity.BondCatalog
import com.lhs.share.hub.repository.entity.BondEntry
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.repository.entity.CatalogCategory
import com.lhs.share.hub.repository.entity.CatalogContent
import com.lhs.share.hub.repository.entity.CatalogPublication
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Tag("integration")
class CatalogGameLinkMongoTest {
    private val database = TestMongo.database("game_link")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val bonds = BondCatalogRepository(mongo)
    private val achievements = AchievementCatalogRepository(mongo)
    private val operators = mockk<OperatorCatalogRepository>()
    private val service = CatalogGameLinkService(operators, bonds, achievements, jacksonObjectMapper().findAndRegisterModules())
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    private fun member(games: List<String>) = OperatorCatalogEntity(
        operatorId = "a", name = "a", rarity = 5, prof = emptyList(), subProf = emptyList(), games = games,
        discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
    )

    private fun seed() {
        every { operators.findAllByOrderByOperatorIdAsc() } answers {
            listOf(operators.findByOperatorId("a")!!, operators.findByOperatorId("b")!!.copy(operatorId = "b"))
        }
        every { operators.findByOperatorId("a") } returns member(listOf("代号鸢"))
        every { operators.findByOperatorId("b") } returns member(listOf("代号鸢", "如鸢"))
        val bond = BondEntry("bond_source", "代号鸢", listOf("a", "b"), "gather", "sunny", "positive")
        bonds.insert(BondCatalog("代号鸢", published = BondPublication("source", "代号鸢", listOf(bond)), identities = listOf(bond)))
        val entry = AchievementEntry("yh_dhy_source", "代号鸢", "cat_source", "合成成就", "", 0, operatorIds = listOf("a", "b"))
        val content = CatalogContent("代号鸢", "partial", categories = listOf(CatalogCategory("cat_source", "合成分类")), entries = listOf(entry))
        achievements.insert(
            AchievementCatalog("代号鸢", published = CatalogPublication("source", content, Instant.EPOCH, "test"), draft = content),
        )
    }

    @Test
    fun `all members required sync drafts once and retain manual changes`() {
        seed()
        transaction.executeWithoutResult { service.sync("a") }
        assertNull(bonds.find("如鸢"))
        every { operators.findByOperatorId("a") } returns member(listOf("代号鸢", "如鸢"))
        transaction.executeWithoutResult { service.sync("a") }
        val bond = bonds.find("如鸢")!!
        val achievement = achievements.find("如鸢")!!
        assertEquals(1, bond.draft.size)
        assertEquals(1, achievement.draft.entries.size)
        assertTrue(bond.published.entries.isEmpty())
        assertTrue(achievement.published.content.entries.isEmpty())
        val edited = achievement.copy(
            revision = achievement.revision + 1,
            draft = achievement.draft.copy(
                entries = achievement.draft.entries.map {
                    it.copy(name = "人工编辑")
                },
            ),
        )
        assertTrue(achievements.replace(edited, achievement.revision))
        transaction.executeWithoutResult { service.sync("a") }
        assertEquals("人工编辑", achievements.find("如鸢")!!.draft.entries.single().name)
        assertEquals(bond, bonds.find("如鸢"))
        every { operators.findByOperatorId("a") } returns member(listOf("代号鸢"))
        assertFalse(service.available(listOf("a", "b"), "如鸢"))
        assertTrue(service.available(emptyList(), "如鸢"))
        assertEquals(1, achievements.find("如鸢")!!.draft.entries.size)
    }

    @Test
    fun `failure rolls back both catalog and initiating write`() {
        seed()
        every { operators.findByOperatorId("a") } returns member(listOf("代号鸢", "如鸢"))
        val target = CatalogContent("如鸢", categories = listOf(CatalogCategory("cat_disabled", "合成分类", enabled = false)))
        achievements.insert(
            AchievementCatalog("如鸢", published = CatalogPublication("target", target, Instant.EPOCH, "test"), draft = target),
        )
        val error = assertThrows(InventoryApiException::class.java) {
            transaction.executeWithoutResult {
                mongo.save(member(listOf("如鸢")))
                service.sync("a")
            }
        }
        assertEquals("如鸢对应成就分类已停用", error.message)
        assertNull(bonds.find("如鸢"))
        assertEquals(0, mongo.findAll(OperatorCatalogEntity::class.java).size)
    }
}
