package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.GlobalExceptionHandler
import com.lhs.share.hub.controller.media.MediaController
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.service.media.MediaStorageService
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException

class MediaControllerContractTest {
    private val storageService = mockk<MediaStorageService>()
    private val helper = mockk<AuthenticationHelper>()
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val mapper = jacksonObjectMapper()
            .registerModule(JavaTimeModule())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        val properties = ShareProperties().apply { info.publicBaseUrl = "https://api.example.test/" }
        mockMvc = MockMvcBuilders
            .standaloneSetup(MediaController(storageService, helper, properties))
            .setControllerAdvice(GlobalExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
            .build()
        every { helper.requireUserId() } returns "u1"
    }

    @Test
    fun `upload success returns ApiResult media data with absolute URL`() {
        every { storageService.upload("u1", any()) } returns MediaAsset(
            id = "med_0123456789abcdef",
            ownerUserId = "u1",
            originalName = "screen.png",
            mime = "image/png",
            size = 9,
            storagePath = "/media/med_0123456789abcdef.png",
        )

        mockMvc.perform(
            multipart("/v1/media/upload")
                .file(MockMultipartFile("file", "screen.png", "image/png", pngBytes()))
                .contentType(MediaType.MULTIPART_FORM_DATA),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status_code").value(200))
            .andExpect(jsonPath("$.data.id").value("med_0123456789abcdef"))
            .andExpect(jsonPath("$.data.url").value("https://api.example.test/media/med_0123456789abcdef.png"))
            .andExpect(jsonPath("$.data.mime").value("image/png"))
    }

    @Test
    fun `missing multipart file returns HTTP 400 ApiResult`() {
        mockMvc.perform(multipart("/v1/media/upload"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status_code").value(400))
    }

    @Test
    fun `multipart size overflow returns HTTP 413 ApiResult`() {
        every { storageService.upload("u1", any()) } throws MultipartException(
            "wrapped size overflow",
            MaxUploadSizeExceededException(12 * 1024 * 1024L),
        )

        mockMvc.perform(
            multipart("/v1/media/upload")
                .file(MockMultipartFile("file", "screen.png", "image/png", pngBytes())),
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(jsonPath("$.status_code").value(413))
    }

    @Test
    fun `malformed multipart returns HTTP 400 ApiResult`() {
        every { storageService.upload("u1", any()) } throws MultipartException("malformed")

        mockMvc.perform(
            multipart("/v1/media/upload")
                .file(MockMultipartFile("file", "screen.png", "image/png", pngBytes())),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status_code").value(400))
    }

    private fun pngBytes(): ByteArray = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte(),
        0x00,
    )
}
