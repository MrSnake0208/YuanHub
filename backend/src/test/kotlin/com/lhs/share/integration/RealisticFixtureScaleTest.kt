package com.lhs.share.integration

import com.lhs.share.fixtures.FixtureScale
import com.lhs.share.fixtures.RealisticFixtureDataset
import com.lhs.share.hub.repository.entity.InventoryRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.testinfra.TestMongo
import com.mongodb.MongoWriteException
import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver

class RealisticFixtureScaleTest {
    @Test
    @Tag("realistic")
    fun `daily all suite rebuilds a medium realistic multi-account dataset`() {
        verifyScale(RealisticFixtureDataset.realistic)
    }

    @Test
    @Tag("stress")
    fun `stress suite rebuilds two thousand users and verifies isolation at scale`() {
        verifyScale(RealisticFixtureDataset.stress)
    }

    private fun verifyScale(scale: FixtureScale) {
        val database = TestMongo.database(if (scale.users >= 2_000) "stress" else "realistic")
        val client = TestMongo.client()
        val mongo = MongoTemplate(client, database)
        try {
            ensureProductionIndexes(mongo)
            RealisticFixtureDataset.forEachBatch(scale) { batch ->
                mongo.getCollection("sub_accounts").insertMany(batch.accounts)
                mongo.getCollection("inventory_records").insertMany(batch.inventoryRecords)
                mongo.getCollection("operator_current").insertMany(batch.operatorCurrents)
                mongo.getCollection("star_state_current").insertMany(batch.starStates)
            }

            assertEquals(scale.accountCount.toLong(), mongo.getCollection("sub_accounts").countDocuments())
            assertEquals(scale.inventoryRecordCount, mongo.getCollection("inventory_records").countDocuments())
            assertEquals(scale.accountCount.toLong(), mongo.getCollection("operator_current").countDocuments())
            assertEquals(scale.accountCount.toLong(), mongo.getCollection("star_state_current").countDocuments())

            verifyAccountSlice(mongo, scale, 1, 1)
            verifyAccountSlice(mongo, scale, scale.users, scale.accountsPerUser)
            verifyScopedIdempotencyIndex(mongo, scale)
        } finally {
            TestMongo.dropDatabase(client, database)
            client.close()
        }
    }

    private fun verifyAccountSlice(mongo: MongoTemplate, scale: FixtureScale, userNumber: Int, accountNumber: Int) {
        val userId = RealisticFixtureDataset.userId(userNumber)
        val accountId = RealisticFixtureDataset.accountId(userNumber, accountNumber)
        val owner = Document("userId", userId).append("accountId", accountId)

        assertEquals(
            scale.inventoryRecordsPerAccount.toLong(),
            mongo.getCollection("inventory_records").countDocuments(owner),
        )
        val page = mongo.getCollection("inventory_records")
            .find(owner)
            .sort(Document("effectiveAt", 1).append("recordId", 1))
            .skip(10)
            .limit(20)
            .into(mutableListOf())
        assertEquals(20, page.size)
        page.forEach {
            assertEquals(userId, it.getString("userId"))
            assertEquals(accountId, it.getString("accountId"))
        }

        val operator = mongo.getCollection("operator_current").find(owner).first()
            ?: error("operator fixture missing for $accountId")
        assertEquals(scale.operatorsPerAccount, operator.get("entries", Document::class.java).size)

        val star = mongo.getCollection("star_state_current").find(owner).first()
            ?: error("star fixture missing for $accountId")
        assertEquals(scale.starEntriesPerAccount, star.getList("inventory", Document::class.java).size)
    }

    private fun verifyScopedIdempotencyIndex(mongo: MongoTemplate, scale: FixtureScale) {
        val recordId = "fixture:0001"
        assertEquals(
            scale.accountCount.toLong(),
            mongo.getCollection("inventory_records").countDocuments(Document("recordId", recordId)),
        )

        val userId = RealisticFixtureDataset.userId(1)
        val firstAccount = RealisticFixtureDataset.accountId(1, 1)
        val duplicate = mongo.getCollection("inventory_records")
            .find(Document("userId", userId).append("accountId", firstAccount).append("recordId", recordId))
            .first()!!
            .let(::Document)
        duplicate.remove("_id")
        assertThrows(MongoWriteException::class.java) {
            mongo.getCollection("inventory_records").insertOne(duplicate)
        }

        if (scale.accountsPerUser > 1) {
            val secondAccount = RealisticFixtureDataset.accountId(1, 2)
            assertEquals(
                1L,
                mongo.getCollection("inventory_records").countDocuments(
                    Document("userId", userId).append("accountId", secondAccount).append("recordId", recordId),
                ),
            )
        }
    }

    private fun ensureProductionIndexes(mongo: MongoTemplate) {
        val resolver = MongoPersistentEntityIndexResolver(mongo.converter.mappingContext)
        listOf(
            SubAccount::class.java,
            InventoryRecord::class.java,
            OperatorCurrent::class.java,
            StarStateCurrent::class.java,
        ).forEach { type ->
            resolver.resolveIndexFor(type).forEach { index ->
                mongo.indexOps(type).ensureIndex(index)
            }
        }
    }
}
