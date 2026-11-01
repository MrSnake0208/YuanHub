package com.lhs.share.hub.service.report

import com.lhs.share.hub.repository.entity.FeedbackTicket

object FeedbackWorkflow {
    const val UNASSIGNED = "UNASSIGNED"
    const val PROCESSING = "PROCESSING"
    const val DEV_HANDOFF = "DEV_HANDOFF"
    val stages = setOf(UNASSIGNED, PROCESSING, DEV_HANDOFF)

    val areas = FeedbackArea.all
    val labels = FeedbackArea.labels

    fun stage(ticket: FeedbackTicket): String = ticket.workflowStage ?: UNASSIGNED

    fun area(ticket: FeedbackTicket): String = ticket.workArea?.takeIf { it.isNotBlank() }
        ?: ticket.area?.trim()?.uppercase()?.takeIf { it in FeedbackArea.all }
        ?: ticket.category?.trim()?.uppercase()?.takeIf { it in FeedbackArea.all }
        ?: FeedbackArea.OTHER

    fun needsReply(ticket: FeedbackTicket): Boolean {
        val lastReporter = ticket.messages.indexOfLast { it.senderKind == "REPORTER" }
        return lastReporter >= 0 && ticket.messages.drop(lastReporter + 1).none { it.senderKind == "ADMIN" }
    }

    fun lastReporterIndex(ticket: FeedbackTicket): Int = ticket.messages.indexOfLast { it.senderKind == "REPORTER" }

    fun isActive(ticket: FeedbackTicket): Boolean = ticket.status == "OPEN" && ticket.mergedIntoId == null
}
