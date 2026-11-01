package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.WorkRecord
import com.lhs.share.hub.work.model.WorkStatus
import org.bson.types.ObjectId
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository

interface WorkRecordRepository : MongoRepository<WorkRecord, ObjectId>, WorkRecordRepositoryCustom {
    fun findByIdAndDeletedAtIsNull(id: ObjectId): WorkRecord?
    fun findByIdAndOwnerIdAndDeletedAtIsNull(id: ObjectId, ownerId: String): WorkRecord?
    fun findByOwnerIdAndDeletedAtIsNullOrderByUpdatedAtDescIdDesc(ownerId: String, pageable: Pageable): List<WorkRecord>
    fun countByOwnerIdAndDeletedAtIsNull(ownerId: String): Long
    fun findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(status: WorkStatus, pageable: Pageable): List<WorkRecord>
    fun countByStatusAndDeletedAtIsNull(status: WorkStatus): Long
}

interface WorkRecordRepositoryCustom {
    fun replaceIfRevision(record: WorkRecord, expectedRevision: Long): WorkRecord?
}

class WorkRecordRepositoryImpl(
    @param:Qualifier("hubMongoTemplate") private val template: MongoTemplate,
) : WorkRecordRepositoryCustom {
    override fun replaceIfRevision(record: WorkRecord, expectedRevision: Long): WorkRecord? {
        val id = requireNotNull(record.id)
        return template.findAndModify(
            Query.query(
                Criteria.where("_id").`is`(id)
                    .and("ownerId").`is`(record.ownerId)
                    .and("deletedAt").`is`(null)
                    .and("revision").`is`(expectedRevision),
            ),
            Update()
                .set("document", record.document)
                .set("status", record.status)
                .set("revision", record.revision)
                .set("updatedAt", record.updatedAt)
                .set("publishedAt", record.publishedAt)
                .set("deletedAt", record.deletedAt),
            FindAndModifyOptions.options().returnNew(true),
            WorkRecord::class.java,
        )
    }
}
