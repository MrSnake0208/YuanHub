package com.lhs.share.hub.repository

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.entity.FeedbackTicket
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.core.query.Criteria

data class FeedbackDiagnosticFilter(
    val source: String? = null,
    val feature: String? = null,
    val outcome: String? = null,
    val issueCode: String? = null,
    val operatorId: String? = null,
    val resourceVersion: String? = null,
    val includeCounts: Boolean = false,
) {
    fun criteria(): List<Criteria> {
        if (source != null && source !in setOf("manual", "maayuan_diagnostic")) throw ApiResultException(400, "Invalid source")
        val fields = mapOf(
            "feature" to feature,
            "outcome" to outcome,
            "issueCodes" to issueCode,
            "operatorIds" to operatorId,
            "resourceVersion" to resourceVersion,
        )
        if (fields.values.any { it != null && it.length !in 1..100 }) throw ApiResultException(400, "Invalid diagnostic filter")
        val result = fields.mapNotNull { (key, value) -> value?.let { Criteria.where("diagnosticReport.$key").`is`(it) } }
        return result + listOfNotNull(source?.let { Criteria.where("source").`is`(if (it == "manual") null else it) })
    }
}

class FeedbackDiagnosticPage(
    content: List<FeedbackTicket>,
    pageable: Pageable,
    total: Long,
    val diagnosticCounts: Map<String, Map<String, Long>>,
) : PageImpl<FeedbackTicket>(content, pageable, total)
