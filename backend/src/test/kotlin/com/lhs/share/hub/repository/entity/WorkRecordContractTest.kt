package com.lhs.share.hub.repository.entity

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.mapping.Document

class WorkRecordContractTest {
    @Test
    fun `entity declares Hub collection and list indexes`() {
        val document = WorkRecord::class.java.getAnnotation(Document::class.java)
        val indexes = WorkRecord::class.java.getAnnotation(CompoundIndexes::class.java).value

        assertTrue(document.value == "hub_works")
        assertTrue(
            indexes.any {
                it.name == "idx_work_owner_deleted_updated" &&
                    it.def == "{'ownerId': 1, 'deletedAt': 1, 'updatedAt': -1}"
            },
        )
        assertTrue(
            indexes.any {
                it.name == "idx_work_public_deleted_published_id" &&
                    it.def == "{'status': 1, 'deletedAt': 1, 'publishedAt': -1, '_id': -1}"
            },
        )
    }
}
