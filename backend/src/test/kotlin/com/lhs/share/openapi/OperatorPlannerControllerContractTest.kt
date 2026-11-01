package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorPlannerController
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorPlannerService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class OperatorPlannerControllerContractTest {
    private val mapper = jacksonObjectMapper().findAndRegisterModules().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val service = mockk<OperatorPlannerService>()
    private val helper = mockk<AuthenticationHelper>().also { every { it.requireUserId() } returns "user" }
    private val mvc = MockMvcBuilders.standaloneSetup(OperatorPlannerController(service, helper))
        .setControllerAdvice(OperatorExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()

    @Test
    fun `workspace and schedule endpoints bind authenticated owner and snake case bodies`() {
        val response = mapper.readTree("""{"account_id":"acc1","revision":1,"active_plan_id":"favorites"}""") as ObjectNode
        every { service.workspace("user", "acc1") } returns response
        every { service.putSchedule("user", "acc1", "favorites", any()) } returns response
        mvc.perform(get("/v1/operator/training-workspace").param("account_id", "acc1"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.active_plan_id").value("favorites"))
        mvc.perform(
            put("/v1/operator/training-plans/favorites/stamina-schedule").param("account_id", "acc1")
                .contentType(MediaType.APPLICATION_JSON).content("""{"expected_revision":0,"schema_version":1}"""),
        )
            .andExpect(status().isOk)
        verify { service.putSchedule("user", "acc1", "favorites", match { it.path("expected_revision").intValue() == 0 }) }
    }

    @Test
    fun `revision conflicts and malformed JSON use operator error envelopes`() {
        every { service.putWorkspace("user", "acc1", any()) } throws OperatorApiException(
            HttpStatus.CONFLICT,
            "training_workspace_revision_conflict",
            "changed",
        )
        mvc.perform(
            put("/v1/operator/training-workspace").param("account_id", "acc1").contentType(MediaType.APPLICATION_JSON).content("{}"),
        )
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("training_workspace_revision_conflict"))
        mvc.perform(
            post(
                "/v1/operator/training-workspace/import-local",
            ).param("account_id", "acc1").contentType(MediaType.APPLICATION_JSON).content("[]"),
        )
            .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    @Test
    fun `account source settings keep snake case fields across the workspace HTTP contract`() {
        val body = """{"schema_version":1,"expected_revision":3,"stamina_sources":{
            "monthly_card":{"tier":"xingguang","daily_enabled":true,"shop_enabled":true,
            "daily_amount":35,"shop_amount":20,"start_date":"2026-10-17","end_date":"2026-11-17"},
            "fixed_sources":[]}}"""
        every { service.putWorkspace("user", "acc1", any()) } answers { thirdArg<ObjectNode>().deepCopy().put("revision", 4) }
        mvc.perform(
            put("/v1/operator/training-workspace").param("account_id", "acc1")
                .contentType(MediaType.APPLICATION_JSON).content(body),
        ).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.stamina_sources.monthly_card.daily_amount").value(35))
            .andExpect(jsonPath("$.data.stamina_sources.monthly_card.end_date").value("2026-11-17"))
            .andExpect(jsonPath("$.data.revision").value(4))
        verify { service.putWorkspace("user", "acc1", match { it.path("expected_revision").asInt() == 3 }) }
    }
}
