package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * Hub 库反馈工单实体(HubBackend.feedback_tickets)
 *
 * 嵌入消息列表 [messages],每一条消息可附带最多 10 个附件(图片与普通文件合计)。
 * 状态机: OPEN → RESOLVED / DISMISSED
 *
 * @property id 工单 id: rpt_<hex>
 * @property type 反馈类型: BUG / FEATURE / CONTENT / ACCOUNT / REPORT / OTHER
 * @property category 反馈归属板块
 * @property area 旧版板块字段；过渡期与 category 双写
 * @property status OPEN / RESOLVED / DISMISSED
 * @property reporterUserId 提交人用户 id
 * @property handlerUserId 最近处理管理员用户 id
 * @property handledAt 最近处理时间
 * @property targetType 预留:举报目标类型(后续扩展)
 * @property targetId 预留:举报目标 id(后续扩展)
 * @property content 首条正文(用于列表预览与搜索)
 * @property adminReply 最近管理员回复预览
 * @property hasAdminReply 是否有管理员回复
 * @property lastMessageSender 最后一条消息发送方: REPORTER | ADMIN
 * @property clientInfoConsent 是否同意保存客户端信息
 * @property clientInfo 客户端信息(仅 consent=true 时保存)
 * @property diagnostics 应用诊断信息(前端版本 / commit / 构建时间);与 consent 无关,旧文档为 null
 * @property messages 消息列表
 * @property createdAt 创建时间
 * @property updatedAt 更新时间
 */
@Document("feedback_tickets")
@CompoundIndex(name = "idx_reporter_created", def = "{'reporterUserId': 1, 'createdAt': -1}")
@CompoundIndex(name = "idx_status_area_created", def = "{'status': 1, 'area': 1, 'createdAt': -1}")
@CompoundIndex(name = "idx_status_type_category_created", def = "{'status': 1, 'type': 1, 'category': 1, 'createdAt': -1}")
@CompoundIndex(name = "idx_public_visibility_status_published", def = "{'visibility': 1, 'publicStatus': 1, 'publishedAt': -1}")
@CompoundIndex(name = "idx_public_visibility_type_published", def = "{'visibility': 1, 'type': 1, 'publishedAt': -1}")
@CompoundIndex(name = "idx_merged_into", def = "{'mergedIntoId': 1}")
@CompoundIndex(name = "idx_public_visibility_completed_version", def = "{'visibility': 1, 'completedVersionId': 1}")
data class FeedbackTicket(
    @Id
    val id: String? = null,

    /** 反馈类型；FEEDBACK 仅兼容旧数据。 */
    val type: String,

    /** 反馈归属板块。 */
    val category: String? = null,

    /** 旧版反馈归属板块；新记录与 category 双写，旧文档可为空。 */
    val area: String? = null,

    /** 状态: OPEN / RESOLVED / DISMISSED */
    val status: String = "OPEN",

    /** 内部处理阶段；旧 OPEN 工单缺失时按 UNASSIGNED 读取。 */
    val workflowStage: String? = null,
    val workArea: String? = null,
    val operatorAssigneeUserId: String? = null,
    val operatorAssignedAt: Instant? = null,
    val developerReturnedAt: Instant? = null,
    /** 团队已读至用户消息在 messages 中的索引；旧单为空时读取逻辑以最后一条历史用户消息为基线。 */
    val teamReadReporterIndex: Int? = null,

    /** 提交人用户 id */
    @Indexed
    val reporterUserId: String,

    /** 最近处理管理员用户 id */
    val handlerUserId: String? = null,

    /** 最近处理时间 */
    val handledAt: Instant? = null,

    /** 预留:举报目标类型 */
    val targetType: String? = null,

    /** 预留:举报目标 id */
    val targetId: String? = null,

    /** 首条正文(用于列表预览与搜索) */
    val content: String,

    /** 用户提交的原始标题(仅用于提交前相似提示);旧工单为空 */
    val title: String? = null,

    /** 用户是否允许管理员整理发布到反馈广场；旧记录缺失时不视为授权 */
    val publicConsent: Boolean = false,

    /** 公开可见性: PRIVATE / PUBLIC;旧工单缺失该字段时一律视为 PRIVATE */
    val visibility: String? = null,

    /** 公开标题,由管理员整理后展示 */
    val publicTitle: String? = null,

    /** 公开摘要,由管理员整理后展示 */
    val publicSummary: String? = null,

    /** 公开开发状态: PublicFeedbackStatus;与内部 status 相互独立 */
    val publicStatus: String? = null,

    /** 支持数量,随 FeedbackSupport 原子增减 */
    val supportCount: Int = 0,

    /** 合并目标: 指向最终主反馈;null 表示非合并项 */
    val mergedIntoId: String? = null,

    /** 主反馈累计合并的重复反馈数量 */
    val mergedCount: Int = 0,

    /** 首次公开时间 */
    val publishedAt: Instant? = null,

    /** 公开字段最近更新时间 */
    val publicUpdatedAt: Instant? = null,

    /** 进入 COMPLETED 公开状态的时间 */
    val completedAt: Instant? = null,

    /** 目标版本: 更新日志 ChangelogEntry.id;null 表示未指定 */
    val targetVersionId: String? = null,

    /** 目标版本展示名快照 */
    val targetVersionLabel: String? = null,

    /** 完成版本: 更新日志 ChangelogEntry.id;null 表示未指定 */
    val completedVersionId: String? = null,

    /** 完成版本展示名快照 */
    val completedVersionLabel: String? = null,

    /** 最近管理员回复预览 */
    val adminReply: String? = null,

    /** 是否有管理员回复 */
    val hasAdminReply: Boolean = false,

    /** 最后一条消息发送方 */
    val lastMessageSender: String = "REPORTER",

    /** 是否同意保存客户端信息 */
    val clientInfoConsent: Boolean = false,

    /** 客户端信息(仅 consent=true 时保存) */
    val clientInfo: FeedbackClientInfo? = null,

    /** 应用诊断信息(前端版本 / commit / 构建时间);与 clientInfoConsent 无关,旧文档为 null */
    val diagnostics: FeedbackDiagnostics? = null,

    /** 消息列表 */
    val messages: List<FeedbackMessage> = emptyList(),

    /** 创建时间 */
    val createdAt: Instant = Instant.now(),

    /** 更新时间 */
    val updatedAt: Instant = Instant.now(),
    /** 缺省历史记录归属 YuanHub，不根据板块名称推断合作方。 */
    val spaceId: String? = null,
) : Serializable
