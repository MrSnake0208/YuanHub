package com.lhs.share.openapi

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.operator.AdminOperatorCatalogController
import com.lhs.share.hub.controller.operator.request.OperatorCatalogWriteRequest
import com.lhs.share.hub.controller.operator.response.AdminOperatorCatalogResponse
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorStarStoneCatalog
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorCatalogService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

/**
 * 密探公共 API 管理端契约测试：路径前缀 `/v1/admin/operator-catalog` 的端点必须 JWT 登录且为管理员
 * 且拥有 operator_catalog:write，非管理员 403 forbidden；成功路径覆盖列表（含内部字段）/新增/更新/删除；
 * 业务错误统一映射 OperatorErrorResponse。
 */
class AdminOperatorCatalogControllerContractTest {
    private val catalogService = mockk<OperatorCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorizationService = mockk<AdminAuthorizationService>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        val validator = LocalValidatorFactoryBean().apply { afterPropertiesSet() }
        mockMvc = MockMvcBuilders
            .standaloneSetup(AdminOperatorCatalogController(catalogService, helper, authorizationService))
            .setControllerAdvice(OperatorExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .setValidator(validator)
            .build()
    }

    private fun asAdmin() {
        every { helper.requireUserId() } returns "u1"
        every { authorizationService.hasPermission("u1", AdminPermission.OPERATOR_CATALOG_WRITE) } returns true
    }

    private fun entity(id: String, name: String) = OperatorCatalogEntity(
        id = "mongo_" + id,
        operatorId = id,
        name = name,
        rarity = 5,
        specialOddityName = "增伤值",
        prof = listOf("阳"),
        subProf = emptyList(),
        games = listOf("如鸢", "代号鸢"),
        discs = emptyList(),
        starStones = listOf(OperatorStarStoneCatalog("主星石", "main")),
        catalogVersion = "2026-08-16",
        createdAt = Instant.parse("2026-08-01T00:00:00Z"),
    )

    private fun response(id: String, name: String) = AdminOperatorCatalogResponse.of(entity(id, name))

    private fun catalogBody() = """
        {
          "id": "char_001_yangxiu",
          "name": "杨修",
          "alias": "杨修",
          "rarity": 5,
          "special_oddity_name": "增伤值",
          "prof": ["阳"],
          "subProf": ["shenji"],
          "games": ["如鸢", "代号鸢"],
          "discs": [],
          "starStones": [ { "name": "主星石", "type": "main" } ],
          "spOf": null
        }
    """.trimIndent()

