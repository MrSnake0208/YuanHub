package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_daily_tasks")
@CompoundIndex(name = "operator_daily_tasks_owner", def = "{'userId':1,'accountId':1,'planId':1,'date':1}", unique = true)
data class OperatorDailyTasks(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val planId: String,
    val date: String,
    val tasks: List<OperatorTrainingTask>,
    val version: Long,
    val updatedAt: Instant,
)

data class OperatorTrainingTask(
    val id: String,
    val groupId: String,
    val stageLevel: Int,
    val count: Int,
    val costPer: Int = 20,
    val completedCount: Int = 0,
)
