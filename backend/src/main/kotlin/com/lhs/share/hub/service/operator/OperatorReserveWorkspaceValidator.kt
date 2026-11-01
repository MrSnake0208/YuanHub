package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class OperatorReserveWorkspaceValidator {
    fun workspace(request: ObjectNode): ObjectNode {
        fields(request, setOf("schema_version", "expected_revision", "active_plan_id", "plans"), "request")
        integer(request.path("schema_version"), "schema_version", 1, 1)
        revision(request)
        val plans = request.path("plans")
        if (!plans.isArray || plans.size() > 50) invalid("plans", "最多保存 50 个方案")
        val ids = mutableSetOf<String>()
        plans.forEachIndexed { index, plan ->
            val path = "plans[$index]"
            fields(plan, setOf("id", "name", "demands"), path)
            if (!ids.add(uuid(plan.path("id"), "$path.id"))) invalid("$path.id", "方案 ID 不可重复")
            val name = plan.path("name")
            if (!name.isTextual || name.asText().isBlank() || name.asText().length !in 1..40) invalid("$path.name", "方案名称须为 1–40 字符")
            val demands = plan.path("demands")
            if (!demands.isArray || demands.size() > 50) invalid("$path.demands", "每个方案最多 50 组需求")
            val demandIds = mutableSetOf<String>()
            demands.forEachIndexed { demandIndex, demand ->
                val demandPath = "$path.demands[$demandIndex]"
                fields(demand, setOf("id", "count", "attribute", "profession", "current", "target"), demandPath)
                if (!demandIds.add(uuid(demand.path("id"), "$demandPath.id"))) invalid("$demandPath.id", "需求 ID 不可重复")
                integer(demand.path("count"), "$demandPath.count", 1, 999)
                if (demand.path("attribute").asText() !in setOf("风", "火", "地", "水", "阴", "阳", "混沌")) {
                    invalid("$demandPath.attribute", "请选择有效属性")
                }
                if (demand.path("profession").asText() !in setOf("破军", "龙盾", "岐黄", "神纪", "诡道")) {
                    invalid("$demandPath.profession", "请选择有效职业")
                }
                val current = demand.path("current")
                val target = demand.path("target")
                state(current, "$demandPath.current", current = true)
                state(target, "$demandPath.target", current = false)
                for (field in listOf("level", "elite")) {
                    if (target.path(field).asInt() < current.path(field).asInt()) invalid("$demandPath.target.$field", "目标不得低于当前值")
                }
            }
        }
        val active = request.path("active_plan_id")
        if (if (ids.isEmpty()) !active.isNull else !active.isTextual || active.asText() !in ids) {
            invalid("active_plan_id", "请选择当前方案，空工作区须为 null")
        }
        return request.deepCopy().also { it.remove("expected_revision") }
    }

    fun revision(request: JsonNode): Long = integer(request.path("expected_revision"), "expected_revision", 0, Long.MAX_VALUE - 1)

    private fun state(node: JsonNode, path: String, current: Boolean) {
        fields(node, if (current) setOf("level", "elite", "breakthrough_stage") else setOf("level", "elite"), path)
        val level = integer(node.path("level"), "$path.level", 0, 100).toInt()
        integer(node.path("elite"), "$path.elite", 0, OperatorGrowthRules.maxEliteForLevel(level).toLong())
        val stage = node.path("breakthrough_stage")
        if (current && !stage.isMissingNode && !stage.isNull) {
            val value = integer(stage, "$path.breakthrough_stage", 0, 9).toInt()
            if (!OperatorLevelBreakthroughRules.valid(level, value)) invalid("$path.breakthrough_stage", "突破状态与当前等级不匹配")
        }
    }

    private fun fields(node: JsonNode, allowed: Set<String>, path: String) {
        if (!node.isObject) invalid(path, "须为对象")
        node.fieldNames().forEach { if (it !in allowed) invalid("$path.$it", "不支持的字段") }
    }

    private fun integer(node: JsonNode, path: String, min: Long, max: Long): Long {
        if (!node.isIntegralNumber || !node.canConvertToLong() || node.asLong() !in min..max) invalid(path, "须为 $min–$max 的整数")
        return node.asLong()
    }

    private fun uuid(node: JsonNode, path: String): String {
        if (!node.isTextual ||
            !runCatching { UUID.fromString(node.asText()).toString().equals(node.asText(), ignoreCase = true) }.getOrDefault(false)
        ) {
            invalid(path, "ID 须为 UUID")
        }
        return node.asText()
    }

    private fun invalid(path: String, message: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_reserve_workspace", message, fieldPath = path)
}
