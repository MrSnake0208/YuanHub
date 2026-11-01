package com.lhs.share.controller.response

/**
 * 业务异常,由 [com.lhs.share.handler.GlobalExceptionHandler] 统一转换为 [ApiResult] 返回
 *
 * @param statusCode 期望返回的 HTTP 状态码
 * @param errorMessage 返回给前端的错误信息
 */
class ApiResultException(
    val statusCode: Int,
    errorMessage: String?,
) : RuntimeException(errorMessage)
