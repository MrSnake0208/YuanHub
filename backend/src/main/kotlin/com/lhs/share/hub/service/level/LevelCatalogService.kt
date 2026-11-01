package com.lhs.share.hub.service.level

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.level.request.LevelCatalogImportEntry
import com.lhs.share.hub.controller.level.request.LevelCatalogWriteRequest
import com.lhs.share.hub.controller.level.response.LevelCatalogAdminResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogExportEntry
import com.lhs.share.hub.controller.level.response.LevelCatalogExportResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogHistoryResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogImportIssue
import com.lhs.share.hub.controller.level.response.LevelCatalogImportResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogItemResponse
import com.lhs.share.hub.controller.level.response.LevelCatalogResponse
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.entity.level.LevelCatalogRevisionAction
import com.lhs.share.hub.repository.entity.level.LevelCatalogRevisionEntity
import com.lhs.share.hub.repository.entity.level.LevelStatus
import com.lhs.share.hub.repository.entity.level.snapshot
import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.repository.level.LevelCatalogRevisionRepository
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.UUID

@Service
class LevelCatalogService(
    private val repository: LevelCatalogRepository,
    private val revisionRepository: LevelCatalogRevisionRepository,
    private val objectMapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactionTemplate: TransactionTemplate,
) {
    fun catalog(
        game: String? = null,
        catOne: String? = null,
        catTwo: String? = null,
        query: String? = null,
        includeArchived: Boolean = false,
        openOnly: Boolean = false,
    ): LevelCatalogResponse {
        val levels = filter(
            repository.findAllByOrderBySortOrderAscLevelKeyAsc(),
            game,
            catOne,
            catTwo,
            query,
            includeArchived,
            openOnly,
        )
        return LevelCatalogResponse(
            catalogVersion = currentCatalogVersion(),
            levels = levels.map(LevelCatalogItemResponse::of),
        )
    }

    fun get(levelKey: String): LevelCatalogItemResponse = LevelCatalogItemResponse.of(findRequired(levelKey))

    fun listForAdmin(
        game: String? = null,
        catOne: String? = null,
        catTwo: String? = null,
        query: String? = null,
        includeArchived: Boolean = true,
        openOnly: Boolean = false,
    ): List<LevelCatalogAdminResponse> = filter(
        repository.findAllByOrderBySortOrderAscLevelKeyAsc(),
        game,
        catOne,
        catTwo,
        query,
        includeArchived,
        openOnly,
    ).map(LevelCatalogAdminResponse::of)

    fun currentCatalogVersion(): String = repository.findTopByOrderByUpdatedAtDesc()?.updatedAt?.toString() ?: "0"

    fun create(actorUserId: String, request: LevelCatalogWriteRequest): LevelCatalogAdminResponse = inTransaction {
        if (request.expectedRevision != null) {
            invalid("expected_revision", "Create must not provide expected_revision")
        }
        val payload = normalizeWrite(request, null, requireAll = true)
        ensureUnique(payload, null)
        val now = nextCatalogTimestamp()
        val entity = LevelCatalogEntity(
            levelKey = newLevelKey(),
            game = payload.game,
            catOne = payload.catOne,
            catTwo = payload.catTwo,
            catThree = payload.catThree,
            name = payload.name,
            levelId = payload.levelId,
            stageId = payload.stageId,
            status = payload.status,
            isOpen = payload.isOpen,
            endTime = payload.endTime,
            sortOrder = payload.sortOrder,
            revision = 0,
            createdAt = now,
            updatedAt = now,
            createdBy = actorUserId,
            updatedBy = actorUserId,
        )
        val saved = save(entity)
        recordHistory(actorUserId, LevelCatalogRevisionAction.CREATE, null, saved)
        LevelCatalogAdminResponse.of(saved)
    }

    fun update(actorUserId: String, levelKey: String, request: LevelCatalogWriteRequest): LevelCatalogAdminResponse = inTransaction {
        val existing = findRequired(levelKey)
        val expectedRevision = request.expectedRevision
            ?: invalid("expected_revision", "expected_revision is required")
        if (expectedRevision < 0) invalid("expected_revision", "expected_revision must not be negative")
        if (expectedRevision != existing.revision) {
            revisionConflict(levelKey)
        }
        request.status?.let { requestedStatus ->
            if (parseStatus(requestedStatus) != existing.status) {
                invalid("status", "status changes must use the archive or restore endpoint")
            }
        }
        val payload = normalizeWrite(request, existing, requireAll = false)
        ensureUnique(payload, levelKey)
        val replacement = existing.copy(
            game = payload.game,
            catOne = payload.catOne,
            catTwo = payload.catTwo,
            catThree = payload.catThree,
            name = payload.name,
            levelId = payload.levelId,
            stageId = payload.stageId,
            status = payload.status,
            isOpen = payload.isOpen,
            endTime = payload.endTime,
            sortOrder = payload.sortOrder,
            revision = expectedRevision + 1,
            updatedAt = nextCatalogTimestamp(),
            updatedBy = actorUserId,
        )
        val saved = try {
            repository.updateIfRevision(levelKey, expectedRevision, replacement)
                ?: revisionConflict(levelKey)
        } catch (_: DuplicateKeyException) {
            throw conflict(levelKey)
        } catch (_: DataIntegrityViolationException) {
            throw conflict(levelKey)
        }
        recordHistory(actorUserId, LevelCatalogRevisionAction.UPDATE, existing, saved)
        LevelCatalogAdminResponse.of(saved)
    }

    fun archive(actorUserId: String, levelKey: String, expectedRevision: Long): LevelCatalogAdminResponse = inTransaction {
        changeStatus(actorUserId, levelKey, expectedRevision, LevelStatus.ARCHIVED, LevelCatalogRevisionAction.ARCHIVE)
    }

    fun restore(actorUserId: String, levelKey: String, expectedRevision: Long): LevelCatalogAdminResponse = inTransaction {
        changeStatus(actorUserId, levelKey, expectedRevision, LevelStatus.ACTIVE, LevelCatalogRevisionAction.RESTORE)
    }

    fun history(levelKey: String): List<LevelCatalogHistoryResponse> {
        findRequired(levelKey)
        return revisionRepository.findByLevelKeyOrderByOccurredAtDesc(levelKey).map(LevelCatalogHistoryResponse::of)
    }

    fun export(): LevelCatalogExportResponse = LevelCatalogExportResponse(
        catalogVersion = currentCatalogVersion(),
        levels = repository.findAllByOrderBySortOrderAscLevelKeyAsc().map(LevelCatalogExportEntry::of),
    )

    fun previewImport(_actorUserId: String, body: JsonNode): LevelCatalogImportResponse {
        // actorUserId is part of the service contract so preview/commit share the same authenticated boundary;
        // preview intentionally never uses it to write a history row.
        val prepared = prepareImport(body)
        return prepared.result(currentCatalogVersion())
    }

    fun commitImport(actorUserId: String, body: JsonNode): LevelCatalogImportResponse {
        val prepared = prepareImport(body)
        if (prepared.issues.isNotEmpty()) {
            val code = if (prepared.errors.isNotEmpty()) "level_import_invalid" else "level_import_conflict"
            throw LevelCatalogApiException(
                if (prepared.errors.isNotEmpty()) HttpStatus.UNPROCESSABLE_ENTITY else HttpStatus.CONFLICT,
                code,
                "Level catalog import contains invalid or conflicting entries",
            )
        }
        return inTransaction {
            prepared.plans.forEach { plan ->
                if (plan.existing == null) {
                    val now = nextCatalogTimestamp()
                    val key = plan.levelKey ?: newLevelKey()
                    val created = save(
                        LevelCatalogEntity(
                            levelKey = key,
                            game = plan.payload.game,
                            catOne = plan.payload.catOne,
                            catTwo = plan.payload.catTwo,
                            catThree = plan.payload.catThree,
                            name = plan.payload.name,
                            levelId = plan.payload.levelId,
                            stageId = plan.payload.stageId,
                            status = plan.payload.status,
                            isOpen = plan.payload.isOpen,
                            endTime = plan.payload.endTime,
                            sortOrder = plan.payload.sortOrder,
                            revision = 0,
                            createdAt = now,
                            updatedAt = now,
                            createdBy = actorUserId,
                            updatedBy = actorUserId,
                        ),
                    )
                    recordHistory(actorUserId, LevelCatalogRevisionAction.IMPORT, null, created)
                } else if (!plan.unchanged) {
                    val existing = plan.existing
                    val replacement = existing.copy(
                        game = plan.payload.game,
                        catOne = plan.payload.catOne,
                        catTwo = plan.payload.catTwo,
                        catThree = plan.payload.catThree,
                        name = plan.payload.name,
                        levelId = plan.payload.levelId,
                        stageId = plan.payload.stageId,
                        status = plan.payload.status,
                        isOpen = plan.payload.isOpen,
                        endTime = plan.payload.endTime,
                        sortOrder = plan.payload.sortOrder,
                        revision = existing.revision + 1,
                        updatedAt = nextCatalogTimestamp(),
                        updatedBy = actorUserId,
                    )
                    val updated = repository.updateIfRevision(existing.levelKey, existing.revision, replacement)
                        ?: revisionConflict(existing.levelKey)
                    recordHistory(actorUserId, LevelCatalogRevisionAction.IMPORT, existing, updated)
                }
            }
            prepared.result(currentCatalogVersion())
        }
    }

    private fun changeStatus(
        actorUserId: String,
        levelKey: String,
        expectedRevision: Long,
        status: LevelStatus,
        action: LevelCatalogRevisionAction,
    ): LevelCatalogAdminResponse {
        val existing = findRequired(levelKey)
        if (expectedRevision < 0) invalid("expected_revision", "expected_revision must not be negative")
        if (expectedRevision != existing.revision) revisionConflict(levelKey)
        if (existing.status == status) return LevelCatalogAdminResponse.of(existing)
        val replacement = existing.copy(
            status = status,
            revision = expectedRevision + 1,
            updatedAt = nextCatalogTimestamp(),
            updatedBy = actorUserId,
        )
        val saved = repository.updateIfRevision(levelKey, expectedRevision, replacement)
            ?: revisionConflict(levelKey)
        recordHistory(actorUserId, action, existing, saved)
        return LevelCatalogAdminResponse.of(saved)
    }

    private fun normalizeWrite(request: LevelCatalogWriteRequest, existing: LevelCatalogEntity?, requireAll: Boolean): LevelPayload {
        return normalize(
            levelKey = null,
            game = request.game ?: existing?.game,
            catOne = request.catOne ?: existing?.catOne,
            catTwo = request.catTwo ?: existing?.catTwo,
            catThree = request.catThree ?: existing?.catThree,
            name = request.name ?: existing?.name,
            levelId = request.levelId ?: existing?.levelId,
            stageId = request.stageId ?: existing?.stageId,
            status = request.status ?: existing?.status?.name,
            isOpen = request.isOpen ?: existing?.isOpen,
            endTime = resolveWriteEndTime(request.endTime, existing),
            sortOrder = request.sortOrder ?: existing?.sortOrder,
            requireAll = requireAll,
        )
    }

    private fun resolveWriteEndTime(value: JsonNode?, existing: LevelCatalogEntity?): String? = when {
        value == null -> existing?.endTime?.toString()
        value.isNull -> null
        value.isTextual -> value.asText()
        else -> invalid("end_time", "end_time must be a string or null")
    }

    private fun normalizeImport(entry: LevelCatalogImportEntry): LevelPayload = normalize(
        levelKey = entry.levelKey,
        game = entry.game,
        catOne = entry.catOne,
        catTwo = entry.catTwo,
        catThree = entry.catThree,
        name = entry.name,
        levelId = entry.levelId,
        stageId = entry.stageId,
        status = entry.status,
        isOpen = entry.isOpen,
        endTime = entry.endTime,
        sortOrder = entry.sortOrder,
        requireAll = true,
    )

    private fun normalize(
        levelKey: String?,
        game: String?,
        catOne: String?,
        catTwo: String?,
        catThree: String?,
        name: String?,
        levelId: String?,
        stageId: String?,
        status: String?,
        isOpen: Boolean?,
        endTime: String?,
        sortOrder: Int?,
        requireAll: Boolean,
    ): LevelPayload {
        val normalizedKey = levelKey?.trim()?.takeIf(String::isNotEmpty)
        if (normalizedKey != null && !LEVEL_KEY_PATTERN.matches(normalizedKey)) {
            invalid("id", "id must start with lvl_ and contain only letters, digits, _ or -")
        }
        val normalizedGame = required(game, "game", requireAll).trim()
        if (normalizedGame !in SUPPORTED_GAMES) invalidCode("invalid_game", "game", "Unsupported game")
        val normalizedCatOne = required(catOne, "cat_one", requireAll).trim()
        val normalizedCatTwo = catTwo?.trim().orEmpty()
        val normalizedCatThree = catThree?.trim().orEmpty()
        val normalizedName = required(name, "name", requireAll).trim()
        val normalizedLevelId = required(levelId, "level_id", requireAll).trim()
        val normalizedStageId = required(stageId, "stage_id", requireAll).trim()
        length(normalizedCatOne, "cat_one", CATEGORY_MAX)
        length(normalizedCatTwo, "cat_two", CATEGORY_MAX)
        length(normalizedCatThree, "cat_three", CATEGORY_MAX)
        length(normalizedName, "name", TEXT_MAX)
        length(normalizedLevelId, "level_id", ID_MAX)
        length(normalizedStageId, "stage_id", ID_MAX)
        val normalizedStatus = parseStatus(status ?: LevelStatus.ACTIVE.name)
        val normalizedEndTime = parseEndTime(endTime)
        val normalizedSortOrder = sortOrder ?: 0
        if (normalizedSortOrder !in SORT_ORDER_RANGE) invalid("sort_order", "sort_order is out of range")
        return LevelPayload(
            levelKey = normalizedKey,
            game = normalizedGame,
            catOne = normalizedCatOne,
            catTwo = normalizedCatTwo,
            catThree = normalizedCatThree,
            name = normalizedName,
            levelId = normalizedLevelId,
            stageId = normalizedStageId,
            status = normalizedStatus,
            isOpen = isOpen ?: true,
            endTime = normalizedEndTime,
            sortOrder = normalizedSortOrder,
        )
    }

    private fun prepareImport(body: JsonNode): PreparedImport {
        val entriesNode = when {
            body.isArray -> body
            body.path("levels").isArray -> body.path("levels")
            body.path("data").path("levels").isArray -> body.path("data").path("levels")
            else -> throw LevelCatalogApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "level_import_invalid",
                "Import body must contain a levels array",
            )
        }
        val plans = mutableListOf<ImportPlan>()
        val issues = mutableListOf<LevelCatalogImportIssue>()
        val errors = mutableListOf<LevelCatalogImportIssue>()
        val seen = mutableMapOf<String, Pair<LevelPayload, Int>>()
        val seenStage = mutableMapOf<String, Pair<LevelPayload, Int>>()
        val seenLevel = mutableMapOf<String, Pair<LevelPayload, Int>>()
        var duplicateCount = 0
        entriesNode.forEachIndexed { index, node ->
            val entry = try {
                objectMapper.treeToValue(node, LevelCatalogImportEntry::class.java)
            } catch (e: Exception) {
                val issue = issue(index, null, "level_import_invalid", "Invalid level entry: ${e.message}")
                issues += issue
                errors += issue
                return@forEachIndexed
            }
            val payload = try {
                normalizeImport(entry)
            } catch (e: LevelCatalogApiException) {
                val issueCode = if (e.code == "schema_validation_failed") "level_import_invalid" else e.code
                val issue = issue(index, entry.levelKey, issueCode, e.message)
                issues += issue
                errors += issue
                return@forEachIndexed
            }
            val identity = payload.levelKey ?: "${payload.game}|${payload.stageId}|${payload.levelId}"
            val previous = seen[identity]
            if (previous != null) {
                if (previous.first == payload) {
                    duplicateCount++
                    return@forEachIndexed
                }
                val issue = issue(index, payload.levelKey, "level_import_conflict", "Duplicate import identity has different content")
                issues += issue
                return@forEachIndexed
            }
            val stageIdentity = "${payload.game}|${payload.stageId}"
            val levelIdentity = "${payload.game}|${payload.levelId}"
            if (listOfNotNull(seenStage[stageIdentity], seenLevel[levelIdentity]).any { it.first != payload }) {
                val issue = issue(index, payload.levelKey, "level_import_conflict", "Import entry conflicts with another entry")
                issues += issue
                return@forEachIndexed
            }
            seen[identity] = payload to index
            seenStage[stageIdentity] = payload to index
            seenLevel[levelIdentity] = payload to index
            val existingByKey = payload.levelKey?.let(repository::findByLevelKey)
            val existingByStage = repository.findByGameAndStageId(payload.game, payload.stageId)
            val existingByLevel = repository.findByGameAndLevelId(payload.game, payload.levelId)
            val existing = existingByKey ?: existingByStage ?: existingByLevel
            val uniqueConflict = listOfNotNull(existingByStage, existingByLevel)
                .distinctBy(LevelCatalogEntity::levelKey)
                .firstOrNull { it.levelKey != existing?.levelKey }
            if (
                uniqueConflict != null ||
                (payload.levelKey != null && existingByKey == null && (existingByStage != null || existingByLevel != null)) ||
                (existingByKey != null && (existingByStage?.levelKey ?: existingByKey.levelKey) != existingByKey.levelKey)
            ) {
                val issue = issue(index, payload.levelKey, "level_import_conflict", "Import entry conflicts with an existing level")
                issues += issue
                return@forEachIndexed
            }
            plans += ImportPlan(
                index = index,
                levelKey = payload.levelKey,
                payload = payload,
                existing = existing,
                unchanged = existing != null && sameContent(existing, payload),
            )
        }
        return PreparedImport(plans, issues, errors, duplicateCount)
    }

    private fun ensureUnique(payload: LevelPayload, currentLevelKey: String?) {
        val stage = repository.findByGameAndStageId(payload.game, payload.stageId)
        if (stage != null && stage.levelKey != currentLevelKey) conflict(currentLevelKey)
        val level = repository.findByGameAndLevelId(payload.game, payload.levelId)
        if (level != null && level.levelKey != currentLevelKey) conflict(currentLevelKey)
    }

    private fun sameContent(entity: LevelCatalogEntity, payload: LevelPayload): Boolean {
        return entity.game == payload.game &&
            entity.catOne == payload.catOne &&
            entity.catTwo == payload.catTwo &&
            entity.catThree == payload.catThree &&
            entity.name == payload.name &&
            entity.levelId == payload.levelId &&
            entity.stageId == payload.stageId &&
            entity.status == payload.status &&
            entity.isOpen == payload.isOpen &&
            (entity.endTime?.equals(payload.endTime) ?: (payload.endTime == null)) &&
            entity.sortOrder == payload.sortOrder
    }

    private fun filter(
        entities: List<LevelCatalogEntity>,
        game: String?,
        catOne: String?,
        catTwo: String?,
        query: String?,
        includeArchived: Boolean,
        openOnly: Boolean,
    ): List<LevelCatalogEntity> {
        game?.trim()?.let { if (it !in SUPPORTED_GAMES) invalidCode("invalid_game", "game", "Unsupported game") }
        val q = query?.trim()?.lowercase(Locale.ROOT)?.takeIf(String::isNotEmpty)
        return entities.filter { entity ->
            val searchable = listOf(
                entity.game,
                entity.catOne,
                entity.catTwo,
                entity.catThree,
                entity.name,
                entity.levelId,
                entity.stageId,
            )
            (includeArchived || entity.status == LevelStatus.ACTIVE) &&
                (!openOnly || entity.isOpen) &&
                (game == null || entity.game == game.trim()) &&
                (catOne == null || entity.catOne == catOne.trim()) &&
                (catTwo == null || entity.catTwo == catTwo.trim()) &&
                (q == null || searchable.any { it.lowercase(Locale.ROOT).contains(q) })
        }
    }

    private fun findRequired(levelKey: String): LevelCatalogEntity = repository.findByLevelKey(levelKey)
        ?: throw LevelCatalogApiException(HttpStatus.NOT_FOUND, "level_not_found", "Level not found", levelKey)

    private fun save(entity: LevelCatalogEntity): LevelCatalogEntity = try {
        repository.save(entity)
    } catch (_: DuplicateKeyException) {
        throw conflict(entity.levelKey)
    } catch (_: DataIntegrityViolationException) {
        throw conflict(entity.levelKey)
    }

    private fun recordHistory(
        actorUserId: String,
        action: LevelCatalogRevisionAction,
        before: LevelCatalogEntity?,
        after: LevelCatalogEntity,
    ) {
        revisionRepository.save(
            LevelCatalogRevisionEntity(
                levelKey = after.levelKey,
                action = action,
                revision = after.revision,
                actorUserId = actorUserId,
                before = before?.snapshot(),
                after = after.snapshot(),
                occurredAt = after.updatedAt,
            ),
        )
    }

    private fun <T : Any> inTransaction(block: () -> T): T = requireNotNull(transactionTemplate.execute { block() })

    private fun required(value: String?, field: String, requireAll: Boolean): String {
        if (value == null) {
            if (requireAll) invalid(field, "$field is required")
            return ""
        }
        if (value.trim().isEmpty()) invalid(field, "$field must not be blank")
        return value
    }

    private fun length(value: String, field: String, max: Int) {
        if (value.length > max) invalid(field, "$field must be at most $max characters")
    }

    private fun parseStatus(value: String): LevelStatus = try {
        LevelStatus.valueOf(value.trim().uppercase(Locale.ROOT))
    } catch (_: IllegalArgumentException) {
        invalidCode("invalid_level_status", "status", "status must be ACTIVE or ARCHIVED")
    }

    private fun parseEndTime(value: String?): Instant? {
        val text = value?.trim()?.takeIf(String::isNotEmpty) ?: return null
        return try {
            OffsetDateTime.parse(text).toInstant()
        } catch (_: DateTimeParseException) {
            invalid("end_time", "end_time must be an ISO-8601 timestamp with timezone")
        }
    }

    private fun issue(index: Int, levelKey: String?, code: String, message: String) =
        LevelCatalogImportIssue(index, levelKey, code, message)

    private fun invalid(field: String, message: String): Nothing = throw LevelCatalogApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "schema_validation_failed",
        message,
        fieldPath = field,
    )

    private fun invalidCode(code: String, field: String, message: String): Nothing = throw LevelCatalogApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        code,
        message,
        fieldPath = field,
    )

    private fun conflict(levelKey: String?): Nothing = throw LevelCatalogApiException(
        HttpStatus.CONFLICT,
        "level_conflict",
        "Level stage_id or level_id is already used",
        levelKey = levelKey,
    )

    private fun revisionConflict(levelKey: String): Nothing = throw LevelCatalogApiException(
        HttpStatus.CONFLICT,
        "level_revision_conflict",
        "Level revision has changed",
        levelKey = levelKey,
        fieldPath = "expected_revision",
    )

    private fun nextCatalogTimestamp(): Instant {
        val now = Instant.now()
        val current = repository.findTopByOrderByUpdatedAtDesc()?.updatedAt
        return if (current != null && !now.isAfter(current)) current.plusNanos(1) else now
    }

    private fun newLevelKey(): String = "lvl_" + UUID.randomUUID().toString().replace("-", "")

    private data class LevelPayload(
        val levelKey: String?,
        val game: String,
        val catOne: String,
        val catTwo: String,
        val catThree: String,
        val name: String,
        val levelId: String,
        val stageId: String,
        val status: LevelStatus,
        val isOpen: Boolean,
        val endTime: Instant?,
        val sortOrder: Int,
    )

    private data class ImportPlan(
        val index: Int,
        val levelKey: String?,
        val payload: LevelPayload,
        val existing: LevelCatalogEntity?,
        val unchanged: Boolean,
    )

    private data class PreparedImport(
        val plans: List<ImportPlan>,
        val issues: List<LevelCatalogImportIssue>,
        val errors: List<LevelCatalogImportIssue>,
        val duplicateCount: Int,
    ) {
        fun result(catalogVersion: String) = LevelCatalogImportResponse(
            createdCount = plans.count { it.existing == null },
            updatedCount = plans.count { it.existing != null && !it.unchanged },
            unchangedCount = plans.count { it.unchanged },
            duplicateCount = duplicateCount,
            errorCount = errors.size,
            conflictCount = issues.count { it.code == "level_import_conflict" },
            conflicts = issues.filter { it.code == "level_import_conflict" },
            errors = errors,
            catalogVersion = catalogVersion,
        )
    }

    companion object {
        val SUPPORTED_GAMES = setOf("代号鸢", "如鸢", "通用")
        private val LEVEL_KEY_PATTERN = Regex("^lvl_[A-Za-z0-9_-]{1,96}$")
        private const val CATEGORY_MAX = 128
        private const val TEXT_MAX = 256
        private const val ID_MAX = 512
        private val SORT_ORDER_RANGE = -1_000_000..1_000_000
    }
}
