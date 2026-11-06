package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_match_connection")
data class OperatorMatchConnection(
    @Id val id: String,
    @Indexed val userId: String,
    @Indexed(unique = true) val token: String,
    val createdAt: Instant = Instant.now(),
)
