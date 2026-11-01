package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class PanelRulesMaintenanceTest {
    private val bundle = panelRules()
    private val catalog = OperatorCatalogEntity(
        operatorId = "operator.test", name = "Synthetic", rarity = 5,
        prof = emptyList(), subProf = emptyList(), games = listOf("如鸢", "代号鸢"),
        discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
    )

    @Test
    fun `maintenance rejects missing duplicate or incompatible published mappings`() {
        assertDoesNotThrow { PanelRulesMaintenance.validateCatalog(bundle, listOf(catalog)) }
        for (entries in listOf(emptyList(), listOf(catalog, catalog), listOf(catalog.copy(rarity = 3)))) {
            assertThrows(IllegalArgumentException::class.java) { PanelRulesMaintenance.validateCatalog(bundle, entries) }
        }
        val unmapped = bundle.copy(operators = bundle.operators + bundle.operators.single().copy(operatorId = null))
        assertDoesNotThrow { PanelRulesMaintenance.validateCatalog(unmapped, listOf(catalog)) }
    }
}
