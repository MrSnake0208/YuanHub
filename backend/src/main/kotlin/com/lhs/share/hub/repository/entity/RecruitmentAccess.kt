package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

enum class RecruitmentAccessMode {
    LIMITED,
    PUBLIC,
}

@Document("recruitment_access_config")
data class RecruitmentAccessConfig(
    @Id val id: String = "recruitment",
    val accessMode: RecruitmentAccessMode = RecruitmentAccessMode.LIMITED,
    val updatedBy: String? = null,
    val updatedAt: Instant = Instant.EPOCH,
    @Version val version: Long? = null,
)

@Document("recruitment_access_grants")
data class RecruitmentAccessGrant(
    @Id val userId: String,
    val grantedBy: String,
    val grantedAt: Instant = Instant.now(),
)
