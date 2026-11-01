package com.lhs.share.openapi

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.OperatorCustomSpendTemplatesController
import com.lhs.share.hub.repository.OperatorCustomSpendTemplatesRepository
import com.lhs.share.hub.repository.entity.OperatorCustomSpendTemplates
import com.lhs.share.hub.service.inventory.EntityCatalogService
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import com.lhs.share.hub.service.operator.OperatorCustomSpendTemplatesService
import com.lhs.share.hub.service.operator.OperatorPlannerValidator
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
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
import java.time.Instant

class OperatorCustomSpendTemplatesContractTest {
    private val mapper = jacksonObjectMapper()
    private val repository = mockk<OperatorCustomSpendTemplatesRepository>()
    private val items = mockk<EntityCatalogService>()
    private val validator = OperatorPlannerValidator(mockk<OperatorCatalogService>(), items, mapper)
    private val service = OperatorCustomSpendTemplatesService(repository, validator, mapper)
    private val helper = mockk<AuthenticationHelper>()
    private val mvc = MockMvcBuilders.standaloneSetup(OperatorCustomSpendTemplatesController(service, helper))
        .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    private val path = "/v1/operator/custom-spend-templates"
    private val body = """{"schema_version":1,"expected_revision":0,
        "templates":[{"id":"custom-spend-lantai","label":"兰台扫荡","cost_per":10,"yield":{"__xp__":1000}}]}"""
    private val data = mutableMapOf<String, OperatorCustomSpendTemplates>()

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "owner"
        every { items.exists("item", any()) } answers { secondArg<String>() == "shuijing" }
        every { repository.find(any()) } answers { data[firstArg()] }
        every { repository.replace(any(), any(), any(), any()) } answers {
            val owner = firstArg<String>()
            val expected = secondArg<Long>()
            if ((data[owner]?.revision ?: 0) != expected) {
                null
            } else {
                OperatorCustomSpendTemplates(owner, thirdArg(), expected + 1, arg<Instant>(3)).also { data[owner] = it }
            }
        }
    }

    @Test
    fun `JWT identity owns templates regardless of account parameters and empty reads never write`() {
        mvc.perform(get(path).param("user_id", "other").param("account_id", "child"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.templates").isEmpty).andExpect(jsonPath("$.data.revision").value(0))
        verify(exactly = 0) { repository.replace(any(), any(), any(), any()) }
        mvc.perform(put(path).param("account_id", "child-a").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(1))
        mvc.perform(get(path).param("account_id", "child-b")).andExpect(jsonPath("$.data.templates[0].label").value("兰台扫荡"))
        every { helper.requireUserId() } returns "other"
        mvc.perform(get(path)).andExpect(jsonPath("$.data.templates").isEmpty)
        assertEquals(1, data.size)
    }

    @Test
    fun `CAS conflict is HTTP409 and explicit empty list clears only this main account`() {
        service.save("owner", mapper.readTree(body) as ObjectNode)
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict)
        service.save("other", mapper.readTree(body) as ObjectNode)
        mvc.perform(
            put(path).contentType(MediaType.APPLICATION_JSON).content("""{"schema_version":1,"expected_revision":1,"templates":[]}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.templates").isEmpty).andExpect(jsonPath("$.data.revision").value(2))
        assertEquals(1, service.get("other").path("templates").size())
    }

    @Test
    fun `invalid fields quantities resources duplicate IDs and builtin collisions cannot write`() {
        val valid = mapper.readTree(body) as ObjectNode
        val cases = listOf(
            valid.deepCopy().put("user_id", "other"),
            valid.deepCopy().also { (it.path("templates")[0] as ObjectNode).put("id", "stage624") },
            valid.deepCopy().also { (it.path("templates")[0] as ObjectNode).put("cost_per", -1) },
            valid.deepCopy().also { (it.path("templates")[0] as ObjectNode).put("label", " ") },
            valid.deepCopy().also { (it.path("templates")[0].path("yield") as ObjectNode).put("unknown", 1) },
            valid.deepCopy().also {
                (it.path("templates") as com.fasterxml.jackson.databind.node.ArrayNode).add(it.path("templates")[0].deepCopy<ObjectNode>())
            },
        )
        cases.forEach { request ->
            assertEquals(
                HttpStatus.UNPROCESSABLE_ENTITY,
                assertThrows(OperatorApiException::class.java) {
                    service.save("owner", request)
                }.status,
            )
        }
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isUnprocessableEntity)
        verify(exactly = 0) { repository.replace(any(), any(), any(), any()) }
    }

    @Test
    fun `unauthenticated requests cannot reach storage`() {
        every { helper.requireUserId() } throws OperatorApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "请先登录")
        mvc.perform(get(path)).andExpect(status().isUnauthorized)
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized)
        verify(exactly = 0) { repository.find(any()) }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any()) }
    }
}