    @Test
    fun `unauthenticated requests are rejected with 401`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)

        mockMvc.perform(get("/v1/admin/operator-catalog"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `non-admin is forbidden with operator error body`() {
        every { helper.requireUserId() } returns "u1"
        every { authorizationService.hasPermission("u1", AdminPermission.OPERATOR_CATALOG_WRITE) } returns false

        mockMvc.perform(get("/v1/admin/operator-catalog"))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.error.code").value("forbidden"))
    }

    @Test
    fun `admin can list the full catalog including internal fields`() {
        asAdmin()
        every { catalogService.listForAdmin() } returns listOf(response("char_001_yangxiu", "杨修"))

        mockMvc.perform(get("/v1/admin/operator-catalog"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data[0].id").value("char_001_yangxiu"))
            .andExpect(jsonPath("$.data[0].star_stones[0].type").value("main"))
            .andExpect(jsonPath("$.data[0].catalog_version").value("2026-08-16"))
            .andExpect(jsonPath("$.data[0].created_at").exists())
            .andExpect(jsonPath("$.data[0].special_oddity_name").value("增伤值"))
            .andExpect(jsonPath("$.data[0].oddity_schema.attack.max").value(500))
            .andExpect(jsonPath("$.data[0].oddity_schema.hp.max").value(2600))
            .andExpect(jsonPath("$.data[0].oddity_schema.special.name").value("增伤值"))
            .andExpect(jsonPath("$.data[0].incomplete_fields").isEmpty)
    }

    @Test
    fun `admin can create a catalog operator`() {
        asAdmin()
        every { catalogService.create(any()) } returns response("char_001_yangxiu", "杨修")

        mockMvc.perform(
            post("/v1/admin/operator-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content(catalogBody()),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("char_001_yangxiu"))
            .andExpect(jsonPath("$.data.oddity_schema.special.max").value(15))

        verify { catalogService.create(match<OperatorCatalogWriteRequest> { it.id == "char_001_yangxiu" }) }
    }

    @Test
    fun `admin can update a catalog operator`() {
        asAdmin()
        every { catalogService.update("char_001_yangxiu", any()) } returns response("char_001_yangxiu", "杨修")

        mockMvc.perform(
            put("/v1/admin/operator-catalog/char_001_yangxiu")
                .contentType(MediaType.APPLICATION_JSON)
                .content(catalogBody()),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("char_001_yangxiu"))

        verify { catalogService.update("char_001_yangxiu", any()) }
    }

    @Test
    fun `camelCase special name remains accepted by the administrator request`() {
        asAdmin()
        every { catalogService.update("char_001_yangxiu", any()) } returns response("char_001_yangxiu", "杨修")
        val body = catalogBody().replace(
            "\"special_oddity_name\": \"增伤值\"",
            "\"specialOddityName\": \"免伤值\"",
        )

        mockMvc.perform(
            put("/v1/admin/operator-catalog/char_001_yangxiu")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body),
        ).andExpect(status().isOk)

        verify { catalogService.update("char_001_yangxiu", match { it.specialOddityName == "免伤值" }) }
    }

    @Test
    fun `client supplied derived oddity fields cannot override the response`() {
        asAdmin()
        every { catalogService.create(any()) } returns response("char_001_yangxiu", "杨修")
        val body = catalogBody().dropLast(1) +
            ", \"oddity_schema\": {\"attack\":{\"name\":\"伪造\",\"max\":999}}, \"incomplete_fields\":[\"fake\"] }"

        mockMvc.perform(
            post("/v1/admin/operator-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.oddity_schema.attack.name").value("攻击力"))
            .andExpect(jsonPath("$.data.oddity_schema.attack.max").value(500))
            .andExpect(jsonPath("$.data.incomplete_fields").isEmpty)
    }

    @Test
    fun `admin can delete a catalog operator`() {
        asAdmin()
        every { catalogService.delete("char_001_yangxiu") } returns Unit

        mockMvc.perform(delete("/v1/admin/operator-catalog/char_001_yangxiu"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data").value(true))

        verify { catalogService.delete("char_001_yangxiu") }
    }

    @Test
    fun `conflict is mapped to 409 operator_conflict`() {
        asAdmin()
        every { catalogService.create(any()) } throws
            OperatorApiException(HttpStatus.CONFLICT, "operator_conflict", "Operator already exists")

        mockMvc.perform(
            post("/v1/admin/operator-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content(catalogBody()),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("operator_conflict"))
    }

    @Test
    fun `bean validation failure is mapped to 422 schema_validation_failed`() {
        asAdmin()
        mockMvc.perform(
            post("/v1/admin/operator-catalog")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{ "rarity": 5, "games": ["如鸢"] }"""),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    @Test
    fun `create missing or blank special name is rejected with 422`() {
        asAdmin()
        every { catalogService.create(match { it.specialOddityName == null }) } throws
            OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "special_oddity_name is required")
        every { catalogService.create(match { it.specialOddityName?.isBlank() == true }) } throws
            OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "special_oddity_name length must be 1..32")

        val missing = catalogBody().lineSequence()
            .filterNot { it.contains("special_oddity_name") }
            .joinToString("\n")
        val blank = catalogBody().replace("\"special_oddity_name\": \"增伤值\"", "\"special_oddity_name\": \"   \"")

        mockMvc.perform(post("/v1/admin/operator-catalog").contentType(MediaType.APPLICATION_JSON).content(missing))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        mockMvc.perform(post("/v1/admin/operator-catalog").contentType(MediaType.APPLICATION_JSON).content(blank))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }
}
