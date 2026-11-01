package com.lhs.share.controller.response

import com.fasterxml.jackson.annotation.JsonInclude

/**
 * 统一 Controller 返回包装
 *
 * @param statusCode 状态码,语义对齐 HTTP 状态码
 * @param message    提示信息,成功时可空
 * @param data       业务数据,失败时为 null
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ApiResult<out T>(
    val statusCode: Int,
    val message: String?,
    val data: T?,
) {
    companion object {
        fun <T> success(data: T): ApiResult<T> = success(null, data)

        fun success(): ApiResult<Unit> = success(null, Unit)

        fun <T> success(msg: String?, data: T?): ApiResult<T> = ApiResult(200, msg, data)

        fun fail(code: Int, msg: String?): ApiResult<Nothing> = ApiResult(code, msg, null)
    }
}
