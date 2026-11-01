package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorScanImportEvent
import com.lhs.share.hub.controller.operator.response.OperatorScanReviewResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3FieldChange
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportCommitResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportItem
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportPreviewResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3Issue
import com.lhs.share.hub.controller.operator.response.toCommitResponse
import com.lhs.share.hub.controller.operator.response.toPreviewResponse
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorScanReview
import com.lhs.share.hub.repository.entity.OperatorV3ImportRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.OffsetDateTime

@Service
class OperatorV3ImportService(
    private val objectMapper: ObjectMapper,
    private val schemaValidator: OperatorV3SchemaValidator,
    private val accountRepository: SubAccountRepository,
    private val catalogService: OperatorCatalogService,
    private val operatorService: OperatorService,
    private val importRecordRepository: OperatorV3ImportRecordRepository,
    private val accountEventService: AccountEventService,
    private val scanReviewRepository: OperatorScanReviewRepository,
    private val subjectiveService: OperatorSubjectiveService? = null,
    @param:Qualifier("hubTransactionTemplate") private val transactionTemplate: TransactionTemplate? = null,
) {
    fun previewBrowser(userId: String, body: JsonNode): OperatorV3ImportPreviewResponse =
        prepare(userId, parseCommand(body, null)).map(PreparedItem::response).toPreviewResponse()

    fun commitBrowser(userId: String, body: JsonNode): OperatorV3ImportCommitResponse = commit(userId, parseCommand(body, null))

    fun previewScan(userId: String, accountId: String, document: JsonNode): OperatorV3ImportPreviewResponse =
        prepare(userId, parseCommand(document, accountId)).map(PreparedItem::response).toPreviewResponse()

    fun commitScan(userId: String, accountId: String, document: JsonNode): OperatorV3ImportCommitResponse =
        commit(userId, parseCommand(document, accountId))

    fun listScanReviews(userId: String, accountId: String): List<OperatorScanReviewResponse> {
        requireOwnedAccount(userId, accountId)
        return scanReviewRepository.findByUserIdAndAccountIdOrderByUpdatedAtDesc(userId, accountId).distinctBy {
            it.operatorId
        }.map { review ->
            OperatorScanReviewResponse(
                accountId = review.accountId,
                recordId = review.recordId,
                operatorId = review.operatorId,
                status = review.status,
                document = objectMapper.readTree(review.document),
                warnings = review.warnings,
                blockingErrors = review.blockingErrors,
                updatedAt = review.updatedAt,
            )
        }
    }

    fun closeScanReview(userId: String, accountId: String, recordId: String, operatorId: String) {
        requireOwnedAccount(userId, accountId)
        val recordIds = scanReviewRepository.findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(userId, accountId, operatorId)
            .dropWhile { it.recordId != recordId }.map { it.recordId }
        // Delete only this snapshot of the queue so later scans survive an older review's completion.
        if (recordIds.isNotEmpty()) {
            scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(userId, accountId, operatorId, recordIds)
        }
    }

    private fun commit(userId: String, command: ImportCommand): OperatorV3ImportCommitResponse {
        val committed = mutableListOf<OperatorV3ImportItem>()
        records(command.document).forEach { record ->
            val targetAccountId = command.mapping.getValue(text(record, "account_id"))
            val target = requireOwnedAccount(userId, targetAccountId)
            val game = targetGame(record, target)
            val written = mutableListOf<OperatorV3ImportItem>()
            inTransaction {
                val priorAudit = importRecordRepository.findByUserIdAndAccountIdAndRecordId(
                    userId,
                    targetAccountId,
                    text(record, "record_id"),
                )
                val prepared = prepareRecord(userId, command, record)
                if (text(record, "record_type") == ANNOTATION_RECORD) {
                    if (prepared.none { it.response.status == REJECTED } && priorAudit == null) {
                        if (text(record, "snapshot_scope") == "full") requireNotNull(subjectiveService).resetFull(userId, targetAccountId)
                        val sourceEntries = entries(record).associateBy { text(it, "operator_id") }
                        prepared.forEach { item ->
                            val original = sourceEntries[item.operatorId]
                            if (original == null) {
                                written += item.response.copy(revision = 0, targetRevision = 0)
                            } else {
                                val revision = requireNotNull(subjectiveService).applyAnnotationEntry(userId, targetAccountId, original)
                                written += item.response.copy(revision = revision, targetRevision = revision)
                            }
                        }
                    } else {
                        val recordRejected = prepared.any { it.response.status == REJECTED }
                        written += prepared.map { item ->
                            if (recordRejected && item.response.status != REJECTED) {
                                item.response.copy(
                                    status = REJECTED,
                                    blockingErrors = item.response.blockingErrors +
                                        issue("invalid_annotation_snapshot", "Another entry rejected this atomic annotation record"),
                                )
                            } else {
                                item.response
                            }
                        }
                    }
                } else {
                    prepared.forEach { item ->
                        val result = if (item.patch == null || item.response.status == REJECTED || item.response.status == UNCHANGED) {
                            item.response
                        } else {
                            // Prepare and refresh inside this transaction: earlier forms may have synced this revision.
                            val relatedWritten = written.any { prior ->
                                OperatorSharedGrowth.baseId(prior.operatorId, catalogService) ==
                                    OperatorSharedGrowth.baseId(item.operatorId, catalogService) &&
                                    prior.status in setOf(ACCEPTED, PARTIAL)
                            }
                            if (relatedWritten) {
                                item.patch.put(
                                    "expected_revision",
                                    currentRevision(userId, item.targetAccountId, item.targetGame, item.operatorId),
                                )
                            }
                            val current = operatorService.patchCurrent(
                                userId,
                                item.targetAccountId,
                                item.targetGame,
                                item.operatorId,
                                item.patch,
                            )
                            item.response.copy(
                                revision = current.revision,
                                targetRevision = current.revision,
                                observedStatus = current.combatStats?.observedStatus,
                            )
                        }
                        written += result
                    }
                    if (priorAudit == null &&
                        text(record, "snapshot_scope") == "full" &&
                        written.none { it.status == REJECTED || it.status == REVIEW }
                    ) {
                        operatorService.completeFullImport(
                            userId,
                            targetAccountId,
                            game,
                            entries(record).map { text(it, "operator_id") }.toSet(),
                            OffsetDateTime.parse(text(record, "effective_at")).toInstant(),
                        )
                    }
                }
                if (text(record, "record_type") != ANNOTATION_RECORD && priorAudit == null) {
                    val finalEntries = operatorService.current(userId, targetAccountId, game).singleOrNull()?.entries.orEmpty()
                    written.replaceAll { item ->
                        if (item.status == REJECTED) {
                            item
                        } else {
                            val finalEntry = finalEntries[item.operatorId]
                            val revision = finalEntry?.revision ?: 0L
                            item.copy(
                                revision = revision,
                                targetRevision = revision,
                                observedStatus = finalEntry?.combatStats?.observedStatus,
                            )
                        }
                    }
                }
                val shouldAudit = priorAudit == null &&
                    written.none { it.status == REJECTED } &&
                    (
                        prepared.any { it.patch != null } || text(record, "record_type") == ANNOTATION_RECORD ||
                            written.any { it.status == UNCHANGED || it.status == REVIEW } ||
                            (entries(record).isEmpty() && text(record, "snapshot_scope") == "full")
                        )
                if (shouldAudit) {
                    importRecordRepository.save(
                        OperatorV3ImportRecord(
                            userId = userId,
                            accountId = targetAccountId,
                            sourceAccountId = text(record, "account_id"),
                            recordId = text(record, "record_id"),
                            game = game,
                            sourceKind = text(record, "source_kind"),
                            snapshotScope = text(record, "snapshot_scope"),
                            payload = objectMapper.writeValueAsString(record),
                            revisions = written.mapNotNull { item -> item.revision?.let { item.operatorId to it } }.toMap(),
                            statuses = written.associate { it.operatorId to it.status },
                        ),
                    )
                }
                if (command.scanAccountId != null && priorAudit == null) {
                    written.forEach { item ->
                        if (item.status == REVIEW || item.status == REJECTED) {
                            val selected = entries(record).firstOrNull { text(it, "operator_id") == item.operatorId } ?: return@forEach
                            val singleRecord = record.deepCopy()
                            singleRecord.set<com.fasterxml.jackson.databind.node.ArrayNode>(
                                "entries",
                                objectMapper.createArrayNode().add(selected),
                            )
                            val singleDocument = command.document.deepCopy()
                            singleDocument.set<com.fasterxml.jackson.databind.node.ArrayNode>(
                                "records",
                                objectMapper.createArrayNode().add(singleRecord),
                            )
                            val prior = scanReviewRepository.findByUserIdAndAccountIdAndRecordIdAndOperatorId(
                                userId,
                                targetAccountId,
                                item.recordId,
                                item.operatorId,
                            )
                            val replacedRecordIds = scanReviewRepository
                                .findByUserIdAndAccountIdAndOperatorIdOrderByUpdatedAtDesc(userId, targetAccountId, item.operatorId)
                                .filter { it.recordId != item.recordId }.map { it.recordId }
                            scanReviewRepository.save(
                                OperatorScanReview(
                                    id = prior?.id,
                                    userId = userId,
                                    accountId = targetAccountId,
                                    recordId = item.recordId,
                                    operatorId = item.operatorId,
                                    status = item.status,
                                    document = objectMapper.writeValueAsString(singleDocument),
                                    warnings = item.warnings,
                                    blockingErrors = item.blockingErrors,
                                    updatedAt = Instant.now(),
                                ),
                            )
                            if (replacedRecordIds.isNotEmpty()) {
                                scanReviewRepository.deleteByUserIdAndAccountIdAndOperatorIdAndRecordIdIn(
                                    userId,
                                    targetAccountId,
                                    item.operatorId,
                                    replacedRecordIds,
                                )
                            }
                        } else if (item.status == ACCEPTED || item.status == PARTIAL) {
                            scanReviewRepository.deleteByUserIdAndAccountIdAndRecordIdAndOperatorId(
                                userId,
                                targetAccountId,
                                item.recordId,
                                item.operatorId,
                            )
                        }
                    }
                }
            }
            if (command.scanAccountId != null) written.forEach { publishScanEvent(userId, it) }
            committed += written
        }
        return committed.toCommitResponse()
    }

    private fun publishScanEvent(userId: String, item: OperatorV3ImportItem) {
        val event = OperatorScanImportEvent(
            accountId = item.accountId,
            operatorId = item.operatorId,
            recordId = item.recordId,
            status = item.status,
            revision = item.revision,
            stale = item.stale,
            observedStatus = item.observedStatus,
            warnings = item.warnings,
            blockingErrors = item.blockingErrors,
        )
        accountEventService.publish(
            userId,
            item.accountId,
            SCAN_EVENT_NAME,
            event.eventId,
            event,
        )
    }

    private fun prepare(userId: String, command: ImportCommand): List<PreparedItem> = records(command.document).flatMap { record ->
        val items = prepareRecord(userId, command, record)
        if (text(record, "record_type") == ANNOTATION_RECORD && items.any { it.response.status == REJECTED }) {
            items.map { item ->
                if (item.response.status == REJECTED) {
                    item
                } else {
                    item.copy(
                        patch = null,
                        response = item.response.copy(
                            status = REJECTED,
                            blockingErrors = item.response.blockingErrors +
                                issue("invalid_annotation_snapshot", "Another entry rejected this atomic annotation record"),
                        ),
                    )
                }
            }
        } else {
            items
        }
    }

    private fun prepareRecord(userId: String, command: ImportCommand, record: ObjectNode): List<PreparedItem> {
        val sourceAccountId = text(record, "account_id")
        val targetAccountId = command.mapping.getValue(sourceAccountId)
        val target = requireOwnedAccount(userId, targetAccountId)
        val targetGame = targetGame(record, target)
        val recordId = text(record, "record_id")
        val existingAudit = importRecordRepository.findByUserIdAndAccountIdAndRecordId(userId, targetAccountId, recordId)
        if (existingAudit != null) {
            val same = objectMapper.readTree(existingAudit.payload) == record
            return entries(record).map { entry ->
                val operatorId = entry.path("operator_id").asText("")
                PreparedItem(
                    targetAccountId,
                    targetGame,
                    operatorId,
                    null,
                    OperatorV3ImportItem(
                        accountId = targetAccountId,
                        operatorId = operatorId,
                        recordId = recordId,
                        status = if (!same) {
                            REJECTED
                        } else if (existingAudit.statuses[operatorId] == REVIEW) {
                            REVIEW
                        } else {
                            UNCHANGED
                        },
                        warnings = if (same) listOf(issue("duplicate_record", "record_id was already committed")) else emptyList(),
                        blockingErrors = if (same) {
                            emptyList()
                        } else {
                            listOf(issue("idempotency_conflict", "record_id was already used with different content"))
                        },
                        targetRevision = existingAudit.revisions[operatorId],
                        revision = existingAudit.revisions[operatorId],
                    ),
                    duplicate = same,
                )
            }
        }
        return if (text(record, "record_type") == ANNOTATION_RECORD) {
            val listed = entries(record).map { entry -> prepareAnnotationEntry(userId, record, entry, target, targetGame) }
            if (text(record, "snapshot_scope") != "full") {
                listed
            } else {
                val listedIds = listed.map { it.operatorId }.toSet()
                listed + requireNotNull(subjectiveService).subjectiveOperatorIds(userId, targetAccountId)
                    .filter { it !in listedIds }
                    .map { operatorId -> prepareAnnotationReset(userId, record, target, targetGame, operatorId) }
            }
        } else {
            val prepared = entries(record).map { entry -> prepareEntry(userId, command, record, entry, target, targetGame) }
            val source = entries(record).associateBy { text(it, "operator_id") }
            val invalidGroups = prepared.groupBy { OperatorSharedGrowth.baseId(it.operatorId, catalogService) }
                .filterValues { group ->
                    val patches = group.map { item ->
                        val entry = source.getValue(item.operatorId)
                        buildPatch(entry, record, command).also { patch ->
                            val matchReview = entry.path("match").path("status").asText("ready") != "ready"
                            if ((hasReview(entry) || matchReview) && !command.confirmReview) removeReviewSections(patch, entry, matchReview)
                        }
                    }
                    group.any { it.response.status == REJECTED } ||
                        listOf("level", "elite", "level_breakthrough_stage").any { field ->
                            patches.mapNotNull { it.get(field) }.distinct().size >
                                1
                        }
                }.keys
            prepared.map { item ->
                if (OperatorSharedGrowth.baseId(item.operatorId, catalogService) !in invalidGroups ||
                    item.response.status == REJECTED
                ) {
                    item
                } else {
                    item.copy(
                        patch = null,
                        response = item.response.copy(
                            status = REJECTED,
                            blockingErrors =
                            item.response.blockingErrors +
                                issue("shared_growth_conflict", "Related forms have conflicting or invalid shared growth"),
                        ),
                    )
                }
            }
        }
    }

    private fun prepareAnnotationReset(
        userId: String,
        record: ObjectNode,
        target: SubAccount,
        targetGame: String,
        operatorId: String,
    ): PreparedItem {
        val before = requireNotNull(subjectiveService).subjectiveState(userId, target.accountId, operatorId)
        val defaults = linkedMapOf<String, Any?>(
            "growth_state" to OperatorSubjectiveService.ACTIVE,
            "favorite" to false,
            "note" to null,
            "targets" to null,
        )
        val changes = defaults.mapNotNull { (field, value) ->
            if (before[field] == value) null else field to OperatorV3FieldChange(before[field], value)
        }.toMap()
        return PreparedItem(
            target.accountId,
            targetGame,
            operatorId,
            null,
            OperatorV3ImportItem(
                accountId = target.accountId,
                operatorId = operatorId,
                recordId = text(record, "record_id"),
                status = if (changes.isEmpty()) UNCHANGED else ACCEPTED,
                changes = changes,
                targetRevision = 0,
            ),
        )
    }

    private fun prepareAnnotationEntry(
        userId: String,
        record: ObjectNode,
        entry: ObjectNode,
        target: SubAccount,
        targetGame: String,
    ): PreparedItem {
        val recordId = text(record, "record_id")
        val operatorId = text(entry, "operator_id")
        return try {
            val catalog = catalogService.getOperator(operatorId)
                ?: invalid("unknown_operator", "Unknown operator_id: $operatorId", recordId, operatorId, "operator_id")
            if (targetGame !in
                catalog.games
            ) {
                invalid("invalid_game", "Operator is not available in target game", recordId, operatorId, "game")
            }
            val before = requireNotNull(subjectiveService).subjectiveState(userId, target.accountId, operatorId)
            val after = LinkedHashMap(before)
            listOf("growth_state", "favorite", "note", "targets").forEach { field ->
                if (entry.has(field)) after[field] = objectMapper.convertValue(entry.get(field), Any::class.java)
            }
            val changes = linkedMapOf<String, OperatorV3FieldChange>()
            after.forEach { (field, value) -> if (before[field] != value) changes[field] = OperatorV3FieldChange(before[field], value) }
            val revision = requireNotNull(subjectiveService).subjectiveRevision(userId, target.accountId, operatorId)
            PreparedItem(
                target.accountId,
                targetGame,
                operatorId,
                entry,
                OperatorV3ImportItem(
                    accountId = target.accountId,
                    operatorId = operatorId,
                    recordId = recordId,
                    status = if (changes.isEmpty()) UNCHANGED else ACCEPTED,
                    changes = changes,
                    targetRevision = if (changes.isEmpty()) revision else revision + 1,
                ),
            )
        } catch (e: OperatorApiException) {
            PreparedItem(
                target.accountId,
                targetGame,
                operatorId,
                null,
                OperatorV3ImportItem(
                    accountId = target.accountId,
                    operatorId = operatorId,
                    recordId = recordId,
                    status = REJECTED,
                    blockingErrors = listOf(issue(e.code, e.message, e.fieldPath)),
                ),
            )
        }
    }

    private fun prepareEntry(
        userId: String,
        command: ImportCommand,
        record: ObjectNode,
        entry: ObjectNode,
        target: SubAccount,
        targetGame: String,
    ): PreparedItem {
        val recordId = text(record, "record_id")
        val operatorId = text(entry, "operator_id")
        return try {
            val catalog = catalogService.getOperator(operatorId)
                ?: invalid("unknown_operator", "Unknown operator_id: $operatorId", recordId, operatorId, "operator_id")
            if (targetGame !in catalog.games) {
                invalid("invalid_game", "Operator is not available in the target game", recordId, operatorId, "game")
            }
            validateEntrySemantics(entry, record, catalog, command.scanAccountId != null)
            val warnings = entry.path("warnings").takeIf(JsonNode::isArray)?.map {
                issue("producer_warning", it.asText())
            }.orEmpty().toMutableList()
            entry.get("name")?.asText()?.takeIf { it != catalog.name }?.let {
                warnings += issue("catalog_name_mismatch", "name differs from the public catalog", "name")
            }
            if (entry.path("combat_stats").path("oddities").isObject && catalog.specialOddityName.isNullOrBlank()) {
                warnings += issue("catalog_oddity_name_missing", "Public catalog has no special oddity display name")
            }
            warnings += oddityMaxWarnings(entry, catalog)

            val patch = buildPatch(entry, record, command)
            val legacyAnomaly = entry.has("star_level") && OperatorHuajiRules.anomalous(entry.path("star_level").asInt(), catalog)
            if (legacyAnomaly) {
                patch.remove("star_level")
                warnings +=
                    issue(
                        "legacy_huaji_requires_review",
                        "Hidden rarity legacy value retained in the source record; confirm progress separately",
                        "star_level",
                    )
            }
            if (text(record, "source_kind") == "scan" && patch.has("huaji")) {
                val facts = patch.path("huaji") as ObjectNode
                if (facts.path("stage").isNull) facts.remove("stage")
                if (facts.path("awakened").isNull) facts.remove("awakened")
            }
            val review = hasReview(entry) || legacyAnomaly
            val partial = hasPartial(entry)
            val matchReview = entry.path("match").path("status").asText("ready") != "ready"
            if ((review || matchReview) && !command.confirmReview) removeReviewSections(patch, entry, matchReview)
            if (patch.size() <= 1) {
                val status = if (review || matchReview) REVIEW else UNCHANGED
                return PreparedItem(
                    target.accountId,
                    targetGame,
                    operatorId,
                    null,
                    OperatorV3ImportItem(
                        target.accountId,
                        operatorId,
                        recordId,
                        status,
                        warnings = warnings,
                        targetRevision = currentRevision(userId, target.accountId, targetGame, operatorId),
                    ),
                )
            }
            val latest = operatorService.current(userId, target.accountId, targetGame).singleOrNull()?.entries?.get(operatorId)
            if (text(record, "source_kind") == "scan" &&
                latest?.updatedAt?.isAfter(OffsetDateTime.parse(text(record, "effective_at")).toInstant()) == true
            ) {
                return PreparedItem(
                    target.accountId,
                    targetGame,
                    operatorId,
                    null,
                    OperatorV3ImportItem(
                        target.accountId,
                        operatorId,
                        recordId,
                        REVIEW,
                        warnings = warnings + issue("newer_current_requires_review", "Scan predates the current correction"),
                        targetRevision = latest.revision,
                    ),
                )
            }
            val expectedRevision = currentRevision(userId, target.accountId, targetGame, operatorId)
            patch.put("expected_revision", expectedRevision)
            val preview = operatorService.previewCurrentPatch(userId, target.accountId, targetGame, operatorId, patch)
            val changes = changes(patch, preview.before, preview.after)
            val unchanged = changes.isEmpty()
            val status = when {
                unchanged -> UNCHANGED
                (review || matchReview) && !command.confirmReview -> REVIEW
                partial -> PARTIAL
                else -> ACCEPTED
            }
            PreparedItem(
                target.accountId,
                targetGame,
                operatorId,
                patch.takeUnless { unchanged },
                OperatorV3ImportItem(
                    accountId = target.accountId,
                    operatorId = operatorId,
                    recordId = recordId,
                    status = status,
                    changes = changes,
                    warnings = warnings,
                    stale = preview.stale,
                    targetRevision = if (unchanged) expectedRevision else preview.after.revision,
                    observedStatus = preview.after.combatStats?.observedStatus,
                ),
            )
        } catch (e: OperatorApiException) {
            PreparedItem(
                target.accountId,
                targetGame,
                operatorId,
                null,
                OperatorV3ImportItem(
                    accountId = target.accountId,
                    operatorId = operatorId,
                    recordId = recordId,
                    status = REJECTED,
                    blockingErrors = listOf(issue(e.code, e.message, e.fieldPath)),
                    targetRevision = currentRevision(userId, target.accountId, targetGame, operatorId),
                ),
            )
        }
    }

    private fun parseCommand(body: JsonNode, scanAccountId: String?): ImportCommand {
        if (!body.isObject) schemaError("Request body must be an object")
        val root = body as ObjectNode
        val wrapped = root.has("document")
        if (wrapped) rejectUnknown(root, setOf("document", "account_mapping", "confirm_review"))
        val document = (if (wrapped) root.get("document") else root) as? ObjectNode
            ?: schemaError("document must be an object")
        schemaValidator.validate(document)
        validateDocumentSemantics(document, scanAccountId)
        val sourceIds = accounts(document).map { text(it, "id") }
        val mapping = if (scanAccountId != null) {
            if (sourceIds.size != 1) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "scan_scope_not_allowed",
                    "Scan import requires one source account",
                )
            }
            sourceIds.associateWith { scanAccountId }
        } else if (wrapped) {
            val rawMapping = root.get("account_mapping")
            if (rawMapping == null || !rawMapping.isObject) {
                throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "account_mapping_required", "account_mapping is required")
            }
            rawMapping.fields().asSequence().associate { (source, value) ->
                if (!value.isTextual || value.asText().isBlank()) schemaError("account_mapping values must be account ids")
                source to value.asText()
            }.also { mappings ->
                if (sourceIds.any { it !in mappings }) {
                    throw OperatorApiException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "account_mapping_required",
                        "Every source account must be mapped",
                    )
                }
            }
        } else {
            sourceIds.associateWith { it }
        }
        val confirmReview = wrapped && root.path("confirm_review").asBoolean(false)
        return ImportCommand(document, mapping, scanAccountId, confirmReview)
    }

    private fun validateDocumentSemantics(document: ObjectNode, scanAccountId: String?) {
        parseTimestamp(text(document, "exported_at"), "exported_at")
        val accountIds = accounts(document).map { text(it, "id") }
        if (accountIds.distinct().size != accountIds.size) schemaError("accounts[].id must be unique")
        val records = records(document)
        val recordIds = records.map { text(it, "record_id") }
        if (recordIds.distinct().size != recordIds.size) schemaError("record_id must be unique")
        records.forEach { record ->
            val source = text(record, "account_id")
            if (source !in accountIds) schemaError("record account_id does not reference accounts", text(record, "record_id"))
            val recordType = text(record, "record_type")
            if (recordType !in setOf("operator_snapshot", ANNOTATION_RECORD)) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    if (scanAccountId != null) "scan_scope_not_allowed" else "unsupported_record_type",
                    "Unsupported operator record type",
                    text(record, "record_id"),
                )
            }
            parseTimestamp(text(record, "effective_at"), "effective_at", text(record, "record_id"))
            if (scanAccountId != null && recordType == ANNOTATION_RECORD) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "scan_scope_not_allowed",
                    "OpenAPI scan import cannot contain operator annotations",
                    text(record, "record_id"),
                )
            }
            if (scanAccountId != null &&
                (text(record, "source_kind") != "scan" || text(record, "snapshot_scope") != "listed")
            ) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "scan_scope_not_allowed",
                    "OpenAPI scan import requires source_kind=scan and snapshot_scope=listed",
                    text(record, "record_id"),
                )
            }
        }
        if (scanAccountId != null && records.map { text(it, "account_id") }.distinct().size != 1) {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "scan_scope_not_allowed",
                "Scan records must use one source account",
            )
        }
    }

    private fun validateEntrySemantics(entry: ObjectNode, record: ObjectNode, catalog: OperatorCatalogEntity, scan: Boolean) {
        entry.get("observed_at")?.let { parseTimestamp(it.asText(), "observed_at", text(record, "record_id")) }
        entry.path("combat_stats").get("observed_at")?.let {
            parseTimestamp(it.asText(), "combat_stats.observed_at", text(record, "record_id"))
        }
        entry.get("star_level")?.let {
            val maximum = if (catalog.spOf == null) 31 else 5
            if (it.intValue() !in 0..maximum) {
                invalid(
                    "invalid_star_level",
                    "star_level is invalid for this catalog operator",
                    text(record, "record_id"),
                    catalog.operatorId,
                    "star_level",
                )
            }
        }
        val oddities = entry.path("combat_stats").path("oddities")
        val oddityStatus = entry.path("section_status").path("oddities").asText("")
        if (oddityStatus == "ready" && oddities.isObject && oddities.size() != 3) {
            invalid(
                "invalid_oddities",
                "ready oddities must include attack, hp, and special",
                text(record, "record_id"),
                catalog.operatorId,
                "combat_stats.oddities",
            )
        }
        validateCatalogEntryFields(entry, record, catalog)
        if (scan) {
            val combat = entry.path("combat_stats")
            if (combat.has("manual_attack") || combat.has("manual_hp") || combat.has("display_mode")) {
                invalid(
                    "scan_field_not_allowed",
                    "OpenAPI scan import cannot change manual values or display_mode",
                    text(record, "record_id"),
                    catalog.operatorId,
                    "combat_stats",
                )
            }
        }
    }

    private fun validateCatalogEntryFields(entry: ObjectNode, record: ObjectNode, catalog: OperatorCatalogEntity) {
        val recordId = text(record, "record_id")
        entry.path("disc_loadouts").takeIf(JsonNode::isArray)?.forEachIndexed { loadoutIndex, loadout ->
            loadout.path("discs").takeIf(JsonNode::isArray)?.forEachIndexed { discIndex, disc ->
                val name = disc.path("ot_name").asText()
                if (catalog.discs.none { it.otName == name }) {
                    invalid(
                        "invalid_disc_loadout",
                        "disc is not in the operator catalog",
                        recordId,
                        catalog.operatorId,
                        "disc_loadouts[$loadoutIndex].discs[$discIndex].ot_name",
                    )
                }
            }
        }
        val stoneTypes = mutableSetOf<String>()
        entry.path("equipped_star_stones").takeIf(JsonNode::isArray)?.forEachIndexed { index, stone ->
            val type = stone.path("type").asText()
            val catalogType = when {
                type.startsWith("main") -> "main"
                type.startsWith("assist") -> "assist"
                else -> type
            }
            if (!stoneTypes.add(type) ||
                (catalog.starStones.isNotEmpty() && catalog.starStones.none { it.type == type || it.type == catalogType })
            ) {
                invalid(
                    "invalid_equipped_star_stones",
                    "star stone type is not supported by the operator catalog",
                    recordId,
                    catalog.operatorId,
                    "equipped_star_stones[$index].type",
                )
            }
        }
        val limits = oddityLimits(catalog.rarity)
        entry.path("combat_stats").path("oddities").takeIf(JsonNode::isObject)?.fields()?.forEach { (key, value) ->
            OperatorOddityValidation.requireCurrent(key, value.get("current"), limits.getValue(key), catalog.operatorId, recordId)
        }
    }

    private fun buildPatch(entry: ObjectNode, record: ObjectNode, command: ImportCommand): ObjectNode {
        val patch = objectMapper.createObjectNode().put("reason", "v3_import")
        if (includeSection(entry, "basic", command.confirmReview)) {
            if (entry.has("level")) patch.set<JsonNode>("level", entry.get("level"))
            if (entry.has("elite")) patch.set<JsonNode>("elite", entry.get("elite"))
        }
        if (includeSection(entry, "breakthrough", command.confirmReview) && entry.has("level_breakthrough_stage")) {
            val scanning = command.scanAccountId != null || text(record, "source_kind") == "scan"
            if (!scanning || entry.hasNonNull("level_breakthrough_stage")) {
                patch.set<JsonNode>("level_breakthrough_stage", entry.get("level_breakthrough_stage"))
            }
        }
        if (includeSection(entry, "huaji", command.confirmReview) && entry.has("star_level")) {
            patch.set<JsonNode>("star_level", entry.get("star_level"))
        }
        if (includeSection(entry, "huaji", command.confirmReview) && entry.has("huaji")) {
            patch.set<JsonNode>("huaji", entry.get("huaji").deepCopy<JsonNode>())
            if (entry.has("huaji_legacy")) patch.set<JsonNode>("huaji_legacy", entry.get("huaji_legacy"))
        }
        if (includeSection(entry, "disc_loadouts", command.confirmReview) && entry.has("disc_loadouts")) {
            patch.set<JsonNode>("disc_loadouts", entry.get("disc_loadouts"))
        }
        if (includeSection(entry, "equipment", command.confirmReview) && entry.has("equipped_star_stones")) {
            val stones = objectMapper.createArrayNode()
            entry.withArray("equipped_star_stones").forEach { raw ->
                val stone = objectMapper.createObjectNode()
                    .put("type", raw.path("type").asText())
                    .put("name", raw.path("name").asText(raw.path("stone_id").asText()))
                    .put("level", raw.path("level").intValue())
                stones.add(stone)
            }
            patch.set<JsonNode>("star_stones", stones)
        }
        if (entry.has("combat_stats")) {
            val source = entry.get("combat_stats") as ObjectNode
            val combat = objectMapper.createObjectNode()
            val includeCombat = includeSection(entry, "combat_stats", command.confirmReview)
            val includeOddities = includeSection(entry, "oddities", command.confirmReview)
            source.fields().forEach { (field, value) ->
                if ((field == "oddities" && includeOddities) || (field != "oddities" && includeCombat)) {
                    combat.set<JsonNode>(field, value)
                }
            }
            if (command.scanAccountId != null || text(record, "source_kind") == "scan") {
                if (combat.size() > 0) combat.put("source", "scan")
            }
            if (combat.size() > 0) patch.set<JsonNode>("combat_stats", combat)
        }
        return patch
    }

    private fun removeReviewSections(patch: ObjectNode, entry: ObjectNode, all: Boolean) {
        if (all || sectionStatus(entry, "basic") == REVIEW) {
            patch.remove("level")
            patch.remove("elite")
        }
        if (all || sectionStatus(entry, "breakthrough") == REVIEW) patch.remove("level_breakthrough_stage")
        if (all || sectionStatus(entry, "huaji") == REVIEW) {
            patch.remove("star_level")
            patch.remove("huaji")
            patch.remove("huaji_legacy")
        }
        if (all || sectionStatus(entry, "disc_loadouts") == REVIEW) patch.remove("disc_loadouts")
        if (all || sectionStatus(entry, "equipment") == REVIEW) patch.remove("star_stones")
        val combat = patch.get("combat_stats") as? ObjectNode ?: return
        if (all || sectionStatus(entry, "combat_stats") == REVIEW) {
            combat.fieldNames().asSequence().filter { it != "oddities" }.toList().forEach(combat::remove)
        }
        if (all || sectionStatus(entry, "oddities") == REVIEW) combat.remove("oddities")
        if (combat.size() == 0) patch.remove("combat_stats")
    }

    private fun changes(
        patch: ObjectNode,
        before: OperatorCurrentEntryDto?,
        after: OperatorCurrentEntryDto,
    ): Map<String, OperatorV3FieldChange> = buildMap {
        fun add(field: String, old: Any?, new: Any?) {
            if (old != new) put(field, OperatorV3FieldChange(old, new))
        }
        if (patch.has("level")) add("level", before?.level, after.level)
        if (patch.has(
                "level_breakthrough_stage",
            )
        ) {
            add("level_breakthrough_stage", before?.levelBreakthroughStage, after.levelBreakthroughStage)
        }
        if (patch.has("elite")) add("elite", before?.elite, after.elite)
        if (patch.has("star_level") || patch.has("huaji")) add("huaji", before?.huaji, after.huaji)
        if (patch.has("disc_loadouts")) add("disc_loadouts", before?.discLoadouts, after.discLoadouts)
        if (patch.has("star_stones")) add("equipped_star_stones", before?.starStones, after.starStones)
        if (patch.has("combat_stats")) add("combat_stats", before?.combatStats, after.combatStats)
    }

    private fun oddityMaxWarnings(entry: ObjectNode, catalog: OperatorCatalogEntity): List<OperatorV3Issue> {
        val limits = oddityLimits(catalog.rarity)
        val oddities = entry.path("combat_stats").path("oddities")
        if (!oddities.isObject) return emptyList()
        return limits.mapNotNull { (key, maximum) ->
            oddities.path(key).get("max")?.takeIf { it.intValue() != maximum }?.let {
                issue("oddity_max_mismatch", "$key.max differs from the catalog limit", "combat_stats.oddities.$key.max")
            }
        }
    }

    private fun currentRevision(userId: String, accountId: String, game: String, operatorId: String): Long =
        operatorService.current(userId, accountId, game).singleOrNull()?.entries?.get(operatorId)?.revision ?: 0L

    private fun requireOwnedAccount(userId: String, accountId: String): SubAccount =
        accountRepository.findByUserIdAndAccountId(userId, accountId)
            ?: throw OperatorApiException(HttpStatus.FORBIDDEN, "account_scope_mismatch", "Target account is not owned by the current user")

    private fun targetGame(record: ObjectNode, account: SubAccount): String {
        val game = text(record, "game")
        if (game != "universal" && game != account.game) {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "account_game_mismatch",
                "Record game must match the target account game",
                text(record, "record_id"),
            )
        }
        return account.game
    }

    private fun includeSection(entry: ObjectNode, section: String, confirmed: Boolean): Boolean = when (sectionStatus(entry, section)) {
        "unavailable" -> false
        REVIEW -> confirmed
        else -> true
    }

    private fun sectionStatus(entry: ObjectNode, section: String): String = entry.path("section_status").path(section).asText("ready")

    private fun hasReview(entry: ObjectNode): Boolean =
        entry.path("section_status").takeIf(JsonNode::isObject)?.elements()?.asSequence()?.any { it.asText() == REVIEW } == true

    private fun hasPartial(entry: ObjectNode): Boolean =
        entry.path("section_status").takeIf(JsonNode::isObject)?.elements()?.asSequence()?.any { it.asText() == PARTIAL } == true

    private fun accounts(document: ObjectNode): List<ObjectNode> = document.withArray("accounts").map { it as ObjectNode }
    private fun records(document: ObjectNode): List<ObjectNode> = document.withArray("records").map { it as ObjectNode }
    private fun entries(record: ObjectNode): List<ObjectNode> = record.withArray("entries").map { it as ObjectNode }

    private fun text(node: JsonNode, field: String): String = node.path(field).asText()

    private fun parseTimestamp(value: String, field: String, recordId: String? = null) {
        try {
            OffsetDateTime.parse(value)
        } catch (_: Exception) {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "Invalid $field",
                recordId,
                fieldPath = field,
            )
        }
    }

    private fun rejectUnknown(node: ObjectNode, allowed: Set<String>) {
        node.fieldNames().asSequence().firstOrNull { it !in allowed }?.let { schemaError("Unsupported request field: $it") }
    }

    private fun schemaError(message: String, recordId: String? = null): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message, recordId)

    private fun invalid(code: String, message: String, recordId: String, operatorId: String, field: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, recordId, operatorId, operatorId, field)

    private fun issue(code: String, message: String, field: String? = null) = OperatorV3Issue(code, message, field)

    private fun oddityLimits(rarity: Int): Map<String, Int> = when (rarity) {
        3 -> mapOf("attack" to 300, "hp" to 1560, "special" to 9)
        4 -> mapOf("attack" to 350, "hp" to 1820, "special" to 11)
        5 -> mapOf("attack" to 500, "hp" to 2600, "special" to 15)
        else -> emptyMap()
    }

    private fun <T> inTransaction(block: () -> T): T = transactionTemplate?.execute { block() } ?: block()

    private data class ImportCommand(
        val document: ObjectNode,
        val mapping: Map<String, String>,
        val scanAccountId: String?,
        val confirmReview: Boolean,
    )

    private data class PreparedItem(
        val targetAccountId: String,
        val targetGame: String,
        val operatorId: String,
        val patch: ObjectNode?,
        val response: OperatorV3ImportItem,
        val duplicate: Boolean = false,
    )

    companion object {
        private const val ACCEPTED = "accepted"
        private const val PARTIAL = "partial"
        private const val REVIEW = "review"
        private const val REJECTED = "rejected"
        private const val UNCHANGED = "unchanged"
        const val SCAN_EVENT_NAME = "operator_scan_import"
        private const val ANNOTATION_RECORD = "operator_annotation_snapshot"
    }
}
