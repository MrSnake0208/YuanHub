package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorReserveWorkspace
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate

class OperatorReserveWorkspaceServiceTest {
    private val mapper = jacksonObjectMapper()
    private val repository = mockk<OperatorReserveWorkspaceRepository>()
    private val accountRepository = mockk<SubAccountRepository>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val transactions = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private val accounts = OperatorReserveWorkspaceFixtures.accounts(accountRepository, repository, transactions)
    private val validator = OperatorReserveWorkspaceValidator()
    private val service = OperatorReserveWorkspaceService(accounts, accountRepository, repository, validator, mapper, events, transactions)
    private val data = mutableMapOf<String, OperatorReserveWorkspace>()
    private var game = "如鸢"
    private fun request(revision: Long = 0) = OperatorReserveWorkspaceFixtures.request(mapper, revision)

    @BeforeEach
    fun setup() {
        every { accountRepository.findByUserIdAndAccountId(any(), any()) } answers {
            if (firstArg<String>() == "owner" && secondArg<String>() in setOf("a", "b")) {
                SubAccount(userId = "owner", accountId = secondArg(), name = "synthetic", game = game)
            } else {
                null
            }
        }
        every { accountRepository.fenceRecruitmentWrite(any(), any(), any()) } returns true
        every { repository.findByUserIdAndAccountId(any(), any()) } answers { data["${firstArg<String>()}:${secondArg<String>()}"] }
        every { repository.replace(any(), any(), any(), any(), any(), any()) } answers {
            val key = "${arg<String>(0)}:${arg<String>(1)}"
            if ((data[key]?.revision ?: 0) != arg<Long>(3)) {
                null
            } else {
                OperatorReserveWorkspace(key, arg(0), arg(1), arg(2), arg(4), arg<Long>(3) + 1, arg(5)).also { data[key] = it }
            }
        }
    }

