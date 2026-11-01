package com.lhs.share.hub.controller.bond.request

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.service.bond.BondImportRequest
import com.lhs.share.hub.service.bond.BondRules
import com.lhs.share.hub.service.bond.BondRules.invalid

data class BondWriteRequest(
    val accountId: String,
    val expectedRevision: Long,
    val catalogVersion: String,
    val records: List<Pair<String, Boolean>>,
)

object BondRequests {
    fun write(node: JsonNode, id: String? = null): BondWriteRequest {
        BondRules.fields(node, setOf("account_id", "expected_revision", "catalog_version", if (id == null) "records" else "triggered"))
        val rows = if (id ==
            null
        ) {
            node["records"]?.takeIf { it.isArray && it.size() in 1..50 }?.toList() ?: invalid("records 须为1–50条")
        } else {
            listOf(node)
        }
        val records = rows.map { row ->
            if (id == null) BondRules.fields(row, setOf("bond_id", "triggered"))
            (id ?: BondRules.text(row, "bond_id")) to
                (row["triggered"]?.takeIf { it.isBoolean }?.booleanValue() ?: invalid("triggered 必须是布尔值"))
        }
        return BondWriteRequest(
            BondRules.text(node, "account_id"),
            BondRules.revision(node),
            BondRules.text(node, "catalog_version"),
            records,
        )
    }

    fun exchange(node: JsonNode, confirming: Boolean): BondImportRequest {
        val base = setOf("account_id", "document", "strategy", "source_account", "source_game")
        BondRules.fields(
            node,
            if (confirming) base + setOf("expected_revision", "catalog_version", "preview_token", "skip_unknown") else base,
        )
        fun optional(key: String) = node[key]?.takeUnless { it.isNull }?.let { BondRules.text(node, key) }
        val document = node["document"]?.takeIf { it.isObject } ?: invalid("document 必须是对象")
        val skip = node["skip_unknown"]?.let { it.takeIf { it.isBoolean }?.booleanValue() ?: invalid("skip_unknown 必须是布尔值") } ?: false
        return BondImportRequest(
            BondRules.text(
                node,
                "account_id",
            ),
            document, BondRules.text(node, "strategy"), optional("source_account"), optional("source_game"),
            if (confirming) BondRules.revision(node) else null, if (confirming) BondRules.text(node, "catalog_version") else null,
            if (confirming) BondRules.text(node, "preview_token") else null, skip,
        )
    }
}
