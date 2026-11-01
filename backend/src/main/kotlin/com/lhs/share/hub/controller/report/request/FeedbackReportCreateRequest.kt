package com.lhs.share.hub.controller.report.request

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 创建反馈工单请求
 *
 * @property type 反馈类型: BUG / FEATURE / CONTENT / ACCOUNT / REPORT / OTHER
 * @property category 反馈归属板块: INVENTORY / OPERATOR / LEDGER / PLAZA / ACCOUNT / UI / STAR / MAAYUAN / OTHER
 * @property area 旧版兼容字段；新请求使用 category 表示板块
 * @property title 用户提交的原始标题(公开授权时必填,最多 120 字符)
 * @property publicConsent 用户是否允许管理员整理发布到反馈广场,默认 false
 * @property content 正文(1..1000 字符)
 * @property mediaIds 关联媒体 id 列表(最多 10 个)
 * @property clientInfoConsent 是否同意附带浏览器信息
 * @property diagnostics 应用诊断信息(前端版本 / commit / 构建时间),与 clientInfoConsent 无关
 */
data class FeedbackReportCreateRequest(
    val type: String = "FEEDBACK",
    val category: String? = null,
    val area: String? = null,
    @field:Size(max = 120, message = "标题长度不能超过 120 字符")
    val title: String? = null,
    @field:NotBlank(message = "正文不能为空")
    @field:Size(max = 1000, message = "正文长度不能超过 1000 字符")
    val content: String,
    @field:Size(max = 10, message = "附件数量不能超过 10 个")
    val mediaIds: List<String> = emptyList(),
    val clientInfoConsent: Boolean = false,
    @field:Valid
    val diagnostics: FeedbackDiagnosticsRequest? = null,
    val publicConsent: Boolean = false,
    val spaceId: String = "yuanhub",
)
