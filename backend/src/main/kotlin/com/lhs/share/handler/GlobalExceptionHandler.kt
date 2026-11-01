package com.lhs.share.handler

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.fail
import com.lhs.share.controller.response.ApiResultException
import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.context.request.async.AsyncRequestNotUsableException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.multipart.support.MissingServletRequestPartException
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.resource.NoResourceFoundException

private val log = KotlinLogging.logger { }

/**
 * 全局异常处理,将各种异常统一转换为 [ApiResult] 返回
 */
@RestControllerAdvice
class GlobalExceptionHandler {
    /**
     * 业务异常
     */
    @ExceptionHandler(ApiResultException::class)
    fun apiResultException(e: ApiResultException): ApiResult<Unit> {
        log.warn(e) { "业务异常" }
        return fail(e.statusCode, e.message)
    }

    /**
     * 请求参数缺失
     */
    @ExceptionHandler(MissingServletRequestParameterException::class)
    fun missingServletRequestParameterException(e: MissingServletRequestParameterException, request: HttpServletRequest): ApiResult<Unit> {
        logWarn(request, e.parameterName)
        return fail(HttpStatus.BAD_REQUEST.value(), "请求参数缺失:" + e.parameterName)
    }

    /**
     * 参数类型不匹配
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun methodArgumentTypeMismatchException(e: MethodArgumentTypeMismatchException, request: HttpServletRequest): ApiResult<Unit> {
        logWarn(request, e.name)
        return fail(HttpStatus.BAD_REQUEST.value(), "参数类型不匹配:" + e.message)
    }

    /**
     * 参数校验错误(@Valid)
     */
    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun methodArgumentNotValidException(e: MethodArgumentNotValidException): ApiResult<Unit> {
        val fieldError = e.bindingResult.fieldError
        if (fieldError != null) {
            return fail(HttpStatus.BAD_REQUEST.value(), "参数校验错误: " + fieldError.defaultMessage)
        }
        return fail(HttpStatus.BAD_REQUEST.value(), "参数校验错误: " + e.message)
    }

    /** multipart 请求超过 Spring 配置的封套上限。 */
    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun maxUploadSizeExceededException(e: MaxUploadSizeExceededException): ResponseEntity<ApiResult<Nothing>> =
        multipartError(HttpStatus.PAYLOAD_TOO_LARGE, "上传文件超过请求大小限制")

    /** multipart 格式错误或缺少文件字段。 */
    @ExceptionHandler(MissingServletRequestPartException::class)
    fun missingServletRequestPartException(e: MissingServletRequestPartException): ResponseEntity<ApiResult<Nothing>> =
        multipartError(HttpStatus.BAD_REQUEST, "缺少文件字段: ${e.requestPartName}")

    @ExceptionHandler(MultipartException::class)
    fun multipartException(e: MultipartException): ResponseEntity<ApiResult<Nothing>> {
        val isSizeOverflow = generateSequence<Throwable>(e) { it.cause }
            .any { it is MaxUploadSizeExceededException }
        return if (isSizeOverflow) {
            multipartError(HttpStatus.PAYLOAD_TOO_LARGE, "上传文件超过请求大小限制")
        } else {
            multipartError(HttpStatus.BAD_REQUEST, "multipart 请求格式错误")
        }
    }

    /**
     * 请求资源不存在
     */
    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNoResourceFoundException(e: NoResourceFoundException): ApiResult<Unit> {
        log.error { "请求资源不存在, resource: ${e.resourcePath}" }
        log.debug(e) { "请求资源不存在详细信息" }
        return fail(HttpStatus.NOT_FOUND.value(), "请求资源 " + e.resourcePath + " 不存在")
    }

    /**
     * 请求方式错误
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException::class)
    fun httpRequestMethodNotSupportedExceptionHandler(
        e: HttpRequestMethodNotSupportedException,
        request: HttpServletRequest,
    ): ApiResult<Unit> {
        logWarn(request)
        return fail(HttpStatus.METHOD_NOT_ALLOWED.value(), "请求方法不正确:" + e.message)
    }

    /**
     * 非法参数/状态/约束违反
     */
    @ExceptionHandler(IllegalArgumentException::class, IllegalStateException::class, ConstraintViolationException::class)
    fun illegalArgumentOrStateExceptionHandler(e: RuntimeException): ApiResult<Unit> {
        return fail(HttpStatus.BAD_REQUEST.value(), e.message)
    }

    /**
     * Spring 的 ResponseStatusException(如 401/404 等)
     */
    @ExceptionHandler(ResponseStatusException::class)
    fun responseStatusException(e: ResponseStatusException): ApiResult<Unit> {
        return fail(e.statusCode.value(), e.reason)
    }

    /** SSE 断连后响应已不可写,不再尝试返回 JSON。 */
    @ExceptionHandler(AsyncRequestNotUsableException::class)
    fun clientDisconnected(e: AsyncRequestNotUsableException): ResponseEntity<Void> {
        log.debug { "SSE client disconnected: ${e.message}" }
        return ResponseEntity.noContent().build()
    }

    /**
     * 兜底异常
     */
    @ExceptionHandler(Exception::class)
    fun handleException(e: Exception, request: HttpServletRequest): ApiResult<Unit> {
        log.error(e) { "未处理异常, url: ${request.requestURI}" }
        return fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), e.message)
    }

    private fun logWarn(request: HttpServletRequest, parameterName: String? = null) {
        val parameter = parameterName?.let { ", parameter: $it" }.orEmpty()
        log.warn { "请求参数异常, url: ${request.requestURI}, method: ${request.method}$parameter" }
    }

    private fun multipartError(status: HttpStatus, message: String): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(status).body(fail(status.value(), message))
}
