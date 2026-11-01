package com.lhs.share.hub.controller.recruitment.response

import com.lhs.share.hub.repository.entity.RecruitmentAccessMode
import com.lhs.share.repository.entity.MaaUser
import java.time.Instant

data class RecruitmentAccessMeResponse(
    val accessMode: RecruitmentAccessMode,
    val granted: Boolean,
    val canAccess: Boolean,
)

data class RecruitmentAccessGrantResponse(
    val userId: String,
    val userName: String,
    val activated: Boolean,
    val grantedBy: String,
    val grantedAt: Instant,
)

data class RecruitmentAccessAdminResponse(
    val accessMode: RecruitmentAccessMode,
    val version: Long,
    val grants: List<RecruitmentAccessGrantResponse>,
)

data class RecruitmentAccessUserCandidateResponse(
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
