package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.RecruitmentExceptionHandler
import com.lhs.share.hub.controller.recruitment.AdminRecruitmentCatalogController
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogImportResponse
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.recruitment.RecruitmentCatalog
import com.lhs.share.hub.service.recruitment.recruitmentConflict
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException

class AdminRecruitmentCatalogControllerContractTest {
    private val catalog = mockk<RecruitmentCatalog>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private lateinit var mvc: MockMvc
    private val pool = RecruitmentCatalogPool(
        "pool",
        "如鸢",
        "管理员池",
        revision = 1,
        upAgents = listOf(RecruitmentUpAgent("pool:up:1", "占位1")),
    )
    private val body = """
        {"pool_id":"pool","game":"如鸢","name":"管理员池","expected_revision":0,"enabled":true,
        "up_agents":[{"id":"pool:up:1","name":"占位1","operator_id":null,"active":true}]}
    """.trimIndent()

    @BeforeEach fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(AdminRecruitmentCatalogController(catalog, helper, authorization, mapper))
            .setControllerAdvice(RecruitmentExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    private fun admin() {
        every { helper.requireUserId() } returns "admin"
        every { authorization.hasPermission("admin", AdminPermission.RECRUITMENT_CATALOG_WRITE) } returns true
    }

    @Test fun `JWT and recruitment permission are required on every management endpoint`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("/v1/admin/recruitment-catalog")).andExpect(status().isUnauthorized)
        every { helper.requireUserId() } returns "user"
        every { authorization.hasPermission("user", AdminPermission.RECRUITMENT_CATALOG_WRITE) } returns false
        listOf(
            get("/v1/admin/recruitment-catalog"),
            post("/v1/admin/recruitment-catalog"),
            post("/v1/admin/recruitment-catalog/import"),
            put("/v1/admin/recruitment-catalog/pool"),
        ).forEach { request ->
            mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden)
                .andExpect(jsonPath("$.error.code").value("forbidden"))
        }
        verify { catalog wasNot io.mockk.Called }
    }

    @Test fun `administrator list create and update use stable slots snake case and explicit revision`() {
        admin()
        every { catalog.listForAdmin() } returns RecruitmentCatalogAdminResponse(listOf(pool))
        every { catalog.create("admin", any()) } returns pool
        every { catalog.importCatalog("admin", any()) } returns RecruitmentCatalogImportResponse(1, 1, listOf("legacy"), listOf("pool"))
        every { catalog.update("admin", "pool", any()) } returns pool.copy(revision = 2)
        mvc.perform(get("/v1/admin/recruitment-catalog")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.pools[0].up_agents[0].id").value("pool:up:1"))
        mvc.perform(post("/v1/admin/recruitment-catalog").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.pool_id").value("pool")).andExpect(jsonPath("$.data.revision").value(1))
        mvc.perform(
            post("/v1/admin/recruitment-catalog/import").contentType(MediaType.APPLICATION_JSON)
                .content("""{"pools":[{"pool_id":"legacy","game":"如鸢","name":"旧池","up_agent_ids":[],"up_agent_names":[]}]}"""),
        ).andExpect(status().isOk).andExpect(jsonPath("$.data.created_count").value(1))
            .andExpect(jsonPath("$.data.skipped_count").value(1))
        mvc.perform(
            put(
                "/v1/admin/recruitment-catalog/pool",
            ).contentType(MediaType.APPLICATION_JSON).content(body.replace("\"expected_revision\":0", "\"expected_revision\":1")),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(2))
        verify { catalog.create("admin", match { it.expectedRevision == 0L && it.upAgents.single().operatorId == null }) }
        verify { catalog.importCatalog("admin", match { it.path("pools").size() == 1 }) }
        verify { catalog.update("admin", "pool", match { it.expectedRevision == 1L && it.upAgents.single().id == "pool:up:1" }) }
    }

    @Test fun `wrong types absent revision unknown fields and stale writes produce explicit errors`() {
        admin()
        listOf(
            body.replace("\"expected_revision\":0,", ""),
            body.replace("\"expected_revision\":0", "\"expected_revision\":null"),
            body.replace("\"expected_revision\":0", "\"expected_revision\":0.5"),
            body.dropLast(1) + ",\"unexpected\":true}",
            body.dropLast(1) + ",\"start_date\":[2026,10,1]}",
        ).forEach { input ->
            mvc.perform(post("/v1/admin/recruitment-catalog").contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isUnprocessableEntity)
        }
        verify { catalog wasNot io.mockk.Called }
        every { catalog.update("admin", "pool", any()) } throws recruitmentConflict()
        mvc.perform(put("/v1/admin/recruitment-catalog/pool").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("recruitment_revision_conflict"))
    }

    @Test fun `hidden boolean has a strict optional contract and admin list includes it`() {
        admin()
        listOf("\"false\"", "0", "null", "[]", "{}").forEach { token ->
            mvc.perform(
                put("/v1/admin/recruitment-catalog/pool").contentType(MediaType.APPLICATION_JSON)
                    .content(body.dropLast(1) + ",\"hidden\":$token}"),
            )
                .andExpect(status().isUnprocessableEntity)
        }
        verify { catalog wasNot io.mockk.Called }
        every { catalog.update("admin", "pool", any()) } returns pool.copy(hidden = true)
        every { catalog.listForAdmin() } returns RecruitmentCatalogAdminResponse(listOf(pool.copy(hidden = true)))
        mvc.perform(
            put("/v1/admin/recruitment-catalog/pool").contentType(MediaType.APPLICATION_JSON)
                .content(body.dropLast(1) + ",\"hidden\":true}"),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.hidden").value(true))
        mvc.perform(get("/v1/admin/recruitment-catalog")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.pools[0].hidden").value(true))
        verify { catalog.update("admin", "pool", match { it.hidden == true }) }
    }
}
