package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.Size

/**
 * 管理员关联反馈目标/完成版本请求。
 *
 * 版本使用更新日志条目 id(chg_…);null 或空字符串表示清除。
 *
 * @property targetVersionId 目标版本更新日志 id(可为草稿)
 * @property completedVersionId 完成版本更新日志 id(必须是已发布版本)
 */
data class FeedbackVersionRequest(
    @field:Size(max = 64, message = "目标版本 id 长度不合法")
    val targetVersionId: String? = null,
    @field:Size(max = 64, message = "完成版本 id 长度不合法")
    val completedVersionId: String? = null,
)
