package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.OperatorDailyTasksRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorDailyTasks
import com.lhs.share.hub.repository.entity.OperatorTrainingTask
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class OperatorDailyTasksServiceTest {
    private val mapper = jacksonObjectMapper()
    private val planner = mockk<OperatorPlannerService>()
    private val repository = mockk<OperatorDailyTasksRepository>()
    private val accounts = mockk<SubAccountRepository>()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val now = Instant.parse("2026-10-16T00:00:00Z")
    private val transaction = TransactionTemplate(object : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) = Unit
        override fun rollback(status: TransactionStatus) = Unit
    })
    private fun service(instant: Instant = now) =
        OperatorDailyTasksService(planner, repository, accounts, events, transaction, Clock.fixed(instant, ZoneOffset.UTC))
    private var stored: OperatorDailyTasks? = null
    private var schedule = snapshot()
    private fun task(level: Int, count: Int, completed: Int = 0) =
        OperatorTrainingTask("ds-$level", "ds", level, count, completedCount = completed)
    private fun body(version: Long = 0, revision: Long = 3) =
        mapper.readTree("""{"expected_version":$version,"expected_schedule_revision":$revision}""")
    private fun completion(version: Long, completed: Boolean) = mapper.readTree("""{"expected_version":$version,"completed":$completed}""")
    private fun snapshot(date: String = "2026-10-16"): ObjectNode = mapper.readTree(
        """{"schema_version":1,"rules_version":13,"revision":3,"schedule":{"context":{},"history":[],"result":{"timeline":[
        {"date":"$date","planned":{"spends":[
        {"kind":"training","group_id":"ds","stage_level":10,"value":1,"cost_per":20},
        {"kind":"training","group_id":"ds","stage_level":12,"value":4,"cost_per":20},
        {"kind":"count","id":"luoyang","value":2,"cost_per":72}]}}
        ]}}}""",
    ) as ObjectNode

    @BeforeEach
    fun setup() {
        every { accounts.findByUserIdAndAccountId("u", "a") } returns SubAccount(userId = "u", accountId = "a", name = "test")
        every { accounts.fenceRecruitmentWrite("u", "a", any()) } returns true
        every { planner.workspace("u", "a") } returns mapper.createObjectNode().put("active_plan_id", "p")
        every { planner.schedule("u", "a", "p") } answers { schedule }
        every { repository.find("u", "a", "p", any()) } answers { stored?.takeIf { it.date == arg<String>(3) } }
        every { repository.replace("u", "a", "p", any(), any(), any(), any()) } answers {
            if ((stored?.version ?: 0) != arg<Long>(4)) {
                null
            } else {
                OperatorDailyTasks("one", "u", "a", "p", arg(3), arg(5), arg<Long>(4) + 1, now).also { stored = it }
            }
        }
    }

    @Test
    fun `read uses saved training rows without dispatches and never writes`() {
        val result = service().get("u", "a", "p", "2026-10-16")
        assertEquals(listOf(task(10, 1), task(12, 4)), result.source.items)
        assertEquals(0L, result.version)
        assertTrue(result.tasks.isEmpty())
        service().get("u", "a", "p", "2026-10-16")
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
        verify { events wasNot io.mockk.Called }
    }

    @Test
    fun `adopt is idempotent and checkbox changes can be undone without touching planner`() {
        val api = service()
        val first = api.adopt("u", "a", "p", "2026-10-16", body())
        assertEquals(1L, first.version)
        assertEquals(first, api.adopt("u", "a", "p", "2026-10-16", body()))
        assertEquals(1, api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(1, true)).tasks[0].completedCount)
        assertEquals(2L, api.adopt("u", "a", "p", "2026-10-16", body()).version)
        assertEquals(0, api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(2, false)).tasks[0].completedCount)
        verify(exactly = 3) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { planner.putSchedule(any(), any(), any(), any()) }
    }

    @Test
    fun `explicit schedule update retains completed runs and drops only unfinished removed rows`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(1, true))
        val spends = schedule.path("schedule").path("result").path("timeline")[0].path("planned").path("spends")
        (spends[0] as ObjectNode).put("value", 3)
        (spends[1] as ObjectNode).put("value", 0)
        schedule.put("revision", 4)
        assertTrue(api.get("u", "a", "p", "2026-10-16").needsUpdate)
        assertEquals(listOf(task(10, 3, 1)), api.adopt("u", "a", "p", "2026-10-16", body(2, 4)).tasks)
        assertFalse(api.get("u", "a", "p", "2026-10-16").needsUpdate)
        (spends[0] as ObjectNode).put("value", 0)
        assertEquals(listOf(task(10, 0, 1)), api.adopt("u", "a", "p", "2026-10-16", body(3, 4)).tasks)
        assertTrue(api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(4, false)).tasks.isEmpty())
    }

    @Test
    fun `old task or source versions and changed active plan do not overwrite`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        assertEquals(
            HttpStatus.CONFLICT,
            assertThrows(OperatorApiException::class.java) {
                api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(0, true))
            }.status,
        )
        assertThrows(OperatorApiException::class.java) { api.adopt("u", "a", "p", "2026-10-16", body(1, 2)) }
        every { planner.workspace("u", "a") } returns mapper.createObjectNode().put("active_plan_id", "other")
        assertThrows(OperatorApiException::class.java) { api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(1, true)) }
        assertEquals(1L, stored!!.version)
        assertEquals(0, stored!!.tasks[0].completedCount)
    }

    @Test
    fun `a changed stage cannot reuse attempts already completed on another stage`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        api.complete("u", "a", "p", "2026-10-16", "ds-10", completion(1, true))
        val spends = schedule.path("schedule").path("result").path("timeline")[0].path("planned").path("spends")
        (spends[0] as ObjectNode).put("value", 0)
        (spends[1] as ObjectNode).put("value", 6)
        assertEquals("daily_limit", api.get("u", "a", "p", "2026-10-16").source.status)
        assertThrows(OperatorApiException::class.java) { api.adopt("u", "a", "p", "2026-10-16", body(2)) }
        assertEquals(2L, stored!!.version)
        (spends[1] as ObjectNode).put("value", 5)
        assertEquals("ready", api.get("u", "a", "p", "2026-10-16").source.status)
        assertEquals(listOf(task(10, 0, 1), task(12, 5)), api.adopt("u", "a", "p", "2026-10-16", body(2)).tasks)
    }

    @Test
    fun `unowned accounts cannot read or write tasks`() {
        every { accounts.findByUserIdAndAccountId("other", "a") } returns null
        every { planner.schedule("other", "a", "p") } throws OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        assertThrows(OperatorApiException::class.java) { service().get("other", "a", "p", "2026-10-16") }
        assertThrows(OperatorApiException::class.java) { service().adopt("other", "a", "p", "2026-10-16", body()) }
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `Beijing five am is the write boundary and yesterday tasks never roll over`() {
        schedule = snapshot("2026-10-15")
        service(Instant.parse("2026-10-15T20:59:59Z")).adopt("u", "a", "p", "2026-10-15", body())
        assertThrows(OperatorApiException::class.java) {
            service(Instant.parse("2026-10-15T21:00:00Z")).adopt("u", "a", "p", "2026-10-15", body(1))
        }
        schedule = snapshot()
        assertEquals(0L, service().get("u", "a", "p", "2026-10-16").version)
    }

    @Test
    fun `malformed fields versions and dates are rejected before persistence`() {
        for (json in listOf(
            "{}",
            "[]",
            "null",
            """{"expected_version":-1,"expected_schedule_revision":3}""",
            """{"expected_version":0.5,"expected_schedule_revision":3}""",
            """{"expected_version":0,"expected_schedule_revision":3,"user_id":"victim"}""",
        )) {
            assertThrows(OperatorApiException::class.java) { service().adopt("u", "a", "p", "2026-10-16", mapper.readTree(json)) }
        }
        assertThrows(OperatorApiException::class.java) { service().get("u", "a", "p", "2026-02-30") }
        assertThrows(OperatorApiException::class.java) {
            service().complete("u", "a", "p", "2026-10-16", "ds-10", mapper.readTree("""{"expected_version":1,"completed":"true"}"""))
        }
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `missing unsupported paused and pending recalculation schedules remain explicit`() {
        fun status(snapshot: ObjectNode) = OperatorDailyTasksService.source(snapshot, "2026-10-16").status
        assertEquals("no_schedule", status(snapshot().putNull("schedule")))
        assertEquals("unsupported", status(snapshot().put("rules_version", 99)))
        assertEquals("no_day", status(snapshot("2026-10-17")))
        val paused = snapshot()
        (paused.path("schedule").path("result").path("timeline")[0] as ObjectNode).put("paused", true)
        assertEquals("invalid", status(paused))
        val pending = snapshot()
        (
            pending.path(
                "schedule",
            ).path("context") as ObjectNode
            ).set<ObjectNode>("plan_baselines", mapper.readTree("""{"2026-10-16":{"spends":[]}}"""))
        assertEquals("needs_recalculation", status(pending))
        schedule = pending
        assertThrows(OperatorApiException::class.java) { service().adopt("u", "a", "p", "2026-10-16", body()) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `duplicate training rows aggregate and invalid counts fail closed`() {
        val spends = schedule.path("schedule").path("result").path("timeline")[0].path("planned").path("spends")
        (spends[1] as ObjectNode).put("stage_level", 10)
        assertEquals(listOf(task(10, 5)), OperatorDailyTasksService.source(schedule, "2026-10-16").items)
        (spends[1] as ObjectNode).put("value", 6)
        assertEquals("invalid", OperatorDailyTasksService.source(schedule, "2026-10-16").status)
        (spends[1] as ObjectNode).put("value", 1.5)
        assertEquals("invalid", OperatorDailyTasksService.source(schedule, "2026-10-16").status)
    }

    @Test
    fun `open api completion adopts today tasks atomically when no record exists`() {
        val result = service().completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 0L, 3L, true)

        assertEquals(1L, result.version)
        assertEquals(listOf(task(10, 1), task(12, 4, 4)), result.tasks)
        verify(exactly = 1) { repository.replace("u", "a", "p", "2026-10-16", 0L, any(), any()) }
        verify(exactly = 1) { events.publishChange("u", "a", "operator_training_tasks", any()) }
    }

    @Test
    fun `open api completion rejects a stale schedule revision without writing`() {
        val error = assertThrows(OperatorApiException::class.java) {
            service().completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 0L, 99L, true)
        }

        assertEquals(HttpStatus.CONFLICT, error.status)
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `open api completion refuses schedules that are not ready`() {
        schedule = snapshot("2026-10-17")
        val missingDay = assertThrows(OperatorApiException::class.java) {
            service().completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 0L, 3L, true)
        }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, missingDay.status)

        val pending = snapshot()
        (pending.path("schedule").path("context") as ObjectNode).set<ObjectNode>(
            "plan_baselines",
            mapper.readTree("""{"2026-10-16":{"spends":[]}}"""),
        )
        schedule = pending
        val recalculation = assertThrows(OperatorApiException::class.java) {
            service().completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 0L, 3L, true)
        }
        assertEquals(HttpStatus.CONFLICT, recalculation.status)

        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `open api completion rejects an unknown entry without writing`() {
        val error = assertThrows(OperatorApiException::class.java) {
            service().completeFromOpenApi("u", "a", "p", "2026-10-16", "fh-1", 0L, 3L, true)
        }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `open api completion rejects a stale record version without writing`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        val error = assertThrows(OperatorApiException::class.java) {
            api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 5L, 3L, true)
        }

        assertEquals(HttpStatus.CONFLICT, error.status)
        assertEquals(1L, stored!!.version)
        assertEquals(0, stored!!.tasks.first { it.id == "ds-12" }.completedCount)
        verify(exactly = 1) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `open api completion retries are idempotent and never bump the version`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        val first = api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 1L, 3L, true)
        assertEquals(4, first.tasks.first { it.id == "ds-12" }.completedCount)
        assertEquals(2L, first.version)

        val retried = api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 2L, 3L, true)
        assertEquals(2L, retried.version)
        assertEquals(2L, stored!!.version)
        assertEquals(first.tasks, retried.tasks)
        verify(exactly = 2) { repository.replace(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `open api completion unchecks to zero and preserves other completions`() {
        val api = service()
        api.adopt("u", "a", "p", "2026-10-16", body())
        api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-10", 1L, 3L, true)
        val second = api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 2L, 3L, true)
        assertEquals(listOf(task(10, 1, 1), task(12, 4, 4)), second.tasks)

        val unchecked = api.completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 3L, 3L, false)
        assertEquals(listOf(task(10, 1, 1), task(12, 4, 0)), unchecked.tasks)
        assertEquals(4L, unchecked.version)
    }

    @Test
    fun `merge keeps existing completions for open api adoption`() {
        val planned = OperatorDailyTasksService.source(snapshot(), "2026-10-16").items
        assertEquals(listOf(task(10, 1, 1), task(12, 4)), OperatorDailyTasksService.merge(planned, listOf(task(10, 1, 1))))
    }

    @Test
    fun `open api completion outside the beijing business day never writes`() {
        val error = assertThrows(OperatorApiException::class.java) {
            service().completeFromOpenApi("u", "a", "p", "2026-10-15", "ds-12", 0L, 3L, true)
        }

        assertEquals(HttpStatus.CONFLICT, error.status)
        verify { repository wasNot io.mockk.Called }
        verify { planner wasNot io.mockk.Called }
    }

    @Test
    fun `open api completion stays scoped to the token bound account`() {
        service().completeFromOpenApi("u", "a", "p", "2026-10-16", "ds-12", 0L, 3L, true)

        verify(exactly = 1) { planner.schedule("u", "a", "p") }
        verify(exactly = 1) { accounts.fenceRecruitmentWrite("u", "a", any()) }
        verify(exactly = 1) { repository.replace("u", "a", "p", "2026-10-16", 0L, any(), any()) }
    }
}
