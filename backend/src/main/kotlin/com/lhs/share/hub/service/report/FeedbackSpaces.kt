package com.lhs.share.hub.service.report

import com.lhs.share.hub.repository.entity.FeedbackTicket
import org.springframework.data.mongodb.core.query.Criteria

object FeedbackSpaces {
    const val DEFAULT = "yuanhub"
    const val ALL = "all"

    fun id(ticket: FeedbackTicket): String = ticket.spaceId ?: DEFAULT

    fun criteria(ids: Set<String>): Criteria {
        val values = ids.map<String, String?> { it }.toMutableList()
        if (DEFAULT in ids) values += null // Mongo null also matches missing historical fields.
        return Criteria.where("spaceId").`in`(values)
    }
}
