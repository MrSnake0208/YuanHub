package com.lhs.share.hub.controller.ledger.request

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.entity.LedgerTier
import com.lhs.share.hub.service.ledger.ledgerInvalid
import java.time.Instant

data class LedgerPackageWrite(
    val game: String,
    val name: String,
    val points: Int,
    val draws: Double,
    val limit: Int,
    val priceUsd: Double? = null,
    val priceCny: Double? = null,
    val category: String,
    val sortId: Int = 0,
    val extra: String = "",
    val enabled: Boolean = true,
    val expectedVersion: Long? = null,
)
data class LedgerCampaignWrite(
    val game: String,
    val name: String,
    val startsAt: Instant?,
    val endsAt: Instant,
    val timeZone: String,
    val status: String,
    val tiers: List<LedgerTier>,
    val expectedVersion: Long? = null,
)
data class LedgerSettingsWrite(val exchangeRate: Double, val expectedVersion: Long)

class LedgerCatalogDecoder(mapper: ObjectMapper) {
    private val reader = mapper.copy().enable(
        DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
        DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
        DeserializationFeature.FAIL_ON_NUMBERS_FOR_ENUMS,
    ).disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)

    fun <T> read(node: JsonNode, type: Class<T>): T {
        if (!node.isObject) throw ledgerInvalid("请求必须是JSON对象")
        validateStrings(node)
        return try {
            reader.treeToValue(node, type)
        } catch (error: com.fasterxml.jackson.core.JsonProcessingException) {
            throw ledgerInvalid("字段缺失、未知字段或类型不正确")
        }
    }
    private fun validateStrings(node: JsonNode) {
        if (node.isArray) node.forEach(::validateStrings)
        if (!node.isObject) return
        node.fields().forEach { (key, value) ->
            if (key in setOf("game", "name", "category", "extra", "starts_at", "ends_at", "time_zone", "status") &&
                !value.isNull && !value.isTextual
            ) {
                throw ledgerInvalid("$key 必须是字符串")
            }
            validateStrings(value)
        }
    }
}
