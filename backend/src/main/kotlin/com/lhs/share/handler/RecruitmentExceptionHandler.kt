package com.lhs.share.handler

import com.lhs.share.hub.controller.inventory.response.InventoryError
import com.lhs.share.hub.controller.inventory.response.InventoryErrorResponse
import com.lhs.share.hub.controller.recruitment.AdminRecruitmentCatalogController
import com.lhs.share.hub.controller.recruitment.RecruitmentAccessController
import com.lhs.share.hub.controller.recruitment.RecruitmentController
import com.lhs.share.hub.controller.recruitment.RecruitmentExchangeController
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.recruitment.RecruitmentApiException
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.server.ResponseStatusException

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(
    assignableTypes = [
        RecruitmentController::class,
        RecruitmentExchangeController::class,
        RecruitmentAccessController::class,
        AdminRecruitmentCatalogController::class,
    ],
)
class RecruitmentExceptionHandler {
    private val log = KotlinLogging.logger { }

    @ExceptionHandler(RecruitmentApiException::class)
    fun recruitment(error: RecruitmentApiException) = response(error.status, error.code, error.message)

    @ExceptionHandler(InventoryApiException::class)
    fun account(error: InventoryApiException) = response(error.status, error.code, error.message)

    @ExceptionHandler(ResponseStatusException::class)
    fun authentication(error: ResponseStatusException) = response(HttpStatus.valueOf(error.statusCode.value()), "unauthorized", "请先登录")

    @ExceptionHandler(
        HttpMessageNotReadableException::class,
        MethodArgumentTypeMismatchException::class,
        MissingServletRequestParameterException::class,
        IllegalArgumentException::class,
    )
    fun validation(error: Exception) = response(HttpStatus.UNPROCESSABLE_ENTITY, "recruitment_validation_failed", "请求字段或类型不符合招募档案要求")

    @ExceptionHandler(Exception::class)
    fun unexpected(error: Exception): ResponseEntity<InventoryErrorResponse> {
        log.error(error) { "Unexpected recruitment API failure" }
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "recruitment_internal_error", "保存失败，请稍后重试；草稿可以保留")
    }

    private fun response(status: HttpStatus, code: String, message: String): ResponseEntity<InventoryErrorResponse> = ResponseEntity
        .status(status).body(InventoryErrorResponse(InventoryError(code, message)))
}
