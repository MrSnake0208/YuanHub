package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorDailyTasksController
import com.lhs.share.hub.controller.operator.response.OperatorDailyTaskSource
import com.lhs.share.hub.controller.operator.response.OperatorDailyTasksResponse
import com.lhs.share.hub.repository.entity.OperatorTrainingTask
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorDailyTasksService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorDailyTasksControllerContractTest {
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val service = mockk<OperatorDailyTasksService>()
    private val helper = mockk<AuthenticationHelper>().also { every { it.requireUserId() } returns "owner" }
    private val mvc = MockMvcBuilders.standaloneSetup(OperatorDailyTasksController(service, helper))
        .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/v1/operator/training-plans/plan/daily-tasks"
    private val row = OperatorTrainingTask("ds-12", "ds", 12, 4)
    private val response =
        OperatorDailyTasksResponse("a", "plan", "2026-10-16", 1, OperatorDailyTaskSource("ready", 3, listOf(row)), listOf(row), false)

    @Test
    fun `routes bind JWT owner and explicit account plan date with snake case and no caching`() {
        every { service.get("owner", "a", "plan", "2026-10-16") } returns response
        every { service.adopt("owner", "a", "plan", "2026-10-16", any()) } returns response
        every { service.complete("owner", "a", "plan", "2026-10-16", "ds-12", any()) } returns response
        mvc.perform(get(path).param("account_id", "a").param("date", "2026-10-16"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.tasks[0].stage_level").value(12)).andExpect(jsonPath("$.data.source.revision").value(3))
        mvc.perform(
            put(
                path,
            ).param(
                "account_id",
                "a",
            ).param(
                "date",
                "2026-10-16",
            ).contentType(MediaType.APPLICATION_JSON).content("""{"expected_version":0,"expected_schedule_revision":3}"""),
        )
            .andExpect(status().isOk)
        mvc.perform(
            put(
                "$path/ds-12",
            ).param(
                "account_id",
                "a",
            ).param("date", "2026-10-16").contentType(MediaType.APPLICATION_JSON).content("""{"expected_version":1,"completed":true}"""),
        )
            .andExpect(status().isOk)
        verify { service.complete("owner", "a", "plan", "2026-10-16", "ds-12", match { it.path("completed").booleanValue() }) }
    }

    @Test
    fun `conflicts permission failures and malformed JSON use real HTTP errors`() {
        every { service.adopt(any(), any(), any(), any(), any()) } throws
            OperatorApiException(HttpStatus.CONFLICT, "training_tasks_conflict", "changed")
        mvc.perform(put(path).param("account_id", "a").param("date", "2026-10-16").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("training_tasks_conflict"))
        every { service.get(any(), any(), any(), any()) } throws OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        mvc.perform(get(path).param("account_id", "victim").param("date", "2026-10-16")).andExpect(status().isNotFound)
        mvc.perform(put(path).param("account_id", "a").param("date", "2026-10-16").contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isUnprocessableEntity)
        every { helper.requireUserId() } throws OperatorApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "login")
        mvc.perform(get(path).param("account_id", "a").param("date", "2026-10-16")).andExpect(status().isUnauthorized)
    }
}
