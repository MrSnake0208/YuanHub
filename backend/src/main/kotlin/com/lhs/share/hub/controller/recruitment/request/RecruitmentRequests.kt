package com.lhs.share.hub.controller.recruitment.request

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.service.recruitment.recruitmentInvalid
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate

data class RecruitmentCommandRequest(
    val accountId: String,
    @param:JsonProperty(required = true) val expectedRevision: Long,
    val requestId: String,
    val operation: String,
    val data: JsonNode,
)

data class RecruitmentPoolCreate(
    val progress: Long?,
    val poolId: String? = null,
    val catalogPoolId: String? = null,
    val name: String? = null,
)
data class RecruitmentPoolSelect(val poolId: String)
data class RecruitmentProgressSet(val poolId: String, @param:JsonProperty(required = true) val progress: Long?)
data class RecruitmentBaselineSet(@param:JsonProperty(required = true) val baseline: Long)
data class RecruitmentTemporaryAgentCreate(val agentId: String? = null, val name: String)
data class RecruitmentPoolMap(val poolId: String, val catalogPoolId: String)
data class RecruitmentAgentMap(val agentId: String, val catalogAgentId: String)

data class RecruitmentEventInput(
    val agentId: String,
    @param:JsonProperty(required = true) val pullSpan: Long?,
    val eventId: String? = null,
    val upStatus: String = "unknown",
    val acquiredDate: LocalDate? = null,
    val note: String? = null,
)

data class RecruitmentEventCreate(
    val poolId: String,
    val mode: String,
    val entries: List<RecruitmentEventInput>,
    val tailProgress: Long? = null,
    val extractFromBaseline: Boolean = false,
)

data class RecruitmentPoolRecordsSave(
    val poolId: String,
    val entries: List<RecruitmentEventInput>,
    val deletedEventIds: List<String> = emptyList(),
    @param:JsonProperty(required = true) val remainingPulls: Int?,
    val orderedEventIds: List<String>? = null,
    val wishAgentIds: List<String>? = null,
)

data class RecruitmentEventUpdate(val eventId: String, val entry: RecruitmentEventInput)
data class RecruitmentEventSelect(val eventId: String)
data class RecruitmentEventReorder(val poolId: String, val eventIds: List<String>)

data class RecruitmentBatchCreate(
    val poolId: String,
    val mode: String,
    @param:JsonProperty(required = true) val totalPullCount: Long,
    val entries: List<RecruitmentEventInput>,
    val tailProgress: Long? = null,
    val batchId: String? = null,
    val extractFromBaseline: Boolean = false,
)

data class RecruitmentBatchSelect(val batchId: String, val confirmTotalPullCount: Long? = null)

/** Strict decoding is scoped to recruitment; legacy API coercion behavior is unchanged. */
class RecruitmentRequestDecoder(mapper: ObjectMapper) {
    private val strictMapper = mapper.copy().enable(
        DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
        DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
    )
        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)

    fun <T> read(node: JsonNode, type: Class<T>): T {
        if (!node.isObject) throw recruitmentInvalid("请求必须是JSON对象")
        if (type == RecruitmentCatalogWriteRequest::class.java) {
            for (field in listOf("hidden", "allow_custom_up")) {
                if (node.has(field) && !node.get(field).isBoolean) {
                    throw recruitmentInvalid("${field}必须是布尔值；省略时保留已有状态")
                }
            }
        }
        validateTemporalTokens(node)
        return try {
            strictMapper.treeToValue(node, type) ?: throw recruitmentInvalid("请求不能为空")
        } catch (_: com.fasterxml.jackson.core.JsonProcessingException) {
            throw recruitmentInvalid("请求字段或类型不符合该操作要求")
        }
    }

    /** JavaTime accepts epoch numbers and date arrays; this API requires explicit ISO strings. */
    private fun validateTemporalTokens(node: JsonNode) {
        if (node.isArray) {
            node.forEach(::validateTemporalTokens)
            return
        }
        if (!node.isObject) return
        node.fields().forEachRemaining { (name, value) ->
            if (!value.isNull && name in DATE_FIELDS) {
                if (!value.isTextual || !DATE_FORMAT.matches(value.asText())) throw recruitmentInvalid("纯日期必须为YYYY-MM-DD字符串")
                try {
                    LocalDate.parse(value.asText())
                } catch (_: DateTimeException) {
                    throw recruitmentInvalid("纯日期不正确")
                }
            } else if (!value.isNull && name in TIME_FIELDS) {
                if (!value.isTextual || !value.asText().endsWith("Z")) throw recruitmentInvalid("时间必须为UTC RFC3339字符串")
                try {
                    Instant.parse(value.asText())
                } catch (_: DateTimeException) {
                    throw recruitmentInvalid("时间不正确")
                }
            }
            validateTemporalTokens(value)
        }
    }

    private companion object {
        val DATE_FORMAT = Regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
        val DATE_FIELDS = setOf("acquired_date", "start_date", "end_date")
        val TIME_FIELDS = setOf("exported_at", "created_at", "updated_at", "deleted_at", "imported_at")
    }
}
