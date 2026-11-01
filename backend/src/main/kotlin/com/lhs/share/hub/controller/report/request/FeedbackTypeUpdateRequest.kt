package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 管理员修改反馈类型请求。
 *
 * 类型影响反馈广场展示与许愿池归属(visibility=PUBLIC AND type=FEATURE)。
 *
 * @property type BUG / EXPERIENCE / FEATURE / CONTENT / ACCOUNT / REPORT / OTHER
 */
data class FeedbackTypeUpdateRequest(
    @field:NotBlank(message = "反馈类型不能为空")
    @field:Size(max = 32, message = "反馈类型长度不合法")
    val type: String,
)
