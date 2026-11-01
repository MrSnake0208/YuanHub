package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.account.AccountShareController
import com.lhs.share.hub.controller.account.response.AccountShareResponse
import com.lhs.share.hub.controller.star.StarShareController
import com.lhs.share.hub.controller.star.response.StarShareEntry
import com.lhs.share.hub.controller.star.response.StarShareResponse
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorShareService
import com.lhs.share.hub.service.star.StarShareService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Instant

class StarShareControllerContractTest {
    private val stars = mockk<StarShareService>()
    private val shares = mockk<OperatorShareService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule()).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        mvc = MockMvcBuilders.standaloneSetup(StarShareController(stars), AccountShareController(shares, helper))
            .setControllerAdvice(OperatorExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "owner"
    }

    @Test
    fun `public projection never accepts client selected owner generation or private structure`() {
        every { stars.view("code") } returns
            StarShareResponse("如鸢", listOf("star"), true, Instant.EPOCH, listOf(StarShareEntry("main", "天府", "orange", 10)))
        mvc.perform(get("/v1/star/share/view/code").param("account_id", "foreign").param("user_id", "foreign").param("generation", "999"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.inventory[0].level").value(10))
            .andExpect(jsonPath("$.data.inventory[0].instance_id").doesNotExist())
            .andExpect(jsonPath("$.data.account_id").doesNotExist())
            .andExpect(jsonPath("$.data.generation").doesNotExist())
        verify(exactly = 1) { stars.view("code") }
    }

    @Test
    fun `unauthorized view differs from invalid token`() {
        every { stars.view("code") } throws OperatorApiException(HttpStatus.NOT_FOUND, "share_not_authorized", "Not enabled")
        mvc.perform(
            get("/v1/star/share/view/code"),
        ).andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("share_not_authorized"))
        every { stars.view("bad") } throws OperatorApiException(HttpStatus.NOT_FOUND, "share_not_found", "Not found")
        mvc.perform(
            get("/v1/star/share/view/bad"),
        ).andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("share_not_found"))
    }

    @Test
    fun `scope commands use authenticated owner and reject unknown private fields`() {
        every { shares.setScope("owner", "a", "star", true) } returns AccountShareResponse("a", true, "code", listOf("star"))
        mvc.perform(
            patch(
                "/v1/accounts/share",
            ).param("account_id", "a").contentType("application/json").content("""{"scope":"star","enabled":true}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.scopes[0]").value("star"))
        verify(exactly = 1) { shares.setScope("owner", "a", "star", true) }
        mvc.perform(
            patch(
                "/v1/accounts/share",
            ).param("account_id", "a").contentType("application/json").content("""{"scope":"star","enabled":true,"user_id":"foreign"}"""),
        )
            .andExpect(status().isUnprocessableEntity)
    }
}
