package com.lhs.share.hub.repository.entity

import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkStatus
import org.bson.types.ObjectId
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("hub_works")
@CompoundIndexes(
    CompoundIndex(name = "idx_work_owner_deleted_updated", def = "{'ownerId': 1, 'deletedAt': 1, 'updatedAt': -1}"),
    CompoundIndex(
        name = "idx_work_public_deleted_published_id",
        def = "{'status': 1, 'deletedAt': 1, 'publishedAt': -1, '_id': -1}",
    ),
)
data class WorkRecord(
    @Id val id: ObjectId? = null,
    val ownerId: String,
    val status: WorkStatus = WorkStatus.DRAFT,
    val revision: Long = 1,
    val document: WorkDocument,
    val origin: WorkOrigin = WorkOrigin(),
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = createdAt,
    val publishedAt: Instant? = null,
    val deletedAt: Instant? = null,
)

data class WorkOrigin(val type: String = "NATIVE", val sourceId: String? = null)
