package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorOrganizationRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Service
class OperatorOrganizationService(
    private val accounts: SubAccountRepository,
    private val organizations: OperatorOrganizationRepository,
    private val catalog: OperatorCatalogService,
    private val mapper: ObjectMapper,
    private val events: AccountEventService,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
) {
    fun get(userId: String, accountId: String): ObjectNode {
        requireAccount(userId, accountId)
        val stored = organizations.findByUserIdAndAccountId(userId, accountId)
        val payload = stored?.let { mapper.readTree(it.payloadJson) as ObjectNode } ?: empty()
        return payload.put("account_id", accountId).put("revision", stored?.revision ?: 0)
    }

    fun put(userId: String, accountId: String, request: ObjectNode): ObjectNode {
        val account = requireAccount(userId, accountId)
        fields(request, setOf("schema_version", "status_order", "pinned_ids", "tags", "expected_revision"))
        if (!request.path("schema_version").isIntegralNumber || !request.path("schema_version").canConvertToInt() ||
            request.path("schema_version").asInt() != 1
        ) {
            invalid("schema_version")
        }
        val revision = request.path("expected_revision")
        if (!revision.isIntegralNumber || !revision.canConvertToLong() || revision.asLong() !in 0..9_007_199_254_740_990L) {
            invalid("expected_revision")
        }
        val order = ids(request.path("status_order"), "status_order", 4)
        if (order.toSet() != STATES.toSet()) invalid("status_order")
        val referenced = ids(request.path("pinned_ids"), "pinned_ids").toMutableSet()
        val tags = request.path("tags")
        if (!tags.isArray || tags.size() > 20) invalid("tags")
        val tagIds = mutableSetOf<String>()
        val tagNames = mutableSetOf<String>()
        tags.forEach { tag ->
            fields(tag, setOf("id", "name", "operator_ids"))
            val id = tag.path("id")
            if (!id.isTextual || !id.asText().matches(Regex("[A-Za-z0-9_-]{1,80}")) || !tagIds.add(id.asText())) invalid("tags.id")
            val name = tag.path("name")
            if (!name.isTextual || name.asText().trim().length !in 1..40 || !tagNames.add(name.asText().trim())) invalid("tags.name")
            (tag as ObjectNode).put("name", name.asText().trim())
            referenced.addAll(ids(tag.path("operator_ids"), "tags.operator_ids"))
        }
        referenced.forEach { id ->
            val operator = catalog.getOperator(id) ?: invalid("operator_ids: $id")
            if (account.game !in operator.games) invalid("operator_ids: $id does not belong to account game")
        }
        val content = request.deepCopy().also { it.remove("expected_revision") }
        val saved = try {
            checkNotNull(
                transaction.execute {
                    // Share the account fence with deletion/game changes so a late write cannot recreate orphaned data.
                    if (!accounts.fenceRecruitmentWrite(userId, accountId, account.game)) conflict()
                    organizations.replace(userId, accountId, revision.asLong(), content.toString(), Instant.now()) ?: conflict()
                },
            )
        } catch (_: DuplicateKeyException) {
            conflict()
        } catch (error: RuntimeException) {
            if (RecruitmentService.isWriteConflict(error)) conflict()
            throw error
        }
        events.publishChange(userId, accountId, "operator_organization", mapOf("revision" to saved.revision))
        return content.put("account_id", accountId).put("revision", saved.revision)
    }

    private fun requireAccount(userId: String, accountId: String) = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "账号不存在")

    private fun ids(node: JsonNode, field: String, max: Int = 1000): List<String> {
        if (!node.isArray || node.size() > max || node.any { !it.isTextual || it.asText().length !in 1..128 }) invalid(field)
        val values = node.map { it.asText() }
        if (values.distinct().size != values.size) invalid(field)
        return values
    }

    private fun fields(node: JsonNode, allowed: Set<String>) {
        if (!node.isObject || node.fieldNames().asSequence().any { it !in allowed }) invalid("unknown field")
    }

    private fun empty() = mapper.readTree(
        """{"schema_version":1,"status_order":["active","graduated","skip","discarded"],"pinned_ids":[],"tags":[]}""",
    ) as ObjectNode

    private fun invalid(field: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_operator_organization", "分类设置无效：$field", fieldPath = field)

    private fun conflict(): Nothing =
        throw OperatorApiException(HttpStatus.CONFLICT, "operator_organization_revision_conflict", "分类已在其他设备修改，请重新读取后再保存")

    companion object {
        val STATES = listOf("active", "graduated", "skip", "discarded")
    }
}
