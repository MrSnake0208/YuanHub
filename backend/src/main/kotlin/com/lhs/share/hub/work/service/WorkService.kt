package com.lhs.share.hub.work.service

import com.lhs.share.hub.repository.WorkRecordRepository
import com.lhs.share.hub.repository.entity.WorkRecord
import com.lhs.share.hub.repository.entity.level.LevelCatalogEntity
import com.lhs.share.hub.repository.level.LevelCatalogRepository
import com.lhs.share.hub.work.adapter.MaaYuanWorkAdapter
import com.lhs.share.hub.work.adapter.YuanAssistWorkAdapter
import com.lhs.share.hub.work.model.CompatibilityIssue
import com.lhs.share.hub.work.model.CompatibilityStatus
import com.lhs.share.hub.work.model.MaaYuanExtension
import com.lhs.share.hub.work.model.WorkCompatibilityResponse
import com.lhs.share.hub.work.model.WorkConversion
import com.lhs.share.hub.work.model.WorkDetailResponse
import com.lhs.share.hub.work.model.WorkDoc
import com.lhs.share.hub.work.model.WorkDocument
import com.lhs.share.hub.work.model.WorkExec
import com.lhs.share.hub.work.model.WorkExtensions
import com.lhs.share.hub.work.model.WorkLevelSummary
import com.lhs.share.hub.work.model.WorkListItem
import com.lhs.share.hub.work.model.WorkMetadata
import com.lhs.share.hub.work.model.WorkPageResponse
import com.lhs.share.hub.work.model.WorkSource
import com.lhs.share.hub.work.model.WorkStatus
import com.lhs.share.hub.work.model.WorkTarget
import com.lhs.share.hub.work.model.statusOf
import com.lhs.share.hub.work.parser.LegacyParseResult
import com.lhs.share.hub.work.parser.LegacyWorkDraft
import com.lhs.share.hub.work.parser.MaaYuanLegacyParser
import com.lhs.share.hub.work.repository.MaaCopilotWorkSource
import com.lhs.share.hub.work.repository.MaaCopilotWorkSourceRepository
import org.bson.types.ObjectId
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

class WorkApiException(val status: HttpStatus, override val message: String) : RuntimeException(message)

class WorkRevisionConflictException(val currentRevision: Long) : RuntimeException("作业已被更新，请刷新后重试")

sealed interface ResolvedWorkId {
    data class Native(val id: ObjectId) : ResolvedWorkId

    data class Legacy(val id: Long) : ResolvedWorkId
}

@Component
class WorkIdResolver {
    fun resolve(value: String): ResolvedWorkId? = when {
        value.startsWith(NATIVE_PREFIX) && ObjectId.isValid(value.removePrefix(NATIVE_PREFIX)) ->
            ResolvedWorkId.Native(ObjectId(value.removePrefix(NATIVE_PREFIX)))
        value.all(Char::isDigit) -> value.toLongOrNull()?.let(ResolvedWorkId::Legacy)
        else -> null
    }

    fun external(id: ObjectId): String = "$NATIVE_PREFIX${id.toHexString()}"

    private companion object {
        const val NATIVE_PREFIX = "w_"
    }
}

