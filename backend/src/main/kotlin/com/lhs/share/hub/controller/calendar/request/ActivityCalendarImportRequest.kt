package com.lhs.share.hub.controller.calendar.request

import io.swagger.v3.oas.annotations.media.Schema

data class ActivityCalendarImportRequest(
    @field:Schema(description = "原始UTF-8 JSON v1文本，最多1 MiB、1–200条；不是本地文件路径", requiredMode = Schema.RequiredMode.REQUIRED)
    val json: String,
    @field:Schema(description = "提交必填：同一原文预览返回的令牌；预览请求省略")
    val previewToken: String? = null,
)
