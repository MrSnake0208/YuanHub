package com.lhs.share.openapi

import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.service.jwt.JwtService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(
    properties = [
        "spring.data.mongodb.uri=mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
        "spring.data.mongodb.auto-index-creation=false",
    ],
)
@AutoConfigureMockMvc
class InventoryAgentFavoriteSecurityTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jwtService: JwtService

    @MockitoBean
    lateinit var accountService: SubAccountService

    @MockitoBean
    lateinit var eventService: AccountEventService

    @Test
    fun `agent favorites require login`() {
        mockMvc.perform(get("/v1/inventory/agent-favorites").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))
    }

    @Test
    fun `star state requires login`() {
        mockMvc.perform(get("/v1/star-state/current").param("account_id", "acc_a"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.error.code").value("unauthorized"))
    }

    @Test
    fun `authenticated SSE completion permits async dispatch`() {
        val emitter = SseEmitter()
        `when`(accountService.requireAccount("probe-user", "main")).thenReturn(
            SubAccount(userId = "probe-user", accountId = "main", name = "大号"),
        )
        `when`(eventService.subscribe("probe-user", "main")).thenReturn(emitter)
        val jwt = jwtService.issueAuthToken("probe-user", null, emptyList()).value

        val result = mockMvc.perform(
            get("/v1/accounts/main/events")
                .header("Authorization", "Bearer $jwt"),
        )
            .andExpect(status().isOk)
            .andExpect(request().asyncStarted())
            .andReturn()

        emitter.complete()

        mockMvc.perform(asyncDispatch(result))
            .andExpect(status().isOk)
    }
}
