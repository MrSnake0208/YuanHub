package com.lhs.share.hub.controller.inventory.request

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus

data class DrawResourceRequest(
    val accountId: String,
    val game: String,
    val operationId: String,
    val expectedInventoryRevision: Long,
    val action: String,
    val ticketId: String,
    val quantity: Long,
    val channel: String,
) {
    companion object {
        fun parse(body: JsonNode): DrawResourceRequest {
            val fields =
                setOf("account_id", "game", "operation_id", "expected_inventory_revision", "action", "ticket_id", "quantity", "channel")
            if (!body.isObject || body.fieldNames().asSequence().toSet() != fields) invalid()
            fun text(key: String): String {
                val node = body[key]
                if (node == null || !node.isTextual || node.textValue().isBlank() || node.textValue().length > 128) invalid()
                return node.textValue()
            }
            fun number(key: String): Long {
                val node = body[key]
                if (node == null || !node.isIntegralNumber || !node.canConvertToLong()) invalid()
                return node.longValue()
            }
            return DrawResourceRequest(
                text("account_id"),
                text("game"),
                text("operation_id"),
                number("expected_inventory_revision"),
                text("action"),
                text("ticket_id"),
                number("quantity"),
                text("channel"),
            )
        }

        private fun invalid(): Nothing = throw InventoryApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "draw_resource_invalid_request",
            "请完整填写有效的符传操作，数量和版本必须为整数",
        )
    }
}
