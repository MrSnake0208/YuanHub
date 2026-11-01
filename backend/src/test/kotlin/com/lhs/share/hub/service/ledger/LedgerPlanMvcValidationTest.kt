package com.lhs.share.hub.service.ledger

import com.lhs.share.service.jwt.JwtService
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * 账房接口 Bean Validation 回归测试(全上下文 MockMvc)。
 *
 * 背景:曾出现「@Valid 写在类型前(param: @Valid T)导致注解未落入 JVM 参数注解、
 * Spring 静默跳过校验」的全项目问题,修复后以本测试守护。
 *
 * 断言口径:本项目 GlobalExceptionHandler 不带 @ResponseStatus,HTTP 恒为 200,
 * 业务状态码在响应体 status_code(前端 request.js 亦以 status_code 判定)。
 * 仅测 400 分支(校验失败不触达服务层,不写库,不污染共享 Mongo)。
 */
@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(
    properties = [
        "spring.data.mongodb.uri=mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
        "spring.data.mongodb.auto-index-creation=false",
    ],
)
@AutoConfigureMockMvc
class LedgerPlanMvcValidationTest {
    // Parameter validation must reach MVC without using any real rate-limit Redis.
    @org.springframework.test.context.bean.override.mockito.MockitoBean(answers = org.mockito.Answers.RETURNS_DEEP_STUBS)
    lateinit var redis: org.springframework.data.redis.core.StringRedisTemplate

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var plans: LedgerPlanService

    @org.junit.jupiter.api.AfterEach
    fun invalidRequestsNeverReachTheWriteService() {
        org.mockito.Mockito.verifyNoInteractions(plans)
    }

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jwtService: JwtService

    private fun postBody(body: String) = mockMvc.perform(
        post("/hub/ledger/plan")
            .header("Authorization", "Bearer " + jwtService.issueAuthToken("probe-user", null, emptyList()).value)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body),
    )

    @Test
    fun `空方案名返回业务码 400`() {
        postBody(
            "{\"name\":\"\",\"version\":\"daihao\",\"initial_points\":0,\"cart_items\":[],\"custom_packages\":[]}",
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(400))
            .andExpect(jsonPath("$.message", containsString("方案名不能为空")))
    }

    @Test
    fun `方案名超 50 字返回业务码 400`() {
        val longName = "长".repeat(51)
        postBody(
            "{\"name\":\"$longName\",\"version\":\"daihao\",\"initial_points\":0,\"cart_items\":[],\"custom_packages\":[]}",
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(400))
            .andExpect(jsonPath("$.message", containsString("方案名最长 50 个字符")))
    }

    @Test
    fun `非法版本返回业务码 400`() {
        postBody(
            "{\"name\":\"坏版本\",\"version\":\"xxx\",\"initial_points\":0,\"cart_items\":[],\"custom_packages\":[]}",
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(400))
            .andExpect(jsonPath("$.message", containsString("版本仅支持 daihao 或 ru")))
    }
}
