package com.lhs.share.hub.service.achievement

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.achievement.request.AchievementImportRequest
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.repository.AchievementCatalogRepository
import com.lhs.share.hub.repository.AchievementRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.AchievementArchive
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.transaction.support.TransactionTemplate

/** Run explicitly after the offline converter, with ACHIEVEMENT_FIXTURE_DIR pointing to its output. */
@Tag("integration")
@Tag("achievement-real-data")
class AchievementCatalogScaleMongoTest {
    private val database = TestMongo.database("ach_real")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val mapper = achievementMapper()
    private val repository = AchievementCatalogRepository(mongo)
    private val catalogs = AchievementCatalogService(mapper, repository)
    private val admin = AchievementCatalogAdminService(catalogs, repository, mapper)

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `synthetic full catalogs survive IDs import publish full history backup and repeat restore within byte budgets`() {
        mongo.createCollection(AchievementArchive::class.java)
        val accounts = mockk<SubAccountRepository>()
        val owners = listOf("代号鸢", "如鸢").flatMap { game ->
            listOf("a", "b").map { suffix ->
                SubAccount(id = game + suffix, userId = "owner", accountId = game + suffix, name = suffix, game = game)
            }
        }
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers
            { owners.find { it.userId == firstArg<String>() && it.accountId == secondArg<String>() } }
        every { accounts.fenceRecruitmentWrite(any(), any(), any()) } returns true
        val personal =
            AchievementService(
                AchievementRepository(mongo),
                accounts,
                catalogs,
                mapper,
                AchievementImportPreviews(),
                TransactionTemplate(MongoTransactionManager(factory)),
            )
        for ((game, count) in mapOf("代号鸢" to 1600, "如鸢" to 1300)) {
            val content = com.lhs.share.hub.repository.entity.CatalogContent(
                game,
                "partial",
                "合成容量资料",
                (0..4).map { com.lhs.share.hub.repository.entity.CatalogCategory("import_$it", "测试分类$it") },
                (0 until count).map { i ->
                    fixtureCatalog(game).entries.first().copy(
                        achievementId = "yh_synthetic_$i",
                        categoryId = "import_${i % 5}",
                        name = "合成成就$i",
                        sort = i,
                        isHidden = i % 10 == 0,
                        target = if (i < 7) (i + 1).toLong() else null,
                        linkedMetric = if (i < 7) "yuan_bond_variants" else null,
                    )
                },
            )
            val input = mapper.createObjectNode().put("format", "yuanhub-achievement-catalog").put("schema_version", 1)
            input.set<JsonNode>("catalog", mapper.valueToTree(content))
            input["catalog"]["entries"].forEach { (it as ObjectNode).remove("achievement_id") }
            assertTrue(
                mapper.writeValueAsBytes(mapOf("expected_revision" to 0, "document" to input, "strategy" to "keep")).size < 2 * 1024 * 1024,
            )
            var view = admin.read(game)
            val preview = admin.importPreview(game, view.revision, "admin", input, "keep")
            assertTrue(
                preview.items.none {
                    it.outcome in setOf("invalid", "unmatched")
                },
                preview.items.filter { it.outcome == "invalid" }.toString(),
            )
            assertEquals(count + 5, preview.items.count { it.outcome == "add" })
            view = admin.importConfirm(game, view.revision, "admin", input, "keep", preview.previewToken)
            val ids = view.draft.entries.map { it.achievementId }
            assertEquals(count, ids.toSet().size)
            assertTrue(view.draft.categories.all { it.categoryId.startsWith("cat_") })
            assertTrue(view.draft.entries.all { it.achievementId.startsWith(if (game == "代号鸢") "yh_dhy_" else "yh_ry_") })
            val categoryIds = view.draft.categories.associate { it.name to it.categoryId }
            input["catalog"]["entries"].forEachIndexed { index, row ->
                val expected = row.deepCopy<ObjectNode>().put("achievement_id", ids[index])
                val categoryName = input["catalog"]["categories"].first { it["category_id"] == row["category_id"] }["name"].asText()
                expected.put("category_id", categoryIds.getValue(categoryName))
                assertEquals(expected, mapper.valueToTree<JsonNode>(view.draft.entries[index]))
            }
            val exported = mapper.valueToTree<JsonNode>(view.draft)
            val repeat = admin.importPreview(game, view.revision, "admin", exported, "update")
            assertTrue(repeat.items.all { it.outcome == "same" })
            view = admin.importConfirm(game, view.revision, "admin", exported, "update", repeat.previewToken)
            repeat(8) { view = admin.publish(game, view.revision, "admin") }
            assertEquals(5, view.history.size)
            assertEquals(ids, view.draft.entries.map { it.achievementId })
            view = admin.publish(game, view.revision, "admin", view.history.first().version)
            assertEquals(count, catalogs.catalog(game).entries.size)
            assertEquals(count / 10, catalogs.catalog(game).entries.count { it.isHidden == true })
            assertEquals(7, catalogs.catalog(game).entries.count { it.linkedMetric != null })
            assertTrue(admin.read(game).compatibilityIssues.isEmpty())
            val catalogBytes = mapper.writeValueAsBytes(repository.find(game)).size
            assertTrue(catalogBytes < AchievementCatalogRules.MAX_DOCUMENT_BYTES)
            val document = mapper.createObjectNode().put(
                "format",
                "yuanhub-achievement",
            ).put("schema_version", 1).put("game", game).put("catalog_version", view.published.version)
            val rows = document.putArray("records")
            ids.forEach {
                rows.addObject().put("achievement_id", it).put("status", "completed").put("favorite", true).put("note", "文".repeat(500))
            }
            fun restore(accountId: String, file: JsonNode): Long {
                val request = AchievementImportRequest(accountId, file, "use_file", false)
                val plan = personal.preview("owner", request)
                assertEquals(0, plan.stats.getValue("invalid"))
                return personal.confirm(
                    "owner",
                    request.copy(
                        expectedRevision = plan.expectedRevision,
                        catalogVersion = plan.catalogVersion,
                        previewToken = plan.previewToken,
                    ),
                ).revision
            }
            restore(game + "a", document)
            val backup = personal.export("owner", game + "a")
            val backupNode = mapper.valueToTree<JsonNode>(backup)
            val backupBytes = mapper.writeValueAsBytes(backup).size
            assertTrue(backupBytes > 1024 * 1024 && backupBytes < AchievementRequestDecoder.MAX_BYTES)
            assertEquals(count, backup.records.size)
            assertTrue(personal.archive("owner", game + "b").records.isEmpty())
            assertThrows(InventoryApiException::class.java) { personal.archive("other", game + "a") }
            val revision = restore(game + "b", backupNode)
            assertEquals(revision, restore(game + "b", backupNode))
            val restored = personal.export("owner", game + "b").records
            assertEquals(
                backup.records.map {
                    listOf(it.achievementId, it.status, it.favorite, it.note, it.progress, it.completedOn)
                },
                restored.map { listOf(it.achievementId, it.status, it.favorite, it.note, it.progress, it.completedOn) },
            )
            val bson = repository.raw(game)!!
            assertTrue(
                bson.get("draft", Document::class.java).getList("entries", Document::class.java).all {
                    it.keys.all { key ->
                        key in
                            setOf(
                                "achievementId", "game", "categoryId", "name", "condition", "sort", "isHidden",
                                "rewards", "target", "linkedMetric", "_class",
                            )
                    }
                },
            )
            println(
                "REAL_CAPACITY $game entries=$count catalogWithFiveHistoryBytes=$catalogBytes backupWith500ChineseNotesBytes=$backupBytes",
            )
        }
    }
}
