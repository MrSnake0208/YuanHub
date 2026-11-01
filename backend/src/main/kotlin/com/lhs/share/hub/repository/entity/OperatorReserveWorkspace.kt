package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_reserve_workspaces")
@CompoundIndex(name = "reserve_workspace_owner", def = "{'userId':1,'accountId':1}", unique = true)
data class OperatorReserveWorkspace(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val gameSnapshot: String,
    val payloadJson: String,
    val revision: Long,
    val updatedAt: Instant,
)
