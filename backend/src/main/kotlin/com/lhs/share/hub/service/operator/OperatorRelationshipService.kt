package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorRelationshipRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
class OperatorRelationshipService(
    private val accounts: SubAccountRepository,
    private val operators: OperatorCatalogService,
    private val rules: OperatorRelationshipCatalog,
    private val repository: OperatorRelationshipRepository,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
) {
    fun catalog(game: String): Map<String, Any> {
        if (game !in setOf("如鸢", "代号鸢")) invalid("请选择有效游戏")
        val snapshot = rules.snapshot(game)
        return mapOf("game" to game, "version" to snapshot.version, "operators" to snapshot.operators)
    }
    fun get(user: String, account: String): Map<String, Any> {
        val game = accountGame(user, account)
        return response(user, account, game)
    }
    fun patch(user: String, account: String, body: JsonNode): Map<String, Any> {
        val game = accountGame(user, account)
        if (!body.isObject || body.fieldNames().asSequence().toSet() != setOf("expected_revision", "catalog_version", "entries")) {
            invalid("请提供记录版本、规则版本和修改内容")
        }
        val revision = body.path("expected_revision")
        if (!revision.isIntegralNumber || !revision.canConvertToLong() ||
            revision.asLong() !in 0 until OperatorRelationshipCatalog.MAX_VALUE
        ) {
            invalid("记录版本无效")
        }
        val snapshot = rules.snapshot(game)
        if (!body.path("catalog_version").isTextual || body.path("catalog_version").asText() != snapshot.version) conflict()
        val changes = body.path("entries")
        if (!changes.isObject || changes.size() !in 1..1000 || body.toString().toByteArray().size > 1024 * 1024) invalid("修改内容无效或过大")
        val catalog = snapshot.operators
        val canonical = mapper.createObjectNode()
        changes.fields().forEach { (id, fields) ->
            val subject = operators.getOperator(id)?.takeIf { game in it.games } ?: invalid("密探不存在或不属于当前游戏：$id")
            if (!fields.isObject || fields.isEmpty || fields.fieldNames().asSequence().any { it !in setOf("trust", "rumors") }) {
                invalid("仅支持信赖值和传闻数量")
            }
            fields.fields().forEach { (kind, value) ->
                val owner = if (kind == "trust") catalog.path(id).path("trust_owner_id").asText(id) else id
                if (owner != subject.operatorId && operators.getOperator(owner)?.games?.contains(game) != true) invalid("共享信赖主体无效")
                val domain = catalog.path(owner).path(kind)
                if (!value.isNull &&
                    (!value.isIntegralNumber || !value.canConvertToLong() || value.asLong() !in 0..OperatorRelationshipCatalog.MAX_VALUE)
                ) {
                    invalid("进度必须为非负安全整数，留空表示未记录")
                }
                if (!value.isNull && domain.path("max").isIntegralNumber &&
                    value.asLong() > domain.path("max").asLong()
                ) {
                    invalid("进度超过已核准上限")
                }
                val entry =
                    canonical.path(owner).takeIf { it.isObject } as? ObjectNode
                        ?: mapper.createObjectNode().also { canonical.set<ObjectNode>(owner, it) }
                if (entry.has(kind) && entry.path(kind) != value) invalid("共享信赖值冲突，请先核对")
                entry.set<JsonNode>(kind, value)
            }
        }
        try {
            transaction.executeWithoutResult {
                if (accountGame(user, account) != game || !accounts.fenceRecruitmentWrite(user, account, game)) conflict()
                if (rules.snapshot(game).version != snapshot.version) conflict()
                val current = repository.find(user, account, game)
                if ((current?.revision ?: 0) != revision.asLong()) conflict()
                val entries = current?.let { mapper.readTree(it.entriesJson) as ObjectNode } ?: mapper.createObjectNode()
                val before = entries.deepCopy()
                // Only an explicit trust edit resolves legacy values; reading or editing rumors never discards them.
                canonical.fields().forEach { (owner, patch) ->
                    if (patch.has("trust")) {
                        catalog.fields().forEach { (id, rule) ->
                            if (id != owner && rule.path("trust_owner_id").asText(id) == owner) {
                                (entries.path(id) as? ObjectNode)?.let { legacy ->
                                    legacy.remove("trust")
                                    if (legacy.isEmpty) entries.remove(id)
                                }
                            }
                        }
                    }
                }
                canonical.fields().forEach { (id, patch) ->
                    val entry = entries.path(id).takeIf { it.isObject } as? ObjectNode ?: mapper.createObjectNode()
                    patch.fields().forEach { (key, value) ->
                        if (value.isNull) entry.remove(key) else entry.set<JsonNode>(key, value)
                    }
                    if (entry.isEmpty) entries.remove(id) else entries.set<ObjectNode>(id, entry)
                }
                if (entries.size() > 1000) invalid("记录数量超过上限")
                if (before != entries && repository.replace(user, account, game, revision.asLong(), entries.toString()) == null) conflict()
            }
        } catch (error: RuntimeException) {
            if (error is DuplicateKeyException || RecruitmentService.isWriteConflict(error)) conflict()
            throw error
        }
        return response(user, account, game)
    }
    private fun accountGame(user: String, account: String): String = accounts.findByUserIdAndAccountId(user, account)?.game
        ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "账号不存在")
    private fun response(user: String, account: String, game: String): Map<String, Any> {
        val saved = repository.find(user, account, game)
        return mapOf(
            "account_id" to account,
            "game" to game,
            "revision" to (saved?.revision ?: 0L),
            "catalog_version" to rules.snapshot(game).version,
            "entries" to (
                saved?.let {
                    mapper.readTree(it.entriesJson)
                } ?: mapper.createObjectNode()
                ),
            "updated_at" to (saved?.updatedAt?.toString() ?: ""),
        )
    }
    private fun invalid(message: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_operator_relationship", message)
    private fun conflict(): Nothing =
        throw OperatorApiException(HttpStatus.CONFLICT, "operator_relationship_conflict", "记录或规则已变化，请重新读取并核对后保存")
}
