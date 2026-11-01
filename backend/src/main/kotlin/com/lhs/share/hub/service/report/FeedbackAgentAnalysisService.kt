package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackAgentReviewRepository
import com.lhs.share.hub.repository.entity.FeedbackAgentClassification
import com.lhs.share.hub.repository.entity.FeedbackAgentImplementationResult
import com.lhs.share.hub.repository.entity.FeedbackAgentReview
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

@Service
class FeedbackAgentAnalysisService(
    private val repository: FeedbackAgentReviewRepository,
    private val feedbackReports: FeedbackReportService,
    private val categories: FeedbackCategoryService,
) {
    fun latest(ownerUserId: String, ticketId: String, allowedAreas: Set<String>?): FeedbackAgentReviewView? {
        val ticket = feedbackReports.getByIdForAutomation(ownerUserId, ticketId, allowedAreas)
        val review = repository.findFirstByTicketIdOrderByUpdatedAtDesc(ticketId) ?: return null
        return FeedbackAgentReviewView(review, stale = review.ticketUpdatedAt != ticket.updatedAt)
    }

    fun save(
        ownerUserId: String,
        integrationTokenId: String,
        ticketId: String,
        allowedAreas: Set<String>?,
        input: FeedbackAgentReviewInput,
    ): FeedbackAgentReviewView {
        val ticket = feedbackReports.getByIdForAutomation(ownerUserId, ticketId, allowedAreas)
        if (ticket.updatedAt != input.ticketUpdatedAt) {
            throw ApiResultException(HttpStatus.CONFLICT.value(), "ticket_changed")
        }

        val source = normalizeEnum(input.source, SOURCES, "source")
        val severity = normalizeEnum(input.severity, SEVERITIES, "severity")
        val suggestedAction = normalizeEnum(input.suggestedAction, ACTIONS, "suggested_action")
        val summary = requireText(input.summary, "summary", MAX_SUMMARY)
        val suggestedType = input.suggestedType?.trim()?.uppercase()?.also {
            if (it !in FeedbackType.all) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效 suggested_type: $it")
            }
        }
        val suggestedArea = input.suggestedArea?.trim()?.uppercase()?.also {
            if (it !in categories.keys()) {
                throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效 suggested_area: $it")
            }
        }
        if (input.confidence != null && input.confidence !in 0.0..1.0) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "confidence 必须在 0 到 1 之间")
        }

        val now = Instant.now()
        val review = FeedbackAgentReview(
            id = "far_${UUID.randomUUID().toString().replace("-", "")}",
            ticketId = ticketId,
            ticketUpdatedAt = input.ticketUpdatedAt,
            integrationTokenId = integrationTokenId,
            actorUserId = ownerUserId,
            source = source,
            model = input.model?.trim()?.takeIf { it.isNotEmpty() }?.also {
                if (it.length > MAX_MODEL) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "model 过长")
            },
            summary = summary,
            classification = FeedbackAgentClassification(
                suggestedType = suggestedType,
                suggestedArea = suggestedArea,
                severity = severity,
            ),
            suspectedModules = normalizeList(input.suspectedModules, "suspected_modules"),
            suspectedFiles = normalizeList(input.suspectedFiles, "suspected_files"),
            suggestedAction = suggestedAction,
            confidence = input.confidence,
            evidence = normalizeList(input.evidence, "evidence"),
            implementationResult = input.implementationResult?.let {
                FeedbackAgentImplementationResult(
                    status = it.status?.trim()?.takeIf(String::isNotEmpty),
                    commit = it.commit?.trim()?.takeIf(String::isNotEmpty),
                    files = normalizeList(it.files, "implementation_result.files"),
                    validation = normalizeList(it.validation, "implementation_result.validation"),
                )
            },
            createdAt = now,
            updatedAt = now,
        )
        return FeedbackAgentReviewView(repository.save(review), stale = false)
    }

    private fun normalizeEnum(value: String, allowed: Set<String>, field: String): String {
        val normalized = value.trim().uppercase()
        if (normalized !in allowed) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "无效 $field: $value")
        }
        return normalized
    }

    private fun requireText(value: String, field: String, maxLength: Int): String {
        val normalized = value.trim()
        if (normalized.isEmpty()) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "$field 不能为空")
        if (normalized.length > maxLength) throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "$field 过长")
        return normalized
    }

    private fun normalizeList(values: List<String>, field: String): List<String> {
        if (values.size > MAX_LIST_ITEMS) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "$field 最多 $MAX_LIST_ITEMS 项")
        }
        return values.map { requireText(it, field, MAX_LIST_ITEM_LENGTH) }
    }

    companion object {
        private val SOURCES = setOf("WEBCODEX", "CODEX", "OTHER")
        private val SEVERITIES = setOf("LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN")
        private val ACTIONS = setOf(
            "NEEDS_INFO",
            "CODE_INVESTIGATION",
            "LIKELY_USER_ERROR",
            "DUPLICATE_CANDIDATE",
            "READY_FOR_TRIAGE",
            "FIXED_LOCALLY",
            "NO_ACTION",
        )
        private const val MAX_SUMMARY = 4000
        private const val MAX_MODEL = 120
        private const val MAX_LIST_ITEMS = 20
        private const val MAX_LIST_ITEM_LENGTH = 500
    }
}

data class FeedbackAgentReviewView(
    val review: FeedbackAgentReview,
    val stale: Boolean,
)

data class FeedbackAgentReviewInput(
    val ticketUpdatedAt: Instant,
    val source: String,
    val model: String?,
    val summary: String,
    val suggestedType: String?,
    val suggestedArea: String?,
    val severity: String,
    val suspectedModules: List<String>,
    val suspectedFiles: List<String>,
    val suggestedAction: String,
    val confidence: Double?,
    val evidence: List<String>,
    val implementationResult: FeedbackAgentImplementationInput?,
)

data class FeedbackAgentImplementationInput(
    val status: String?,
    val commit: String?,
    val files: List<String>,
    val validation: List<String>,
)
