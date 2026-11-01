package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.PanelRulesRepository
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionTemplate

class PanelRuleServiceTest {
    private val repository = mockk<PanelRulesRepository>()
    private val transaction = mockk<TransactionTemplate>()
    private val service = PanelRuleService(repository, transaction)

    @Test fun `snapshots pin one version and a later activation does not change an existing snapshot`() {
        val first = panelRules("v1")
        val second = panelRules("v2")
        every { repository.activeVersion("如鸢") } returnsMany listOf("v1", "v2", "v1")
        every { repository.load("v1") } returns first
        every { repository.load("v2") } returns second
        assertEquals("v1", service.snapshot("如鸢")!!.ruleSet.id)
        assertEquals("v2", service.snapshot("如鸢")!!.ruleSet.id)
        assertEquals("v1", service.snapshot("如鸢")!!.ruleSet.id)
        assertEquals("v1", first.ruleSet.id)
        verify(exactly = 1) { repository.load("v1") }
        verify(exactly = 0) {
            repository.activate(any(), any())
            repository.ensureIndexes()
            repository.insert(any())
        }
        verify { transaction wasNot Called }
    }

    @Test fun `missing version has no fallback and incomplete or wrong-game rules cannot activate`() {
        every { repository.activeVersion("如鸢") } returns null
        assertNull(service.snapshot("如鸢"))
        val bundle = panelRules()
        every { repository.load("broken") } returns bundle.copy(stars = emptyList())
        every { repository.load("foreign") } returns bundle.copy(ruleSet = bundle.ruleSet.copy(games = setOf("代号鸢")))
        assertThrows(IllegalArgumentException::class.java) { service.activate("如鸢", "broken") }
        assertThrows(IllegalArgumentException::class.java) { service.activate("如鸢", "foreign") }
        verify(exactly = 0) { repository.activate(any(), any()) }
    }

    @Test fun `invalid import has no schema writes or transaction`() {
        assertThrows(IllegalArgumentException::class.java) { service.importBundle(panelRules().copy(stars = emptyList())) }
        verify {
            repository wasNot Called
            transaction wasNot Called
        }
    }
}
