package com.lhs.share.hub.controller.achievement.request

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.objectFields
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.text
import com.lhs.share.hub.repository.entity.AchievementCandidate
import com.lhs.share.hub.service.achievement.AchievementCatalogDecoder

data class AchievementSuggestionSubmitRequest(
    val clientRequestId: String,
    val candidate: AchievementCandidate,
    val sourceUrl: String,
    val submissionNote: String?,
)
data class AchievementSuggestionAcceptRequest(
    val expectedVersion: Long,
    val expectedCatalogRevision: Long,
    val candidate: AchievementCandidate,
    val reviewNote: String?,
)
data class AchievementSuggestionRejectRequest(val expectedVersion: Long, val reviewNote: String)

class AchievementSuggestionRequestDecoder(private val mapper: ObjectMapper) {
    fun submit(node: JsonNode): AchievementSuggestionSubmitRequest {
        objectFields(node, setOf("client_request_id", "candidate", "source_url", "submission_note"))
        return AchievementSuggestionSubmitRequest(
            text(node, "client_request_id"),
            candidate(node.path("candidate")),
            text(node, "source_url"),
            optional(node, "submission_note"),
        )
    }
    fun accept(node: JsonNode): AchievementSuggestionAcceptRequest {
        objectFields(node, setOf("expected_version", "expected_catalog_revision", "candidate", "review_note"))
        return AchievementSuggestionAcceptRequest(
            version(node, "expected_version"),
            version(node, "expected_catalog_revision"),
            candidate(node.path("candidate")),
            optional(node, "review_note"),
        )
    }
    fun reject(node: JsonNode): AchievementSuggestionRejectRequest {
        objectFields(node, setOf("expected_version", "review_note"))
        return AchievementSuggestionRejectRequest(version(node, "expected_version"), text(node, "review_note"))
    }
    private fun optional(node: JsonNode, key: String) = node[key]?.takeUnless { it.isNull }?.let { text(node, key) }
    private fun version(node: JsonNode, key: String): Long =
        node[key]?.takeIf { it.isIntegralNumber && it.canConvertToLong() && it.longValue() in 0 until Long.MAX_VALUE }?.longValue()
            ?: invalid("$key 必须是非负整数")
    private fun candidate(node: JsonNode): AchievementCandidate {
        objectFields(node, setOf("game", "category_id", "name", "condition", "is_hidden", "rewards", "target", "linked_metric"))
        val row = node.deepCopy<ObjectNode>().put("achievement_id", "yh_candidate").put("sort", 0)
        val e = AchievementCatalogDecoder.entry(row, mapper)
        return AchievementCandidate(e.game, e.categoryId, e.name, e.condition, e.isHidden, e.rewards, e.target, e.linkedMetric)
    }
}
