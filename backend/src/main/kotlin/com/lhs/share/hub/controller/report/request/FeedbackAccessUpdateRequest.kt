package com.lhs.share.hub.controller.report.request

/** 超级管理员更新用户的反馈模块权限。 */
data class FeedbackAccessUpdateRequest(
    val receiveCategories: Set<String>? = null,
    val manageCategories: Set<String>? = null,
    val receiveAreas: Set<String>? = null,
    val manageAreas: Set<String>? = null,
    val feedbackRoles: Set<String>? = null,
    val operatorAreas: Set<String>? = null,
    val developerAreas: Set<String>? = null,
)
