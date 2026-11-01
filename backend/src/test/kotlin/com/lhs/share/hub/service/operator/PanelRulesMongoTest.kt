package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.PanelRulesRepository
import com.lhs.share.hub.repository.entity.OperatorPanelRule
import com.lhs.share.hub.repository.entity.PanelRuleSet
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.query.Query
import org.springframework.transaction.support.TransactionTemplate

@Tag("integration")
class PanelRulesMongoTest {
    private val database = TestMongo.database("panel")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(SimpleMongoClientDatabaseFactory(client, database))
    private val repository = PanelRulesRepository(mongo)
    private val service = PanelRuleService(repository, TransactionTemplate(MongoTransactionManager(mongo.mongoDatabaseFactory)))

    @AfterEach fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test fun `unmapped operators coexist while immutable versions activate and roll back by game`() {
        val base = panelRules("v1")
        val operator = base.operators.single()
        val unmapped = listOf("124", "125").map { operator.copy(id = "v1:operator:$it", sourceId = it, operatorId = null) }
        val first = base.copy(ruleSet = base.ruleSet.copy(operatorCount = 3), operators = base.operators + unmapped)
        service.importBundle(first)
        assertEquals(first, repository.load("v1"))
        assertNull(service.snapshot("如鸢"))
        service.activate("如鸢", "v1")
        assertEquals("v1", service.snapshot("如鸢")!!.ruleSet.id)
        assertNull(service.snapshot("代号鸢"))
        service.importBundle(panelRules("v2"))
        service.activate("如鸢", "v2")
        assertEquals("v2", service.snapshot("如鸢")!!.ruleSet.id)
        service.activate("如鸢", "v1")
        assertEquals("v1", service.snapshot("如鸢")!!.ruleSet.id)
        assertThrows(DuplicateKeyException::class.java) { service.importBundle(first) }
        assertEquals(first, repository.load("v1"))
        assertThrows(DuplicateKeyException::class.java) { mongo.insert(operator.copy(id = "duplicate", sourceId = "999")) }
    }

    @Test fun `failed import rolls back metadata and operators and cannot activate partial tables`() {
        val bundle = panelRules("conflict")
        repository.ensureIndexes()
        mongo.insert(bundle.stars.first())
        assertThrows(DuplicateKeyException::class.java) { service.importBundle(bundle) }
        assertNull(mongo.findById("conflict", PanelRuleSet::class.java))
        assertEquals(0, mongo.count(Query(), OperatorPanelRule::class.java))
        assertThrows(IllegalStateException::class.java) { service.activate("如鸢", "conflict") }
        assertNull(repository.activeVersion("如鸢"))
    }
}
