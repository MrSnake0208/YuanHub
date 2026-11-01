package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorCustomSpendTemplatesRepository
import com.lhs.share.hub.repository.entity.OperatorCustomSpendTemplates
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class OperatorCustomSpendTemplatesService(
    private val repository: OperatorCustomSpendTemplatesRepository,
    private val validator: OperatorPlannerValidator,
    private val mapper: ObjectMapper,
) {
    fun get(userId: String): ObjectNode = repository.find(userId)?.let(::response)
        ?: mapper.createObjectNode().put("schema_version", 1).put("revision", 0).putNull("updated_at")
            .also { it.putArray("templates") }

    fun save(userId: String, request: ObjectNode): ObjectNode {
        val content = validator.customSpendTemplates(request.deepCopy())
        val saved = repository.replace(userId, validator.revision(request), content.toString(), Instant.now())
            ?: throw OperatorApiException(HttpStatus.CONFLICT, "custom_spend_templates_revision_conflict", "常用支出已在另一设备更新，请读取最新配置后重试")
        return response(saved)
    }

    private fun response(record: OperatorCustomSpendTemplates): ObjectNode =
        (mapper.readTree(record.payloadJson) as ObjectNode).put("revision", record.revision).put("updated_at", record.updatedAt.toString())
}
