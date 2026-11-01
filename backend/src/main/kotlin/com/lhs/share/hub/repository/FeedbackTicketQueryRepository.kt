package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.report.FeedbackArea
import com.lhs.share.hub.service.report.FeedbackSpaces
import com.lhs.share.hub.service.report.FeedbackType
import com.lhs.share.hub.service.report.FeedbackVisibility
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.regex.Pattern

@Repository
class FeedbackTicketQueryRepository(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) {
    fun search(
        reporterUserId: String?,
        manageableCategories: Set<String>?,
        status: String?,
        type: String?,
        category: String?,
        keyword: String?,
        pageable: Pageable,
        workAreas: Set<String>? = null,
        queue: String? = null,
        actorUserId: String? = null,
        developerAreas: Set<String> = emptySet(),
        knownAreas: Set<String> = FeedbackArea.all,
        spaceIds: Set<String>? = null,
    ): Page<FeedbackTicket> {
        val filters = mutableListOf<Criteria>()
        spaceIds?.let { filters += FeedbackSpaces.criteria(it) }
        reporterUserId?.let { filters += Criteria.where("reporterUserId").`is`(it) }
        manageableCategories?.let { filters += workAreaSetCriteria(it, knownAreas) }
        if (developerAreas.isEmpty()) workAreas?.let { filters += workAreaSetCriteria(it, knownAreas) }
        if (developerAreas.isNotEmpty()) {
            filters += Criteria().orOperator(
                workAreaSetCriteria(workAreas.orEmpty(), knownAreas),
                Criteria().andOperator(
                    workAreaSetCriteria(developerAreas, knownAreas),
                    Criteria().orOperator(
                        Criteria.where("workflowStage").`is`("DEV_HANDOFF"),
                        Criteria.where("developerReturnedAt").ne(null),
                    ),
                ),
            )
        }
        when (queue) {
            "UNASSIGNED" -> filters += Criteria().andOperator(
                Criteria.where("status").`is`("OPEN"),
                Criteria.where("workflowStage").`in`(null, "UNASSIGNED"),
                Criteria.where("operatorAssigneeUserId").`is`(null),
                Criteria.where("mergedIntoId").`is`(null),
            )
            "MINE" -> filters += Criteria().andOperator(
                Criteria.where("status").`is`("OPEN"),
                Criteria.where("operatorAssigneeUserId").`is`(actorUserId),
                Criteria.where("mergedIntoId").`is`(null),
            )
            "NEEDS_REPLY" -> filters += Criteria().andOperator(
                Criteria.where("status").`is`("OPEN"),
                Criteria.where("workflowStage").`is`("PROCESSING"),
                Criteria.where("operatorAssigneeUserId").`is`(actorUserId),
                workAreaSetCriteria(workAreas.orEmpty(), knownAreas),
                Criteria.where("mergedIntoId").`is`(null),
                // Match needsReply from the messages, including old tickets without lastMessageSender.
                Criteria.where("\$expr").`is`(
                    Document(
                        "\$eq",
                        listOf(
                            Document(
                                "\$arrayElemAt",
                                listOf(
                                    Document(
                                        "\$filter",
                                        Document("input", Document("\$ifNull", listOf("\$messages.senderKind", emptyList<String>())))
                                            .append("as", "kind")
                                            .append("cond", Document("\$in", listOf("\$\$kind", listOf("REPORTER", "ADMIN")))),
                                    ),
                                    -1,
                                ),
                            ),
                            "REPORTER",
                        ),
                    ),
                ),
            )
            "DEV" -> filters += Criteria().andOperator(
                Criteria.where("status").`is`("OPEN"),
                Criteria.where("workflowStage").`is`("DEV_HANDOFF"),
                workAreaSetCriteria(developerAreas, knownAreas),
                Criteria.where("mergedIntoId").`is`(null),
            )
            "CLOSED" -> filters += Criteria().andOperator(
                Criteria.where("status").ne("OPEN"),
                Criteria.where("mergedIntoId").`is`(null),
            )
            "RETURNED" -> filters += Criteria().andOperator(
                Criteria.where("status").`is`("OPEN"),
                Criteria.where("workflowStage").`is`("PROCESSING"),
                Criteria.where("developerReturnedAt").ne(null),
                workAreaSetCriteria(workAreas.orEmpty() + developerAreas, knownAreas),
                Criteria.where("mergedIntoId").`is`(null),
            )
            "ALL" -> if (keyword.isNullOrBlank()) filters += Criteria.where("mergedIntoId").`is`(null)
            null -> Unit
            else -> throw IllegalArgumentException("Unknown workflow queue: $queue")
        }
        status?.let { filters += Criteria.where("status").`is`(it) }
        type?.let { filters += typeCriteria(it) }
        category?.let { filters += workAreaSetCriteria(setOf(it), knownAreas) }
        keyword?.takeIf { it.isNotBlank() }?.let { value ->
            val pattern = Pattern.compile(Pattern.quote(value.trim()), Pattern.CASE_INSENSITIVE)
            filters += Criteria().orOperator(
                Criteria.where("content").regex(pattern),
                Criteria.where("_id").regex(pattern),
            )
        }

        val criteria = if (filters.isEmpty()) Criteria() else Criteria().andOperator(*filters.toTypedArray())
        val countQuery = Query(criteria)
        val total = template.count(countQuery, FeedbackTicket::class.java)
        val items = template.find(Query(criteria).with(pageable), FeedbackTicket::class.java)
        return PageImpl(items, pageable, total)
    }

