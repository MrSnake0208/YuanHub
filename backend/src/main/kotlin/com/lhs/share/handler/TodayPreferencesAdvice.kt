package com.lhs.share.handler

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.hub.controller.today.TodayPreferencesController
import org.springframework.core.MethodParameter
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpInputMessage
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter
import java.io.ByteArrayInputStream
import java.lang.reflect.Type

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [TodayPreferencesController::class])
class TodayPreferencesAdvice : RequestBodyAdviceAdapter() {
    override fun supports(parameter: MethodParameter, targetType: Type, converterType: Class<out HttpMessageConverter<*>>): Boolean = true

    override fun beforeBodyRead(
        inputMessage: HttpInputMessage,
        parameter: MethodParameter,
        targetType: Type,
        converterType: Class<out HttpMessageConverter<*>>,
    ): HttpInputMessage {
        // 同时限制Content-Length和无长度/分块请求，解析JSON前最多读取4KiB+1。
        if (inputMessage.headers.contentLength > 4096) throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "首页设置请求不得超过4KiB")
        val bytes = inputMessage.body.readNBytes(4097)
        if (bytes.size > 4096) throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "首页设置请求不得超过4KiB")
        return object : HttpInputMessage {
            override fun getHeaders() = inputMessage.headers
            override fun getBody() = ByteArrayInputStream(bytes)
        }
    }

    @ExceptionHandler(ResponseStatusException::class)
    fun api(error: ResponseStatusException): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(error.statusCode).body(ApiResult.fail(error.statusCode.value(), error.reason))

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun invalid(error: HttpMessageNotReadableException): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.unprocessableEntity().body(ApiResult.fail(422, "首页设置必须为合法JSON"))
}
