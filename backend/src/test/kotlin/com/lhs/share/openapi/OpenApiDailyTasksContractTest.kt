package com.lhs.share.openapi

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.response.OperatorDailyTaskSource
import com.lhs.share.hub.controller.operator.response.OperatorDailyTasksResponse
import com.lhs.share.hub.repository.entity.OperatorTrainingTask
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorDailyTasksService
import com.lhs.share.hub.service.operator.OperatorPlannerService
import com.lhs.share.hub.service.operator.OperatorService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.swagger.v3.oas.annotations.Operation
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class OpenApiDailyTasksContractTest {
    private val mapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val tokenService = mockk<OpenApiTokenService>()
    private val service = mockk<OperatorService>()
    private val accountService = mockk<SubAccountService>()
    private val planner = mockk<OperatorPlannerService>()
    private val dailyTasks = mockk<OperatorDailyTasksService>()

    // 2026-10-16T17:30Z 在北京时间是 2026-10-17 01:30,用来区分 UTC 日期与 Asia/Shanghai 日期。
    private val controller = OpenApiOperatorController(
        tokenService,
        service,
        accountService,
        plannerService = planner,
        dailyTasksService = dailyTasks,
        clock = Clock.fixed(Instant.parse("2026-10-16T17:30:00Z"), ZoneOffset.UTC),
    )
    private val mvc = MockMvcBuilders.standaloneSetup(controller)
        .setControllerAdvice(OperatorExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/open-api/operator/daily-tasks"

    private fun workspace(active: String?, vararg plans: Pair<String, String>): ObjectNode {
        val node = mapper.createObjectNode()
        if (active == null) node.putNull("active_plan_id") else node.put("active_plan_id", active)
        val array = node.putArray("plans")
        plans.forEach { (id, name) ->
            array.addObject().put("id", id).put("name", name).put("source", "custom")
        }
        return node
    }

    private fun dailyResponse(
        planId: String = "daily",
        date: String = "2026-10-17",
        version: Long = 7,
        status: String = "ready",
        needsUpdate: Boolean = false,
        tasks: List<OperatorTrainingTask> = emptyList(),
    ) = OperatorDailyTasksResponse(
        "acc1",
        planId,
        date,
        version,
        OperatorDailyTaskSource(status, 3, tasks),
        tasks,
        needsUpdate,
    )

    @Test
    fun `daily tasks endpoint is an open api read endpoint`() {
        val method = OpenApiOperatorController::class.java.getDeclaredMethod("dailyTasks", String::class.java, String::class.java)
        assertNotNull(method.getAnnotation(RequireOpenApiToken::class.java))
        assertNotNull(method.getAnnotation(Operation::class.java))
    }

    @Test
    fun `active plan returns token bound tasks with snake case and no caching`() {
        every {
            tokenService.validateAnyAuthorization(
                "Bearer t",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns
            workspace("daily", "favorites" to "特别关注", "daily" to "日常")
        val tasks = listOf(
            OperatorTrainingTask("ds-12", "ds", 12, 4),
            OperatorTrainingTask("fh-3", "fh", 3, 1, 20, 2),
            OperatorTrainingTask("yy-1", "yy", 1, 1),
            OperatorTrainingTask("experience-8", "experience", 8, 1),
            OperatorTrainingTask("mystery-1", "mystery", 1, 1),
        )
        every { dailyTasks.get("u1", "acc1", "daily", "2026-10-17") } returns
            dailyResponse(tasks = tasks, needsUpdate = true)

        mvc.perform(
            get(path).header("Authorization", "Bearer t").param("account_id", "victim").param("plan_id", "favorites"),
        )
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.plan_id").value("daily"))
            .andExpect(jsonPath("$.data.plan_name").value("日常"))
            .andExpect(jsonPath("$.data.date").value("2026-10-17"))
            .andExpect(jsonPath("$.data.version").value(7))
            .andExpect(jsonPath("$.data.needs_update").value(true))
            .andExpect(jsonPath("$.data.source_status").value("ready"))
            .andExpect(jsonPath("$.data.tasks[0].id").value("ds-12"))
            .andExpect(jsonPath("$.data.tasks[0].group_id").value("ds"))
            .andExpect(jsonPath("$.data.tasks[0].group_name").value("地水"))
            .andExpect(jsonPath("$.data.tasks[0].stage_level").value(12))
            .andExpect(jsonPath("$.data.tasks[0].count").value(4))
            .andExpect(jsonPath("$.data.tasks[0].completed_count").value(0))
            .andExpect(jsonPath("$.data.tasks[0].cost_per").value(20))
            .andExpect(jsonPath("$.data.tasks[1].group_name").value("风火"))
            .andExpect(jsonPath("$.data.tasks[1].completed_count").value(2))
            .andExpect(jsonPath("$.data.tasks[2].group_name").value("阴阳"))
            .andExpect(jsonPath("$.data.tasks[3].group_name").value("经验"))
            .andExpect(content().string(containsString("\"group_name\":null")))

        verify(exactly = 1) {
            tokenService.validateAnyAuthorization(
                "Bearer t",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        }
        verify(exactly = 1) { dailyTasks.get("u1", "acc1", "daily", "2026-10-17") }
    }

    @Test
    fun `blank active plan falls back to the first plan`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns
            workspace("", "favorites" to "特别关注", "daily" to "日常")
        every { dailyTasks.get("u1", "acc1", "favorites", "2026-10-17") } returns
            dailyResponse(planId = "favorites", version = 0, status = "no_schedule")

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.plan_id").value("favorites"))
            .andExpect(jsonPath("$.data.plan_name").value("特别关注"))
            .andExpect(jsonPath("$.data.source_status").value("no_schedule"))
            .andExpect(jsonPath("$.data.tasks").isEmpty)

        verify { dailyTasks.get("u1", "acc1", "favorites", "2026-10-17") }
    }

    @Test
    fun `unknown active plan falls back to the first plan`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns
            workspace("deleted", "favorites" to "特别关注", "daily" to "日常")
        every { dailyTasks.get("u1", "acc1", "favorites", "2026-10-17") } returns
            dailyResponse(planId = "favorites", status = "needs_recalculation")

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.plan_id").value("favorites"))
            .andExpect(jsonPath("$.data.source_status").value("needs_recalculation"))
    }

    @Test
    fun `workspace without plans returns no schedule and empty tasks`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace(null)

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.date").value("2026-10-17"))
            .andExpect(jsonPath("$.data.version").value(0))
            .andExpect(jsonPath("$.data.needs_update").value(false))
            .andExpect(jsonPath("$.data.source_status").value("no_schedule"))
            .andExpect(jsonPath("$.data.tasks").isEmpty)
            .andExpect(content().string(containsString("\"plan_id\":null")))
            .andExpect(content().string(containsString("\"plan_name\":null")))

        verify(exactly = 0) { dailyTasks.get(any(), any(), any(), any()) }
    }

    @Test
    fun `date defaults to shanghai today and an explicit date is forwarded`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get("u1", "acc1", "daily", "2026-10-17") } returns dailyResponse()
        every { dailyTasks.get("u1", "acc1", "daily", "2026-09-01") } returns dailyResponse(date = "2026-09-01")

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.date").value("2026-10-17"))
        mvc.perform(get(path).header("Authorization", "Bearer t").param("date", "2026-09-01"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.date").value("2026-09-01"))

        verify { dailyTasks.get("u1", "acc1", "daily", "2026-09-01") }
    }

    @Test
    fun `source status vocabulary is passed through`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get(any(), any(), any(), any()) } returns dailyResponse(status = "daily_limit")

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.source_status").value("daily_limit"))
            .andExpect(jsonPath("$.data.tasks").isEmpty)
    }

    @Test
    fun `token and service failures use real http errors`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")
        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))

        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")
        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))

        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get(any(), any(), any(), any()) } throws
            OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "日期不正确")
        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    private fun completion(
        token: String = "Bearer write",
        entry: String = "fh-12",
        body: String = """{"date":"2026-10-17","expected_version":7,"expected_schedule_revision":3,"completed":true}""",
    ) = put("$path/$entry/completion")
        .header("Authorization", token)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body)

    @Test
    fun `completion endpoint is a documented open api write endpoint`() {
        val method = OpenApiOperatorController::class.java.getDeclaredMethod(
            "completeDailyTask",
            String::class.java,
            String::class.java,
            JsonNode::class.java,
        )

        assertNotNull(method.getAnnotation(RequireOpenApiToken::class.java))
        assertNotNull(method.getAnnotation(Operation::class.java))
    }

    @Test
    fun `read response exposes schedule revision and planned candidates`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get("u1", "acc1", "daily", "2026-10-17") } returns
            dailyResponse(tasks = listOf(OperatorTrainingTask("fh-12", "fh", 12, 4, 20, 1)))

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.version").value(7))
            .andExpect(jsonPath("$.data.schedule_revision").value(3))
            .andExpect(jsonPath("$.data.planned_tasks[0].id").value("fh-12"))
            .andExpect(jsonPath("$.data.planned_tasks[0].group_id").value("fh"))
            .andExpect(jsonPath("$.data.planned_tasks[0].group_name").value("风火"))
            .andExpect(jsonPath("$.data.planned_tasks[0].stage_level").value(12))
            .andExpect(jsonPath("$.data.planned_tasks[0].count").value(4))
            .andExpect(jsonPath("$.data.planned_tasks[0].completed_count").value(1))
            .andExpect(jsonPath("$.data.planned_tasks[0].cost_per").value(20))
            .andExpect(jsonPath("$.data.tasks[0].id").value("fh-12"))
    }

    @Test
    fun `planned candidates stay empty when the schedule is not ready`() {
        every {
            tokenService.validateAnyAuthorization(
                any(),
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get(any(), any(), any(), any()) } returns
            dailyResponse(status = "needs_recalculation", tasks = listOf(OperatorTrainingTask("fh-12", "fh", 12, 4, 20, 1)))

        mvc.perform(get(path).header("Authorization", "Bearer t"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.schedule_revision").value(3))
            .andExpect(jsonPath("$.data.planned_tasks").isEmpty)
    }

    @Test
    fun `completion returns the authoritative snapshot without caching`() {
        every { tokenService.validateAuthorization("Bearer write", OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.completeFromOpenApi("u1", "acc1", "daily", "2026-10-17", "fh-12", 7L, 3L, true) } returns
            dailyResponse(tasks = listOf(OperatorTrainingTask("fh-12", "fh", 12, 4, 20, 4)))

        mvc.perform(completion())
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.plan_id").value("daily"))
            .andExpect(jsonPath("$.data.plan_name").value("日常"))
            .andExpect(jsonPath("$.data.date").value("2026-10-17"))
            .andExpect(jsonPath("$.data.version").value(7))
            .andExpect(jsonPath("$.data.needs_update").value(false))
            .andExpect(jsonPath("$.data.source_status").value("ready"))
            .andExpect(jsonPath("$.data.schedule_revision").value(3))
            .andExpect(jsonPath("$.data.planned_tasks[0].id").value("fh-12"))
            .andExpect(jsonPath("$.data.tasks[0].completed_count").value(4))

        verify(exactly = 1) {
            dailyTasks.completeFromOpenApi("u1", "acc1", "daily", "2026-10-17", "fh-12", 7L, 3L, true)
        }
    }

    @Test
    fun `completion rejects missing and read only tokens with real http errors`() {
        every { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } throws
            InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "API token is missing")
        mvc.perform(completion(token = "Bearer missing"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))

        every { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } throws
            InventoryApiException(HttpStatus.FORBIDDEN, "forbidden", "API token lacks the required scope")
        mvc.perform(completion(token = "Bearer read-only"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))
    }

    @Test
    fun `completion maps conflicts and invalid tasks to real http errors`() {
        every { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.completeFromOpenApi(any(), any(), any(), any(), any(), any(), any(), any()) } throws
            OperatorApiException(HttpStatus.CONFLICT, "training_tasks_conflict", "待办已在其他设备更新，请读取最新状态后重试")
        mvc.perform(completion())
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("training_tasks_conflict"))

        every { dailyTasks.completeFromOpenApi(any(), any(), any(), any(), any(), any(), any(), any()) } throws
            OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "历练待办不存在")
        mvc.perform(completion())
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    @Test
    fun `completion validates the exact body before touching the schedule`() {
        every { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        val bodies = listOf(
            """{"date":"2026-10-17","expected_version":7,"expected_schedule_revision":3}""",
            """{"date":"2026-10-17","expected_version":7,"expected_schedule_revision":3,"completed":true,"account_id":"victim"}""",
            """{"date":"2026-10-17","expected_version":7,"expected_schedule_revision":3,"completed":"true"}""",
            """{"date":20261017,"expected_version":7,"expected_schedule_revision":3,"completed":true}""",
            """{"date":"2026-10-17","expected_version":-1,"expected_schedule_revision":3,"completed":true}""",
        )
        bodies.forEach { body ->
            mvc.perform(completion(body = body))
                .andExpect(status().isUnprocessableEntity)
                .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        }

        verify(exactly = 0) { dailyTasks.completeFromOpenApi(any(), any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { planner.workspace(any(), any()) }
    }

    @Test
    fun `completion without a plan is unprocessable instead of failing`() {
        every { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace(null)

        mvc.perform(completion())
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))

        verify(exactly = 0) { dailyTasks.completeFromOpenApi(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `read accepts the daily tasks write scope without operator read`() {
        // 只勾了「在手机小组件中记录今日历练完成」的用户，也必须能读到今日历练。
        every {
            tokenService.validateAnyAuthorization(
                "Bearer write-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        } returns
            OpenApiPrincipal("u1", "acc1")
        every { planner.workspace("u1", "acc1") } returns workspace("daily", "daily" to "日常")
        every { dailyTasks.get("u1", "acc1", "daily", "2026-10-17") } returns
            dailyResponse(tasks = listOf(OperatorTrainingTask("fh-12", "fh", 12, 4, 20, 0)))

        mvc.perform(get(path).header("Authorization", "Bearer write-only"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.account_id").value("acc1"))
            .andExpect(jsonPath("$.data.tasks[0].id").value("fh-12"))

        verify(exactly = 1) {
            tokenService.validateAnyAuthorization(
                "Bearer write-only",
                OpenApiPermission.OPERATOR_READ,
                OpenApiPermission.OPERATOR_DAILY_TASKS_WRITE,
            )
        }
        // 读取不再单独要求 operator:read
        verify(exactly = 0) { tokenService.validateAuthorization(any(), OpenApiPermission.OPERATOR_READ) }
    }
}
