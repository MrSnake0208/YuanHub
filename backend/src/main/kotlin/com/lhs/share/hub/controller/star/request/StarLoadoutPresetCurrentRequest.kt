package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

data class StarLoadoutPresetCurrentRequest(
    @field:NotNull(message = "expected_revision 不能为空")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val expectedRevision: Long?,
    @field:NotNull(message = "main_presets 不能为空")
    @field:Size(max = 20, message = "main_presets 数量不能超过 20")
    @field:Valid
    @field:JsonSetter(nulls = Nulls.FAIL)
    val mainPresets: List<StarLoadoutPresetRequest>?,
    @field:NotNull(message = "support_presets 不能为空")
    @field:Size(max = 20, message = "support_presets 数量不能超过 20")
    @field:Valid
    @field:JsonSetter(nulls = Nulls.FAIL)
    val supportPresets: List<StarLoadoutPresetRequest>?,
) {
    @JsonAnySetter
    fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star loadout preset field: $name")
    }
}

data class StarLoadoutPresetRequest(
    @field:NotNull(message = "preset id 不能为空")
    @field:Size(max = 128, message = "preset id 长度不能超过 128")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val id: String?,
    @field:NotNull(message = "preset name 不能为空")
    @field:Size(max = 64, message = "preset name 长度不能超过 64")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val name: String?,
    @field:NotNull(message = "star_names 不能为空")
    @field:Size(min = 1, max = 3, message = "star_names 数量必须为 1 到 3")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val starNames: List<String>?,
) {
    @JsonAnySetter
    fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown preset item field: $name")
    }
}
