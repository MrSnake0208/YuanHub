package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.operator.response.OperatorAnnotationListResponse
import com.lhs.share.hub.controller.operator.response.OperatorAnnotationResponse
import com.lhs.share.hub.controller.operator.response.OperatorGrowthTargetListResponse
import com.lhs.share.hub.controller.operator.response.OperatorGrowthTargetResponse
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorGrowthTargetRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import com.lhs.share.hub.repository.entity.OperatorAnnotation
import com.lhs.share.hub.repository.entity.OperatorGrowthTarget
import com.lhs.share.hub.service.account.AccountEventService
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class OperatorSubjectiveService(
    private val accountRepository: SubAccountRepository,
    private val catalogService: OperatorCatalogService,
    private val annotationRepository: OperatorAnnotationRepository,
    private val targetRepository: OperatorGrowthTargetRepository,
    private val favoriteRepository: InventoryAgentFavoriteRepository,
    private val accountEvents: AccountEventService? = null,
) {
    fun annotations(userId: String, accountId: String): OperatorAnnotationListResponse {
        requireAccount(userId, accountId)
        return OperatorAnnotationListResponse(
            accountId,
            annotationRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, accountId)
                .map(OperatorAnnotationResponse::of),
        )
    }

    fun putAnnotation(userId: String, accountId: String, operatorId: String, request: ObjectNode): OperatorAnnotationResponse {
        rejectUnknown(request, setOf("growth_state", "note", "expected_revision"))
        requireSubject(userId, accountId, operatorId)
        val expected = requiredRevision(request)
        if (!request.has("growth_state") && !request.has("note")) invalid("annotation update has no fields")
        val current = annotationRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        val growth = request.get("growth_state")?.let(::growthState) ?: current?.growthState ?: ACTIVE
        val note = if (request.has("note")) note(request.get("note")) else current?.note
        if (current != null && current.growthState == growth && current.note == note) return OperatorAnnotationResponse.of(current)
        if ((current?.revision ?: 0L) != expected) conflict("annotation_revision_conflict")
        val now = Instant.now()
        val saved = if (current == null) {
            try {
                annotationRepository.save(
                    OperatorAnnotation(
                        id = key(userId, accountId, operatorId),
                        userId = userId,
                        accountId = accountId,
                        operatorId = operatorId,
                        growthState = growth,
                        note = note,
                        revision = 1,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            } catch (_: DuplicateKeyException) {
                conflict("annotation_revision_conflict")
            }
        } else {
            annotationRepository.compareAndSet(userId, accountId, operatorId, expected, growth, note, now)
                ?: conflict("annotation_revision_conflict")
        }
        accountEvents?.publishChange(
            userId,
            accountId,
            "operator_annotation",
            mapOf(
                "operator_id" to operatorId,
                "revision" to saved.revision,
            ),
        )
        return OperatorAnnotationResponse.of(saved)
    }

    fun targets(userId: String, accountId: String): OperatorGrowthTargetListResponse {
        requireAccount(userId, accountId)
        return OperatorGrowthTargetListResponse(
            accountId,
            targetRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, accountId)
                .map(OperatorGrowthTargetResponse::of),
        )
    }

    fun putTarget(userId: String, accountId: String, operatorId: String, request: ObjectNode): OperatorGrowthTargetResponse? {
        rejectUnknown(request, setOf("level", "elite", "star_level", "huaji", "heart_paper", "targets", "expected_revision"))
        requireSubject(userId, accountId, operatorId)
        val expected = requiredRevision(request)
        if (request.has("targets")) {
            if (!request.get("targets").isNull) invalidTarget("targets must be null when present")
            return clearTarget(userId, accountId, operatorId, expected)
        }
        if (TARGET_FIELDS.none(request::has)) invalidTarget("target update has no fields")
        val current = targetRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        val level = value(request, "level", 0, 100, current?.targetLevel)
        val elite = value(request, "elite", 0, 17, current?.targetElite)
        val star = value(
            request,
            "star_level",
            0,
            if (catalogService.getOperator(operatorId)?.spOf ==
                null
            ) {
                31
            } else {
                5
            },
            current?.targetStarLevel,
        )
        val huaji = targetHuaji(request, operatorId, current)
        val heart = value(request, "heart_paper", 0, 1_000_000, current?.targetHeartPaper)
        if (current != null && listOf(level, elite, star, heart, huaji) ==
            listOf(current.targetLevel, current.targetElite, current.targetStarLevel, current.targetHeartPaper, current.targetHuaji)
        ) {
            return OperatorGrowthTargetResponse.of(current)
        }
        if ((current?.revision ?: 0L) != expected) conflict("growth_target_revision_conflict")
        val now = Instant.now()
        val saved = if (current == null) {
            try {
                targetRepository.save(
                    OperatorGrowthTarget(
                        id = key(userId, accountId, operatorId),
                        userId = userId,
                        accountId = accountId,
                        operatorId = operatorId,
                        targetLevel = level,
                        targetElite = elite,
                        targetStarLevel = star,
                        targetHeartPaper = heart,
                        targetHuaji = huaji,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            } catch (_: DuplicateKeyException) {
                conflict("growth_target_revision_conflict")
            }
        } else {
            targetRepository.compareAndSet(userId, accountId, operatorId, expected, level, elite, star, heart, now, huaji)
                ?: conflict("growth_target_revision_conflict")
        }
        accountEvents?.publishChange(
            userId,
            accountId,
            "operator_growth_target",
            mapOf(
                "operator_id" to operatorId,
                "revision" to saved.revision,
            ),
        )
        return OperatorGrowthTargetResponse.of(saved)
    }

    fun deleteTarget(userId: String, accountId: String, operatorId: String, expectedRevision: Long) {
        if (expectedRevision < 0) invalidTarget("expected_revision must be non-negative")
        requireSubject(userId, accountId, operatorId)
        clearTarget(userId, accountId, operatorId, expectedRevision)
    }

    /** Called by the v3 importer inside its record transaction. */
    fun applyAnnotationEntry(userId: String, accountId: String, entry: ObjectNode): Long {
        val operatorId = entry.path("operator_id").asText()
        requireSubject(userId, accountId, operatorId)
        val oldAnnotation = annotationRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        if (entry.has("growth_state") || entry.has("note")) {
            val growth = if (entry.has("growth_state")) growthState(entry.get("growth_state")) else oldAnnotation?.growthState ?: ACTIVE
            val nextNote = if (entry.has("note")) note(entry.get("note")) else oldAnnotation?.note
            if (oldAnnotation?.growthState != growth || oldAnnotation?.note != nextNote) {
                val now = Instant.now()
                annotationRepository.save(
                    oldAnnotation?.copy(
                        growthState = growth,
                        note = nextNote,
                        revision = oldAnnotation.revision + 1,
                        updatedAt = now,
                    ) ?: OperatorAnnotation(
                        id = key(userId, accountId, operatorId),
                        userId = userId,
                        accountId = accountId,
                        operatorId = operatorId,
                        growthState = growth,
                        note = nextNote,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            }
        }
        if (entry.has("favorite")) {
            val favorite = entry.path("favorite").booleanValue()
            val exists = favoriteRepository.existsByUserIdAndAccountIdAndAgentId(userId, accountId, operatorId)
            if (favorite && !exists) {
                favoriteRepository.save(InventoryAgentFavorite(userId = userId, accountId = accountId, agentId = operatorId))
            } else if (!favorite && exists) {
                favoriteRepository.deleteByUserIdAndAccountIdAndAgentId(userId, accountId, operatorId)
            }
        }
        if (entry.has("targets")) applyImportedTarget(userId, accountId, operatorId, entry.get("targets"))
        listOf("operator_annotation", "operator_growth_target", "operator_favorites").forEach {
            accountEvents?.publishChange(userId, accountId, it, mapOf("operator_id" to operatorId))
        }
        return annotationRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)?.revision ?: 0L
    }

    fun resetFull(userId: String, accountId: String) {
        val now = Instant.now()
        annotationRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, accountId).forEach { annotation ->
            if (annotation.growthState != ACTIVE || annotation.note != null) {
                annotationRepository.save(
                    annotation.copy(
                        growthState = ACTIVE,
                        note = null,
                        revision = annotation.revision + 1,
                        updatedAt = now,
                    ),
                )
            }
        }
        targetRepository.deleteAllByUserIdAndAccountId(userId, accountId)
        favoriteRepository.deleteAllByUserIdAndAccountId(userId, accountId)
        listOf("operator_annotation", "operator_growth_target", "operator_favorites").forEach {
            accountEvents?.publishChange(userId, accountId, it)
        }
    }

    fun subjectiveState(userId: String, accountId: String, operatorId: String): Map<String, Any?> {
        val annotation = annotationRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        val target = targetRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        return linkedMapOf(
            "growth_state" to (annotation?.growthState ?: ACTIVE),
            "favorite" to favoriteRepository.existsByUserIdAndAccountIdAndAgentId(userId, accountId, operatorId),
            "note" to annotation?.note,
            "targets" to target?.let {
                linkedMapOf(
                    "level" to it.targetLevel,
                    "elite" to it.targetElite,
                    "star_level" to it.targetStarLevel,
                    "heart_paper" to it.targetHeartPaper,
                    "huaji" to it.targetHuaji,
                ).filterValues { value -> value != null }
            },
        )
    }

    fun subjectiveRevision(userId: String, accountId: String, operatorId: String): Long = maxOf(
        annotationRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)?.revision ?: 0,
        targetRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)?.revision ?: 0,
    )

    fun subjectiveOperatorIds(userId: String, accountId: String): Set<String> =
        annotationRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, accountId).map { it.operatorId }.toSet() +
            targetRepository.findAllByUserIdAndAccountIdOrderByOperatorIdAsc(userId, accountId).map { it.operatorId } +
            favoriteRepository.findAllByUserIdAndAccountIdOrderByAgentIdAsc(userId, accountId).map { it.agentId }

    private fun applyImportedTarget(userId: String, accountId: String, operatorId: String, node: JsonNode) {
        val old = targetRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
        if (node.isNull) {
            if (old != null) targetRepository.deleteByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
            return
        }
        val target = node as ObjectNode
        val level = value(target, "level", 0, 100, old?.targetLevel)
        val elite = value(target, "elite", 0, 17, old?.targetElite)
        val star = value(target, "star_level", 0, if (catalogService.getOperator(operatorId)?.spOf == null) 31 else 5, old?.targetStarLevel)
        val huaji = targetHuaji(target, operatorId, old)
        val heart = value(target, "heart_paper", 0, 1_000_000, old?.targetHeartPaper)
        if (old != null && listOf(level, elite, star, heart, huaji) ==
            listOf(old.targetLevel, old.targetElite, old.targetStarLevel, old.targetHeartPaper, old.targetHuaji)
        ) {
            return
        }
        val now = Instant.now()
        targetRepository.save(
            old?.copy(
                targetLevel = level,
                targetElite = elite,
                targetStarLevel = star,
                targetHeartPaper = heart,
                targetHuaji = huaji,
                revision = old.revision + 1,
                updatedAt = now,
            ) ?: OperatorGrowthTarget(
                id = key(userId, accountId, operatorId),
                userId = userId,
                accountId = accountId,
                operatorId = operatorId,
                targetLevel = level,
                targetElite = elite,
                targetStarLevel = star,
                targetHeartPaper = heart,
                targetHuaji = huaji,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun clearTarget(userId: String, accountId: String, operatorId: String, expected: Long): OperatorGrowthTargetResponse? {
        val current = targetRepository.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId) ?: run {
            if (expected != 0L) conflict("growth_target_revision_conflict")
            return null
        }
        if (current.revision != expected) conflict("growth_target_revision_conflict")
        if (!targetRepository.deleteIfRevision(userId, accountId, operatorId, expected)) {
            conflict("growth_target_revision_conflict")
        }
        accountEvents?.publishChange(userId, accountId, "operator_growth_target", mapOf("operator_id" to operatorId))
        return null
    }

    private fun requireSubject(userId: String, accountId: String, operatorId: String) {
        requireAccount(userId, accountId)
        if (catalogService.getOperator(operatorId) == null) {
            throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found", operatorId = operatorId)
        }
    }

    private fun requireAccount(userId: String, accountId: String) = accountRepository.findByUserIdAndAccountId(userId, accountId)
        ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

    private fun requiredRevision(request: ObjectNode): Long {
        val node = request.get("expected_revision")
        if (node == null || !node.isIntegralNumber || !node.canConvertToLong() || node.longValue() < 0) {
            invalid("expected_revision must be a non-negative integer")
        }
        return node.longValue()
    }

    private fun targetHuaji(
        node: ObjectNode,
        operatorId: String,
        old: OperatorGrowthTarget?,
    ): com.lhs.share.hub.repository.entity.OperatorHuaji? {
        val catalog = checkNotNull(catalogService.getOperator(operatorId))
        if (node.has("huaji") && node.has("star_level")) invalidTarget("Use one target huaji representation")
        if (node.has("huaji")) {
            return OperatorHuajiRules.patch(
                node.get("huaji"),
                catalog,
                old?.targetHuaji ?: com.lhs.share.hub.repository.entity.OperatorHuaji(true, null, null),
            )
        }
        if (node.hasNonNull("star_level")) {
            val raw = node.path("star_level").asInt()
            if (OperatorHuajiRules.anomalous(raw, catalog)) invalidTarget("Hidden rarity legacy target requires review")
            return OperatorHuajiRules.legacy(raw, catalog, old?.targetHuaji)
        }
        return old?.targetHuaji
    }

    private fun value(node: ObjectNode, field: String, min: Int, max: Int, fallback: Int?): Int? {
        if (!node.has(field)) return fallback
        val value = node.get(field)
        if (!value.isIntegralNumber || !value.canConvertToInt() || value.intValue() !in min..max) {
            invalidTarget("$field must be an integer in $min..$max")
        }
        return value.intValue()
    }

    private fun growthState(node: JsonNode): String {
        val value = node.takeIf(JsonNode::isTextual)?.asText()
        if (value !in GROWTH_STATES) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_growth_state", "Invalid growth_state")
        }
        return checkNotNull(value)
    }

    private fun note(node: JsonNode): String? {
        if (node.isNull) return null
        if (!node.isTextual || node.asText().length > 1000) invalid("note must be null or a string with at most 1000 characters")
        return node.asText()
    }

    private fun rejectUnknown(request: ObjectNode, allowed: Set<String>) {
        request.fieldNames().forEachRemaining { if (it !in allowed) invalid("Unknown field: $it") }
    }

    private fun conflict(code: String): Nothing = throw OperatorApiException(HttpStatus.CONFLICT, code, "Revision conflict")

    private fun invalid(message: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)

    private fun invalidTarget(message: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_growth_target", message)

    private fun key(userId: String, accountId: String, operatorId: String) = "$userId:$accountId:$operatorId"

    companion object {
        const val ACTIVE = "active"
        val GROWTH_STATES = setOf(ACTIVE, "graduated", "skip", "discarded")
        val TARGET_FIELDS = setOf("level", "elite", "star_level", "huaji", "heart_paper")
    }
}
