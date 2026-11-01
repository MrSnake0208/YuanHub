package com.lhs.share.handler

import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.request.async.AsyncRequestNotUsableException

class GlobalExceptionHandlerStreamTest {
    private val mvc = MockMvcBuilders.standaloneSetup(StreamController())
        .setControllerAdvice(GlobalExceptionHandler()).build()

    @Test
    fun `disconnected event stream returns no body instead of serializing JSON as SSE`() {
        mvc.perform(get("/test/events").accept(MediaType.TEXT_EVENT_STREAM))
            .andExpect(status().isNoContent)
            .andExpect(content().string(""))
    }

    @Test
    fun `ordinary failures retain the existing error response`() {
        mvc.perform(get("/test/failure").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.statusCode").value(500))
            .andExpect(jsonPath("$.message").value("server failure"))
    }

    @RestController
    class StreamController {
        @GetMapping("/test/events")
        fun events(response: HttpServletResponse) {
            response.contentType = MediaType.TEXT_EVENT_STREAM_VALUE
            throw AsyncRequestNotUsableException("Broken pipe")
        }

        @GetMapping("/test/failure")
        fun failure(): Unit = throw RuntimeException("server failure")
    }
}
