package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_organization")
@CompoundIndex(name = "operator_organization_owner", def = "{'userId':1,'accountId':1}", unique = true)
data class OperatorOrganization(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val payloadJson: String,
    val revision: Long,
    val updatedAt: Instant,
)
