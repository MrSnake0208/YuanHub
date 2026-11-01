package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 管理员合并重复反馈请求。
 *
 * @property targetFeedbackId 目标反馈 id;若目标是已合并反馈,服务端会解析到最终主反馈
 */
data class FeedbackMergeRequest(
    @field:NotBlank(message = "目标反馈不能为空")
    @field:Size(max = 64, message = "目标反馈 id 长度不合法")
    val targetFeedbackId: String,
)
