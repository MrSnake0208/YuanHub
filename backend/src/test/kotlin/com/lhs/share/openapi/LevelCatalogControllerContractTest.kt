package com.lhs.share.openapi

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.LevelCatalogExceptionHandler
import com.lhs.share.hub.controller.level.AdminLevelCatalogController
import com.lhs.share.hub.controller.level.LevelCatalogController
import com.lhs.share.hub.controller.level.response.LevelCatalogAdminResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogItemResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogResponse
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.level.LevelCatalogApiException
import com.lhs.share.hub.service.level.LevelCatalogService
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
import java.time.Instant

class LevelCatalogControllerContractTest {
    private val service = mockk<LevelCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorizationService = mockk<AdminAuthorizationService>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        mockMvc = MockMvcBuilders
            .standaloneSetup(
                LevelCatalogController(service),
                AdminLevelCatalogController(service, helper, authorizationService),
            )
            .setControllerAdvice(LevelCatalogExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
    }

    @Test
    fun `public catalog is available without jwt and hides operator fields`() {
        every { service.catalog(null, null, null, null, false, false) } returns LevelCatalogResponse(
            catalogVersion = "2026-09-07T00:00:00Z",
            levels = listOf(item()),
        )

        mockMvc.perform(get("/v1/level/catalog"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.catalog_version").value("2026-09-07T00:00:00Z"))
            .andExpect(jsonPath("$.data.levels[0].id").value("lvl_1"))
            .andExpect(jsonPath("$.data.levels[0].stage_id").value("stage_1"))
            .andExpect(jsonPath("$.data.levels[0].created_by").doesNotExist())
            .andExpect(jsonPath("$.data.levels[0].updated_by").doesNotExist())
    }

    @Test
    fun `admin request without jwt is rejected`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)

        mockMvc.perform(get("/v1/admin/level-catalog"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `ordinary user is forbidden by the level catalog permission`() {
        every { helper.requireUserId() } returns "user"
        every { authorizationService.hasPermission("user", AdminPermission.LEVEL_CATALOG_WRITE) } returns false

        mockMvc.perform(get("/v1/admin/level-catalog"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))
    }

    @Test
    fun `permitted administrator can create a level`() {
        every { helper.requireUserId() } returns "admin"
        every { authorizationService.hasPermission("admin", AdminPermission.LEVEL_CATALOG_WRITE) } returns true
        every { service.create("admin", any()) } returns adminItem()

        mockMvc.perform(
            post("/v1/admin/level-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"game":"代号鸢","cat_one":"主线","cat_two":"第一章","cat_three":"",
                     "name":"第一关","level_id":"level/1","stage_id":"stage_1","is_open":true}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("lvl_1"))
            .andExpect(jsonPath("$.data.revision").value(1))

        verify { service.create("admin", any()) }
    }

    @Test
    fun `explicit null end time reaches service as an explicit null node`() {
        every { helper.requireUserId() } returns "admin"
        every { authorizationService.hasPermission("admin", AdminPermission.LEVEL_CATALOG_WRITE) } returns true
        every { service.update("admin", "lvl_1", any()) } returns adminItem()

        mockMvc.perform(
            put("/v1/admin/level-catalog/lvl_1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"game":"代号鸢","cat_one":"主线","cat_two":"第一章","cat_three":"",
                     "name":"第一关","level_id":"level/1","stage_id":"stage_1","status":"ACTIVE",
                     "is_open":true,"end_time":null,"sort_order":0,"expected_revision":1}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isOk)

        verify {
            service.update("admin", "lvl_1", match { it.endTime?.isNull == true && it.expectedRevision == 1L })
        }
    }

    @Test
    fun `domain conflict keeps stable error code and status`() {
        every { helper.requireUserId() } returns "admin"
        every { authorizationService.hasPermission("admin", AdminPermission.LEVEL_CATALOG_WRITE) } returns true
        every { service.create("admin", any()) } throws LevelCatalogApiException(
            HttpStatus.CONFLICT,
            "level_conflict",
            "Level already exists",
        )

        mockMvc.perform(
            post("/v1/admin/level-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"game\":\"代号鸢\",\"cat_one\":\"主线\",\"name\":\"第一关\",\"level_id\":\"level/1\",\"stage_id\":\"stage_1\"}"),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("level_conflict"))
    }

    private fun item() = LevelCatalogItemResponse(
        id = "lvl_1",
        game = "代号鸢",
        catOne = "主线",
        catTwo = "第一章",
        catThree = "",
        name = "第一关",
        levelId = "level/1",
        stageId = "stage_1",
        status = "ACTIVE",
        isOpen = true,
        endTime = null,
        sortOrder = 0,
    )

    private fun adminItem() = LevelCatalogAdminResponse(
        id = "lvl_1",
        game = "代号鸢",
        catOne = "主线",
        catTwo = "第一章",
        catThree = "",
        name = "第一关",
        levelId = "level/1",
        stageId = "stage_1",
        status = "ACTIVE",
        isOpen = true,
        endTime = null,
        sortOrder = 0,
        revision = 1,
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        createdBy = "admin",
        updatedBy = "admin",
    )
}
