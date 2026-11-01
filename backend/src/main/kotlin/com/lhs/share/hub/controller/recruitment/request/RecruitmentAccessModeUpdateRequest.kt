package com.lhs.share.hub.controller.recruitment.request

import com.lhs.share.hub.repository.entity.RecruitmentAccessMode

data class RecruitmentAccessModeUpdateRequest(
    val accessMode: RecruitmentAccessMode,
    val expectedVersion: Long,
)
