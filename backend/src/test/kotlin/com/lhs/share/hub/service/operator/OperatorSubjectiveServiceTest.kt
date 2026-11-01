package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorGrowthTargetRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import com.lhs.share.hub.repository.entity.OperatorAnnotation
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorGrowthTarget
import com.lhs.share.hub.repository.entity.SubAccount
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class OperatorSubjectiveServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountRepository>()
    private val catalog = mockk<OperatorCatalogService>()
    private val annotations = mockk<OperatorAnnotationRepository>()
    private val targets = mockk<OperatorGrowthTargetRepository>()
    private val favorites = mockk<InventoryAgentFavoriteRepository>()
    private val annotationData = mutableMapOf<Triple<String, String, String>, OperatorAnnotation>()
    private val targetData = mutableMapOf<Triple<String, String, String>, OperatorGrowthTarget>()
    private val favoriteData = mutableSetOf<Triple<String, String, String>>()
    private val service = OperatorSubjectiveService(accounts, catalog, annotations, targets, favorites)

    @BeforeEach
    fun setUp() {
        annotationData.clear()
        targetData.clear()
        favoriteData.clear()
        every { accounts.findByUserIdAndAccountId(any(), any()) } answers {
            val user = firstArg<String>()
            val account = secondArg<String>()
            if ((user == "u1" && account in setOf("a1", "a2")) || (user == "u2" && account == "a1")) {
                SubAccount(userId = user, accountId = account, name = account, game = "如鸢")
            } else {
                null
            }
        }
        every { catalog.getOperator("op1") } returns OperatorCatalogEntity(
            operatorId = "op1",
            name = "密探",
            rarity = 5,
            prof = listOf("火"),
            subProf = listOf("pojun"),
            games = listOf("如鸢"),
            discs = emptyList(),
            starStones = emptyList(),
            catalogVersion = "1",
        )
        every { annotations.findByUserIdAndAccountIdAndOperatorId(any(), any(), any()) } answers {
            annotationData[Triple(firstArg(), secondArg(), thirdArg())]
        }
        every { annotations.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(any(), any()) } answers {
            annotationData.values.filter { it.userId == firstArg<String>() && it.accountId == secondArg<String>() }
                .sortedBy { it.operatorId }
        }
        every { annotations.save(any()) } answers {
            firstArg<OperatorAnnotation>().also { annotationData[Triple(it.userId, it.accountId, it.operatorId)] = it }
        }
        every { annotations.compareAndSet(any(), any(), any(), any(), any(), any(), any()) } answers {
            val key = Triple(firstArg<String>(), secondArg<String>(), thirdArg<String>())
            val current = annotationData[key]
            if (current?.revision != arg<Long>(3)) {
                null
            } else {
                current.copy(
                    growthState = arg(4),
                    note = arg(5),
                    revision = current.revision + 1,
                    updatedAt = arg(6),
                ).also { annotationData[key] = it }
            }
        }
        every { annotations.deleteAllByUserIdAndAccountId(any(), any()) } answers {
            val user = firstArg<String>()
            val account = secondArg<String>()
            annotationData.entries.removeIf { it.key.first == user && it.key.second == account }
        }
        every { targets.findByUserIdAndAccountIdAndOperatorId(any(), any(), any()) } answers {
            targetData[Triple(firstArg(), secondArg(), thirdArg())]
        }
        every { targets.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(any(), any()) } answers {
            targetData.values.filter { it.userId == firstArg<String>() && it.accountId == secondArg<String>() }
                .sortedBy { it.operatorId }
        }
        every { targets.save(any()) } answers {
            firstArg<OperatorGrowthTarget>().also { targetData[Triple(it.userId, it.accountId, it.operatorId)] = it }
        }
        every { targets.compareAndSet(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } answers {
            val key = Triple(firstArg<String>(), secondArg<String>(), thirdArg<String>())
            val current = targetData[key]
            if (current?.revision != arg<Long>(3)) {
                null
            } else {
                current.copy(
                    targetLevel = arg(4),
                    targetElite = arg(5),
                    targetStarLevel = arg(6),
                    targetHeartPaper = arg(7),
                    targetHuaji = arg(9),
                    revision = current.revision + 1,
                    updatedAt = arg(8),
                ).also { targetData[key] = it }
            }
        }
        every { targets.deleteIfRevision(any(), any(), any(), any()) } answers {
            val key = Triple(firstArg<String>(), secondArg<String>(), thirdArg<String>())
            val current = targetData[key]
            if (current?.revision == arg<Long>(3)) targetData.remove(key) != null else false
        }
        every { targets.deleteByUserIdAndAccountIdAndOperatorId(any(), any(), any()) } answers {
            if (targetData.remove(Triple(firstArg(), secondArg(), thirdArg())) == null) 0 else 1
        }
        every { targets.deleteAllByUserIdAndAccountId(any(), any()) } answers {
            val user = firstArg<String>()
            val account = secondArg<String>()
            targetData.entries.removeIf { it.key.first == user && it.key.second == account }
        }
        every { favorites.existsByUserIdAndAccountIdAndAgentId(any(), any(), any()) } answers {
            Triple(firstArg(), secondArg(), thirdArg()) in favoriteData
        }
        every { favorites.save(any()) } answers {
            firstArg<InventoryAgentFavorite>().also { favoriteData += Triple(it.userId, it.accountId, it.agentId) }
        }
        every { favorites.deleteByUserIdAndAccountIdAndAgentId(any(), any(), any()) } answers {
            if (favoriteData.remove(Triple(firstArg(), secondArg(), thirdArg()))) 1 else 0
        }
        every { favorites.deleteAllByUserIdAndAccountId(any(), any()) } answers {
            val user = firstArg<String>()
            val account = secondArg<String>()
            favoriteData.removeIf { it.first == user && it.second == account }
        }
    }

    @Test
    fun `movie growth targets reject ordinary encoded star levels`() {
        val base = catalog.getOperator("op1")!!
        every { catalog.getOperator("op1") } returns base.copy(spOf = "base")
        assertThrows(OperatorApiException::class.java) {
            service.putTarget(
                "u1",
                "a1",
                "op1",
                mapper.readTree("""{"star_level":7,"expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
            )
        }
        service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"star_level":5,"expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        assertEquals(5, service.subjectiveState("u1", "a1", "op1")["targets"].let { (it as Map<*, *>)["star_level"] })
    }

    @Test
    fun `annotations are isolated and missing annotation defaults to active`() {
        service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"growth_state":"graduated","expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )

        assertEquals("graduated", service.annotations("u1", "a1").items.single().growthState)
        assertTrue(service.annotations("u1", "a2").items.isEmpty())
        assertTrue(service.annotations("u2", "a1").items.isEmpty())
        assertEquals("active", service.subjectiveState("u1", "a2", "op1")["growth_state"])
    }

    @Test
    fun `independent target facts survive partial updates without copying to other forms`() {
        val first = service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree(
                """{"expected_revision":0,"huaji":{"owned":true,"stage":null,"awakened":true}}""",
            ) as com.fasterxml.jackson.databind.node.ObjectNode,
        )!!
        assertEquals(25, first.huaji?.stage)
        assertEquals(true, first.huaji?.awakened)
        val second = service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"expected_revision":1,"level":100}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )!!
        assertEquals(first.huaji, second.huaji)
        val third = service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"expected_revision":2,"huaji":{"awakened":false}}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )!!
        assertEquals(false, third.huaji?.awakened)
        assertEquals(25, third.huaji?.stage)
        assertEquals(1, service.targets("u1", "a1").items.size)
        assertThrows(OperatorApiException::class.java) {
            service.putTarget(
                "u1",
                "a1",
                "op1",
                mapper.readTree(
                    """{"expected_revision":3,"star_level":31,"huaji":{"awakened":false}}""",
                ) as com.fasterxml.jackson.databind.node.ObjectNode,
            )
        }
        assertEquals(third, service.targets("u1", "a1").items.single())
        val unknown = service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"expected_revision":3,"huaji":{"stage":null}}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )!!
        assertEquals(null, unknown.huaji?.stage)
        assertEquals(false, unknown.huaji?.awakened)
    }

    @Test
    fun `discarded can be restored without changing note favorite or targets and respects revision and owner`() {
        favoriteData += Triple("u1", "a1", "op1")
        service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree(
                """{"heart_paper":180,"expected_revision":0}""",
            ) as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        val saved = service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree(
                """{"growth_state":"discarded","note":"保留备注","expected_revision":0}""",
            ) as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        assertEquals("discarded", service.annotations("u1", "a1").items.single().growthState)
        assertTrue(service.annotations("u1", "a2").items.isEmpty())
        assertTrue(service.annotations("u2", "a1").items.isEmpty())
        val conflict = assertThrows(OperatorApiException::class.java) {
            service.putAnnotation(
                "u1",
                "a1",
                "op1",
                mapper.readTree(
                    """{"growth_state":"active","expected_revision":0}""",
                ) as com.fasterxml.jackson.databind.node.ObjectNode,
            )
        }
        assertEquals("annotation_revision_conflict", conflict.code)
        var revision = saved.revision
        for (state in listOf("active", "graduated", "skip", "discarded")) {
            val restored = service.putAnnotation(
                "u1",
                "a1",
                "op1",
                mapper.readTree(
                    """{"growth_state":"$state","expected_revision":$revision}""",
                ) as com.fasterxml.jackson.databind.node.ObjectNode,
            )
            assertEquals(state, restored.growthState)
            assertEquals("保留备注", restored.note)
            assertTrue(Triple("u1", "a1", "op1") in favoriteData)
            assertEquals(180, service.targets("u1", "a1").items.single().heartPaper)
            revision = restored.revision
        }
        val invalid = assertThrows(OperatorApiException::class.java) {
            service.putAnnotation(
                "u1",
                "a1",
                "op1",
                mapper.readTree(
                    """{"growth_state":"future","expected_revision":$revision}""",
                ) as com.fasterxml.jackson.databind.node.ObjectNode,
            )
        }
        assertEquals("invalid_growth_state", invalid.code)
        assertEquals("discarded", service.annotations("u1", "a1").items.single().growthState)
    }

    @Test
    fun `growth state and favorite remain independent`() {
        favoriteData += Triple("u1", "a1", "op1")
        service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"growth_state":"graduated","expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        assertTrue(Triple("u1", "a1", "op1") in favoriteData)

        service.applyAnnotationEntry(
            "u1",
            "a1",
            mapper.readTree("""{"operator_id":"op1","favorite":false}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        assertFalse(Triple("u1", "a1", "op1") in favoriteData)
        assertEquals("graduated", service.annotations("u1", "a1").items.single().growthState)
    }

    @Test
    fun `graduated favorite operator keeps targets and explicit null clears note and targets`() {
        favoriteData += Triple("u1", "a1", "op1")
        val annotation = service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree(
                """{"growth_state":"graduated","note":"继续收集心纸","expected_revision":0}""",
            ) as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        service.putTarget(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"heart_paper":180,"expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )

        assertEquals(180, service.targets("u1", "a1").items.single().heartPaper)
        assertTrue(Triple("u1", "a1", "op1") in favoriteData)
        val cleared = service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree(
                """{"note":null,"expected_revision":${annotation.revision}}""",
            ) as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        assertNull(cleared.note)
        assertNull(
            service.putTarget(
                "u1",
                "a1",
                "op1",
                mapper.readTree("""{"targets":null,"expected_revision":1}""") as com.fasterxml.jackson.databind.node.ObjectNode,
            ),
        )
        assertTrue(service.targets("u1", "a1").items.isEmpty())
    }

    @Test
    fun `revision conflict does not overwrite annotation`() {
        service.putAnnotation(
            "u1",
            "a1",
            "op1",
            mapper.readTree("""{"growth_state":"graduated","expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        val error = assertThrows(OperatorApiException::class.java) {
            service.putAnnotation(
                "u1",
                "a1",
                "op1",
                mapper.readTree("""{"growth_state":"skip","expected_revision":0}""") as com.fasterxml.jackson.databind.node.ObjectNode,
            )
        }
        assertEquals(409, error.status.value())
        assertEquals("annotation_revision_conflict", error.code)
        assertEquals("graduated", service.annotations("u1", "a1").items.single().growthState)
    }
}
