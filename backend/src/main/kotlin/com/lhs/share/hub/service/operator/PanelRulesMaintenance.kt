package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.PanelRulesRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import com.mongodb.ConnectionString
import com.mongodb.client.MongoClients
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.transaction.support.TransactionTemplate
import java.nio.file.Path

/** Explicit operator command, never an application startup hook or HTTP endpoint. */
object PanelRulesMaintenance {
    @JvmStatic
    fun main(args: Array<String>) {
        require(args.size == 2 && args[0] == "import" || args.size == 3 && args[0] == "activate") {
            "Usage: import <private-bundle.json> | activate <game> <version>; set PANEL_HUB_MONGO_URI explicitly"
        }
        val bundle = if (args[0] == "import") PanelRuleFile.read(Path.of(args[1])) else null
        val uri = requireNotNull(System.getenv("PANEL_HUB_MONGO_URI")) { "PANEL_HUB_MONGO_URI is required; no application-config fallback" }
        val database = requireNotNull(ConnectionString(uri).database) { "URI must explicitly name the Hub database" }
        MongoClients.create(uri).use { client ->
            val factory = SimpleMongoClientDatabaseFactory(client, database)
            val mongo = MongoTemplate(factory)
            val repository = PanelRulesRepository(mongo)
            val service = PanelRuleService(repository, TransactionTemplate(MongoTransactionManager(factory)))
            val selected = bundle ?: requireNotNull(repository.load(args[2])) { "Rule version does not exist" }
            validateCatalog(selected, mongo.findAll(OperatorCatalogEntity::class.java))
            if (bundle != null) {
                service.importBundle(bundle)
                println("Imported ${bundle.ruleSet.id}; not activated")
            } else {
                service.activate(args[1], args[2])
                println("Activated ${args[2]} for ${args[1]}")
            }
        }
    }

    internal fun validateCatalog(bundle: PanelRuleBundle, catalog: List<OperatorCatalogEntity>) {
        val byId = catalog.associateBy { it.operatorId }
        require(catalog.size == byId.size) { "Published catalog has duplicate IDs" }
        bundle.operators.filter { it.operatorId != null }.forEach { rule ->
            val entry =
                requireNotNull(byId[rule.operatorId]) { "Reviewed operator mapping is absent from the target catalog: ${rule.operatorId}" }
            require(entry.rarity == rule.rarity && OperatorHuajiRules.maximum(entry) == rule.maxStar) {
                "Catalog capability differs from reviewed rule: ${rule.operatorId}"
            }
        }
    }
}
