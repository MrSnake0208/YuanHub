package com.lhs.share.hub.controller.report.request

import io.swagger.v3.oas.annotations.media.Schema

/**
 * 更新反馈工单状态请求
 *
 * @property status 目标状态: OPEN / RESOLVED / DISMISSED
 * @property actorMode 本次操作身份意图: REPORTER / ADMIN；兼容期允许缺省
 */
data class FeedbackStatusUpdateRequest(
    val status: String,
    @field:Schema(
        description = "操作身份意图。REPORTER 要求当前用户为提交人，ADMIN 要求当前用户有板块管理权限；缺省仅在身份唯一时兼容推断",
        allowableValues = ["REPORTER", "ADMIN"],
    )
    val actorMode: String? = null,
    val reason: String? = null,
    @field:Schema(description = "管理员结案公开反馈时同时标记公开完成；false 保留原公开进度，提交人结案不生效")
    val completePublicFeedback: Boolean = true,
)
