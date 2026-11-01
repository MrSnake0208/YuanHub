package com.lhs.share.hub.controller.report.request

import jakarta.validation.constraints.Size

/**
 * 反馈工单应用诊断信息请求
 *
 * 由前端在创建反馈时自动附带,记录用户实际运行的前端版本与构建信息。
 * 与 [FeedbackReportCreateRequest.clientInfoConsent] 无关:版本与 Build 属于应用诊断信息,
 * 即使用户未同意保存浏览器 / IP 信息也会记录。
 *
 * @property productVersion YuanHub 产品版本
 * @property frontendCommit 前端 commit 短 SHA
 * @property buildTime 前端构建时间
 */
data class FeedbackDiagnosticsRequest(
    @field:Size(max = 64, message = "产品版本长度不能超过 64 字符")
    val productVersion: String? = null,
    @field:Size(max = 64, message = "前端 commit 长度不能超过 64 字符")
    val frontendCommit: String? = null,
    @field:Size(max = 64, message = "构建时间长度不能超过 64 字符")
    val buildTime: String? = null,
)
