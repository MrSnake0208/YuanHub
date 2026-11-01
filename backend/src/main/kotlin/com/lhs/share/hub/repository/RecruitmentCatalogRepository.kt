package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Repository

@Repository
class RecruitmentCatalogRepository(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) {
    fun all(): List<RecruitmentCatalogPool> = template.findAll(RecruitmentCatalogPool::class.java)
    fun find(poolId: String): RecruitmentCatalogPool? = template.findById(poolId, RecruitmentCatalogPool::class.java)

    /** Creation uses unique _id; updates CAS even when an old document has no revision. */
    fun save(next: RecruitmentCatalogPool, existing: Boolean = next.revision != 1L): Boolean {
        if (!existing) {
            template.insert(next)
            return true
        }
        val version = if (next.revision == 1L) {
            Criteria().orOperator(Criteria.where("revision").`is`(0), Criteria.where("revision").exists(false))
        } else {
            Criteria.where("revision").`is`(next.revision - 1)
        }
        return template.updateFirst(
            Query.query(Criteria.where("_id").`is`(next.poolId)).addCriteria(version),
            Update().set("name", next.name).set("startDate", next.startDate).set("endDate", next.endDate)
                .set("poolType", next.poolType).set("enabled", next.enabled).set("revision", next.revision)
                .set("hidden", next.hidden).set("allowCustomUp", next.allowCustomUp)
                .set("upAgents", next.upAgents).set("upStatus", next.upStatus)
                .set("updatedBy", next.updatedBy).set("updatedAt", next.updatedAt),
            RecruitmentCatalogPool::class.java,
        ).matchedCount == 1L
    }
}
