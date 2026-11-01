package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 管理员发布反馈到反馈广场请求。
 *
 * @property publicTitle 公开标题(必填,管理员整理)
 * @property publicSummary 公开摘要(可选)
 * @property publicStatus 公开开发状态(可选,默认 COLLECTING)
 */
data class FeedbackPublishRequest(
    @field:NotBlank(message = "公开标题不能为空")
    @field:Size(max = 120, message = "公开标题长度不能超过 120 字符")
    val publicTitle: String,
    @field:Size(max = 1000, message = "公开摘要长度不能超过 1000 字符")
    val publicSummary: String? = null,
    @field:Size(max = 32, message = "公开状态长度不合法")
    val publicStatus: String? = null,
)
