package com.lhs.share.hub.controller.report.response

/**
 * 反馈管理工作台可选择的产品版本。
 *
 * 只暴露版本 id / 标签 / 是否已发布，不暴露更新日志草稿正文。
 * targetVersion 可使用草稿或已发布版本；completedVersion 只允许 published=true。
 */
data class FeedbackVersionOptionResponse(
    val id: String,
    val versionLabel: String,
    val published: Boolean,
)
