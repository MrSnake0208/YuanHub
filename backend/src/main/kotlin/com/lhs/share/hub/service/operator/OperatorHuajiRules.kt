package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorEntry
import com.lhs.share.hub.repository.entity.OperatorHuaji
import com.lhs.share.hub.repository.entity.OperatorHuajiLegacy
import org.springframework.http.HttpStatus

/** Legacy scalars are observations, never an independent second writable fact. */
object OperatorHuajiRules {
    fun maximum(catalog: OperatorCatalogEntity) = if (catalog.spOf == null && catalog.rarity == 3) 19 else 25

    fun anomalous(raw: Int, catalog: OperatorCatalogEntity) = catalog.spOf == null && catalog.rarity == 3 && raw > 19

    fun awakeningSupported(catalog: OperatorCatalogEntity): Boolean = catalog.rarity in 4..5 &&
        (catalog.spOf == null || catalog.operatorId in setOf("char_084_chendengsp", "char_085_shizimiaosp"))

    fun read(entry: OperatorEntry, catalog: OperatorCatalogEntity?): OperatorHuaji = entry.huaji?.let { value ->
        when {
            catalog != null && value.stage?.let { anomalous(it, catalog) } == true -> value.copy(stage = null)
            value.owned && value.awakened == true && catalog != null && awakeningSupported(catalog) -> value.copy(stage = 25)
            else -> value
        }
    } ?: when {
        catalog == null -> OperatorHuaji(entry.starLevel > 0, if (entry.starLevel == 0) 0 else null, null)
        entry.starLevel !in 0..(if (catalog.spOf == null) 31 else 5) -> OperatorHuaji(entry.starLevel > 0, null, null)
        else -> legacy(entry.starLevel, catalog)
    }

    fun trace(entry: OperatorEntry, catalog: OperatorCatalogEntity?): OperatorHuajiLegacy {
        val stage = entry.huaji?.stage
        return if (catalog != null && stage != null && anomalous(stage, catalog)) {
            OperatorHuajiLegacy(stage, "historical_invalid_stage")
        } else {
            entry.huajiLegacy ?: OperatorHuajiLegacy(entry.starLevel, "legacy_current")
        }
    }

    fun forDisplay(entry: OperatorEntry, catalog: OperatorCatalogEntity?): OperatorEntry =
        entry.copy(huaji = read(entry, catalog), huajiLegacy = trace(entry, catalog))

    fun legacy(raw: Int, catalog: OperatorCatalogEntity, prior: OperatorHuaji? = null): OperatorHuaji {
        if (raw !in 0..(if (catalog.spOf == null) 31 else 5)) fail("invalid_star_level")
        if (anomalous(raw, catalog)) return OperatorHuaji(raw > 0, null, null)
        if (raw == 0) {
            if (prior?.awakened == true) fail("huaji_conflict")
            return OperatorHuaji(false, 0, prior?.awakened)
        }
        if (raw == 31 || prior?.awakened == true && awakeningSupported(catalog)) return OperatorHuaji(true, 25, true)
        if (catalog.spOf != null) return OperatorHuaji(true, 6 * (raw - 1) + 1, prior?.awakened)
        return OperatorHuaji(true, minOf(raw, 25), prior?.awakened)
    }

    fun patch(node: JsonNode, catalog: OperatorCatalogEntity, prior: OperatorHuaji): OperatorHuaji {
        if (!node.isObject || node.isEmpty || node.fieldNames().asSequence().any { it !in setOf("owned", "stage", "awakened") }) {
            fail("invalid_huaji")
        }
        val owned = if (node.has("owned")) {
            node.get("owned").takeIf { it.isBoolean }?.booleanValue() ?: fail("invalid_huaji")
        } else {
            prior.owned
        }
        val stage = if (node.has("stage")) {
            val value = node.get("stage")
            if (value.isNull) null else value.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue() ?: fail("invalid_huaji")
        } else {
            prior.stage
        }
        val awakened = if (node.has("awakened")) {
            val value = node.get("awakened")
            if (value.isNull) null else value.takeIf { it.isBoolean }?.booleanValue() ?: fail("invalid_huaji")
        } else {
            prior.awakened
        }
        val result = OperatorHuaji(owned, stage ?: if (awakened == true) 25 else null, awakened)
        validate(result, catalog)
        if (node.path("awakened").asBoolean(false) && !awakeningSupported(catalog)) fail("awakening_not_supported")
        return result
    }

    fun validate(value: OperatorHuaji, catalog: OperatorCatalogEntity) {
        if (value.stage != null && value.stage !in 0..maximum(catalog)) fail("invalid_huaji")
        if ((!value.owned && (value.stage != 0 || value.awakened == true)) || (value.owned && value.stage == 0)) fail("invalid_huaji")
        if (value.awakened == true && value.stage != null && value.stage != 25) fail("awakening_requires_five_star")
        if (catalog.spOf != null && value.stage != null && value.stage != 0 && value.stage !in listOf(1, 7, 13, 19, 25)) {
            fail("invalid_huaji")
        }
    }

    fun compatible(value: OperatorHuaji, catalog: OperatorCatalogEntity, fallback: Int): Int = when {
        !value.owned -> 0
        value.stage == null -> if (value.awakened == true && catalog.spOf == null) 31 else fallback
        catalog.spOf != null -> (value.stage - 1) / 6 + 1
        else -> value.stage
    }

    private fun fail(code: String): Nothing = throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, code, fieldPath = "huaji")
}
