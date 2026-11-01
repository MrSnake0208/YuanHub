package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorCombatStats
import com.lhs.share.hub.repository.entity.OperatorCorrectionRecord
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorOddityValue
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory

@Tag("integration")
class OperatorOddityPersistenceTest {
    private val database = TestMongo.database("oddity")
    private val client = TestMongo.client()
    private val template = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `legacy BSON int and long current and correction values read without changing ownership`() {
        for ((index, number) in listOf<Number>(1, 3L).withIndex()) {
            val stats = Document("oddities", Document("special", Document("current", number)))
            val entry = Document("level", 10).append("elite", 1).append("starLevel", 3).append("combatStats", stats)
            template.getCollection("operator_current").insertOne(
                Document("_id", "old-$index").append("userId", "owner-$index").append("accountId", "account-$index")
                    .append("game", "test").append("entries", Document("op", entry)),
            )
            template.getCollection("operator_correction_records").insertOne(
                Document("_id", "audit-$index").append("userId", "owner-$index").append("accountId", "account-$index")
                    .append("game", "test").append("operatorId", "op").append("reason", "manual_correction")
                    .append("fields", listOf("combat_stats")).append("combatStats", stats),
            )
            val current = checkNotNull(template.findById("old-$index", OperatorCurrent::class.java))
            val audit = checkNotNull(template.findById("audit-$index", OperatorCorrectionRecord::class.java))
            assertEquals(number.toDouble(), current.entries.getValue("op").combatStats?.oddities?.get("special")?.current)
            assertEquals(number.toDouble(), audit.combatStats?.oddities?.get("special")?.current)
            assertEquals("owner-$index", current.userId)
            assertEquals(current.userId, audit.userId)
            assertEquals("account-$index", current.accountId)
            assertEquals(current.accountId, audit.accountId)
        }
    }

    @Test
    fun `new decimal current and correction round trip using the real Mongo converter`() {
        for (value in listOf(0.5, 3.2)) {
            val stats =
                OperatorCombatStats(oddities = mapOf("attack" to OperatorOddityValue(10.0), "special" to OperatorOddityValue(value)))
            val current = template.save(
                OperatorCurrent(
                    userId = "owner",
                    accountId = "account-$value",
                    game = "test",
                    entries = mapOf("op" to OperatorEntry(elite = 1, starLevel = 3, level = 10, combatStats = stats)),
                ),
            )
            val audit = template.save(
                OperatorCorrectionRecord(
                    userId = "owner",
                    accountId = current.accountId,
                    game = "test",
                    operatorId = "op",
                    reason = "manual_correction",
                    fields = setOf("combat_stats"),
                    combatStats = stats,
                ),
            )
            val read = checkNotNull(template.findById(checkNotNull(current.id), OperatorCurrent::class.java))
            val correction = checkNotNull(template.findById(checkNotNull(audit.id), OperatorCorrectionRecord::class.java))
            assertEquals(value, read.entries.getValue("op").combatStats?.oddities?.get("special")?.current)
            assertEquals(value, correction.combatStats?.oddities?.get("special")?.current)
            assertEquals(10.0, read.entries.getValue("op").combatStats?.oddities?.get("attack")?.current)
            assertEquals("owner", read.userId)
            assertEquals(read.accountId, correction.accountId)
        }
    }
}
