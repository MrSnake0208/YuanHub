package com.lhs.share.hub.controller.recruitment.request

import com.fasterxml.jackson.annotation.JsonProperty
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import java.time.LocalDate

data class RecruitmentCatalogWriteRequest(
    val poolId: String,
    val game: String,
    val name: String,
    @param:JsonProperty(required = true) val expectedRevision: Long,
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    val poolType: String? = null,
    val enabled: Boolean = true,
    val upAgents: List<RecruitmentUpAgent> = emptyList(),
    val hidden: Boolean? = null,
    val allowCustomUp: Boolean? = null,
)
