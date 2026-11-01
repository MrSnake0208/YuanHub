package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import org.springframework.http.HttpStatus

/**
 * 公开开发状态。
 *
 * 与内部工单状态(status: OPEN/RESOLVED/DISMISSED)职责不同,二者不得混用:
 * 内部状态描述"工单是否已读/已回复/已关闭",公开状态描述"开发进度到哪一步"。
 */
object PublicFeedbackStatus {
    const val COLLECTING = "COLLECTING"
    const val CONFIRMED = "CONFIRMED"
    const val PLANNED = "PLANNED"
    const val IN_PROGRESS = "IN_PROGRESS"
    const val COMPLETED = "COMPLETED"
    const val NOT_PLANNED = "NOT_PLANNED"

    val all = linkedSetOf(COLLECTING, CONFIRMED, PLANNED, IN_PROGRESS, COMPLETED, NOT_PLANNED)

    val labels = linkedMapOf(
        COLLECTING to "收集中",
        CONFIRMED to "已确认",
        PLANNED to "计划中",
        IN_PROGRESS to "开发中",
        COMPLETED to "已完成",
        NOT_PLANNED to "暂不处理",
    )

    /** 空白返回 null;非法值抛 400。 */
    fun normalizeOrNull(value: String?): String? {
        val normalized = value?.trim()?.uppercase()?.takeIf { it.isNotEmpty() } ?: return null
        if (normalized !in all) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效的公开状态: $value, 可选: $all")
        }
        return normalized
    }
}