    /**
     * 公开反馈检索: 强制 visibility=PUBLIC 且未合并;keyword 只匹配 publicTitle/publicSummary。
     */
    fun publicSearch(
        type: String?,
        publicStatus: String?,
        keyword: String?,
        completedVersionId: String?,
        sort: String,
        pageable: Pageable,
        spaceId: String = FeedbackSpaces.DEFAULT,
    ): Page<FeedbackTicket> {
        val filters = mutableListOf<Criteria>(
            FeedbackSpaces.criteria(setOf(spaceId)),
            Criteria.where("visibility").`is`(FeedbackVisibility.PUBLIC),
            nonReportCriteria(),
            Criteria.where("mergedIntoId").`is`(null),
        )
        type?.let { filters += typeCriteria(it) }
        publicStatus?.let { filters += Criteria.where("publicStatus").`is`(it) }
        completedVersionId?.let { filters += Criteria.where("completedVersionId").`is`(it) }
        keyword?.takeIf { it.isNotBlank() }?.let { value ->
            val pattern = Pattern.compile(Pattern.quote(value.trim()), Pattern.CASE_INSENSITIVE)
            filters += Criteria().orOperator(
                Criteria.where("publicTitle").regex(pattern),
                Criteria.where("publicSummary").regex(pattern),
            )
        }
        val criteria = Criteria().andOperator(*filters.toTypedArray())
        val sortSpec = when (sort) {
            "hot" -> Sort.by(Sort.Order.desc("supportCount"), Sort.Order.desc("publishedAt"))
            "updated" -> Sort.by(Sort.Order.desc("publicUpdatedAt"), Sort.Order.desc("publishedAt"))
            else -> Sort.by(Sort.Order.desc("publishedAt"))
        }
        val total = template.count(Query(criteria), FeedbackTicket::class.java)
        val items = template.find(Query(criteria).with(pageable).with(sortSpec), FeedbackTicket::class.java)
        return PageImpl(items, pageable, total)
    }

    /**
     * 相似反馈召回: 只在 PUBLIC 且未合并的反馈中按关键词 regex 粗召回,精确打分由 Service 完成。
     */
    fun searchPublicSimilar(tokens: List<String>, candidateLimit: Int, spaceId: String = FeedbackSpaces.DEFAULT): List<FeedbackTicket> {
        if (tokens.isEmpty()) return emptyList()
        val tokenCriteria = tokens.map { token ->
            val pattern = Pattern.compile(Pattern.quote(token), Pattern.CASE_INSENSITIVE)
            Criteria().orOperator(
                Criteria.where("publicTitle").regex(pattern),
                Criteria.where("publicSummary").regex(pattern),
            )
        }
        val criteria = Criteria().andOperator(
            FeedbackSpaces.criteria(setOf(spaceId)),
            Criteria.where("visibility").`is`(FeedbackVisibility.PUBLIC),
            nonReportCriteria(),
            Criteria.where("mergedIntoId").`is`(null),
            Criteria().orOperator(*tokenCriteria.toTypedArray()),
        )
        return template.find(Query(criteria).limit(candidateLimit), FeedbackTicket::class.java)
    }

