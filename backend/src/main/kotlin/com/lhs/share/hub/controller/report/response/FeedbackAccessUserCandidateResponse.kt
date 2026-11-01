package com.lhs.share.hub.controller.report.response

import com.lhs.share.repository.entity.MaaUser

/** 反馈权限配置专用用户候选信息, 不扩展公开 MaaUserInfo。 */
data class FeedbackAccessUserCandidateResponse(
    val id: String,
    val userName: String,
    val email: String,
    val activated: Boolean,
) {
    constructor(user: MaaUser) : this(
        id = user.userId!!,
        userName = user.userName,
        email = user.email,
        activated = user.status > 0,
    )
}
