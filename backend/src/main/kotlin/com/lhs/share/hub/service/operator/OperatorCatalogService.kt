package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.operator.request.OperatorCatalogWriteRequest
import com.lhs.share.hub.controller.operator.response.AdminOperatorCatalogResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogEntryResponse
import com.lhs.share.hub.controller.operator.response.OperatorCatalogResponse
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorDiscCatalog
import com.lhs.share.hub.repository.entity.OperatorStarStoneCatalog
import org.springframework.core.io.ClassPathResource
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import java.time.Instant
import java.time.LocalDate

@Service
class OperatorCatalogService(
    private val repository: OperatorCatalogRepository,
    private val objectMapper: ObjectMapper,
    private val avatarStorage: AvatarStorage,
) {
    @Volatile private var seeded = false

    @Volatile private var catalogVersion = ""

    // SP 形态反向索引：本体 id -> 其 SP 形态 id 列表。惰性构建，目录写入时失效重建。
    @Volatile private var spIndexCache: Map<String, List<String>>? = null

    fun getOperator(id: String): OperatorCatalogEntity? {
        ensureSeeded()
        return repository.findByOperatorId(id)
    }
    fun exists(id: String): Boolean = getOperator(id) != null

    /** Preview commands must not trigger lazy catalog writes. */
    fun getOperatorReadOnly(id: String): OperatorCatalogEntity? = repository.findByOperatorId(id)
    fun currentCatalogVersion(): String {
        ensureSeeded()
        return catalogVersion.ifEmpty { LocalDate.now().toString() }
    }
    fun catalog(): OperatorCatalogResponse {
        ensureSeeded()
        return OperatorCatalogResponse(
            catalogVersion = currentCatalogVersion(),
            operators = repository.findAllByOrderByOperatorIdAsc().map { OperatorCatalogEntryResponse.of(it) },
        )
    }

    /**
     * 管理端全量列表：返回原始实体（含 starStones / catalogVersion / createdAt 等内部字段），
     * 供管理员编辑公共图鉴使用。与只读公共图鉴 [catalog] 不同，不做任何裁剪。
     */
    fun listForAdmin(): List<AdminOperatorCatalogResponse> {
        ensureSeeded()
        return repository.findAllByOrderByOperatorIdAsc().map(AdminOperatorCatalogResponse::of)
    }

    /**
     * 返回指定本体密探的所有 SP 形态 id（如 char_023_shizimiao -> [char_085_shizimiaosp]）。
     * 反向索引惰性构建，目录写入时失效重建。普通密探返回空列表。
     */
    fun spFormsOf(baseId: String): List<String> {
        ensureSeeded()
        return spIndex()[baseId].orEmpty()
    }

    /** 本体 id -> SP 形态 id 列表；惰性构建，目录写入（create/update/delete）后失效。 */
    private fun spIndex(): Map<String, List<String>> {
        spIndexCache?.let { return it }
        synchronized(this) {
            spIndexCache?.let { return it }
            val m = mutableMapOf<String, MutableList<String>>()
            repository.findAllByOrderByOperatorIdAsc().forEach { e ->
                e.spOf?.let { base -> m.getOrPut(base) { mutableListOf() }.add(e.operatorId) }
            }
            val idx = m.mapValues { it.value.toList() }
            spIndexCache = idx
            return idx
        }
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun create(request: OperatorCatalogWriteRequest): AdminOperatorCatalogResponse {
        ensureSeeded()
        if (repository.findByOperatorId(request.id) != null) {
            throw OperatorApiException(HttpStatus.CONFLICT, "operator_conflict", "Operator already exists")
        }
        validate(request)
        val specialOddityName = requireSpecialOddityName(request.specialOddityName)
        val version = nextCatalogVersion()
        return repository.save(request.toEntity(catalogVersion = version, specialOddityName = specialOddityName))
            .also {
                spIndexCache = null
            }
            .let(AdminOperatorCatalogResponse::of)
    }

    @Transactional(transactionManager = "hubTransactionManager")
    fun update(operatorId: String, request: OperatorCatalogWriteRequest): AdminOperatorCatalogResponse {
        ensureSeeded()
        if (operatorId != request.id) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Path id and body id must match")
        }
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        validate(request)
        val specialOddityName = request.specialOddityName
            ?.let(::requireSpecialOddityName)
            ?: existing.specialOddityName
        val version = nextCatalogVersion()
        // avatar 不在写请求内，普通编辑整条覆盖时必须显式保留既有头像，否则会把已上传头像冲掉。
        return repository.save(
            request.toEntity(
                id = existing.id,
                createdAt = existing.createdAt,
                catalogVersion = version,
                specialOddityName = specialOddityName,
            ).copy(avatar = existing.avatar),
        ).also {
            spIndexCache = null
        }.let(AdminOperatorCatalogResponse::of)
    }

    /**
     * 上传/替换密探头像：文件落盘后把相对路径写入字典，即时反映到公共图鉴。
     * 同 id 重传即幂等覆盖；不 bump catalogVersion（头像不算目录内容变更）。
     */
    fun setAvatar(operatorId: String, file: MultipartFile): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        val path = avatarStorage.save(operatorId, file)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(avatar = path)))
    }

    /** 清除密探头像：删除磁盘文件并置空字段。 */
    fun clearAvatar(operatorId: String): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        avatarStorage.delete(operatorId)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(avatar = null)))
    }

    fun delete(operatorId: String) {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        if (spFormsOf(operatorId).isNotEmpty()) {
            throw OperatorApiException(HttpStatus.CONFLICT, "operator_has_forms", "Remove movie-form relations before deleting their base")
        }
        repository.delete(existing)
        // 级联清理头像文件：失败仅遗留孤儿文件，不阻断目录删除。
        avatarStorage.delete(operatorId)
        spIndexCache = null
        bumpCatalogVersion()
    }

    /**
     * 目录内容变化后生成新版本号并持久化。
     *
     * create/update 会随新写入行自然带上新版本号；delete 不产生新行，因此挑一条剩余行
     * 回写版本号（无剩余行时版本号只在内存更新，下次重新播种时自然刷新）。
     */
    private fun bumpCatalogVersion() {
        val version = nextCatalogVersion()
        repository.findAllByOrderByOperatorIdAsc().firstOrNull()?.let {
            repository.save(it.copy(catalogVersion = version))
        }
    }

    private fun validate(request: OperatorCatalogWriteRequest) {
        if (request.games.any { it !in SUPPORTED_GAMES }) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_game", "Unsupported game")
        }
        val discNames = request.discs.map { it.otName }
        if (discNames.toSet().size != discNames.size) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_disc", "disc ot_name must be unique")
        }
        val stoneTypes = request.starStones.map { it.type }
        if (stoneTypes.toSet().size != stoneTypes.size) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_star_stone", "star stone type must be unique")
        }
        if (spFormsOf(request.id).any { id -> getOperator(id)?.games?.any { it !in request.games } == true }) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_sp_relation", "Base games must cover its movie forms")
        }
        request.spOf?.let { base ->
            if (base == request.id) {
                throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "spOf cannot reference itself")
            }
            val target = getOperator(base)
                ?: throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "unknown_operator_id",
                    "spOf base operator not found: " + base,
                )
            if (target.spOf != null || spFormsOf(request.id).isNotEmpty()) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "invalid_sp_relation",
                    "spOf must point directly to a base operator",
                )
            }
            if (!target.games.containsAll(request.games)) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "invalid_sp_relation",
                    "Movie-form games must be available on the base",
                )
            }
        }
    }

    private fun requireSpecialOddityName(value: String?): String {
        val normalized = value?.trim()
        if (normalized == null || normalized.length !in 1..32) {
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                if (value == null) "special_oddity_name is required" else "special_oddity_name length must be 1..32 after trimming",
            )
        }
        return normalized
    }

    private fun OperatorCatalogWriteRequest.toEntity(
        id: String? = null,
        createdAt: Instant = Instant.now(),
        catalogVersion: String,
        specialOddityName: String?,
    ) = OperatorCatalogEntity(
        id = id,
        operatorId = this.id,
        name = name,
        alias = alias,
        rarity = rarity,
        specialOddityName = specialOddityName,
        prof = prof,
        subProf = subProf,
        games = games,
        discs = discs.map { OperatorDiscCatalog(it.otName, it.abbreviation, it.color, it.desp) },
        starStones = starStones.map { OperatorStarStoneCatalog(it.name, it.type) },
        spOf = spOf,
        catalogVersion = catalogVersion,
        createdAt = createdAt,
    )

    private fun nextCatalogVersion(): String {
        catalogVersion = Instant.now().toString()
        return catalogVersion
    }

    private fun ensureSeeded() {
        if (seeded) return
        synchronized(this) {
            if (seeded) return
            val version = LocalDate.now().toString()
            val resource = ClassPathResource("operator/operators.json")
            if (resource.exists()) {
                if (repository.count() == 0L) {
                    // 全新库：整体播种。
                    objectMapper.readTree(resource.inputStream).forEach { node ->
                        fromResource(node, version)?.let { repository.save(it) }
                    }
                } else {
                    // 已播种过的老库：只回填后来新增的字段（spOf / specialOddityName），
                    // 不覆盖管理员改动、不重插被删除的行。约 121 行，仅首次访问执行一次。
                    var specialBackfillVersion: String? = null
                    objectMapper.readTree(resource.inputStream).forEach { node ->
                        val id = node.path("id").asText()
                        if (id.isBlank()) return@forEach
                        val existing = repository.findByOperatorId(id) ?: return@forEach
                        val resourceSpecialName = resourceText(node, "specialOddityName")
                        if (existing.specialOddityName == null && resourceSpecialName != null && specialBackfillVersion == null) {
                            specialBackfillVersion = nextCatalogVersion()
                        }
                        val merged = mergeResourceFields(
                            existing,
                            node,
                            specialBackfillVersion ?: existing.catalogVersion,
                        )
                        if (merged != existing) {
                            repository.save(merged)
                        }
                    }
                }
            }
            catalogVersion = repository.findAllByOrderByOperatorIdAsc()
                .maxOfOrNull { it.catalogVersion }
                ?: version
            // 存量头像关联：与 spOf 老库回填同理，只回填 avatar 为 null 的行，
            // 不覆盖管理员上传的头像、不重插被删除的行；进程内仅首次访问执行一次。
            backfillAvatars()
            seeded = true
        }
    }

    /**
     * 把 `share.avatar.dir` 目录里已有的 `{operatorId}.webp` 关联到字典行。
     * 让"直接放进目录的头像文件"无需逐条上传也能被公共图鉴发布。
     */
    private fun backfillAvatars() {
        val ids = avatarStorage.existingOperatorIds()
        if (ids.isEmpty()) return
        ids.forEach { id ->
            val existing = repository.findByOperatorId(id) ?: return@forEach
            if (existing.avatar == null) {
                repository.save(existing.copy(avatar = avatarStorage.relativePath(id)))
            }
        }
    }

    internal fun mergeResourceFields(
        existing: OperatorCatalogEntity,
        node: JsonNode,
        specialBackfillVersion: String,
    ): OperatorCatalogEntity {
        val resourceSpecialName = resourceText(node, "specialOddityName")
        val specialBackfilled = existing.specialOddityName == null && resourceSpecialName != null
        return existing.copy(
            spOf = existing.spOf ?: resourceText(node, "spOf"),
            specialOddityName = existing.specialOddityName ?: resourceSpecialName,
            catalogVersion = if (specialBackfilled) specialBackfillVersion else existing.catalogVersion,
        )
    }

    internal fun fromResource(node: JsonNode, version: String): OperatorCatalogEntity? {
        val id = node.path("id").asText()
        if (id.isBlank()) return null
        return OperatorCatalogEntity(
            operatorId = id,
            name = node.path("name").asText(id),
            alias = node.get("alias")?.asText(),
            rarity = node.path("rarity").asInt(5),
            specialOddityName = resourceText(node, "specialOddityName"),
            prof = node.path("prof").map { it.asText() },
            subProf = node.path("subProf").map { it.asText() },
            games = node.path("games").map { it.asText() }.ifEmpty { SUPPORTED_GAMES },
            discs = node.path("discs").map {
                OperatorDiscCatalog(
                    it.path("ot_name").asText(),
                    it.get("abbreviation")?.asText(),
                    it.get("color")?.asText(),
                    it.get("desp")?.asText(),
                )
            },
            starStones = node.path("starStones").map {
                OperatorStarStoneCatalog(it.path("name").asText(), it.path("type").asText())
            }.ifEmpty { DEFAULT_STONES },
            spOf = node.get("spOf")?.asText(),
            catalogVersion = version,
        )
    }

    private fun resourceText(node: JsonNode, field: String): String? =
        node.get(field)?.takeUnless(JsonNode::isNull)?.asText()?.trim()?.takeIf(String::isNotEmpty)

    companion object {
        val SUPPORTED_GAMES = listOf("如鸢", "代号鸢")
        private val DEFAULT_STONES = listOf(OperatorStarStoneCatalog("主星石", "main"), OperatorStarStoneCatalog("辅星石", "assist"))
    }
}