    /** 原子 +1 支持数;visibility 已在查询中限制为 PUBLIC。 */
    fun incrementSupportCount(ticketId: String): FeedbackTicket? = template.findAndModify(
        Query(Criteria.where("_id").`is`(ticketId).and("visibility").`is`(FeedbackVisibility.PUBLIC)),
        Update().inc("supportCount", 1),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** 原子 -1 支持数,并保证 supportCount 不为负。 */
    fun decrementSupportCount(ticketId: String): FeedbackTicket? = template.findAndModify(
        Query(
            Criteria.where("_id").`is`(ticketId)
                .and("visibility").`is`(FeedbackVisibility.PUBLIC)
                .and("supportCount").gt(0),
        ),
        Update().inc("supportCount", -1),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /**
     * 定向更新公开字段,避免覆盖并发的消息/状态写入。
     */
    fun setPublicInfo(
        ticketId: String,
        visibility: String,
        publicTitle: String?,
        publicSummary: String?,
        publicStatus: String?,
        publishedAt: Instant?,
        publicUpdatedAt: Instant,
        completedAt: Instant? = null,
    ): FeedbackTicket? = template.findAndModify(
        Query(
            Criteria().andOperator(
                Criteria.where("_id").`is`(ticketId).and("mergedIntoId").`is`(null),
                if (visibility == FeedbackVisibility.PUBLIC) nonReportCriteria() else Criteria(),
            ),
        ),
        Update()
            .set("visibility", visibility)
            .set("publicTitle", publicTitle)
            .set("publicSummary", publicSummary)
            .set("publicStatus", publicStatus)
            .set("publishedAt", publishedAt)
            .set("publicUpdatedAt", publicUpdatedAt)
            .set("completedAt", completedAt),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** 定向更新公开状态与完成时间。 */
    fun setPublicStatus(ticketId: String, publicStatus: String, publicUpdatedAt: Instant, completedAt: Instant?): FeedbackTicket? =
        template.findAndModify(
            Query(Criteria.where("_id").`is`(ticketId).and("mergedIntoId").`is`(null)),
            Update()
                .set("publicStatus", publicStatus)
                .set("publicUpdatedAt", publicUpdatedAt)
                .set("completedAt", completedAt),
            FindAndModifyOptions.options().returnNew(true),
            FeedbackTicket::class.java,
        )

    /** 定向写入合并指向;源记录保留。 */
    fun setMergedInto(ticketId: String, targetTicketId: String): FeedbackTicket? = template.findAndModify(
        Query(
            Criteria().andOperator(
                Criteria.where("_id").`is`(ticketId),
                Criteria.where("mergedIntoId").`is`(null),
                Criteria.where("mergedCount").`in`(0, null),
                Criteria.where("status").`is`("OPEN"),
            ),
        ),
        Update().set("mergedIntoId", targetTicketId),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** 定向修改反馈类型。 */
    fun setType(ticketId: String, type: String): FeedbackTicket? = template.findAndModify(
        Query(
            Criteria().andOperator(
                Criteria.where("_id").`is`(ticketId).and("mergedIntoId").`is`(null),
                nonReportCriteria(),
                if (type == FeedbackType.REPORT) Criteria.where("visibility").ne(FeedbackVisibility.PUBLIC) else Criteria(),
            ),
        ),
        Update().set("type", type),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** 定向写入目标/完成版本与展示名快照。 */
    fun setVersions(
        ticketId: String,
        targetVersionId: String?,
        targetVersionLabel: String?,
        completedVersionId: String?,
        completedVersionLabel: String?,
    ): FeedbackTicket? = template.findAndModify(
        Query(Criteria.where("_id").`is`(ticketId).and("mergedIntoId").`is`(null)),
        Update()
            .set("targetVersionId", targetVersionId)
            .set("targetVersionLabel", targetVersionLabel)
            .set("completedVersionId", completedVersionId)
            .set("completedVersionLabel", completedVersionLabel),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** 原子累加主反馈的合并数量。 */
    fun incrementMergedCount(ticketId: String): FeedbackTicket? = template.findAndModify(
        Query(Criteria.where("_id").`is`(ticketId).and("mergedIntoId").`is`(null).and("status").`is`("OPEN")),
        Update().inc("mergedCount", 1),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )

    /** Match the same valid-area, valid-category, OTHER precedence as detail authorization. */
    private fun categorySetCriteria(categories: Set<String>, knownAreaKeys: Set<String>): Criteria {
        if (categories.isEmpty()) return Criteria.where("_id").`in`(emptyList<String>())
        val knownAreas = normalizedValues(knownAreaKeys)
        val requested = normalizedValues(categories)
        val branches = mutableListOf(
            Criteria.where("area").regex(requested),
            Criteria().andOperator(
                Criteria.where("area").not().regex(knownAreas),
                Criteria.where("category").regex(requested),
            ),
        )
        if (FeedbackArea.OTHER in categories) {
            branches += Criteria().andOperator(
                Criteria.where("area").not().regex(knownAreas),
                Criteria.where("category").not().regex(knownAreas),
            )
        }
        return Criteria().orOperator(*branches.toTypedArray())
    }

    private fun workAreaSetCriteria(areas: Set<String>, knownAreas: Set<String>): Criteria {
        if (areas.isEmpty()) return Criteria.where("_id").`in`(emptyList<String>())
        return Criteria().orOperator(
            Criteria.where("workArea").`in`(areas),
            Criteria().andOperator(Criteria.where("workArea").`is`(null), categorySetCriteria(areas.intersect(knownAreas), knownAreas)),
        )
    }

    /** 查询层排除举报，避免列表总数、相似召回和版本反查泄露历史误公开数据。 */
    private fun nonReportCriteria(): Criteria = Criteria().norOperator(
        Criteria.where("type").regex("^\\s*REPORT\\s*$", "i"),
        Criteria().andOperator(
            Criteria.where("type").regex("^\\s*FEEDBACK\\s*$", "i"),
            Criteria.where("category").regex("^\\s*REPORT\\s*$", "i"),
        ),
    )

    private fun typeCriteria(type: String): Criteria {
        if (type == FeedbackType.LEGACY_FEEDBACK) {
            return Criteria().andOperator(
                Criteria.where("type").regex(normalizedValues(setOf(type))),
                Criteria.where("category").not().regex(normalizedValues(FeedbackType.all)),
            )
        }
        return Criteria().orOperator(
            Criteria.where("type").regex(normalizedValues(setOf(type))),
            Criteria().andOperator(
                Criteria.where("type").regex(normalizedValues(setOf(FeedbackType.LEGACY_FEEDBACK))),
                Criteria.where("category").regex(normalizedValues(setOf(type))),
            ),
        )
    }

    private fun normalizedValues(values: Set<String>): Pattern = Pattern.compile(
        "^\\s*(?:" + values.joinToString("|") { Pattern.quote(it) } + ")\\s*$",
        Pattern.CASE_INSENSITIVE,
    )

    /**
     * Only save mutations based on the still-current snapshot. Message count and
     * status also guard writes within the same Mongo millisecond. Missing legacy
     * timestamps/messages remain writable; no document migration is required.
     */
    fun saveIfUnchanged(previous: FeedbackTicket, updated: FeedbackTicket): FeedbackTicket? {
        val messageBoundary = if (previous.messages.isEmpty()) {
            Criteria().orOperator(Criteria.where("messages").size(0), Criteria.where("messages").`is`(null))
        } else {
            Criteria.where("messages").size(previous.messages.size)
        }
        val query = Query(
            Criteria().andOperator(
                Criteria.where("_id").`is`(checkNotNull(previous.id)),
                Criteria.where("status").`is`(previous.status),
                Criteria.where("mergedIntoId").`is`(previous.mergedIntoId),
                Criteria.where("workflowStage").`is`(previous.workflowStage),
                Criteria.where("operatorAssigneeUserId").`is`(previous.operatorAssigneeUserId),
                messageBoundary,
                Criteria().orOperator(
                    Criteria.where("updatedAt").`is`(previous.updatedAt),
                    Criteria.where("updatedAt").exists(false),
                ),
            ),
        )
        val update = Update()
            .set("messages", updated.messages)
            .set("lastMessageSender", updated.lastMessageSender)
            .set("hasAdminReply", updated.hasAdminReply)
            .set("adminReply", updated.adminReply)
            .set("status", updated.status)
            .set("workflowStage", updated.workflowStage)
            .set("workArea", updated.workArea)
            .set("category", updated.category)
            .set("area", updated.area)
            .set("operatorAssigneeUserId", updated.operatorAssigneeUserId)
            .set("operatorAssignedAt", updated.operatorAssignedAt)
            .set("developerReturnedAt", updated.developerReturnedAt)
            .set("handlerUserId", updated.handlerUserId)
            .set("handledAt", updated.handledAt)
            .set("updatedAt", updated.updatedAt)
        if (updated.publicStatus != previous.publicStatus || updated.completedAt != previous.completedAt ||
            updated.publicUpdatedAt != previous.publicUpdatedAt
        ) {
            query.addCriteria(
                Criteria.where("visibility").`is`(previous.visibility)
                    .and("publicStatus").`is`(previous.publicStatus)
                    .and("publicUpdatedAt").`is`(previous.publicUpdatedAt)
                    .and("completedAt").`is`(previous.completedAt),
            )
            update.set("publicStatus", updated.publicStatus)
                .set("completedAt", updated.completedAt)
                .set("publicUpdatedAt", updated.publicUpdatedAt)
        }
        if (updated.teamReadReporterIndex != null &&
            (previous.teamReadReporterIndex == null || updated.teamReadReporterIndex > previous.teamReadReporterIndex)
        ) {
            update.max("teamReadReporterIndex", updated.teamReadReporterIndex)
        }
        return template.findAndModify(query, update, FindAndModifyOptions.options().returnNew(true), FeedbackTicket::class.java)
    }

    fun advanceTeamRead(ticketId: String, messageIndex: Int): FeedbackTicket? = template.findAndModify(
        Query(Criteria.where("_id").`is`(ticketId)),
        Update().max("teamReadReporterIndex", messageIndex),
        FindAndModifyOptions.options().returnNew(true),
        FeedbackTicket::class.java,
    )
}
