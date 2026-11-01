package com.lhs.share.hub.service.operator

import com.lhs.share.hub.controller.operator.request.OperatorResetPreviewRequest
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryCurrent
import com.lhs.share.hub.repository.entity.InventoryRevision
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorCurrent
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.StockEntry
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class OperatorResetPreviewTest {
    @Test
    fun `a balance read racing an inventory commit retains the earlier version`() {
        val accounts = mockk<SubAccountRepository>()
        val catalog = mockk<OperatorCatalogService>()
        val operators = mockk<OperatorCurrentRepository>()
        val stock = mockk<InventoryCurrentRepository>()
        val revisions = mockk<InventoryRevisionRepository>()
        val baseline = Instant.parse("2026-01-01T00:00:00Z")
        val op = OperatorCatalogEntity(
            operatorId = "op", name = "密探", rarity = 5, prof = listOf("火"), subProf = listOf("pojun"),
            games = listOf("如鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test",
        )
        every { accounts.findByUserIdAndAccountId("owner", "main") } returns
            SubAccount(userId = "owner", accountId = "main", name = "账号", game = "如鸢")
        every { catalog.getOperator("op") } returns op
        every { catalog.spFormsOf("op") } returns emptyList()
        every { operators.findByUserIdAndAccountIdAndGame("owner", "main", "如鸢") } returns OperatorCurrent(
            id = "owner:main:如鸢",
            userId = "owner",
            accountId = "main",
            game = "如鸢",
            fullBaselineAt = baseline,
            entries = mapOf("op" to OperatorEntry(level = 40, elite = 2, starLevel = 5, levelBreakthroughStage = 3)),
        )
        var revision = 0L
        var inventory = InventoryCurrent(id = "stock", userId = "owner", accountId = "main", entityType = "item", fullBaselineAt = baseline)
        every { revisions.findByUserIdAndAccountId("owner", "main") } answers {
            InventoryRevision("owner:main", "owner", "main", revision)
        }
        every { stock.findByUserIdAndAccountIdAndEntityType("owner", "main", "item") } answers {
            val snapshot = inventory
            revision = 1L
            inventory = inventory.copy(entries = mapOf("bingshuquanjuan" to StockEntry(count = 5)))
            snapshot
        }
        val service = OperatorResetService(accounts, catalog, operators, stock, revisions, mockk(), mockk(), mockk(), mockk(), mockk())
        val stale = service.preview("owner", OperatorResetPreviewRequest("main", "如鸢", "op"))
        assertTrue(stale.blockers.isEmpty())
        assertEquals(0L, stale.resources.first { it.id == "bingshuquanjuan" }.balanceBefore)
        assertEquals(0L, stale.inventoryRevision)
        val fresh = service.preview("owner", OperatorResetPreviewRequest("main", "如鸢", "op"))
        assertEquals(1L, fresh.inventoryRevision)
        assertEquals(5L, fresh.resources.first { it.id == "bingshuquanjuan" }.balanceBefore)
        assertEquals(70L, fresh.resources.first { it.id == "bingshuquanjuan" }.balanceAfter)
    }
}
