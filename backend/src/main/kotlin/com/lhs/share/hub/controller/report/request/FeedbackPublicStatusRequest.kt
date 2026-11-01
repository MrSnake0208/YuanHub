package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 管理员修改公开开发状态请求。
 *
 * @property publicStatus COLLECTING / CONFIRMED / PLANNED / IN_PROGRESS / COMPLETED / NOT_PLANNED
 */
data class FeedbackPublicStatusRequest(
    @field:NotBlank(message = "公开状态不能为空")
    @field:Size(max = 32, message = "公开状态长度不合法")
    val publicStatus: String,
)
