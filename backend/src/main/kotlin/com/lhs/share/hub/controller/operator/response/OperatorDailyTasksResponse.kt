package com.lhs.share.hub.controller.operator.response

import com.lhs.share.hub.repository.entity.OperatorTrainingTask

data class OperatorDailyTasksResponse(
    val accountId: String,
    val planId: String,
    val date: String,
    val version: Long,
    val source: OperatorDailyTaskSource,
    val tasks: List<OperatorTrainingTask>,
    val needsUpdate: Boolean,
)

data class OperatorDailyTaskSource(val status: String, val revision: Long, val items: List<OperatorTrainingTask> = emptyList())
