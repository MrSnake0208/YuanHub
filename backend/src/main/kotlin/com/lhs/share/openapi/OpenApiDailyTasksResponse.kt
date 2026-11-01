package com.lhs.share.openapi

import com.lhs.share.hub.repository.entity.OperatorTrainingTask

/**
 * OpenAPI:今日密探历练待办
 *
 * 账号由 Token 绑定(OpenApiPrincipal.accountId),客户端传入的 account_id/plan_id 一律忽略。
 * 无可用方案时 planId/planName 为 null、version 为 0、sourceStatus 为 no_schedule、
 * scheduleRevision 为 0、tasks/plannedTasks 为空,仍返回 HTTP 200。
 * tasks 始终是正式待办记录;plannedTasks 是当前养成规划为今天生成的候选,仅 sourceStatus 为 ready 时非空。
 * 读取与写入(完成勾选)返回同一结构,客户端可把写入响应直接当作权威快照。
 */
data class OpenApiDailyTasksResponse(
    val accountId: String,
    val planId: String?,
    val planName: String?,
    val date: String,
    val version: Long,
    val needsUpdate: Boolean,
    val sourceStatus: String,
    val tasks: List<OpenApiDailyTask>,
    val scheduleRevision: Long,
    val plannedTasks: List<OpenApiDailyTask>,
)

/**
 * 单条历练待办;groupName 为服务端便利字段,客户端仍保留自身兜底映射。
 */
data class OpenApiDailyTask(
    val id: String,
    val groupId: String,
    val groupName: String?,
    val stageLevel: Int,
    val count: Int,
    val completedCount: Int,
    val costPer: Int,
) {
    companion object {
        fun of(task: OperatorTrainingTask): OpenApiDailyTask = OpenApiDailyTask(
            id = task.id,
            groupId = task.groupId,
            groupName = groupName(task.groupId),
            stageLevel = task.stageLevel,
            count = task.count,
            completedCount = task.completedCount,
            costPer = task.costPer,
        )

        /** 未知 group_id 返回 null,由客户端兜底展示。 */
        private fun groupName(groupId: String): String? = when (groupId) {
            "fh" -> "风火"
            "ds" -> "地水"
            "yy" -> "阴阳"
            "experience" -> "经验"
            else -> null
        }
    }
}
