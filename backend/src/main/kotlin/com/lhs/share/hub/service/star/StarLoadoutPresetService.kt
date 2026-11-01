package com.lhs.share.hub.service.star

import com.lhs.share.hub.controller.star.request.StarLoadoutPresetCurrentRequest
import com.lhs.share.hub.controller.star.request.StarLoadoutPresetRequest
import com.lhs.share.hub.controller.star.response.StarLoadoutPresetCurrentResponse
import com.lhs.share.hub.repository.StarLoadoutPresetCurrentRepository
import com.lhs.share.hub.repository.entity.StarLoadoutPreset
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class StarLoadoutPresetService(
    private val repository: StarLoadoutPresetCurrentRepository,
) {
    fun current(userId: String): StarLoadoutPresetCurrentResponse = repository.findByUserId(userId)
        ?.let(StarLoadoutPresetCurrentResponse::of)
        ?: StarLoadoutPresetCurrentResponse.empty()

    fun putCurrent(userId: String, request: StarLoadoutPresetCurrentRequest): StarLoadoutPresetCurrentResponse {
        val expected = request.expectedRevision ?: throw invalid("expected_revision 不能为空")
        if (expected < 0) throw invalid("expected_revision 不能小于 0")
        val main = normalizeGroup("main_presets", request.mainPresets)
        val support = normalizeGroup("support_presets", request.supportPresets)
        val payloadCharacters = (main + support).sumOf { preset ->
            preset.id.length + preset.name.length + preset.starNames.sumOf(String::length)
        }
        if (payloadCharacters > MAX_PAYLOAD_CHARACTERS) throw invalid("preset payload 过大")
        val saved = starCasConflictBoundary({ throw conflict() }) {
            repository.replace(userId, expected, main, support, Instant.now()) ?: throw conflict()
        }
        return StarLoadoutPresetCurrentResponse.of(saved)
    }

    private fun normalizeGroup(label: String, source: List<StarLoadoutPresetRequest>?): List<StarLoadoutPreset> {
        val presets = source ?: throw invalid("$label 不能为空")
        if (presets.size > MAX_PRESETS_PER_GROUP) throw invalid("$label 数量不能超过 $MAX_PRESETS_PER_GROUP")
        val ids = HashSet<String>()
        return presets.map { item ->
            val id = item.id?.trim().orEmpty()
            val name = item.name?.trim().orEmpty()
            val starNames = item.starNames?.map(String::trim) ?: throw invalid("star_names 不能为空")
            if (id.isEmpty()) throw invalid("preset id 不能为空")
            if (id.length > MAX_ID_LENGTH) throw invalid("preset id 长度不能超过 $MAX_ID_LENGTH")
            if (!ids.add(id)) throw invalid("$label 内 preset id 不能重复")
            if (name.isEmpty()) throw invalid("preset name 不能为空")
            if (name.length > MAX_NAME_LENGTH) throw invalid("preset name 长度不能超过 $MAX_NAME_LENGTH")
            if (starNames.size !in 1..3) throw invalid("star_names 数量必须为 1 到 3")
            if (starNames.any(String::isEmpty)) throw invalid("star_names 不能包含空名称")
            if (starNames.any { it.length > MAX_STAR_NAME_LENGTH }) throw invalid("star name 长度不能超过 $MAX_STAR_NAME_LENGTH")
            if (starNames.toSet().size != starNames.size) throw invalid("同一 preset 内 star_names 不能重复")
            StarLoadoutPreset(id, name, starNames)
        }
    }

    private fun invalid(message: String) = InventoryApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "star_loadout_preset_invalid_snapshot",
        message,
    )

    private fun conflict() = InventoryApiException(
        HttpStatus.CONFLICT,
        "star_loadout_preset_revision_conflict",
        "Star loadout presets changed; reload before saving",
    )

    companion object {
        private const val MAX_PRESETS_PER_GROUP = 20
        private const val MAX_ID_LENGTH = 128
        private const val MAX_NAME_LENGTH = 64
        private const val MAX_STAR_NAME_LENGTH = 32
        private const val MAX_PAYLOAD_CHARACTERS = 16_384
    }
}
