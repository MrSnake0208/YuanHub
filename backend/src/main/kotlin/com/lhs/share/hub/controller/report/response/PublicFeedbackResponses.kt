package com.lhs.share.hub.controller.report.response

import java.time.Instant

/**
 * 公开反馈列表项。
 *
 * 只包含允许公开展示的字段;绝不包含 reporterUserId、原始正文、消息、附件、
 * clientInfo、diagnostics 或任何管理员内部信息。
 */
data class PublicFeedbackListItem(
    val id: String,
    val publicTitle: String?,
    val publicSummary: String?,
    val type: String,
    val publicStatus: String?,
    val supportCount: Int,
    val supportedByCurrentUser: Boolean,
    val publishedAt: Instant?,
    val publicUpdatedAt: Instant?,
    val targetVersionLabel: String? = null,
    val completedVersionLabel: String? = null,
    val category: String? = null,
    val categoryLabel: String? = null,
    val spaceId: String = "yuanhub",
)

/** 公开反馈列表分页响应。 */
data class PublicFeedbackPage(
    val items: List<PublicFeedbackListItem>,
    val total: Long,
    val page: Int,
    val pageSize: Int,
)

/** 公开反馈详情;合并项携带最终主反馈指向。 */
data class PublicFeedbackDetail(
    val id: String,
    val publicTitle: String?,
    val publicSummary: String?,
    val type: String,
    val publicStatus: String?,
    val supportCount: Int,
    val supportedByCurrentUser: Boolean,
    val publishedAt: Instant?,
    val publicUpdatedAt: Instant?,
    val completedAt: Instant?,
    val targetVersionLabel: String? = null,
    val completedVersionLabel: String? = null,
    val mergedInto: MergedInto?,
    val category: String? = null,
    val categoryLabel: String? = null,
    val spaceId: String = "yuanhub",
) {
    data class MergedInto(
        val id: String,
        val publicTitle: String?,
    )
}
