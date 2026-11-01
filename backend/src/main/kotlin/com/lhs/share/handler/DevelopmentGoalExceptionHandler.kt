package com.lhs.share.handler

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.development.AdminDevelopmentGoalController
import com.lhs.share.hub.controller.development.DevelopmentGoalController
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [DevelopmentGoalController::class, AdminDevelopmentGoalController::class])
class DevelopmentGoalExceptionHandler {
    @ExceptionHandler(ApiResultException::class)
    fun api(e: ApiResultException): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(e.statusCode).body(ApiResult.fail(e.statusCode, e.message))

    @ExceptionHandler(HttpMessageNotReadableException::class, MethodArgumentTypeMismatchException::class)
    fun invalid(): ResponseEntity<ApiResult<Nothing>> = ResponseEntity.badRequest().body(ApiResult.fail(400, "开发目标字段格式无效"))
}
