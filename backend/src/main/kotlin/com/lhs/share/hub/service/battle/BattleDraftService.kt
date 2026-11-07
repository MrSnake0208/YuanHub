package com.lhs.share.hub.service.battle

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.BattleDraftRepository
import com.lhs.share.hub.repository.entity.BattleDraft
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/**
 * 配队与操作图云草稿：按站点用户 + 游戏账号隔离，每个账号最多 [LIMIT] 份。
 * 正文由前端完整校验后提交；服务端只校验归属、体积与列表所需的基本结构，原样保存 JSON。
 */
@Service
class BattleDraftService(
    private val repository: BattleDraftRepository,
    private val accounts: SubAccountService,
    private val mapper: ObjectMapper,
) {
    fun list(userId: String, accountId: String): ObjectNode {
        accounts.requireAccount(userId, accountId)
        val result = mapper.createObjectNode().put("limit", LIMIT)
        val drafts = result.putArray("drafts")
        repository.list(userId, accountId).forEach { drafts.add(summary(it)) }
        return result
    }

    fun get(userId: String, accountId: String, id: String): ObjectNode {
        accounts.requireAccount(userId, accountId)
        return detail(repository.find(userId, accountId, id) ?: throw notFound())
    }

    fun create(userId: String, accountId: String, body: JsonNode?): ObjectNode {
        val game = accounts.requireAccount(userId, accountId).game
        val draft = validate(body?.get("draft"), game)
        val now = Instant.now()
        val saved = repository.insert(userId, accountId, LIMIT) { slot ->
            BattleDraft(UUID.randomUUID().toString(), userId, accountId, slot, title(draft), game, draft.toString(), 1, now, now)
        } ?: throw InventoryApiException(HttpStatus.CONFLICT, "battle_draft_limit", "每个账号最多保存 $LIMIT 份云草稿，请先删除不需要的草稿")
        return detail(saved)
    }

    fun save(userId: String, accountId: String, id: String, body: JsonNode?): ObjectNode {
        val game = accounts.requireAccount(userId, accountId).game
        val revision = body?.get("revision")
        if (revision == null || !revision.canConvertToLong() || !revision.isIntegralNumber || revision.asLong() < 1) throw invalid("版本号")
        val draft = validate(body.get("draft"), game)
        val saved = repository.replace(userId, accountId, id, revision.asLong(), title(draft), game, draft.toString(), Instant.now())
        if (saved != null) return detail(saved)
        if (repository.find(userId, accountId, id) == null) throw notFound()
        throw InventoryApiException(HttpStatus.CONFLICT, "battle_draft_revision_conflict", "云草稿已在其他设备更新，请载入最新版本后再编辑")
    }

    fun delete(userId: String, accountId: String, id: String) {
        accounts.requireAccount(userId, accountId)
        if (!repository.delete(userId, accountId, id)) throw notFound()
    }

    private fun validate(node: JsonNode?, game: String): ObjectNode {
        if (node !is ObjectNode) throw invalid("正文")
        if (mapper.writeValueAsBytes(node).size > MAX_BYTES) throw invalid("草稿不能超过 1 MB")
        if (node.path("game").asText() != game) throw invalid("游戏与当前账号不一致")
        val title = node.get("title")
        if (title == null || !title.isTextual || title.asText().length > 120) throw invalid("标题")
        val note = node.get("note")
        if (note == null || !note.isTextual || note.asText().length > 2000) throw invalid("说明")
        if (!node.path("operators").isArray || node.path("operators").size() != 5) throw invalid("五人阵容")
        if (!node.path("targets").isArray || node.path("targets").size() != 5) throw invalid("敌方目标")
        val rounds = node.path("rounds")
        if (!rounds.isArray || rounds.size() !in 1..50) throw invalid("回合数")
        return node
    }

    private fun title(draft: ObjectNode) = draft.path("title").asText()

    private fun summary(record: BattleDraft): ObjectNode = mapper.createObjectNode()
        .put("id", record.id).put("title", record.title).put("game", record.game)
        .put("revision", record.revision).put("updated_at", record.updatedAt.toString())

    private fun detail(record: BattleDraft): ObjectNode {
        val result = summary(record)
        result.set<JsonNode>("draft", mapper.readTree(record.payloadJson))
        return result
    }

    private fun notFound() = InventoryApiException(HttpStatus.NOT_FOUND, "battle_draft_not_found", "云草稿不存在或已被删除")

    private fun invalid(label: String) = InventoryApiException(HttpStatus.BAD_REQUEST, "battle_draft_invalid", "草稿格式无效：$label")

    companion object {
        const val LIMIT = 5
        const val MAX_BYTES = 1024 * 1024
    }
}
