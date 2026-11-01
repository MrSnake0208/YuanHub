package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.common.controller.PagedDTO
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.handler.DevelopmentGoalExceptionHandler
import com.lhs.share.hub.controller.development.AdminDevelopmentGoalController
import com.lhs.share.hub.controller.development.DevelopmentGoalController
import com.lhs.share.hub.controller.development.response.DevelopmentGoalResponse
import com.lhs.share.hub.repository.entity.DevelopmentCriterion
import com.lhs.share.hub.service.development.DevelopmentGoalService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class DevelopmentGoalControllerContractTest {
    private val service = mockk<DevelopmentGoalService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mvc: MockMvc
    private val response =
        DevelopmentGoalResponse(
            "goal_1", "目标", "说明", "PLANNED",
            listOf(
                DevelopmentCriterion("验收"),
            ),
            emptyList(), "0.2.0", "2026-10-01", Instant.EPOCH, 2,
        )

    @BeforeEach
    fun setup() {
        val mapper = jacksonObjectMapper().registerModule(
            JavaTimeModule(),
        ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        mvc =
            MockMvcBuilders.standaloneSetup(
                DevelopmentGoalController(service),
                AdminDevelopmentGoalController(service, helper),
            ).setControllerAdvice(
                DevelopmentGoalExceptionHandler(),
            ).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "admin"
    }

    @Test
    fun `访客列表返回独立目标及snake case而不访问身份`() {
        every { service.list(1, 12, null) } returns PagedDTO(false, 1, 1, listOf(response))
        mvc.perform(get("/v1/development-goals"))
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.data.data[0].target_version").value("0.2.0"))
            .andExpect(jsonPath("$.data.data[0].feedback_ids").doesNotExist())
            .andExpect(jsonPath("$.data.data[0].criteria[0].completed").value(false))
        verify(exactly = 0) { helper.requireUserId() }
    }

    @Test
    fun `管理保存绑定验收关联及乐观锁版本`() {
        every { service.update("admin", "goal_1", any()) } returns response
        mvc.perform(
            put(
                "/v1/admin/development-goals/goal_1",
            ).contentType(
                MediaType.APPLICATION_JSON,
            ).content(
                """{"title":"目标","description":"说明","stage":"PLANNED","criteria":[{"title":"验收","completed":true}],"feedback_ids":["public_1"],"expected_version":2}""",
            ),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        verify {
            service.update(
                "admin",
                "goal_1",
                match {
                    it.expectedVersion == 2L && it.feedbackIds == listOf("public_1") &&
                        it.criteria.single().completed
                },
            )
        }
    }

    @Test
    fun `越权和并发冲突保留真实HTTP状态`() {
        every { service.create("admin", any()) } throws ApiResultException(403, "权限不足")
        every { service.update("admin", "goal_1", any()) } throws ApiResultException(409, "版本冲突")
        val body = """{"title":"目标","description":"说明","stage":"PLANNED","criteria":[{"title":"验收"}]}"""
        mvc.perform(
            post("/v1/admin/development-goals").contentType(MediaType.APPLICATION_JSON).content(body),
        ).andExpect(status().isForbidden)
        mvc.perform(
            put("/v1/admin/development-goals/goal_1").contentType(MediaType.APPLICATION_JSON).content(body),
        ).andExpect(status().isConflict).andExpect(jsonPath("$.status_code").value(409))
    }

    @Test
    fun `缺失必填字段返回400而非500`() {
        mvc.perform(post("/v1/admin/development-goals").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest)
        verify(exactly = 0) { service.create(any(), any()) }
    }

    @Test
    fun `非法分页字段返回400并且不访问服务`() {
        mvc.perform(get("/v1/development-goals?page=invalid")).andExpect(status().isBadRequest)
        verify(exactly = 0) { service.list(any(), any(), any(), any()) }
    }
}
