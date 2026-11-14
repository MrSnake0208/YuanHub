package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
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
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate

@Service
class OperatorCatalogService(
    private val repository: OperatorCatalogRepository,
    private val objectMapper: ObjectMapper,
    private val avatarStorage: AvatarStorage,
    private val xinzhiStorage: XinzhiStorage,
    private val portraitStorage: PortraitStorage,
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

    /** Diagnostic reads must not seed or backfill the catalog. */
    fun catalogReadOnly(): List<OperatorCatalogEntity> = repository.findAllByOrderByOperatorIdAsc()
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

    /** 独立读取数据库快照，不触发 seed/backfill，也不使用进程内版本缓存。 */
    fun maaYuanCatalog(): ObjectNode {
        val entries = repository.findAllByOrderByOperatorIdAsc()
        check(entries.isNotEmpty()) { "Operator catalog is empty" }
        val root = objectMapper.createObjectNode()
        val operators = root.putArray("OPERATORS")
        entries.filter { it.discs.isNotEmpty() }.forEach { entry ->
            val node = operators.addObject()
                .put("id", entry.operatorId)
                .put("name", entry.name)
                .put("name_en", entry.name)
                .put("alias", entry.alias.orEmpty())
                .put("alt_name", entry.name)
                .put("rarity", entry.rarity)
            if (entry.xinzhi != null && entry.xinzhiSha256 != null) {
                node.put("xinzhi_url", "${entry.xinzhi}?v=${entry.xinzhiSha256.take(16)}")
                node.put("xinzhi_sha256", entry.xinzhiSha256)
            }
            node.putArray("prof").also { array -> entry.prof.forEach { array.add(it) } }
            node.putArray("subProf").also { array -> entry.subProf.forEach { array.add(it) } }
            node.putArray("games").also { array -> entry.games.forEach { array.add(it) } }
            // 命盘顺序是自动编队契约，不能排序。
            val discs = node.putArray("discs")
            entry.discs.forEach { disc ->
                val value = discs.addObject()
                    .put("ot_name", disc.otName)
                    .put("abbreviation", disc.abbreviation.orEmpty())
                    .put("color", disc.color.orEmpty())
                    .put("desp", disc.desp.orEmpty())
                if (!disc.aliases.isNullOrEmpty()) {
                    value.putArray("aliases").also { array -> disc.aliases.forEach { array.add(it) } }
                }
                if (!disc.despAliases.isNullOrEmpty()) {
                    value.putArray("desp_aliases").also { array -> disc.despAliases.forEach { array.add(it) } }
                }
            }
        }
        val professions = ClassPathResource("operator/professions.json").inputStream.use { objectMapper.readTree(it) }
        check(professions.isArray && !professions.isEmpty) { "Invalid operator professions" }
        root.set<JsonNode>("PROFESSIONS", professions)
        root.put("catalog_schema_version", 1)
        root.put("catalog_version", entries.maxOf { it.catalogVersion })
        return root
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
        val normalized = normalizeAliases(request)
        validate(normalized)
        val specialOddityName = requireSpecialOddityName(request.specialOddityName)
        val version = nextCatalogVersion()
        return repository.save(normalized.toEntity(catalogVersion = version, specialOddityName = specialOddityName))
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
        val normalized = normalizeAliases(request, existing)
        validate(normalized)
        val specialOddityName = request.specialOddityName
            ?.let(::requireSpecialOddityName)
            ?: existing.specialOddityName
        val version = nextCatalogVersion()
        // 图片不在写请求内，普通编辑整条覆盖时保留已上传资源。
        return repository.save(
            normalized.toEntity(
                id = existing.id,
                createdAt = existing.createdAt,
                catalogVersion = version,
                specialOddityName = specialOddityName,
            ).copy(
                avatar = existing.avatar,
                xinzhi = existing.xinzhi,
                xinzhiSha256 = existing.xinzhiSha256,
                portrait = existing.portrait,
                portraitSha256 = existing.portraitSha256,
            ),
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

    fun setXinzhi(operatorId: String, file: MultipartFile): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        val (path, sha256) = xinzhiStorage.save(operatorId, file)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(xinzhi = path, xinzhiSha256 = sha256)))
    }

    fun clearXinzhi(operatorId: String): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        xinzhiStorage.delete(operatorId)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(xinzhi = null, xinzhiSha256 = null)))
    }

    fun setPortrait(operatorId: String, file: MultipartFile): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        val (path, sha256) = portraitStorage.save(operatorId, file)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(portrait = path, portraitSha256 = sha256)))
    }

    fun clearPortrait(operatorId: String): AdminOperatorCatalogResponse {
        ensureSeeded()
        val existing = repository.findByOperatorId(operatorId)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "Operator not found")
        portraitStorage.delete(operatorId)
        return AdminOperatorCatalogResponse.of(repository.save(existing.copy(portrait = null, portraitSha256 = null)))
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
        try {
            xinzhiStorage.delete(operatorId)
        } catch (_: java.io.IOException) {
            // 目录已删除，清理失败仅遗留孤儿文件。
        }
        try {
            portraitStorage.delete(operatorId)
        } catch (_: java.io.IOException) {
            // 目录已删除，清理失败仅遗留孤儿文件。
        }
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
        validateAliasConflicts(request)
        validateDescriptionAliasConflicts(request)
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

    private fun normalizeAliases(
        request: OperatorCatalogWriteRequest,
        existing: OperatorCatalogEntity? = null,
    ): OperatorCatalogWriteRequest = request.copy(
        discs = request.discs.mapIndexed { index, disc ->
            // 优先按标准名保留；原位改名且旧名已移除时，保留该位置的别名。
            val previous = existing?.discs?.firstOrNull { it.otName == disc.otName }
                ?: existing?.discs?.getOrNull(index)?.takeIf { old -> request.discs.none { it.otName == old.otName } }
            val aliases = (disc.aliases ?: previous?.aliases).orEmpty().map(String::trim).filter(String::isNotEmpty)
            if (aliases.size > 20 || aliases.any { it.length > 64 }) {
                throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_disc", "${disc.otName}：OCR 别名最多 20 个，每个最多 64 字符")
            }
            val despAliases = (disc.despAliases ?: previous?.despAliases).orEmpty().map(String::trim).filter(String::isNotEmpty)
            if (despAliases.size > 20 || despAliases.any { it.length > 256 }) {
                throw OperatorApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "invalid_disc",
                    "${disc.otName}：描述别名最多 20 个，每个最多 256 字符",
                )
            }
            disc.copy(
                aliases = aliases.distinctBy(::normalizeDiscName),
                despAliases = despAliases.distinctBy(::normalizeDiscDescription),
            )
        },
    )

    private fun validateAliasConflicts(request: OperatorCatalogWriteRequest) {
        val entries = repository.findAllByOrderByOperatorIdAsc().filter { it.operatorId != request.id }
        val discs = entries.flatMap { entry -> entry.discs.map { entry.operatorId to it } } +
            request.discs.map { request.id to OperatorDiscCatalog(it.otName, aliases = it.aliases) }
        discs.forEach { (owner, disc) ->
            disc.aliases.orEmpty().forEach { alias ->
                val key = normalizeDiscName(alias)
                val conflict = discs.firstOrNull { (otherOwner, other) ->
                    val otherName = normalizeDiscName(other.otName)
                    val aliasHit = other.aliases.orEmpty().any { normalizeDiscName(it) == key }
                    val differentDiscHit = other.otName != disc.otName && otherName == key
                    val sameOwnerHit = owner == otherOwner && other !== disc && (otherName == key || aliasHit)
                    differentDiscHit || sameOwnerHit
                }
                if (conflict != null) {
                    throw OperatorApiException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "invalid_disc",
                        "$owner / ${disc.otName} 的别名「$alias」与 ${conflict.first} / ${conflict.second.otName} 冲突",
                    )
                }
            }
        }
    }

    private fun normalizeDiscName(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC).filterNot { it.isWhitespace() }

    private fun validateDescriptionAliasConflicts(request: OperatorCatalogWriteRequest) {
        request.discs.forEach { disc ->
            disc.despAliases.orEmpty().forEach { alias ->
                val key = normalizeDiscDescription(alias)
                val conflict = request.discs.firstNotNullOfOrNull { other ->
                    if (other === disc) return@firstNotNullOfOrNull null
                    val descriptions = listOfNotNull(other.desp) + other.despAliases.orEmpty()
                    descriptions.firstOrNull { description ->
                        val otherKey = normalizeDiscDescription(description)
                        val comparable = key.isNotEmpty() && otherKey.isNotEmpty()
                        comparable && (key.contains(otherKey) || otherKey.contains(key))
                    }?.let { other.otName to it }
                }
                if (conflict != null) {
                    throw OperatorApiException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "invalid_disc",
                        "${disc.otName} 的描述别名「$alias」与 ${conflict.first} 的描述「${conflict.second}」冲突",
                    )
                }
            }
        }
    }

    private fun normalizeDiscDescription(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFKC).replace(Regex("[^a-zA-Z0-9\\u4e00-\\u9fff]"), "")

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
        discs = discs.map { OperatorDiscCatalog(it.otName, it.abbreviation, it.color, it.desp, it.aliases, it.despAliases) },
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
            backfillXinzhi()
            backfillPortraits()
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

    private fun backfillXinzhi() {
        xinzhiStorage.existingOperatorIds().forEach { id ->
            val existing = repository.findByOperatorId(id) ?: return@forEach
            val sha256 = xinzhiStorage.sha256(id)
            if (existing.xinzhi == null || existing.xinzhiSha256 != sha256) {
                repository.save(existing.copy(xinzhi = xinzhiStorage.relativePath(id), xinzhiSha256 = sha256))
            }
        }
    }

    private fun backfillPortraits() {
        portraitStorage.existingOperatorIds().forEach { id ->
            val existing = repository.findByOperatorId(id) ?: return@forEach
            val sha256 = portraitStorage.sha256(id)
            if (existing.portrait == null || existing.portraitSha256 != sha256) {
                repository.save(existing.copy(portrait = portraitStorage.relativePath(id), portraitSha256 = sha256))
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
                    it.get("aliases")?.takeIf(JsonNode::isArray)?.map { alias -> alias.asText() },
                    it.get("desp_aliases")?.takeIf(JsonNode::isArray)?.map { alias -> alias.asText() },
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
