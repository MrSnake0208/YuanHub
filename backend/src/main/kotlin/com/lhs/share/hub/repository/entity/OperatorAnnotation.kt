package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_annotation")
@CompoundIndex(
    name = "idx_operator_annotation_owner_unique",
    def = "{'userId': 1, 'accountId': 1, 'operatorId': 1}",
    unique = true,
)
data class OperatorAnnotation(
    @Id val id: String? = null,
    @Indexed val userId: String,
    val accountId: String,
    val operatorId: String,
    val growthState: String = "active",
    val note: String? = null,
    val revision: Long = 1,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
)
