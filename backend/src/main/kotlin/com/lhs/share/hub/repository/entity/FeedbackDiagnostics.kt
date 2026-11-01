package com.lhs.share.hub.repository.entity

/**
 * 反馈工单应用诊断信息
 *
 * 与 [FeedbackClientInfo] 相互独立:这里只记录用户实际运行的前端版本与构建信息,
 * 不含 IP / User-Agent,且不受 clientInfoConsent 控制(无论是否勾选都会记录)。
 *
 * 旧工单没有该字段,读取时该值为 null。
 */
data class FeedbackDiagnostics(
    /** YuanHub 产品版本,例如 0.0.1-beta.1 */
    val productVersion: String? = null,
    /** 用户实际运行的前端 commit 短 SHA;无 Git 环境时为 unknown */
    val frontendCommit: String? = null,
    /** 前端构建时间,ISO-8601 */
    val buildTime: String? = null,
)
