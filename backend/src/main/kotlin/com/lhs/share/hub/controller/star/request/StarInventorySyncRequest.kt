package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus

/** Strict wire DTOs: identity and game always come from the bound token/account. */
data class StarInventorySyncRequest(
    val format: String,
    val version: Int,
    val scanId: String,
    @field:JsonSetter(nulls = Nulls.FAIL) val complete: Boolean,
    val counts: StarInventorySyncCounts,
    val inventory: List<StarInventorySyncEntry>,
    val experience: StarInventorySyncExperience,
    @get:JsonInclude(JsonInclude.Include.NON_NULL) val bag: StarWorkspaceBagRequest? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown inventory sync field: $name")
    }

    companion object {
        /** No Jackson scalar coercion: unknown counts must never become zero. */
        fun fromWire(root: JsonNode): StarInventorySyncRequest {
            fun invalid(): Nothing =
                throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_sync_invalid", "星石同步 JSON 字段、类型或数量无效")
            fun fields(node: JsonNode, vararg names: String) {
                if (!node.isObject || node.fieldNames().asSequence().toSet() != names.toSet()) invalid()
            }
            fun text(node: JsonNode): String = if (node.isTextual) node.textValue() else invalid()
            fun integer(node: JsonNode): Int = if (node.isIntegralNumber && node.canConvertToInt()) node.intValue() else invalid()
            fun nullableInteger(node: JsonNode): Int? = if (node.isNull) null else integer(node)
            val required = arrayOf("format", "version", "scan_id", "complete", "counts", "inventory", "experience")
            fields(root, *(required + if (root.has("bag")) arrayOf("bag") else emptyArray()))
            val bag = if (root.has("bag")) {
                val node = root.path("bag")
                fields(node, "current_count", "capacity")
                StarWorkspaceBagRequest(
                    integer(node.path("current_count")),
                    nullableInteger(node.path("capacity")),
                )
            } else {
                null
            }
            val counts = root.path("counts")
            fields(counts, "main", "support")
            val experience = root.path("experience")
            fields(experience, "orange", "purple", "white")
            val inventory = root.path("inventory")
            if (!inventory.isArray || inventory.size() > 1000 || !root.path("complete").isBoolean) invalid()
            return StarInventorySyncRequest(
                text(root.path("format")),
                integer(root.path("version")),
                text(root.path("scan_id")),
                root.path("complete").booleanValue(),
                StarInventorySyncCounts(integer(counts.path("main")), integer(counts.path("support"))),
                inventory.map {
                    fields(it, "kind", "name", "quality", "level")
                    StarInventorySyncEntry(
                        text(it.path("kind")),
                        text(it.path("name")),
                        text(it.path("quality")),
                        integer(it.path("level")),
                    )
                },
                StarInventorySyncExperience(
                    nullableInteger(experience.path("orange")),
                    nullableInteger(experience.path("purple")),
                    nullableInteger(experience.path("white")),
                ),
                bag,
            )
        }
    }
}

data class StarInventorySyncCounts(val main: Int, val support: Int) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown inventory count field: $name")
    }
}

data class StarInventorySyncEntry(val kind: String, val name: String, val quality: String, val level: Int) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown inventory entry field: $name")
    }
}

data class StarInventorySyncExperience(val orange: Int?, val purple: Int?, val white: Int?) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown inventory experience field: $name")
    }
}
