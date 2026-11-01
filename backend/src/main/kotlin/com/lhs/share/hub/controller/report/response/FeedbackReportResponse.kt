package com.lhs.share.hub.controller.report.response

import java.time.Instant

/**
 * 反馈消息响应
 *
 * @property id 消息 id: rpm_<hex>
 * @property senderKind REPORTER | ADMIN
 * @property author 发送人信息
 * @property content 消息正文
 * @property images 图片列表
 * @property files 普通文件列表
 * @property createdAt 发送时间
 */
data class FeedbackMessageResponse(
    val id: String,
    val senderKind: String,
    val author: AuthorInfo,
    val content: String,
    val images: List<ImageInfo>,
    val createdAt: Instant,
    val files: List<FileInfo> = emptyList(),
) {
    data class AuthorInfo(
        val id: String,
        val userName: String,
    )

    data class ImageInfo(
        val id: String,
        val url: String,
        val privateStorage: Boolean = false,
    )

    data class FileInfo(
        val id: String,
        val name: String,
        val mime: String,
        val size: Long,
        val downloadUrl: String,
    )
}

/**
 * 反馈工单响应
 *
 * @property id 工单 id: rpt_<hex>
 * @property type BUG / FEATURE / CONTENT / ACCOUNT / REPORT / OTHER
 * @property category 反馈归属板块
 * @property status OPEN / RESOLVED / DISMISSED
 * @property content 首条正文
 * @property messages 消息列表
 * @property quota 配额信息
 * @property viewerIsReporter 当前查看者是否为提交人
 * @property clientInfo 客户端信息
 * @property diagnostics 应用诊断信息(前端版本 / commit / 构建时间);旧工单为 null
 * @property reporter 提交人信息
 * @property handler 处理人信息
 * @property createdAt 创建时间
 * @property updatedAt 更新时间
 */
data class FeedbackReportResponse(
    val id: String,
    val spaceId: String = "yuanhub",
    val type: String,
    val category: String?,
    val area: String,
    val status: String,
    val workflowStage: String = "UNASSIGNED",
    val workArea: String? = null,
    val operatorAssigneeUserId: String? = null,
    val operatorAssigneeName: String? = null,
    val teamUnread: Boolean = false,
    val needsReply: Boolean = false,
    val content: String,
    val title: String? = null,
    val publicConsent: Boolean = false,
    val visibility: String = "PRIVATE",
    val publicTitle: String? = null,
    val publicSummary: String? = null,
    val publicStatus: String? = null,
    val supportCount: Int = 0,
    val mergedIntoId: String? = null,
    val mergedCount: Int = 0,
    val mergedSourceIds: List<String> = emptyList(),
    val publishedAt: Instant? = null,
    val publicUpdatedAt: Instant? = null,
    val completedAt: Instant? = null,
    val targetVersionId: String? = null,
    val targetVersionLabel: String? = null,
    val completedVersionId: String? = null,
    val completedVersionLabel: String? = null,
    val messages: List<FeedbackMessageResponse>,
    val hasAdminReply: Boolean,
    val quota: QuotaInfo,
    val viewerIsReporter: Boolean,
    val viewerCanManage: Boolean,
    val viewerCanTakeOver: Boolean = false,
    val viewerCanDevelop: Boolean = false,
    val clientInfo: ClientInfoResponse?,
    val reporter: UserInfo,
    val handler: UserInfo?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val diagnostics: DiagnosticsResponse? = null,
) {
    data class QuotaInfo(
        val pendingCount: Int,
        val pendingLimit: Int,
        val canAppend: Boolean,
    )

    data class ClientInfoResponse(
        val consent: Boolean,
        val userAgent: String?,
        val ip: String?,
        val ipLocation: String?,
    )

    /**
     * 反馈工单应用诊断信息
     *
     * 与 [ClientInfoResponse] 分开:这里不含 IP / User-Agent,也不受 consent 控制。
     */
    data class DiagnosticsResponse(
        val productVersion: String?,
        val frontendCommit: String?,
        val buildTime: String?,
    )

    data class UserInfo(
        val id: String,
        val userName: String,
    )
}

/**
 * 反馈工单列表项
 *
 * @property id 工单 id
 * @property type 工单类型
 * @property category 分类
 * @property status 状态
 * @property content 正文预览
 * @property hasAdminReply 是否有管理员回复
 * @property lastMessageSender 最后消息发送方
 * @property lastReporterMessageId 最后一条用户消息 id
 * @property lastReporterMessageCreatedAt 最后一条用户消息时间
 * @property lastReporterMessageIndex 最后一条用户消息在消息数组中的零基索引
 * @property reporterUserId 提交人 id
 * @property reporterName 提交人昵称
 * @property createdAt 创建时间
 * @property updatedAt 更新时间
 */
data class FeedbackReportListItem(
    val id: String,
    val spaceId: String = "yuanhub",
    val type: String,
    val category: String?,
    val area: String,
    val status: String,
    val workflowStage: String = "UNASSIGNED",
    val workArea: String? = null,
    val operatorAssigneeUserId: String? = null,
    val operatorAssigneeName: String? = null,
    val mergedIntoId: String? = null,
    val mergedCount: Int = 0,
    val teamUnread: Boolean = false,
    val needsReply: Boolean = false,
    val content: String,
    val hasAdminReply: Boolean,
    val lastMessageSender: String,
    val lastReporterMessageId: String?,
    val lastReporterMessageCreatedAt: Instant?,
    val lastReporterMessageIndex: Int?,
    val reporterUserId: String,
    val reporterName: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/**
 * 反馈工单列表响应
 */
data class FeedbackReportListResponse(
    val reports: List<FeedbackReportListItem>,
    val total: Long,
    val page: Int,
    val pageSize: Int,
    val mine: Boolean,
    val sortBy: String,
    val sortOrder: String,
)
