package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.data.annotation.Id
import org.springframework.data.convert.ValueConverter
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant
import java.time.LocalDate

data class RecruitmentCatalogSourcePage(
    val url: String,
    val revision: Long? = null,
)

@Document("recruitment_catalog")
data class RecruitmentCatalogPool(
    @Id val poolId: String,
    val game: String,
    val name: String,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val startDate: LocalDate? = null,
    @field:ValueConverter(ActivityCalendarDateConverter::class) val endDate: LocalDate? = null,
    val poolType: String? = null,
    val enabled: Boolean = true,
    val revision: Long = 0,
    val upAgents: List<RecruitmentUpAgent> = emptyList(),
    val upStatus: String = "unknown",
    @JsonIgnore val updatedBy: String? = null,
    @JsonIgnore val updatedAt: Instant = Instant.EPOCH,
    val sourceUpAgentNames: List<String> = emptyList(),
    val sourceUrl: String? = null,
    val sourceRevision: Long? = null,
    val sourcePages: List<RecruitmentCatalogSourcePage> = emptyList(),
    val sourceNote: String? = null,
    val hidden: Boolean = false,
    val allowCustomUp: Boolean = false,
)
