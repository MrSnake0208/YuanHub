package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.handler.GlobalExceptionHandler
import com.lhs.share.hub.controller.report.FeedbackAccessController
import com.lhs.share.hub.controller.report.response.CurrentFeedbackAccessResponse
import com.lhs.share.hub.controller.report.response.FeedbackAreaOptionResponse
import com.lhs.share.hub.service.report.FeedbackAccessService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class FeedbackCategoryControllerContractTest {
    private val service = mockk<FeedbackAccessService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val mvc = MockMvcBuilders.standaloneSetup(FeedbackAccessController(service, helper))
        .setControllerAdvice(GlobalExceptionHandler())
        .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
        .build()

    @Test
    fun `隐藏与恢复绑定布尔状态并返回完整板块信息`() {
        every { helper.requireUserId() } returns "root"
        for (hidden in listOf(true, false)) {
            every { service.setCategoryHidden("root", "CUSTOM_TEST", hidden) } returns
                FeedbackAreaOptionResponse("CUSTOM_TEST", "历史板块", hidden = hidden)
            mvc.perform(
                put("/v1/admin/feedback-categories/CUSTOM_TEST/visibility")
                    .contentType(MediaType.APPLICATION_JSON).content("""{"hidden":$hidden}"""),
            )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.data.key").value("CUSTOM_TEST"))
                .andExpect(jsonPath("$.data.hidden").value(hidden))
            verify(exactly = 1) { service.setCategoryHidden("root", "CUSTOM_TEST", hidden) }
        }
    }

    @Test
    fun `排序路由绑定完整新旧顺序并返回目录而非命中改名路由`() {
        every { helper.requireUserId() } returns "root"
        every { service.reorderCategories("root", listOf("OTHER", "CALENDAR"), listOf("CALENDAR", "OTHER")) } returns listOf(
            FeedbackAreaOptionResponse("OTHER", "其他"),
            FeedbackAreaOptionResponse("CALENDAR", "日历", "CALENDAR", true),
        )
        mvc.perform(
            put("/v1/admin/feedback-categories/order").contentType(MediaType.APPLICATION_JSON)
                .content("""{"keys":["OTHER","CALENDAR"],"expected_keys":["CALENDAR","OTHER"]}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data[0].key").value("OTHER"))
            .andExpect(jsonPath("$.data[1].builtin_key").value("CALENDAR"))
            .andExpect(jsonPath("$.data[1].hidden").value(true))
        verify(exactly = 0) { service.renameCategory(any(), any(), any()) }
    }

    @Test
    fun `排序接口保留权限非法列表和冲突业务错误`() {
        every { helper.requireUserId() } returns "actor"
        for (code in listOf(403, 400, 409)) {
            every { service.reorderCategories("actor", any(), any()) } throws ApiResultException(code, "拒绝操作")
            mvc.perform(
                put("/v1/admin/feedback-categories/order").contentType(MediaType.APPLICATION_JSON)
                    .content("""{"keys":[],"expected_keys":[]}"""),
            ).andExpect(jsonPath("$.status_code").value(code))
        }
    }

    @Test
    fun `隐藏接口保留权限不存在和并发冲突业务错误`() {
        every { helper.requireUserId() } returns "actor"
        for (code in listOf(403, 404, 409)) {
            every { service.setCategoryHidden("actor", "CUSTOM_TEST", true) } throws ApiResultException(code, "拒绝操作")
            mvc.perform(
                put("/v1/admin/feedback-categories/CUSTOM_TEST/visibility")
                    .contentType(MediaType.APPLICATION_JSON).content("""{"hidden":true}"""),
            ).andExpect(jsonPath("$.status_code").value(code))
        }
    }

    @Test
    fun `空可选目录仍返回历史目录供管理恢复和名称展示`() {
        every { helper.requireUserId() } returns "user"
        every { service.current("user") } returns CurrentFeedbackAccessResponse(
            superAdmin = false,
            receiveAreas = emptySet(),
            manageAreas = emptySet(),
            availableAreas = emptyList(),
            categoryCatalog = listOf(FeedbackAreaOptionResponse("CUSTOM_TEST", "历史板块", hidden = true)),
        )
        mvc.perform(get("/v1/reports/access"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.available_categories").isEmpty)
            .andExpect(jsonPath("$.data.available_work_areas").isEmpty)
            .andExpect(jsonPath("$.data.category_catalog[0].hidden").value(true))
    }
}