    @Test
    fun `empty and repeated GETs never write or publish`() {
        repeat(2) {
            val empty = service.workspace("owner", "a")
            assertEquals(0, empty.path("revision").asInt())
            assertTrue(empty.path("plans").isEmpty)
            assertTrue(empty.path("active_plan_id").isNull)
            assertFalse(empty.path("read_only").asBoolean())
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { accountRepository.fenceRecruitmentWrite(any(), any(), any()) }
        verify(exactly = 0) { events.publishChange(any(), any(), any(), any()) }
    }

    @Test
    fun `save roundtrip owner and account isolation and revision conflicts`() {
        val input = request()
        val original = input.deepCopy()
        val saved = service.putWorkspace("owner", "a", input)
        assertEquals(original, input)
        assertEquals(1, saved.path("revision").asInt())
        assertEquals(saved, service.workspace("owner", "a"))
        assertEquals(0, service.workspace("owner", "b").path("revision").asInt())
        for (account in listOf("a", "missing")) {
            assertThrows(InventoryApiException::class.java) { service.workspace("stranger", account) }
            assertThrows(InventoryApiException::class.java) { service.putWorkspace("stranger", account, request()) }
        }
        val stale = assertThrows(OperatorApiException::class.java) { service.putWorkspace("owner", "a", request()) }
        assertEquals(HttpStatus.CONFLICT, stale.status)
        assertEquals("reserve_workspace_revision_conflict", stale.code)
        verify(exactly = 1) { events.publishChange("owner", "a", "operator_reserve_workspace", mapOf("revision" to 1L)) }
    }

    @Test
    fun `game change retains old plans as read only and rejects all writes`() {
        service.putWorkspace("owner", "a", request())
        game = "代号鸢"
        val old = service.workspace("owner", "a")
        assertTrue(old.path("read_only").asBoolean())
        assertEquals("如鸢", old.path("game_snapshot").asText())
        val error = assertThrows(OperatorApiException::class.java) { service.putWorkspace("owner", "a", request(1)) }
        assertEquals("reserve_workspace_game_changed", error.code)
        assertEquals(1, data["owner:a"]!!.revision)
        assertFalse(service.workspace("owner", "b").path("read_only").asBoolean())
    }

    @Test
    fun `initial unique index race and account fence failure are conflicts`() {
        every { repository.replace(any(), any(), any(), any(), any(), any()) } throws DuplicateKeyException("synthetic race")
        assertEquals(
            HttpStatus.CONFLICT,
            assertThrows(OperatorApiException::class.java) {
                service.putWorkspace("owner", "a", request())
            }.status,
        )
        every { accountRepository.fenceRecruitmentWrite(any(), any(), any()) } returns false
        assertEquals(
            HttpStatus.CONFLICT,
            assertThrows(OperatorApiException::class.java) {
                service.putWorkspace("owner", "b", request())
            }.status,
        )
        assertTrue(data.isEmpty())
        verify(exactly = 0) { events.publishChange(any(), any(), any(), any()) }
    }

    @Test
    fun `invalid fields are 422 without writes and legal unknown demands remain saveable`() {
        val changes: List<(ObjectNode) -> Unit> = listOf(
            { it.put("user_id", "other") }, { it.put("schema_version", 2) }, { it.put("expected_revision", 0.5) },
            { it.put("expected_revision", "0") }, { it.put("active_plan_id", "missing") },
            { it.withArray("plans")[0].let { plan -> (plan as ObjectNode).put("name", " ") } },
            { it.withArray("plans")[0].let { plan -> (plan as ObjectNode).put("name", "x".repeat(41)) } },
            { (it.at("/plans/0/demands/0") as ObjectNode).put("operatorId", "fake") },
            { (it.at("/plans/0/demands/0") as ObjectNode).put("count", 1000) },
            { (it.at("/plans/0/demands/0") as ObjectNode).put("count", 1.5) },
            { (it.at("/plans/0/demands/0") as ObjectNode).put("attribute", "fh") },
            { (it.at("/plans/0/demands/0") as ObjectNode).put("profession", "") },
            { (it.at("/plans/0/demands/0/current") as ObjectNode).put("level", 70) },
            { (it.at("/plans/0/demands/0/current") as ObjectNode).put("breakthrough_stage", 8) },
            { (it.at("/plans/0/demands/0/target") as ObjectNode).put("elite", 12) },
            { (it.at("/plans/0/demands/0/target") as ObjectNode).put("level", 101) },
            { (it.at("/plans/0/demands/0/target") as ObjectNode).put("star_level", 31) },
            { it.withArray("plans").add(it.withArray("plans")[0].deepCopy()) },
            { (it.at("/plans/0") as ObjectNode).withArray("demands").add(it.at("/plans/0/demands/0").deepCopy()) },
        )
        changes.forEach { change ->
            val input = request().also(change)
            val error = assertThrows(OperatorApiException::class.java) { service.putWorkspace("owner", "a", input) }
            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
            assertTrue(!error.fieldPath.isNullOrBlank())
        }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any()) }
        val unknown = request()
        (unknown.at("/plans/0/demands/0") as ObjectNode).put("attribute", "混沌")
        (unknown.at("/plans/0/demands/0/current") as ObjectNode).put("level", 70).put("elite", 1).putNull("breakthrough_stage")
        service.putWorkspace("owner", "a", unknown)
        assertEquals("混沌", service.workspace("owner", "a").at("/plans/0/demands/0/attribute").asText())
    }

    @Test
    fun `all level elite caps and breakthrough stages match existing rules`() {
        for (level in 0..100) {
            val input = request()
            val maxElite = OperatorGrowthRules.maxEliteForLevel(level)
            for (key in listOf("current", "target")) {
                (input.at("/plans/0/demands/0/$key") as ObjectNode).put("level", level).put("elite", maxElite)
            }
            (input.at("/plans/0/demands/0/current") as ObjectNode).putNull("breakthrough_stage")
            validator.workspace(input)
            (input.at("/plans/0/demands/0/target") as ObjectNode).put("elite", maxElite + 1)
            assertThrows(OperatorApiException::class.java) { validator.workspace(input) }
        }
    }

    @Test
    fun `workspace and demand capacity bounds reject overflow and empty workspace can save`() {
        val full = request()
        val plans = full.withArray("plans").removeAll()
        repeat(50) { index ->
            plans.addObject().put("id", "00000000-0000-4000-8000-${index.toString().padStart(12, '0')}")
                .put("name", "synthetic").putArray("demands")
        }
        full.put("active_plan_id", plans[0].path("id").asText())
        validator.workspace(full)
        plans.add(plans[0].deepCopy())
        assertThrows(OperatorApiException::class.java) { validator.workspace(full) }
        val groups = request()
        val demands = (groups.at("/plans/0") as ObjectNode).withArray("demands")
        val single = demands[0].deepCopy<ObjectNode>()
        demands.removeAll()
        repeat(50) { index -> demands.add(single.deepCopy().put("id", "00000000-0000-4000-8000-${index.toString().padStart(12, '0')}")) }
        validator.workspace(groups)
        demands.add(single)
        assertThrows(OperatorApiException::class.java) { validator.workspace(groups) }
        val empty = mapper.createObjectNode().put("schema_version", 1).put("expected_revision", 0).putNull("active_plan_id")
        empty.putArray("plans")
        assertTrue(service.putWorkspace("owner", "a", empty).path("plans").isEmpty)
    }
}
