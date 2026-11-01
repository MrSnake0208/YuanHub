package com.lhs.share.hub.repository.entity

import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.data.mapping.model.MappingInstantiationException
import org.springframework.data.mongodb.core.convert.MappingMongoConverter
import org.springframework.data.mongodb.core.convert.MongoCustomConversions
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver
import org.springframework.data.mongodb.core.mapping.MongoMappingContext
import java.time.Instant

class OperatorDiscTargetPersistenceTest {
    private val conversions = MongoCustomConversions(emptyList<Any>())
    private val context = MongoMappingContext().apply {
        setSimpleTypeHolder(conversions.simpleTypeHolder)
        afterPropertiesSet()
    }
    private val converter = MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context).apply {
        setCustomConversions(conversions)
        afterPropertiesSet()
    }

    @Test
    fun `plain id imports and Mongo ids preserve loadout identity in nested account documents`() {
        for (idField in listOf("id", "_id")) {
            val loadout = Document(idField, "disc_1").append("name", "命盘1")
                .append("discs", listOf(Document("otName", "实际词条")))
                .append("status", "reroll")
                .append("targetDiscs", listOf(Document("otName", "目标词条")))
            val entry = Document("elite", 1).append("starLevel", 1).append("level", 1).append("discLoadouts", listOf(loadout))
            val raw = Document("userId", "owner").append("accountId", "account").append("game", "如鸢")
                .append("entries", Document("op", entry))
            val before = raw.toJson()
            val current = converter.read(OperatorCurrent::class.java, raw)
            assertEquals(
                listOf(OperatorDiscLoadout("disc_1", "命盘1", listOf(OperatorDisc("实际词条")), "reroll", listOf(OperatorDisc("目标词条")))),
                current.entries.getValue("op").discLoadouts,
            )
            assertEquals(before, raw.toJson())
            val stored = Document()
            converter.write(current.entries.getValue("op").discLoadouts.single(), stored)
            assertEquals("disc_1", stored["_id"])
            assertEquals(false, stored.containsKey("id"))
            assertEquals(current.entries.getValue("op").discLoadouts.single(), converter.read(OperatorDiscLoadout::class.java, stored))
        }
    }

    @Test
    fun `Mongo identifier takes precedence when both identifier fields exist`() {
        val raw = Document("_id", "original").append("id", "imported").append("name", "命盘1")
        assertEquals("original", converter.read(OperatorDiscLoadout::class.java, raw).id)
    }

    @Test
    fun `missing loadout identity still fails instead of silently replacing data`() {
        assertThrows(MappingInstantiationException::class.java) {
            converter.read(OperatorDiscLoadout::class.java, Document("name", "缺少编号"))
        }
    }

    @Test
    fun `old BSON loadouts use defaults and new account documents round trip both independent targets`() {
        val legacy = Document("_id", "one").append("name", "旧命盘").append("discs", listOf(Document("otName", "A")))
        val old = converter.read(OperatorDiscLoadout::class.java, legacy)
        assertEquals("one", old.id)
        assertEquals("unmarked", old.status)
        assertEquals(emptyList<OperatorDisc>(), old.targetDiscs)
        assertEquals(listOf(OperatorDisc("A")), old.discs)
        for ((owner, account) in listOf("ownerA" to "accountA", "ownerA" to "accountB", "ownerB" to "accountA")) {
            val current = OperatorCurrent(
                userId = owner,
                accountId = account,
                game = "如鸢",
                updatedAt = Instant.EPOCH,
                entries = mapOf(
                    "op" to OperatorEntry(
                        elite = 1,
                        starLevel = 1,
                        level = 1,
                        discLoadouts = listOf(
                            old.copy(status = "reroll", targetDiscs = listOf(OperatorDisc(account))),
                            OperatorDiscLoadout("two", "命盘二", status = "perfect", targetDiscs = listOf(OperatorDisc(owner))),
                        ),
                    ),
                ),
            )
            val document = Document()
            converter.write(current, document)
            assertEquals(current, converter.read(OperatorCurrent::class.java, document))
        }
    }
}
