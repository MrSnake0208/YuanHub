package com.lhs.share.hub.repository.entity

/**
 * 反馈工单客户端信息
 *
 * 仅在用户同意(clientInfoConsent=true)时保存,用于辅助排查问题。
 */
data class FeedbackClientInfo(
    /** 用户代理字符串 */
    val userAgent: String? = null,
    /** 客户端 IP 地址 */
    val ip: String? = null,
    /** IP 地理位置 */
    val ipLocation: String? = null,
)