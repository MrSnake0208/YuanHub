package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCatalogWriteRequest
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogAdminResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCatalogImportResponse
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.RecruitmentAgentSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentCatalogSourcePage
import com.lhs.share.hub.repository.entity.RecruitmentEvent
import com.lhs.share.hub.repository.entity.RecruitmentPool
import com.lhs.share.hub.repository.entity.RecruitmentPoolSnapshot
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.core.io.ClassPathResource
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException

@Service
class RecruitmentCatalog(
    private val mapper: ObjectMapper,
    private val repository: RecruitmentCatalogRepository,
    private val operators: OperatorCatalogRepository,
) {
    private val operatorSeed: Map<String, JsonNode> by lazy {
        ClassPathResource("operator/operators.json").inputStream.use(mapper::readTree).associateBy { it.path("id").asText() }
    }

    fun catalog(game: String): JsonNode {
        requireGame(game)
        val pools = all().filter { it.game == game }
        return response(pools.filter { !it.hidden }, pools)
    }

    fun listForAdmin(): RecruitmentCatalogAdminResponse {
        val names = operatorNames()
        return RecruitmentCatalogAdminResponse(
            all().map {
                val snapshot = snapshotOf(it, names)
                it.copy(upAgents = snapshot.upAgents, upStatus = snapshot.upStatus)
            },
        )
    }

    private fun all(): List<RecruitmentCatalogPool> = repository.all()
        .sortedWith(compareByDescending<RecruitmentCatalogPool> { it.startDate }.thenBy { it.poolId })

    private fun response(pools: List<RecruitmentCatalogPool>, versionPools: List<RecruitmentCatalogPool>): JsonNode {
        val names = operatorNames()
        val items = mapper.createArrayNode()
        pools.forEach { pool ->
            val item = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(pool)
            val snapshot = snapshotOf(pool, names)
            item.set<JsonNode>("up_agents", mapper.valueToTree(snapshot.upAgents))
            item.set<JsonNode>("up_agent_ids", mapper.valueToTree(snapshot.upAgentIds))
            item.set<JsonNode>("up_agent_names", mapper.valueToTree(snapshot.upAgentNames))
            item.set<JsonNode>("unmapped_up_agent_names", mapper.valueToTree(snapshot.unmappedUpAgentNames))
            item.put("up_status", snapshot.upStatus)
            items.add(item)
        }
        val latest = versionPools.maxOfOrNull { it.updatedAt } ?: Instant.EPOCH
        return mapper.createObjectNode().put(
            "catalog_revision",
            "db:${versionPools.size}:${versionPools.sumOf { it.revision }}:$latest",
        ).set("pools", items)
    }

    fun findPool(game: String, poolId: String): RecruitmentCatalogPool? = repository.find(poolId)?.takeIf { it.game == game }

    fun snapshot(game: String, poolId: String, requireEnabled: Boolean = true): RecruitmentPoolSnapshot {
        val pool = findPool(game, poolId) ?: throw RecruitmentApiException(
            HttpStatus.NOT_FOUND,
            "recruitment_catalog_pool_not_found",
            "当前游戏没有该管理员卡池，请联系管理员",
        )
        if (requireEnabled && pool.hidden) throw recruitmentInvalid("该卡池已隐藏，仅可维护已有历史，不能新增记录")
        if (requireEnabled && !pool.enabled) throw recruitmentInvalid("该卡池已停用，不能新增记录")
        return snapshotOf(pool)
    }

    private fun snapshotOf(pool: RecruitmentCatalogPool, names: Map<String, String> = emptyMap()): RecruitmentPoolSnapshot {
        val slots = pool.upAgents.map { slot ->
            val operatorId = slot.operatorId
            if (operatorId == null) slot else slot.copy(name = names[operatorId] ?: slot.name)
        }
        val active = slots.filter { it.active }
        val upStatus = if (pool.upStatus == "partial" && active.isNotEmpty() &&
            active.all { it.operatorId != null }
        ) {
            "verified"
        } else {
            pool.upStatus
        }
        return RecruitmentPoolSnapshot(
            name = pool.name,
            game = pool.game,
            catalogPoolId = pool.poolId,
            startDate = pool.startDate,
            endDate = pool.endDate,
            upAgentIds = active.mapNotNull { it.operatorId },
            upStatus = upStatus,
            upAgentNames = active.map { it.name },
            unmappedUpAgentNames = active.filter { it.operatorId == null }.map { it.name },
            catalogRevision = "db:${pool.revision}:${pool.updatedAt}",
            poolType = pool.poolType,
            upAgents = slots,
            allowCustomUp = pool.allowCustomUp,
        )
    }

    fun validateWishes(game: String, ids: List<String>) {
        if (ids.size != 2 || ids.distinct().size != 2) throw recruitmentInvalid("请选择两位不同的心愿密探")
        if (ids.any { operator(game, it).rarity != 5 }) throw recruitmentInvalid("心愿密探只能选择当前游戏的绝密密探")
    }

    fun personalSnapshot(pool: RecruitmentPool, requireEnabled: Boolean = true): RecruitmentPoolSnapshot {
        val reference = pool.mappedSnapshot ?: pool.snapshot
        val latest = reference.catalogPoolId?.let { snapshot(reference.game, it, requireEnabled) } ?: reference
        return withWishes(latest, pool.wishAgentIds, reference.upAgents.associate { it.id to it.name } + operatorNames())
    }

    private fun withWishes(snapshot: RecruitmentPoolSnapshot, ids: List<String>, names: Map<String, String>): RecruitmentPoolSnapshot {
        if (!snapshot.allowCustomUp) return snapshot
        val slots = ids.map { id ->
            val existing = snapshot.upAgents.firstOrNull { it.operatorId == id }
            RecruitmentUpAgent(existing?.id ?: id, names[id] ?: existing?.name ?: id, id)
        }
        return snapshot.copy(
            upAgents = slots,
            upAgentIds = ids,
            upAgentNames = slots.map { it.name },
            unmappedUpAgentNames = emptyList(),
            upStatus = if (ids.size == 2) "verified" else "unknown",
        )
    }

    fun slot(game: String, poolId: String, id: String, requireActive: Boolean = true): RecruitmentUpAgent? =
        findPool(game, poolId)?.let { pool ->
            val slot = snapshotOf(pool, operatorNames()).upAgents.firstOrNull { it.id == id } ?: return@let null
            if (requireActive && (pool.hidden || !pool.enabled || !slot.active)) throw recruitmentInvalid("该卡池已隐藏、停用或UP已退役，不能新增记录")
            slot
        }

    private fun operatorNames(): Map<String, String> {
        val persisted = operators.findAllByOrderByOperatorIdAsc()
        return if (persisted.isEmpty()) {
            operatorSeed.mapValues { it.value.path("name").asText() }
        } else {
            persisted.associate { it.operatorId to it.name }
        }
    }

    fun operator(game: String, id: String): RecruitmentAgentSnapshot {
        val persisted = operators.findByOperatorId(id)
        val seed = if (persisted == null && operators.count() == 0L) operatorSeed[id] else null
        val games = persisted?.games ?: seed?.path("games")?.map(JsonNode::asText).orEmpty()
        val value = persisted?.let {
            RecruitmentAgentSnapshot(it.operatorId, it.name, catalogRevision = it.catalogVersion, rarity = it.rarity)
        } ?: seed?.let {
            RecruitmentAgentSnapshot(
                id,
                it.path("name").asText(),
                catalogRevision = "operator-seed",
                rarity = it.path("rarity").asInt(),
            )
        }
        if (value == null) throw recruitmentInvalid("图鉴中没有该密探，请刷新图鉴或联系管理员配置占位UP")
        if (value.rarity !in 4..5 || game !in games) throw recruitmentInvalid("请选择当前游戏可用的4星或5星密探（含照影SP）")
        return value
    }

    fun projectPools(pools: List<RecruitmentPool>, game: String? = null): List<RecruitmentPool> {
        if (pools.isEmpty() && game == null) return pools
        val latest = all().associateBy { it.poolId }
        val names = operatorNames()
        val visible = pools.toMutableList()
        if (game != null) {
            val linked = pools.mapNotNull { (it.mappedSnapshot ?: it.snapshot).catalogPoolId }.toSet()
            val ids = pools.map { it.poolId }.toMutableSet()
            latest.values.filter { it.game == game && !it.hidden && it.poolId !in linked }.forEach { pool ->
                val base = "catalog:${pool.poolId}"
                var id = base
                var suffix = 0
                while (!ids.add(id)) id = "$base:${++suffix}"
                visible.add(RecruitmentPool(id, snapshotOf(pool, names)))
            }
        }
        return visible.map { pool ->
            val reference = pool.mappedSnapshot ?: pool.snapshot
            val snapshot = latest[reference.catalogPoolId]?.takeIf { it.game == reference.game }?.let { snapshotOf(it, names) }
                ?: return@map pool
            val personal = withWishes(snapshot, pool.wishAgentIds, reference.upAgents.associate { it.id to it.name } + names)
            if (pool.mappedSnapshot != null) pool.copy(mappedSnapshot = personal) else pool.copy(snapshot = personal)
        }
    }

    fun projectEvents(events: List<RecruitmentEvent>): List<RecruitmentEvent> {
        if (events.isEmpty()) return events
        val latest = all().associateBy { it.poolId }
        val names = operatorNames()
        return events.map { event ->
            val pool = latest[event.poolSnapshot.catalogPoolId]?.takeIf { it.game == event.poolSnapshot.game } ?: return@map event
            val latestSnapshot = snapshotOf(pool, names)
            val snapshot = if (event.poolSnapshot.allowCustomUp) {
                withWishes(
                    latestSnapshot.copy(allowCustomUp = true),
                    event.poolSnapshot.upAgentIds,
                    event.poolSnapshot.upAgents.associate { it.id to it.name } + names,
                )
            } else {
                latestSnapshot
            }
            val slot = snapshot.upAgents.firstOrNull { it.id == event.agentSnapshot.agentId }
            val name = slot?.name ?: names[event.agentSnapshot.agentId] ?: event.agentSnapshot.name
            event.copy(poolSnapshot = snapshot, agentSnapshot = event.agentSnapshot.copy(name = name))
        }
    }

    fun poolStates(pools: List<RecruitmentPool>): Map<String, String> {
        val latest = all().associateBy { it.poolId }
        return pools.mapNotNull { pool ->
            val reference = pool.mappedSnapshot ?: pool.snapshot
            val definition = latest[reference.catalogPoolId]?.takeIf { it.game == reference.game } ?: return@mapNotNull null
            pool.poolId to when {
                definition.hidden -> "hidden"
                definition.enabled -> "enabled"
                else -> "disabled"
            }
        }.toMap()
    }

    fun create(actorUserId: String, input: RecruitmentCatalogWriteRequest): RecruitmentCatalogPool {
        if (repository.find(input.poolId) != null) throw recruitmentConflict("该卡池ID已存在")
        if (input.expectedRevision != 0L) throw recruitmentConflict("新建卡池的expected_revision须为0")
        return save(actorUserId, input, null)
    }

    fun update(actorUserId: String, poolId: String, input: RecruitmentCatalogWriteRequest): RecruitmentCatalogPool {
        if (poolId != input.poolId) throw recruitmentInvalid("路径与请求的卡池ID必须一致")
        val current = repository.find(poolId) ?: throw recruitmentNotFound("catalog_pool")
        if (current.game != input.game) throw recruitmentInvalid("已创建卡池不能修改所属游戏")
        if (current.revision != input.expectedRevision) throw recruitmentConflict("卡池已被其他管理员修改，请刷新后重试")
        return save(actorUserId, input, current)
    }

    fun importCatalog(actorUserId: String, document: JsonNode): RecruitmentCatalogImportResponse {
        if (!document.isObject) throw recruitmentInvalid("导入文件必须是JSON对象")
        val poolNodes = document.get("pools")
        if (poolNodes == null || !poolNodes.isArray) throw recruitmentInvalid("导入文件必须包含pools数组")
        if (poolNodes.size() > IMPORT_POOL_LIMIT) throw recruitmentInvalid("单次最多导入${IMPORT_POOL_LIMIT}个卡池")

        val knownNames = operatorNames()
        val planned = poolNodes.mapIndexed { index, node -> parseImportPool(actorUserId, node, index + 1, knownNames) }
        if (planned.map { it.poolId }.toSet().size != planned.size) throw recruitmentInvalid("导入文件包含重复卡池ID")

        val existing = repository.all().map { it.poolId }.toMutableSet()
        val created = mutableListOf<String>()
        val skipped = mutableListOf<String>()
        planned.forEach { pool ->
            if (!existing.add(pool.poolId)) {
                skipped += pool.poolId
                return@forEach
            }
            try {
                if (repository.save(pool)) {
                    created += pool.poolId
                } else {
                    skipped += pool.poolId
                }
            } catch (_: DuplicateKeyException) {
                skipped += pool.poolId
            }
        }
        return RecruitmentCatalogImportResponse(created.size, skipped.size, created, skipped)
    }

    private fun parseImportPool(
        actorUserId: String,
        node: JsonNode,
        position: Int,
        knownNames: Map<String, String>,
    ): RecruitmentCatalogPool {
        if (!node.isObject) throw recruitmentInvalid("第${position}个卡池必须是JSON对象")
        if (node.has("hidden") && !node.get("hidden").isBoolean) throw recruitmentInvalid("第${position}个卡池hidden必须是布尔值")
        if (node.has("allow_custom_up") && !node.get("allow_custom_up").isBoolean) {
            throw recruitmentInvalid("第${position}个卡池allow_custom_up必须是布尔值")
        }
        val poolId = requiredText(node, "pool_id", position)
        val game = requiredText(node, "game", position)
        requireGame(game)
        if (!POOL_ID.matches(poolId)) throw recruitmentInvalid("第${position}个卡池ID格式不正确")
        val name = validName(requiredText(node, "name", position))
        val startDate = optionalDate(node, "start_date", position)
        val endDate = optionalDate(node, "end_date", position)
        if (startDate != null && endDate != null && startDate > endDate) throw recruitmentInvalid("第${position}个卡池开始日期不能晚于结束日期")
        val poolType = optionalText(node, "pool_type", position)?.trim()?.takeIf { it.isNotEmpty() }
        if (poolType != null && poolType.length > 64) throw recruitmentInvalid("第${position}个卡池类型不能超过64字")
        val enabled = optionalBoolean(node, "enabled", position, true)
        val slots = if (node.has("up_agents") && !node.get("up_agents").isNull) {
            importSlots(node.get("up_agents"), poolId, game, position, knownNames)
        } else {
            legacySlots(node, poolId, game, position, knownNames)
        }
        val requestedStatus = optionalText(node, "up_status", position)
        val upStatus = requestedStatus ?: if (slots.any { it.active }) "verified" else "unknown"
        if (upStatus !in UP_STATUSES) throw recruitmentInvalid("第${position}个卡池UP状态不支持")
        val sourceUpAgentNames = stringList(node, "source_up_agent_names", position)
        val sourceUrl = optionalText(node, "source_url", position)
        val sourceRevision = optionalLong(node, "source_revision", position)
        val sourcePages = sourcePages(node, position)
        val sourceNote = optionalText(node, "source_note", position)
        return RecruitmentCatalogPool(
            poolId = poolId,
            game = game,
            name = name,
            startDate = startDate,
            endDate = endDate,
            poolType = poolType,
            enabled = enabled,
            revision = 1,
            upAgents = slots,
            upStatus = upStatus,
            updatedBy = actorUserId,
            updatedAt = Instant.now(),
            sourceUpAgentNames = sourceUpAgentNames,
            sourceUrl = sourceUrl,
            sourceRevision = sourceRevision,
            sourcePages = sourcePages,
            sourceNote = sourceNote,
            hidden = optionalBoolean(node, "hidden", position, false),
            allowCustomUp = optionalBoolean(node, "allow_custom_up", position, false),
        )
    }

    private fun importSlots(
        node: JsonNode,
        poolId: String,
        game: String,
        position: Int,
        knownNames: Map<String, String>,
    ): List<RecruitmentUpAgent> {
        if (!node.isArray) throw recruitmentInvalid("第${position}个卡池up_agents必须是数组")
        val slots = node.mapIndexed { index, slot ->
            if (!slot.isObject) throw recruitmentInvalid("第${position}个卡池第${index + 1}个UP必须是JSON对象")
            RecruitmentUpAgent(
                id = requiredText(slot, "id", position),
                name = requiredText(slot, "name", position),
                operatorId = optionalText(slot, "operator_id", position),
                active = optionalBoolean(slot, "active", position, true),
            )
        }
        return normalizeImportedSlots(poolId, game, position, slots, knownNames)
    }

    private fun legacySlots(
        node: JsonNode,
        poolId: String,
        game: String,
        position: Int,
        knownNames: Map<String, String>,
    ): List<RecruitmentUpAgent> {
        val names = stringList(node, "up_agent_names", position)
        val ids = stringList(node, "up_agent_ids", position)
        val slotNames = if (names.isNotEmpty()) names else ids.map { knownNames[it] ?: operatorSeed[it]?.path("name")?.asText() ?: it }
        val slots = slotNames.mapIndexed { index, name ->
            val operatorId = if (slotNames.size == ids.size) {
                ids.getOrNull(index)
            } else {
                ids.firstOrNull { id -> knownNames[id] == name || operatorSeed[id]?.path("name")?.asText() == name }
            }
            RecruitmentUpAgent("$poolId:up:${index + 1}", name, operatorId)
        }
        return normalizeImportedSlots(poolId, game, position, slots, knownNames)
    }

    private fun normalizeImportedSlots(
        poolId: String,
        game: String,
        position: Int,
        slots: List<RecruitmentUpAgent>,
        knownNames: Map<String, String>,
    ): List<RecruitmentUpAgent> {
        if (slots.size > 500 || slots.count { it.active } > 120 || slots.map { it.id }.toSet().size != slots.size) {
            throw recruitmentInvalid("第${position}个卡池UP名单最多120个有效项、500个保留项，槽ID不能重复")
        }
        val normalized = slots.map { slot ->
            if (!SLOT_ID.matches(slot.id) || !slot.id.startsWith("$poolId:up:")) {
                throw recruitmentInvalid("第${position}个卡池UP槽ID必须属于当前卡池且不超过128字")
            }
            val operator = slot.operatorId?.let { operator(game, it) } ?: knownNames.entries
                .filter { it.value == slot.name.trim() }.mapNotNull { (id, _) ->
                    try {
                        operator(game, id)
                    } catch (_: RecruitmentApiException) {
                        null
                    }
                }.singleOrNull()
            slot.copy(name = operator?.name ?: validName(slot.name), operatorId = operator?.agentId)
        }
        val bound = normalized.filter { it.active }.mapNotNull { it.operatorId }
        if (bound.toSet().size != bound.size) throw recruitmentInvalid("第${position}个卡池有效UP不能重复选择同一密探")
        return normalized
    }

    private fun requiredText(node: JsonNode, field: String, position: Int): String {
        val value = node.get(field)
        if (value == null || !value.isTextual) throw recruitmentInvalid("第${position}个卡池字段${field}必须是字符串")
        return value.asText()
    }

    private fun optionalText(node: JsonNode, field: String, position: Int): String? {
        val value = node.get(field) ?: return null
        if (value.isNull) return null
        if (!value.isTextual) throw recruitmentInvalid("第${position}个卡池字段${field}必须是字符串或null")
        return value.asText()
    }

    private fun optionalBoolean(node: JsonNode, field: String, position: Int, default: Boolean): Boolean {
        val value = node.get(field) ?: return default
        if (value.isNull) return default
        if (!value.isBoolean) throw recruitmentInvalid("第${position}个卡池字段${field}必须是布尔值")
        return value.asBoolean()
    }

    private fun optionalLong(node: JsonNode, field: String, position: Int): Long? {
        val value = node.get(field) ?: return null
        if (value.isNull) return null
        if (!value.isIntegralNumber || !value.canConvertToLong()) throw recruitmentInvalid("第${position}个卡池字段${field}必须是整数或null")
        return value.asLong()
    }

    private fun sourcePages(node: JsonNode, position: Int): List<RecruitmentCatalogSourcePage> {
        val value = node.get("source_pages") ?: return emptyList()
        if (value.isNull) return emptyList()
        if (!value.isArray) throw recruitmentInvalid("第${position}个卡池字段source_pages必须是数组")
        return value.map { page ->
            if (!page.isObject) throw recruitmentInvalid("第${position}个卡池source_pages条目必须是JSON对象")
            RecruitmentCatalogSourcePage(
                url = requiredText(page, "url", position),
                revision = optionalLong(page, "revision", position),
            )
        }
    }

    private fun optionalDate(node: JsonNode, field: String, position: Int): LocalDate? {
        val value = optionalText(node, field, position) ?: return null
        return try {
            LocalDate.parse(value)
        } catch (_: DateTimeParseException) {
            throw recruitmentInvalid("第${position}个卡池字段${field}必须是YYYY-MM-DD日期")
        }
    }

    private fun stringList(node: JsonNode, field: String, position: Int): List<String> {
        val value = node.get(field) ?: return emptyList()
        if (value.isNull) return emptyList()
        if (!value.isArray || value.any { !it.isTextual }) throw recruitmentInvalid("第${position}个卡池字段${field}必须是字符串数组")
        return value.map(JsonNode::asText)
    }

    private fun save(actorUserId: String, input: RecruitmentCatalogWriteRequest, current: RecruitmentCatalogPool?): RecruitmentCatalogPool {
        requireGame(input.game)
        if (!POOL_ID.matches(input.poolId) || input.expectedRevision < 0 || input.expectedRevision == Long.MAX_VALUE) {
            throw recruitmentInvalid("卡池ID或版本格式不正确")
        }
        val name = validName(input.name)
        if (input.startDate != null && input.endDate != null && input.startDate > input.endDate) throw recruitmentInvalid("开始日期不能晚于结束日期")
        if (input.poolType != null && input.poolType.length > 64) throw recruitmentInvalid("卡池类型不能超过64字")
        if (input.upAgents.size > 500 || input.upAgents.count { it.active } > 120 ||
            input.upAgents.map { it.id }.toSet().size != input.upAgents.size
        ) {
            throw recruitmentInvalid("UP名单最多120个有效项、500个保留项，槽ID不能重复")
        }
        val slots = input.upAgents.map { slot ->
            if (!SLOT_ID.matches(slot.id) || !slot.id.startsWith("${input.poolId}:up:")) throw recruitmentInvalid("UP槽ID必须属于当前卡池且不超过128字")
            val old = current?.upAgents?.firstOrNull { it.id == slot.id }
            if (old?.operatorId != null && old.operatorId != slot.operatorId) {
                throw recruitmentInvalid("已绑定UP名额不能更换历史身份，请退役旧名额并添加正确的新名额")
            }
            if (old != null && old.operatorId == slot.operatorId) {
                if (old.operatorId == null && old.name != slot.name.trim()) {
                    throw recruitmentInvalid("已保存占位名额不能更换历史名称，请退役旧名额并添加新名额")
                }
                return@map old.copy(active = slot.active)
            }
            val operator = slot.operatorId?.let { operator(input.game, it) }
            slot.copy(name = operator?.name ?: validName(slot.name))
        } + current?.upAgents.orEmpty().filter { old -> input.upAgents.none { it.id == old.id } }.map { it.copy(active = false) }
        val bound = slots.filter { it.active }.mapNotNull { it.operatorId }
        if (bound.toSet().size != bound.size || slots.size > 500) throw recruitmentInvalid("有效UP不能重复选择同一密探，保留槽不能超过500项")
        val next = RecruitmentCatalogPool(
            input.poolId,
            input.game,
            name,
            input.startDate,
            input.endDate,
            input.poolType?.trim()?.takeIf { it.isNotEmpty() },
            input.enabled,
            input.expectedRevision + 1,
            slots,
            if (slots.any { it.active }) "verified" else "unknown",
            actorUserId,
            Instant.now(),
            sourceUpAgentNames = current?.sourceUpAgentNames.orEmpty(),
            sourceUrl = current?.sourceUrl,
            sourceRevision = current?.sourceRevision,
            sourcePages = current?.sourcePages.orEmpty(),
            sourceNote = current?.sourceNote,
            hidden = input.hidden ?: current?.hidden ?: false,
            allowCustomUp = input.allowCustomUp ?: current?.allowCustomUp ?: false,
        )
        try {
            if (!repository.save(next, current != null)) throw recruitmentConflict("卡池已变化，请刷新后重试")
        } catch (_: DuplicateKeyException) {
            throw recruitmentConflict("卡池已变化，请刷新后重试")
        }
        return next
    }

    private fun validName(value: String) = value.trim().takeIf { it.length in 1..128 } ?: throw recruitmentInvalid("名称须为1至128字")

    private fun requireGame(game: String) {
        if (game !in SubAccountService.SUPPORTED_GAMES) throw recruitmentInvalid("游戏只支持代号鸢或如鸢")
    }

    private companion object {
        const val IMPORT_POOL_LIMIT = 1000
        val UP_STATUSES = setOf("unknown", "partial", "verified", "selection")
        val POOL_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$")
        val SLOT_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    }
}
