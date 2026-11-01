package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.hub.work.controller.WorkController
import com.lhs.share.hub.work.controller.WorkExceptionHandler
import com.lhs.share.hub.work.model.CompatibilityStatus
import com.lhs.share.hub.work.model.MaaYuanTargetDocument
import com.lhs.share.hub.work.model.WorkCompatibilityResponse
import com.lhs.share.hub.work.model.WorkConversion
import com.lhs.share.hub.work.model.WorkDetailResponse
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkMetadata
import com.lhs.share.hub.work.model.WorkPageResponse
import com.lhs.share.hub.work.model.WorkRound
import com.lhs.share.hub.work.model.WorkSource
import com.lhs.share.hub.work.model.WorkTarget
import com.lhs.share.hub.work.model.YuanAssistConfig
import com.lhs.share.hub.work.model.YuanAssistInstruction
import com.lhs.share.hub.work.model.YuanAssistTargetDocument
import com.lhs.share.hub.work.service.WorkApiException
import com.lhs.share.hub.work.service.WorkRevisionConflictException
import com.lhs.share.hub.work.service.WorkService
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class WorkControllerContractTest {
    private val service = mockk<WorkService>()
    private val authentication = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        every { authentication.obtainUserId() } returns null
        mockMvc = MockMvcBuilders.standaloneSetup(WorkController(service, authentication))
            .setControllerAdvice(WorkExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
    }

    @Test
    fun `detail uses ApiResult snake case preserves raw source and omits null protocol optionals`() {
        every { service.get("7", null) } returns detail()

        mockMvc.perform(get("/v1/works/7"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(200))
            .andExpect(jsonPath("$.data.conversion.status").value("exact"))
            .andExpect(jsonPath("$.data.work.stage_name").value("测试关卡"))
            .andExpect(jsonPath("$.data.work.level_id").doesNotExist())
            .andExpect(jsonPath("$.data.work.exec").doesNotExist())
            .andExpect(jsonPath("$.data.work.rounds[0].remark").doesNotExist())
            .andExpect(jsonPath("$.data.source.raw_content").value(RAW))
    }

    @Test
    fun `list is paged with one based defaults`() {
        every { service.list(1, 20) } returns WorkPageResponse(1, 20, 0, false, emptyList())

        mockMvc.perform(get("/v1/works"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.page").value(1))
            .andExpect(jsonPath("$.data.has_next").value(false))
    }

    @Test
    fun `compatibility success exposes target status and compiled document`() {
        every { service.compatibility("7", "MAAYUAN", null) } returns WorkCompatibilityResponse(
            target = WorkTarget.MAAYUAN,
            status = CompatibilityStatus.EXACT,
            issues = emptyList(),
            targetDocument = MaaYuanTargetDocument(mapOf("1" to listOf(listOf("1普")))),
        )

        mockMvc.perform(get("/v1/works/7/compatibility?to=MAAYUAN"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.target").value("MAAYUAN"))
            .andExpect(jsonPath("$.data.status").value("exact"))
            .andExpect(jsonPath("$.data.target_document.round_actions['1'][0][0]").value("1普"))
    }

    @Test
    fun `YUANASSIST target document preserves native camel case inside snake case envelope`() {
        every { service.compatibility("7", "YUANASSIST", null) } returns WorkCompatibilityResponse(
            target = WorkTarget.YUANASSIST,
            status = CompatibilityStatus.EXACT,
            issues = emptyList(),
            targetDocument = YuanAssistTargetDocument(
                scriptContent = "1回合\t1A\t\t\t\t",
                instructions = listOf(YuanAssistInstruction(1, 1, "PAUSE", 0)),
                config = YuanAssistConfig(1000, 2000, 8000),
            ),
        )

        mockMvc.perform(get("/v1/works/7/compatibility?to=YUANASSIST"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.target_document.scriptContent").value("1回合\t1A\t\t\t\t"))
            .andExpect(jsonPath("$.data.target_document.script_content").doesNotExist())
            .andExpect(jsonPath("$.data.target_document.config.intervalAttack").value(1000))
            .andExpect(jsonPath("$.data.target_document.config.intervalSkill").value(2000))
            .andExpect(jsonPath("$.data.target_document.config.waitTurn").value(8000))
            .andExpect(jsonPath("$.data.target_document.instructions[0].type").value("PAUSE"))
    }

    @Test
    fun `bad target and hidden work keep real HTTP statuses`() {
        every { service.compatibility("7", "OTHER", null) } throws WorkApiException(HttpStatus.BAD_REQUEST, "bad target")
        every { service.get("8", null) } throws WorkApiException(HttpStatus.NOT_FOUND, "作业不存在")

        mockMvc.perform(get("/v1/works/7/compatibility?to=OTHER"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status_code").value(400))
        mockMvc.perform(get("/v1/works/8"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.status_code").value(404))
    }

    @Test
    fun `unknown input action returns structured json path`() {
        mockMvc.perform(
            post("/v1/works/compatibility?to=MAAYUAN")
                .contentType("application/json")
                .content(
                    """
                    {"document":{"format":"yuanhub-work","version":1,"game":"如鸢","stage_name":"测试关卡",
                    "doc":{"title":"测试","details":""},"operators":["一","二","三","四","五"],
                    "rounds":[{"round":1,"actions":[{"type":"unknown"}]}]}}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status_code").value(400))
            .andExpect(jsonPath("$.data[0].code").value("unknown_type"))
            .andExpect(jsonPath("$.data[0].path").value("$.rounds[0].actions[0].type"))
    }

    @Test
    fun `unknown protocol field is rejected instead of discarded`() {
        mockMvc.perform(
            post("/v1/works/compatibility?to=MAAYUAN")
                .contentType("application/json")
                .content(
                    """
                    {"document":{"format":"yuanhub-work","version":1,"game":"如鸢","stage_name":"测试关卡",
                    "doc":{"title":"测试","details":""},"operators":["一","二","三","四","五"],
                    "rounds":[{"round":1,"actions":[{"slot":1,"type":"attack","unknown":true}]}]}}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.data[0].code").value("invalid_json"))
            .andExpect(jsonPath("$.data[0].path").value("$.rounds[0].actions[0].unknown"))
    }

    @Test
    fun `unknown condition reports its discriminator path`() {
        mockMvc.perform(
            post("/v1/works/compatibility?to=MAAYUAN")
                .contentType("application/json")
                .content(
                    """
                    {"document":{"format":"yuanhub-work","version":1,"game":"如鸢","stage_name":"测试关卡",
                    "doc":{"title":"测试","details":""},"operators":["一","二","三","四","五"],
                    "rounds":[{"round":1,"actions":[{"type":"check","condition":{"type":"unknown"},"on_fail":"restart"}]}]}}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.data[0].code").value("unknown_type"))
            .andExpect(jsonPath("$.data[0].path").value("$.rounds[0].actions[0].condition.type"))
    }

    @Test
    fun `required action fields cannot be filled from model defaults`() {
        mockMvc.perform(
            post("/v1/works/compatibility?to=MAAYUAN")
                .contentType("application/json")
                .content(
                    """
                    {"document":{"format":"yuanhub-work","version":1,"game":"如鸢","stage_name":"测试关卡",
                    "doc":{"title":"测试","details":""},"operators":["一","二","三","四","五"],
                    "rounds":[{"round":1,"actions":[{"type":"check","condition":{"type":"crit"}}]}]}}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.data[0].code").value("invalid_json"))
            .andExpect(jsonPath("$.data[0].path").value("$.rounds[0].actions[0].on_fail"))
    }

    @Test
    fun `revision conflict exposes current revision`() {
        every { authentication.requireUserId() } returns "u1"
        every { service.update("u1", "w_66ed00000000000000000001", 1, any()) } throws WorkRevisionConflictException(3)

        mockMvc.perform(
            put("/v1/works/w_66ed00000000000000000001")
                .contentType("application/json")
                .content(
                    """
                    {"expected_revision":1,"document":{"format":"yuanhub-work","version":1,"game":"如鸢",
                    "stage_name":"测试关卡","doc":{"title":"测试","details":""},
                    "operators":["一","二","三","四","五"],
                    "rounds":[{"round":1,"actions":[{"slot":1,"type":"attack"}]}]}}
                    """.trimIndent(),
                ),
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.status_code").value(409))
            .andExpect(jsonPath("$.data.current_revision").value(3))
    }

    private fun detail() = WorkDetailResponse(
        metadata = WorkMetadata("7", "测试", null, null, 1, 2.0, 3),
        level = null,
        conversion = WorkConversion(CompatibilityStatus.EXACT, emptyList()),
        work = WorkDocument(
            format = "yuanhub-work",
            version = 1,
            game = "如鸢",
            stageName = "测试关卡",
            doc = WorkDoc("测试", ""),
            operators = listOf("一", "二", "三", "四", "五"),
            rounds = listOf(WorkRound(1, actions = listOf(com.lhs.share.hub.work.model.SlotAction(1, "attack")))),
        ),
        source = WorkSource(id = "7", rawContent = RAW),
    )

    private companion object {
        const val RAW = "{\"stage_name\":\"测试关卡\"}"
    }
}
