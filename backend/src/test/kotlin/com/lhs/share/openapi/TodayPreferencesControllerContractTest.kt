package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.GlobalExceptionHandler
import com.lhs.share.handler.TodayPreferencesAdvice
import com.lhs.share.hub.controller.today.TodayPreferencesController
import com.lhs.share.hub.repository.TodayPreferencesRepository
import com.lhs.share.hub.repository.entity.TodayPreferences
import com.lhs.share.hub.service.today.TodayPreferencesService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpInputMessage
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayInputStream
import java.time.Instant

class TodayPreferencesControllerContractTest {
    private val repository = mockk<TodayPreferencesRepository>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mvc: MockMvc
    private val path = "/v1/today/preferences"
    private val body = """{"schema_version":1,"expected_version":0,"hidden_modules":["training"]}"""

    @BeforeEach
    fun setup() {
        every { helper.requireUserId() } returns "owner"
        val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        mvc = MockMvcBuilders.standaloneSetup(TodayPreferencesController(TodayPreferencesService(repository), helper))
            .setControllerAdvice(
                TodayPreferencesAdvice(),
                GlobalExceptionHandler(),
            ).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `snake case contract is private no store and reads use authenticated identity`() {
        every { repository.find("owner", "desktop") } returns null
        mvc.perform(get("$path/desktop").param("user_id", "other"))
            .andExpect(status().isOk).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.layout_mode").value("desktop"))
            .andExpect(jsonPath("$.data.schema_version").value(1))
            .andExpect(jsonPath("$.data.version").value(0))
            .andExpect(jsonPath("$.data.hidden_modules").isEmpty)
            .andExpect(jsonPath("$.data.user_id").doesNotExist())
        verify(exactly = 1) { repository.find("owner", "desktop") }
        verify(exactly = 0) { repository.replace(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `writes use authenticated owner and conflict is real HTTP 409`() {
        every { repository.replace("owner", "mobile", 0, listOf("training"), any()) } returns
            TodayPreferences("one", "owner", "mobile", listOf("training"), updatedAt = Instant.EPOCH)
        mvc.perform(put("$path/mobile").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.version").value(1))
        every { repository.replace("owner", "mobile", 0, listOf("training"), any()) } returns null
        mvc.perform(put("$path/mobile").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict).andExpect(jsonPath("$.status_code").value(409))
    }

    @Test
    fun `invalid fields malformed JSON and oversized body are rejected before persistence`() {
        for (json in listOf("{", "{}", body.dropLast(1) + ",\"user_id\":\"other\"}")) {
            mvc.perform(
                put("$path/desktop").contentType(MediaType.APPLICATION_JSON).content(json),
            ).andExpect(status().isUnprocessableEntity)
        }
        mvc.perform(put("$path/desktop").contentType(MediaType.APPLICATION_JSON).content(body + " ".repeat(4097)))
            .andExpect(status().isPayloadTooLarge)
        mvc.perform(get("$path/tablet")).andExpect(status().isUnprocessableEntity)
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `unauthenticated reads and writes never reach database`() {
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录")
        mvc.perform(get("$path/desktop")).andExpect(status().isUnauthorized)
        mvc.perform(put("$path/mobile").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized)
        verify { repository wasNot io.mockk.Called }
    }

    @Test
    fun `size limit also rejects streaming bodies without Content-Length`() {
        val input = object : HttpInputMessage {
            override fun getHeaders() = HttpHeaders()
            override fun getBody() = ByteArrayInputStream(ByteArray(4097) { 32 })
        }
        val error = assertThrows(ResponseStatusException::class.java) {
            TodayPreferencesAdvice().beforeBodyRead(input, mockk(), String::class.java, MappingJackson2HttpMessageConverter::class.java)
        }
        assertEquals(413, error.statusCode.value())
    }

    @Test
    fun `read and write failures are errors rather than default preferences or success`() {
        every { repository.find(any(), any()) } throws org.springframework.dao.DataAccessResourceFailureException("read unavailable")
        mvc.perform(get("$path/desktop")).andExpect(jsonPath("$.status_code").value(500))
        every { repository.replace(any(), any(), any(), any(), any()) } throws
            org.springframework.dao.DataAccessResourceFailureException("write unavailable")
        mvc.perform(put("$path/mobile").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(jsonPath("$.status_code").value(500)).andExpect(jsonPath("$.data").doesNotExist())
    }
}
