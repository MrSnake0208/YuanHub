package com.lhs.share.openapi.feedback

import com.lhs.share.hub.controller.report.response.FeedbackMessageResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportListItem
import com.lhs.share.hub.controller.report.response.FeedbackReportListResponse
import com.lhs.share.hub.controller.report.response.FeedbackReportResponse
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.service.report.FeedbackAgentReviewView
import java.time.Instant

data class FeedbackAutomationListResponse(
    val reports: List<FeedbackAutomationListItem>,
    val total: Long,
    val page: Int,
    val pageSize: Int,
    val sortBy: String,
    val sortOrder: String,
) {
    companion object {
        fun from(source: FeedbackReportListResponse) = FeedbackAutomationListResponse(
            reports = source.reports.map(FeedbackAutomationListItem::from),
            total = source.total,
            page = source.page,
            pageSize = source.pageSize,
            sortBy = source.sortBy,
            sortOrder = source.sortOrder,
        )
    }
}

data class FeedbackAutomationListItem(
    val id: String,
    val content: String,
    val type: String,
    val area: String,
    val status: String,
    val workflowStage: String,
    val workArea: String?,
    val operatorAssigneeName: String?,
    val mergedIntoId: String?,
    val mergedCount: Int,
    val teamUnread: Boolean,
    val needsReply: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    companion object {
        fun from(source: FeedbackReportListItem) = FeedbackAutomationListItem(
            id = source.id,
            content = source.content,
            type = source.type,
            area = source.area,
            status = source.status,
            workflowStage = source.workflowStage,
            workArea = source.workArea,
            operatorAssigneeName = source.operatorAssigneeName,
            mergedIntoId = source.mergedIntoId,
            mergedCount = source.mergedCount,
            teamUnread = source.teamUnread,
            needsReply = source.needsReply,
            createdAt = source.createdAt,
            updatedAt = source.updatedAt,
        )
    }
}

data class FeedbackAutomationDetailResponse(
    val id: String,
    val title: String?,
    val content: String,
    val type: String,
    val area: String,
    val status: String,
    val workflowStage: String,
    val workArea: String?,
    val operatorAssigneeName: String?,
    val mergedIntoId: String?,
    val mergedCount: Int,
    val teamUnread: Boolean,
    val needsReply: Boolean,
    val messages: List<FeedbackAutomationMessage>,
    val diagnostics: FeedbackAutomationDiagnostics?,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    companion object {
        fun from(source: FeedbackReportResponse) = FeedbackAutomationDetailResponse(
            id = source.id,
            title = source.title,
            content = source.content,
            type = source.type,
            area = source.area,
            status = source.status,
            workflowStage = source.workflowStage,
            workArea = source.workArea,
            operatorAssigneeName = source.operatorAssigneeName,
            mergedIntoId = source.mergedIntoId,
            mergedCount = source.mergedCount,
            teamUnread = source.teamUnread,
            needsReply = source.needsReply,
            messages = source.messages.map { FeedbackAutomationMessage.from(source.id, it) },
            diagnostics = source.diagnostics?.let {
                FeedbackAutomationDiagnostics(it.productVersion, it.frontendCommit, it.buildTime)
            },
            createdAt = source.createdAt,
            updatedAt = source.updatedAt,
        )
    }
}

data class FeedbackAutomationMessage(
    val id: String,
    val senderKind: String,
    val content: String,
    val images: List<FeedbackAutomationImage>,
    val files: List<FeedbackAutomationFile>,
    val createdAt: Instant,
) {
    companion object {
        fun from(ticketId: String, source: FeedbackMessageResponse) = FeedbackAutomationMessage(
            id = source.id,
            senderKind = source.senderKind,
            content = source.content,
            images = source.images.map {
                FeedbackAutomationImage(
                    id = it.id,
                    downloadUrl = "/open-api/feedback/$ticketId/attachments/${it.id}",
                )
            },
            files = source.files.map {
                FeedbackAutomationFile(
                    id = it.id,
                    name = it.name,
                    mime = it.mime,
                    size = it.size,
                    downloadUrl = "/open-api/feedback/$ticketId/attachments/${it.id}",
                )
            },
            createdAt = source.createdAt,
        )
    }
}

data class FeedbackAutomationImage(
    val id: String,
    val downloadUrl: String,
)

data class FeedbackAutomationFile(
    val id: String,
    val name: String,
    val mime: String,
    val size: Long,
    val downloadUrl: String,
)

data class FeedbackAutomationDiagnostics(
    val productVersion: String?,
    val frontendCommit: String?,
    val buildTime: String?,
)

data class FeedbackAutomationEvent(
    val action: String,
    val note: String,
    val createdAt: Instant,
) {
    companion object {
        fun from(source: FeedbackWorkflowEvent) = FeedbackAutomationEvent(
            action = source.action,
            note = source.note,
            createdAt = source.createdAt,
        )
    }
}

data class FeedbackAgentReviewResponse(
    val id: String,
    val ticketId: String,
    val ticketUpdatedAt: Instant,
    val source: String,
    val model: String?,
    val summary: String,
    val classification: FeedbackAgentClassificationResponse,
    val suspectedModules: List<String>,
    val suspectedFiles: List<String>,
    val suggestedAction: String,
    val confidence: Double?,
    val evidence: List<String>,
    val implementationResult: FeedbackAgentImplementationResponse?,
    val stale: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    companion object {
        fun from(view: FeedbackAgentReviewView): FeedbackAgentReviewResponse {
            val source = view.review
            return FeedbackAgentReviewResponse(
                id = source.id,
                ticketId = source.ticketId,
                ticketUpdatedAt = source.ticketUpdatedAt,
                source = source.source,
                model = source.model,
                summary = source.summary,
                classification = FeedbackAgentClassificationResponse(
                    suggestedType = source.classification.suggestedType,
                    suggestedArea = source.classification.suggestedArea,
                    severity = source.classification.severity,
                ),
                suspectedModules = source.suspectedModules,
                suspectedFiles = source.suspectedFiles,
                suggestedAction = source.suggestedAction,
                confidence = source.confidence,
                evidence = source.evidence,
                implementationResult = source.implementationResult?.let {
                    FeedbackAgentImplementationResponse(it.status, it.commit, it.files, it.validation)
                },
                stale = view.stale,
                createdAt = source.createdAt,
                updatedAt = source.updatedAt,
            )
        }
    }
}

data class FeedbackAgentClassificationResponse(
    val suggestedType: String?,
    val suggestedArea: String?,
    val severity: String,
)

data class FeedbackAgentImplementationResponse(
    val status: String?,
    val commit: String?,
    val files: List<String>,
    val validation: List<String>,
)