@Service
class WorkService(
    private val sourceRepository: MaaCopilotWorkSourceRepository,
    private val levelRepository: LevelCatalogRepository,
    private val parser: MaaYuanLegacyParser,
    private val maaYuanAdapter: MaaYuanWorkAdapter,
    private val yuanAssistAdapter: YuanAssistWorkAdapter,
    private val recordRepository: WorkRecordRepository,
    private val validator: WorkDocumentValidator,
    private val idResolver: WorkIdResolver,
) {
    fun list(page: Int, limit: Int): WorkPageResponse {
        validatePage(page, limit)
        // ponytail: bounded merge rereads page * limit; add a cursor/projection only when production read amplification matters.
        val bounded = try {
            Math.multiplyExact(page, limit)
        } catch (_: ArithmeticException) {
            throw WorkApiException(HttpStatus.BAD_REQUEST, "page 与 limit 乘积过大")
        }
        val legacyPage = sourceRepository.findPublic(1, bounded)
        val nativeRecords = recordRepository.findByStatusAndDeletedAtIsNullOrderByPublishedAtDescIdDesc(
            WorkStatus.PUBLIC,
            PageRequest.of(0, bounded),
        )
        val levels = levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc()
        val merged = (
            legacyPage.items.mapNotNull { source ->
                legacyListItem(source, levels)?.let { RankedWork(it, source.uploadTime ?: LocalDateTime.MIN) }
            } +
                nativeRecords.map { record ->
                    RankedWork(nativeListItem(record, levels), record.publishedAt?.local() ?: LocalDateTime.MIN)
                }
            ).sortedWith(PUBLIC_WORK_ORDER).map(RankedWork::item)
        val total = legacyPage.total + recordRepository.countByStatusAndDeletedAtIsNull(WorkStatus.PUBLIC)
        val offset = (page - 1) * limit
        val items = merged.drop(offset).take(limit)
        return WorkPageResponse(page, limit, total, page.toLong() * limit < total, items)
    }

    fun mine(userId: String, page: Int, limit: Int): WorkPageResponse {
        validatePage(page, limit)
        val total = recordRepository.countByOwnerIdAndDeletedAtIsNull(userId)
        val levels = levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc()
        val items = recordRepository.findByOwnerIdAndDeletedAtIsNullOrderByUpdatedAtDescIdDesc(
            userId,
            PageRequest.of(page - 1, limit),
        ).map { nativeListItem(it, levels) }
        return WorkPageResponse(page, limit, total, page.toLong() * limit < total, items)
    }

    fun get(id: String, viewerId: String? = null): WorkDetailResponse = when (val resolved = resolveId(id)) {
        is ResolvedWorkId.Legacy -> legacyDetail(
            sourceRepository.findPublicById(resolved.id) ?: notFound(),
            levelRepository.findAllByOrderBySortOrderAscLevelKeyAsc(),
        )
        is ResolvedWorkId.Native -> {
            val record = recordRepository.findByIdAndDeletedAtIsNull(resolved.id) ?: notFound()
            if (record.status != WorkStatus.PUBLIC && record.ownerId != viewerId) notFound()
            nativeDetail(record)
        }
    }

    fun get(id: Long): WorkDetailResponse = get(id.toString())

    fun create(userId: String, document: WorkDocument): WorkDetailResponse {
        validator.validateOrThrow(document)
        return nativeDetail(recordRepository.save(WorkRecord(ownerId = userId, document = document)))
    }

    fun update(userId: String, id: String, expectedRevision: Long, document: WorkDocument): WorkDetailResponse {
        val current = owned(id, userId)
        requireRevision(current, expectedRevision)
        validator.validateOrThrow(document)
        return nativeDetail(replace(current, expectedRevision, current.copy(document = document)))
    }

    fun publish(userId: String, id: String, expectedRevision: Long): WorkDetailResponse {
        val current = owned(id, userId)
        requireRevision(current, expectedRevision)
        validator.validateOrThrow(current.document)
        return nativeDetail(
            replace(current, expectedRevision, current.copy(status = WorkStatus.PUBLIC, publishedAt = Instant.now())),
        )
    }

    fun unpublish(userId: String, id: String, expectedRevision: Long): WorkDetailResponse {
        val current = owned(id, userId)
        return nativeDetail(replace(current, expectedRevision, current.copy(status = WorkStatus.DRAFT, publishedAt = null)))
    }

    fun delete(userId: String, id: String, expectedRevision: Long) {
        val current = owned(id, userId)
        replace(current, expectedRevision, current.copy(deletedAt = Instant.now()))
    }

    fun compatibility(id: String, target: String, viewerId: String? = null): WorkCompatibilityResponse {
        val detail = get(id, viewerId)
        return compatibility(detail.work, detail.level, detail.conversion.issues, target)
    }

    fun compatibility(id: Long, target: String): WorkCompatibilityResponse = compatibility(id.toString(), target)

    fun preview(document: WorkDocument, target: String): WorkCompatibilityResponse {
        validator.validateOrThrow(document)
        val level = document.levelId?.let(levelRepository::findByLevelKey)?.summary()
        return compatibility(document, level, emptyList(), target)
    }

    private fun compatibility(
        document: WorkDocument?,
        level: WorkLevelSummary?,
        sourceIssues: List<CompatibilityIssue>,
        target: String,
    ): WorkCompatibilityResponse = when (parseTarget(target)) {
        WorkTarget.MAAYUAN -> maaYuanAdapter.check(document, sourceIssues)
        WorkTarget.YUANASSIST -> yuanAssistAdapter.check(document, level, sourceIssues)
    }

    private fun nativeDetail(record: WorkRecord): WorkDetailResponse {
        val id = idResolver.external(requireNotNull(record.id))
        val level = record.document.levelId?.let(levelRepository::findByLevelKey)
        return WorkDetailResponse(
            metadata = WorkMetadata(
                id = id,
                title = record.document.doc.title,
                uploaderId = record.ownerId,
                uploadTime = (record.publishedAt ?: record.createdAt).local(),
                views = 0,
                hotScore = 0.0,
                likeCount = 0,
                ownerId = record.ownerId,
                status = record.status,
                revision = record.revision,
                createdAt = record.createdAt.local(),
                updatedAt = record.updatedAt.local(),
                publishedAt = record.publishedAt?.local(),
            ),
            level = level?.summary(),
            conversion = WorkConversion(CompatibilityStatus.EXACT, emptyList()),
            work = record.document,
            source = WorkSource(type = "native", id = id),
        )
    }

    private fun nativeListItem(record: WorkRecord, levels: List<LevelCatalogEntity>): WorkListItem {
        val document = record.document
        return WorkListItem(
            id = idResolver.external(requireNotNull(record.id)),
            title = document.doc.title,
            stageName = document.stageName,
            game = document.game,
            level = document.levelId?.let { id -> levels.singleOrNull { it.levelKey == id } }?.summary(),
            uploaderId = record.ownerId,
            uploadTime = (record.publishedAt ?: record.createdAt).local(),
            views = 0,
            hotScore = 0.0,
            conversionStatus = CompatibilityStatus.EXACT,
            issueCount = 0,
            ownerId = record.ownerId,
            status = record.status,
            revision = record.revision,
            updatedAt = record.updatedAt.local(),
        )
    }

    private fun legacyListItem(source: MaaCopilotWorkSource, levels: List<LevelCatalogEntity>): WorkListItem? {
        val id = source.copilotId ?: return null
        val resolved = resolveLegacy(source, levels)
        return WorkListItem(
            id = id.toString(),
            title = resolved.parse.draft?.title ?: source.name ?: source.stageName ?: "作业 $id",
            stageName = resolved.work?.stageName ?: resolved.parse.draft?.stageName,
            game = resolved.work?.game ?: gameFrom(source, resolved.parse.draft),
            level = resolved.level?.summary(),
            uploaderId = source.uploaderId,
            uploadTime = source.uploadTime ?: source.firstUploadTime,
            views = source.views,
            hotScore = source.hotScore,
            conversionStatus = statusOf(resolved.issues),
            issueCount = resolved.issues.size,
        )
    }

    private fun legacyDetail(source: MaaCopilotWorkSource, levels: List<LevelCatalogEntity>): WorkDetailResponse {
        val id = source.copilotId ?: notFound()
        val resolved = resolveLegacy(source, levels)
        return WorkDetailResponse(
            metadata = WorkMetadata(
                id = id.toString(),
                title = resolved.parse.draft?.title ?: source.name ?: source.stageName ?: "作业 $id",
                uploaderId = source.uploaderId,
                uploadTime = source.uploadTime ?: source.firstUploadTime,
                views = source.views,
                hotScore = source.hotScore,
                likeCount = source.likeCount,
            ),
            level = resolved.level?.summary(),
            conversion = WorkConversion(statusOf(resolved.issues), resolved.issues),
            work = resolved.work,
            source = WorkSource(id = id.toString(), rawContent = source.content.orEmpty()),
        )
    }

    private fun resolveLegacy(source: MaaCopilotWorkSource, levels: List<LevelCatalogEntity>): LegacyResolvedWork {
        val parse = parser.parse(source.content.orEmpty())
        val draft = parse.draft
        val knownGame = gameFrom(source, draft)
        val level = draft?.let { findLevel(it, source, knownGame, levels) }
        val game = knownGame ?: level?.game?.takeIf(::isProtocolGame)
        val issues = parse.issues.toMutableList()
        if (draft != null && game == null) {
            val taggedGames = source.tags.filter(::isProtocolGame).distinct()
            issues += CompatibilityIssue(
                if (taggedGames.size > 1) "ambiguous_game" else "missing_game",
                "$.game",
                "game",
                if (taggedGames.size > 1) "公开标签同时包含多个游戏，无法可靠确定游戏" else "无法从 content、公开标签或唯一 Level Catalog 关联确定游戏",
                CompatibilityStatus.UNSUPPORTED,
            )
        }
        val work = draft?.takeIf {
            game != null &&
                it.stageName != null &&
                it.title != null &&
                it.details.length <= 20_000 &&
                it.rounds.isNotEmpty()
        }?.let {
            WorkDocument(
                format = "yuanhub-work",
                version = 1,
                game = game!!,
                levelId = level?.levelKey,
                stageName = it.stageName!!,
                doc = WorkDoc(it.title!!, it.details),
                operators = it.operators,
                exec = enrichExec(it.exec, level),
                rounds = it.rounds,
            )
        }
        return LegacyResolvedWork(parse, level, work, issues)
    }

    private fun replace(current: WorkRecord, expectedRevision: Long, replacement: WorkRecord): WorkRecord {
        requireRevision(current, expectedRevision)
        val next = replacement.copy(revision = expectedRevision + 1, updatedAt = Instant.now())
        recordRepository.replaceIfRevision(next, expectedRevision)?.let { return it }
        val latest = recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(requireNotNull(current.id), current.ownerId) ?: notFound()
        throw WorkRevisionConflictException(latest.revision)
    }

    private fun requireRevision(current: WorkRecord, expectedRevision: Long) {
        if (current.revision != expectedRevision) throw WorkRevisionConflictException(current.revision)
    }

    private fun owned(externalId: String, userId: String): WorkRecord {
        val native = resolveId(externalId) as? ResolvedWorkId.Native ?: notFound()
        return recordRepository.findByIdAndOwnerIdAndDeletedAtIsNull(native.id, userId) ?: notFound()
    }

    private fun resolveId(id: String): ResolvedWorkId = idResolver.resolve(id) ?: notFound()

    private fun parseTarget(target: String): WorkTarget = try {
        WorkTarget.valueOf(target.uppercase())
    } catch (_: IllegalArgumentException) {
        throw WorkApiException(HttpStatus.BAD_REQUEST, "to 必须是 MAAYUAN 或 YUANASSIST")
    }

    private fun validatePage(page: Int, limit: Int) {
        if (page < 1) throw WorkApiException(HttpStatus.BAD_REQUEST, "page 必须大于等于 1")
        if (limit !in 1..100) throw WorkApiException(HttpStatus.BAD_REQUEST, "limit 必须在 1..100")
    }

    private fun gameFrom(source: MaaCopilotWorkSource, draft: LegacyWorkDraft?): String? =
        draft?.game ?: source.tags.filter(::isProtocolGame).distinct().singleOrNull()

    private fun isProtocolGame(value: String) = value == "代号鸢" || value == "如鸢"

    private fun findLevel(
        draft: LegacyWorkDraft,
        source: MaaCopilotWorkSource,
        game: String?,
        levels: List<LevelCatalogEntity>,
    ): LevelCatalogEntity? {
        val scoped = levels.filter { game == null || it.game == game }
        val strongHints = listOfNotNull(
            draft.levelIdHint,
            source.levelMeta?.levelId,
            draft.stageIdHint,
            source.levelMeta?.stageId,
            source.stageId,
        ).map(String::trim).filter(String::isNotEmpty).distinct()
        strongHints.forEach { hint ->
            val matches = scoped.filter { it.levelKey == hint || it.levelId == hint || it.stageId == hint }
            if (matches.size == 1) return matches.single()
            if (matches.size > 1) return null
        }
        val names = listOfNotNull(draft.levelNameHint, source.levelMeta?.name, source.name, source.stageName)
            .map(String::trim).filter(String::isNotEmpty).distinct()
        names.forEach { name ->
            val matches = scoped.filter { it.name == name || it.stageId == name || it.levelId == name }
            if (matches.size == 1) return matches.single()
            if (matches.size > 1) return null
        }
        return null
    }

    private fun enrichExec(exec: WorkExec?, level: LevelCatalogEntity?): WorkExec? {
        if (level == null) return exec
        val existing = exec?.extensions?.maayuan
        val catalogType = level.catOne.takeIf { it in MAA_LEVEL_TYPES }
        val enriched = MaaYuanExtension(
            levelType = existing?.levelType ?: catalogType,
            recognitionName = existing?.recognitionName ?: when (catalogType) {
                "兰台" -> level.catThree.takeIf(String::isNotBlank)
                "活动", "活动有分级", "其他" -> level.catTwo.takeIf(String::isNotBlank) ?: level.name
                else -> null
            },
            recTargetOffset = existing?.recTargetOffset,
            difficulty = existing?.difficulty,
            caveType = existing?.caveType ?: level.catThree.takeIf { catalogType == "洞窟" && it in setOf("左", "右") },
            lantaiNav = existing?.lantaiNav,
        ).takeUnless { it == MaaYuanExtension() }
        return WorkExec(exec?.delaysMs, WorkExtensions(enriched, exec?.extensions?.yuanassist))
    }

    private fun LevelCatalogEntity.summary() = WorkLevelSummary(levelKey, game, name, levelId, stageId)

    private fun Instant.local(): LocalDateTime = LocalDateTime.ofInstant(this, ZoneId.systemDefault())

    private fun notFound(): Nothing = throw WorkApiException(HttpStatus.NOT_FOUND, "作业不存在")

    private data class LegacyResolvedWork(
        val parse: LegacyParseResult,
        val level: LevelCatalogEntity?,
        val work: WorkDocument?,
        val issues: List<CompatibilityIssue>,
    )

    private data class RankedWork(val item: WorkListItem, val time: LocalDateTime)

    private companion object {
        val MAA_LEVEL_TYPES = setOf("主线", "洞窟", "活动", "活动有分级", "白鹄", "兰台", "其他")
        val PUBLIC_WORK_ORDER = Comparator<RankedWork> { left, right ->
            val time = compareValues(right.time, left.time)
            if (time != 0) {
                time
            } else if (left.item.id.all(Char::isDigit) && right.item.id.all(Char::isDigit)) {
                compareValues(right.item.id.toLong(), left.item.id.toLong())
            } else {
                right.item.id.compareTo(left.item.id)
            }
        }
    }
}
