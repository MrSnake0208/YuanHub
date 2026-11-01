package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentBatch
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentRequestRecord
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.convert.Jsr310Converters.LocalDateToDateConverter
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.aggregation.Aggregation
import org.springframework.data.mongodb.core.aggregation.AggregationOperation
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.LocalDate
import java.util.stream.Stream

/** Explicit Hub template: no recruitment collection can fall back to MaaBackend. */
@Repository
class RecruitmentRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun archive(userId: String, accountId: String): RecruitmentArchive? =
        template.findOne(owner(userId, accountId), RecruitmentArchive::class.java)

    fun saveArchive(next: RecruitmentArchive, existed: Boolean): Boolean {
        if (!existed) {
            template.insert(next)
            return true
        }
        return template.updateFirst(
            owner(next.userId, next.accountId).addCriteria(Criteria.where("archiveRevision").`is`(next.archiveRevision - 1)),
            Update().set("archiveRevision", next.archiveRevision).set("baseline", next.baseline)
                .set("gameSnapshot", next.gameSnapshot).set("currentPoolId", next.currentPoolId)
                .set("pools", next.pools).set("temporaryAgents", next.temporaryAgents)
                .set("nextEventOrder", next.nextEventOrder).set("updatedAt", next.updatedAt),
            RecruitmentArchive::class.java,
        ).matchedCount == 1L
    }

    fun request(userId: String, accountId: String, requestId: String): RecruitmentRequestRecord? = template.findOne(
        owner(userId, accountId).addCriteria(Criteria.where("requestId").`is`(requestId)),
        RecruitmentRequestRecord::class.java,
    )

    fun insertRequest(record: RecruitmentRequestRecord) {
        template.insert(record)
    }
    fun insertEvent(event: RecruitmentEvent) {
        template.insert(event)
    }
    fun saveEvent(event: RecruitmentEvent) {
        template.save(event)
    }
    fun insertBatch(batch: RecruitmentBatch) {
        template.insert(batch)
    }
    fun saveBatch(batch: RecruitmentBatch) {
        template.save(batch)
    }

    fun event(userId: String, accountId: String, eventId: String): RecruitmentEvent? = template.findOne(
        owner(userId, accountId).addCriteria(Criteria.where("eventId").`is`(eventId)),
        RecruitmentEvent::class.java,
    )

    fun batch(userId: String, accountId: String, batchId: String): RecruitmentBatch? = template.findOne(
        owner(userId, accountId).addCriteria(Criteria.where("batchId").`is`(batchId)),
        RecruitmentBatch::class.java,
    )

    fun batches(userId: String, accountId: String, includeDeleted: Boolean = false): List<RecruitmentBatch> = template.find(
        owner(userId, accountId).also {
            if (!includeDeleted) it.addCriteria(Criteria.where("deletedAt").`is`(null))
        },
        RecruitmentBatch::class.java,
    )

    /** Full bounded reads include tombstones; the caller rejects max+1 instead of truncating backups. */
    fun exchangeEvents(userId: String, accountId: String, limit: Int): List<RecruitmentEvent> = template.find(
        owner(userId, accountId).with(Sort.by("sortOrder", "eventId")).limit(limit),
        RecruitmentEvent::class.java,
    )

    fun exchangeBatches(userId: String, accountId: String, limit: Int): List<RecruitmentBatch> = template.find(
        owner(userId, accountId).with(Sort.by("createdAt", "batchId")).limit(limit),
        RecruitmentBatch::class.java,
    )

    fun batchPage(
        userId: String,
        accountId: String,
        poolId: String?,
        afterCreated: Instant?,
        afterId: String?,
        limit: Int,
    ): List<RecruitmentBatch> {
        val query = owner(userId, accountId).addCriteria(Criteria.where("deletedAt").`is`(null))
        poolId?.let { query.addCriteria(Criteria.where("poolId").`is`(it)) }
        if (afterCreated != null && afterId != null) {
            query.addCriteria(
                Criteria().orOperator(
                    Criteria.where("createdAt").lt(afterCreated),
                    Criteria.where("createdAt").`is`(afterCreated).and("batchId").lt(afterId),
                ),
            )
        }
        return template.find(query.with(Sort.by(Sort.Direction.DESC, "createdAt", "batchId")).limit(limit), RecruitmentBatch::class.java)
    }

    fun batchEvents(userId: String, accountId: String, batchId: String): List<RecruitmentEvent> = template.find(
        owner(userId, accountId).addCriteria(Criteria.where("batchId").`is`(batchId)),
        RecruitmentEvent::class.java,
    )

    fun poolEvents(userId: String, accountId: String, poolId: String, limit: Int): List<RecruitmentEvent> = template.find(
        owner(userId, accountId).addCriteria(Criteria.where("poolId").`is`(poolId))
            .addCriteria(Criteria.where("deletedAt").`is`(null)).limit(limit).with(Sort.by("sortOrder", "eventId")),
        RecruitmentEvent::class.java,
    )

    fun page(
        userId: String,
        accountId: String,
        poolId: String?,
        dateFrom: LocalDate?,
        dateTo: LocalDate?,
        afterOrder: Long?,
        afterId: String?,
        limit: Int,
        direction: Sort.Direction = Sort.Direction.DESC,
    ): List<RecruitmentEvent> {
        val filters = mutableListOf(Criteria.where("deletedAt").`is`(null))
        poolId?.let { filters += Criteria.where("poolId").`is`(it) }
        if (dateFrom != null || dateTo != null) {
            val date = Criteria.where("acquiredDate").ne(null)
            dateFrom?.let(date::gte)
            dateTo?.let(date::lte)
            val legacy = mutableListOf(Document("\$eq", listOf(Document("\$type", "\$acquiredDate"), "date")))
            dateFrom?.let { legacy += Document("\$gte", listOf("\$acquiredDate", LocalDateToDateConverter.INSTANCE.convert(it))) }
            dateTo?.let { legacy += Document("\$lt", listOf("\$acquiredDate", LocalDateToDateConverter.INSTANCE.convert(it.plusDays(1)))) }
            filters += Criteria().orOperator(date, Criteria.where("\$expr").`is`(Document("\$and", legacy)))
        }
        if (afterOrder != null && afterId != null) {
            val orderBoundary = Criteria.where("sortOrder")
            val idBoundary = Criteria.where("sortOrder").`is`(afterOrder).and("eventId")
            if (direction == Sort.Direction.ASC) {
                orderBoundary.gt(afterOrder)
                idBoundary.gt(afterId)
            } else {
                orderBoundary.lt(afterOrder)
                idBoundary.lt(afterId)
            }
            filters += Criteria().orOperator(orderBoundary, idBoundary)
        }
        val query = owner(userId, accountId).addCriteria(Criteria().andOperator(filters))
        return template.find(query.with(Sort.by(direction, "sortOrder", "eventId")).limit(limit), RecruitmentEvent::class.java)
    }

    /** Aggregation avoids downloading unbounded event history merely to render an account summary. */
    fun totals(userId: String, accountId: String): RecruitmentTotals {
        return mergeTotals(
            aggregate(userId, accountId, "recruitment_events", eventGroup(null)).firstOrNull(),
            aggregate(userId, accountId, "recruitment_batches", batchGroup(null)).firstOrNull(),
        )
    }

    fun poolTotals(userId: String, accountId: String): Map<String, RecruitmentTotals> {
        val events = aggregate(userId, accountId, "recruitment_events", eventGroup("\$poolId")).associateBy { it.getString("_id") }
        val batches = aggregate(userId, accountId, "recruitment_batches", batchGroup("\$poolId")).associateBy { it.getString("_id") }
        return (events.keys + batches.keys).associateWith { mergeTotals(events[it], batches[it]) }
    }

    /** One account-scoped query for all pools; only grouped counts leave Mongo. */
    fun poolAgentCounts(userId: String, accountId: String): Map<String, Map<String, Long>> = aggregate(
        userId,
        accountId,
        "recruitment_events",
        Document("_id", Document("poolId", "\$poolId").append("agentId", "\$agentSnapshot.agentId"))
            .append("count", Document("\$sum", 1)),
    ).groupBy { it.get("_id", Document::class.java).getString("poolId") }
        .mapValues { (_, rows) ->
            rows.associate { row ->
                row.get("_id", Document::class.java).getString("agentId") to (row["count"] as Number).toLong()
            }
        }

    /** Ordered, projected cursor: no portraits, snapshots or full history list for summary calculations. */
    fun statisticEvents(userId: String, accountId: String): Stream<RecruitmentStatisticEvent> {
        val query = owner(userId, accountId).addCriteria(Criteria.where("deletedAt").`is`(null))
            .addCriteria(Criteria.where("agentSnapshot.rarity").ne(4)).with(Sort.by("sortOrder", "eventId"))
        query.fields().include(
            "poolId",
            "agentSnapshot.rarity",
            "agentSnapshot.agentId",
            "agentSnapshot.name",
            "pullSpan",
            "upStatus",
        ).exclude("_id")
        return template.stream(query, Document::class.java, "recruitment_events").map { row ->
            RecruitmentStatisticEvent(
                row.getString("poolId"),
                (row.get("agentSnapshot", Document::class.java)?.get("rarity") as? Number)?.toInt(),
                (row["pullSpan"] as? Number)?.toLong(),
                row.getString("upStatus"),
                row.get("agentSnapshot", Document::class.java)?.getString("agentId"),
                row.get("agentSnapshot", Document::class.java)?.getString("name"),
            )
        }
    }

    private fun eventGroup(id: String?): Document {
        fun sum(expression: Any) = Document("\$sum", expression)
        val exact = Document("\$ne", listOf(Document("\$ifNull", listOf("\$pullSpan", null)), null))
        val standalone = Document("\$eq", listOf(Document("\$ifNull", listOf("\$batchId", null)), null))
        val fourStar = Document("\$eq", listOf("\$agentSnapshot.rarity", 4))
        fun whenTrue(test: Any, yes: Any, no: Any) = Document("\$cond", listOf(test, yes, no))
        return Document("_id", id)
            .append("recordedPulls", sum(whenTrue(fourStar, 0, whenTrue(standalone, Document("\$ifNull", listOf("\$pullSpan", 0)), 0))))
            .append("eventCount", sum(1))
            .append("fourStarCount", sum(whenTrue(fourStar, 1, 0)))
            .append("exactCount", sum(whenTrue(fourStar, 0, whenTrue(exact, 1, 0))))
            .append("unknownCount", sum(whenTrue(fourStar, 0, whenTrue(exact, 0, 1))))
    }

    private fun batchGroup(id: String?) = Document("_id", id).append("pulls", Document("\$sum", "\$totalPullCount"))

    private fun mergeTotals(events: Document?, batches: Document?): RecruitmentTotals {
        fun Document?.long(field: String) = (this?.get(field) as? Number)?.toLong() ?: 0L
        return RecruitmentTotals(
            events.long("recordedPulls"),
            batches.long("pulls"),
            events.long("eventCount"),
            events.long("exactCount"),
            events.long("unknownCount"),
            events.long("fourStarCount"),
        )
    }

    fun hasSubstantiveData(userId: String, accountId: String): Boolean {
        val archive = archive(userId, accountId)
        return archive != null &&
            (
                archive.baseline > 0 || archive.pools.any { it.snapshot.catalogPoolId == null || it.progress != 0L } ||
                    archive.temporaryAgents.isNotEmpty()
                ) ||
            template.exists(owner(userId, accountId), RecruitmentEvent::class.java) ||
            template.exists(owner(userId, accountId), RecruitmentBatch::class.java)
    }

    /** Called only after proving that no substantive history/progress/temporary items exist. */
    fun removeEmptyPreferences(userId: String, accountId: String) {
        template.remove(owner(userId, accountId), RecruitmentArchive::class.java)
        template.remove(owner(userId, accountId), RecruitmentRequestRecord::class.java)
    }

    fun deleteAccount(userId: String, accountId: String) {
        listOf(
            RecruitmentArchive::class.java,
            RecruitmentEvent::class.java,
            RecruitmentBatch::class.java,
            RecruitmentRequestRecord::class.java,
        )
            .forEach { template.remove(owner(userId, accountId), it) }
    }

    private fun aggregate(userId: String, accountId: String, collection: String, group: Document): List<Document> = template.aggregate(
        Aggregation.newAggregation(
            AggregationOperation {
                Document("\$match", Document("userId", userId).append("accountId", accountId).append("deletedAt", null))
            },
            AggregationOperation { Document("\$group", group) },
        ),
        collection,
        Document::class.java,
    ).mappedResults

    private fun owner(userId: String, accountId: String) =
        Query.query(Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId))
}

data class RecruitmentTotals(
    val recordedPulls: Long,
    val batchPulls: Long,
    val eventCount: Long,
    val exactCount: Long,
    val unknownCount: Long,
    val fourStarCount: Long = 0,
)

data class RecruitmentStatisticEvent(
    val poolId: String,
    val rarity: Int?,
    val pullSpan: Long?,
    val upStatus: String?,
    val agentId: String? = null,
    val agentName: String? = null,
)
