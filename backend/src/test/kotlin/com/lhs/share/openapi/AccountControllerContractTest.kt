package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.account.AccountController
import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import org.springframework.web.context.request.async.AsyncRequestNotUsableException
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant

class AccountControllerContractTest {
    private val accountService = mockk<SubAccountService>()
    private val helper = mockk<AuthenticationHelper>()
    private val eventService = mockk<AccountEventService>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        val validator = LocalValidatorFactoryBean().apply { afterPropertiesSet() }
        mockMvc = MockMvcBuilders
            .standaloneSetup(AccountController(accountService, helper, eventService))
            .setControllerAdvice(InventoryExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .setValidator(validator)
            .build()
    }

    @Test
    fun `daily zhuyu preference requires authenticated owner and explicit expected value`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.dailyZhuyuPreference("jwt-user", "main") } returns
            mapOf("account_id" to "main", "game" to "代号鸢", "preference" to null)
        every { accountService.saveDailyZhuyuPreference("jwt-user", "main", "代号鸢", null, "baijinbi") } returns
            mapOf("account_id" to "main", "game" to "代号鸢", "preference" to "baijinbi")
        mockMvc.perform(get("/v1/accounts/main/daily-zhuyu-preference"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.account_id").value("main"))
        mockMvc.perform(
            put("/v1/accounts/main/daily-zhuyu-preference").contentType(MediaType.APPLICATION_JSON)
                .content("""{"game":"代号鸢","expected":null,"preference":"baijinbi"}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.preference").value("baijinbi"))
        mockMvc.perform(
            put("/v1/accounts/main/daily-zhuyu-preference").contentType(MediaType.APPLICATION_JSON)
                .content("""{"game":"代号鸢","preference":"baijinbi"}"""),
        )
            .andExpect(status().isUnprocessableEntity)
        verify(exactly = 1) { accountService.saveDailyZhuyuPreference("jwt-user", "main", "代号鸢", null, "baijinbi") }
    }

    @Test
    fun `panel auto fill accepts explicit false and binds authenticated owner`() {
        every { helper.requireUserId() } returns "jwt-user"
        val account = SubAccountResponse("main", "test", "如鸢", Instant.EPOCH, Instant.EPOCH, operatorPanelAutoFill = false)
        every { accountService.update("jwt-user", "main", null, null, false) } returns account
        mockMvc.perform(
            patch("/v1/accounts/main").contentType(MediaType.APPLICATION_JSON).content("""{"operator_panel_auto_fill":false}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.operator_panel_auto_fill").value(false))
        verify(exactly = 1) { accountService.update("jwt-user", "main", null, null, false) }
    }

    @Test
    fun `JWT account CRUD uses the authenticated owner on the unified endpoint`() {
        val account = SubAccountResponse("main", "大号", "代号鸢", Instant.EPOCH, Instant.EPOCH)
        val ruyuanAccount = account.copy(game = "如鸢")
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.create("jwt-user", "大号", "如鸢") } returns ruyuanAccount
        every { accountService.create("jwt-user", "默认账号", null) } returns account.copy(name = "默认账号")
        every { accountService.list("jwt-user") } returns listOf(ruyuanAccount)
        every { accountService.update("jwt-user", "main", "改名", null) } returns ruyuanAccount.copy(name = "改名")
        every { accountService.update("jwt-user", "main", null, "代号鸢") } returns account
        every { accountService.delete("jwt-user", "main") } returns Unit

        mockMvc.perform(post("/v1/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"大号\",\"game\":\"如鸢\"}"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.id").value("main"))
            .andExpect(jsonPath("$.data.game").value("如鸢"))
        mockMvc.perform(post("/v1/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"默认账号\"}"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.game").value("代号鸢"))
        mockMvc.perform(get("/v1/accounts"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data[0].name").value("大号"))
            .andExpect(jsonPath("$.data[0].game").value("如鸢"))
        mockMvc.perform(
            patch("/v1/accounts/main").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"改名\"}"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.name").value("改名"))
            .andExpect(jsonPath("$.data.game").value("如鸢"))
        mockMvc.perform(
            patch("/v1/accounts/main").contentType(MediaType.APPLICATION_JSON).content("{\"game\":\"代号鸢\"}"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.game").value("代号鸢"))
        mockMvc.perform(delete("/v1/accounts/main"))
            .andExpect(status().isOk)

        verify { accountService.create("jwt-user", "大号", "如鸢") }
        verify { accountService.create("jwt-user", "默认账号", null) }
        verify { accountService.list("jwt-user") }
        verify { accountService.update("jwt-user", "main", "改名", null) }
        verify { accountService.update("jwt-user", "main", null, "代号鸢") }
        verify { accountService.delete("jwt-user", "main") }
    }

    @Test
    fun `account errors use the inventory error shape`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.delete("jwt-user", "missing") } throws
            InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

        mockMvc.perform(delete("/v1/accounts/missing"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error.code").value("account_not_found"))
    }

    @Test
    fun `create requires a non-blank name`() {
        every { helper.requireUserId() } returns "jwt-user"

        mockMvc.perform(post("/v1/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        verify(exactly = 0) { accountService.create(any(), any()) }
    }

    @Test
    fun `account limit errors surface as conflict`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.create("jwt-user", "超额", null) } throws
            InventoryApiException(HttpStatus.CONFLICT, "account_limit_reached", "Account limit reached")

        mockMvc.perform(post("/v1/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"超额\"}"))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error.code").value("account_limit_reached"))
    }

    @Test
    fun `invalid game and empty patch return 422`() {
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.update("jwt-user", "main", null, "all") } throws
            InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_game", "game 只允许 代号鸢 或 如鸢")
        every { accountService.update("jwt-user", "main", null, null) } throws
            InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "name 或 game 至少提供一项")

        mockMvc.perform(patch("/v1/accounts/main").contentType(MediaType.APPLICATION_JSON).content("{\"game\":\"all\"}"))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("invalid_game"))
        mockMvc.perform(patch("/v1/accounts/main").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
    }

    @Test
    fun `account event stream checks ownership and disables proxy buffering`() {
        val emitter = SseEmitter()
        every { helper.requireUserId() } returns "jwt-user"
        every { accountService.requireAccount("jwt-user", "main") } returns
            SubAccount(userId = "jwt-user", accountId = "main", name = "大号")
        every { eventService.subscribe("jwt-user", "main") } returns emitter

        val response = AccountController(accountService, helper, eventService).events("main")

        assertSame(emitter, response.body)
        assertEquals("no", response.headers.getFirst("X-Accel-Buffering"))
        verify { accountService.requireAccount("jwt-user", "main") }
        verify { eventService.subscribe("jwt-user", "main") }
    }

    @Test
    fun `disconnected account event streams do not get a JSON error body`() {
        val response = InventoryExceptionHandler().clientDisconnected(
            AsyncRequestNotUsableException("Broken pipe"),
        )

        assertEquals(HttpStatus.NO_CONTENT, response.statusCode)
        assertEquals(null, response.body)
    }
}
