package com.lhs.share.openapi

import com.lhs.share.hub.controller.operator.response.OperatorShareViewResponse
import com.lhs.share.hub.service.operator.OperatorShareService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(
    properties = [
        "spring.data.mongodb.uri=mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
        "spring.data.mongodb.auto-index-creation=false",
    ],
)
@AutoConfigureMockMvc
class OperatorShareSecurityTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var shareService: OperatorShareService

    @MockitoBean
    lateinit var starShares: com.lhs.share.hub.service.star.StarShareService

    @Test
    fun `anonymous viewers cannot enable tag publication`() {
        mockMvc.perform(
            patch("/v1/accounts/share").param("account_id", "a").contentType("application/json")
                .content("""{"scope":"operator_tags","enabled":true}"""),
        ).andExpect(status().isUnauthorized)
        org.mockito.Mockito.verifyNoInteractions(shareService)
    }

    @Test
    fun `star views are public but account share commands and private current state are not`() {
        `when`(
            starShares.view("star-code"),
        ).thenReturn(com.lhs.share.hub.controller.star.response.StarShareResponse("如鸢", listOf("star"), false, null, emptyList()))
        mockMvc.perform(get("/v1/star/share/view/star-code")).andExpect(status().isOk)
        mockMvc.perform(get("/v1/accounts/share").param("account_id", "a")).andExpect(status().isUnauthorized)
        mockMvc.perform(
            patch(
                "/v1/accounts/share",
            ).param("account_id", "a").contentType("application/json").content("""{"scope":"star","enabled":true}"""),
        ).andExpect(status().isUnauthorized)
        mockMvc.perform(post("/v1/accounts/share/regenerate").param("account_id", "a")).andExpect(status().isUnauthorized)
        mockMvc.perform(delete("/v1/accounts/share").param("account_id", "a")).andExpect(status().isUnauthorized)
        mockMvc.perform(get("/v1/star-state/current").param("account_id", "a")).andExpect(status().isUnauthorized)
        org.mockito.Mockito.verify(betaService, org.mockito.Mockito.never()).requireAccess(org.mockito.ArgumentMatchers.anyString())
    }

    @Test
    fun `only the view path is public`() {
        `when`(shareService.view("code")).thenReturn(
            OperatorShareViewResponse("代号鸢", "2026-09-03", Instant.EPOCH, emptyMap()),
        )

        mockMvc.perform(get("/v1/operator/share/view/code"))
            .andExpect(status().isOk)

        mockMvc.perform(get("/v1/operator/share").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
        mockMvc.perform(put("/v1/operator/share").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
        mockMvc.perform(post("/v1/operator/share/regenerate").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
        mockMvc.perform(delete("/v1/operator/share").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
    }
}
