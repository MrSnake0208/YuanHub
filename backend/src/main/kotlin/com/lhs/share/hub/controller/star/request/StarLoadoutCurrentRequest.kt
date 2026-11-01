package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

/** Full account snapshot. Each operator's six fixed slot keys are checked by the service. */
data class StarLoadoutCurrentRequest(
    @field:NotNull(message = "expected_revision 不能为空")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val expectedRevision: Long?,
    @field:NotNull(message = "loadouts 不能为空")
    @field:Size(max = 500, message = "loadouts 数量不能超过 500")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val loadouts: Map<String, Map<String, String?>>?,
    @field:NotNull(message = "expected_generation 不能为空")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val expectedGeneration: Long? = null,
) {
    @JsonAnySetter
    fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star loadout field: $name")
    }
}
