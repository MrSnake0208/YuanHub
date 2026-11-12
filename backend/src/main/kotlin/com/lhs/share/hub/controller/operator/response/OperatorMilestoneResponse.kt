package com.lhs.share.hub.controller.operator.response

import java.time.Instant

data class OperatorMilestoneResponse(
    val accountId: String,
    val game: String,
    val operatorId: String,
    val revision: Long,
    val milestones: List<OperatorMilestoneItem>,
    val firstRecruitment: OperatorFirstRecruitment? = null,
)

data class OperatorMilestoneItem(val key: String, val date: String?, val observedAt: Instant?)

data class OperatorFirstRecruitment(val date: String, val poolName: String)
