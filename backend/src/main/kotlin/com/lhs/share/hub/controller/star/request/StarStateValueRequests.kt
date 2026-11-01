package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import com.fasterxml.jackson.databind.JsonNode
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class StarInventoryEntryRequest(
    @field:NotBlank @field:Size(max = 128)
    @field:Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    @field:JsonSetter(nulls = Nulls.FAIL) val instanceId: String,
    @field:NotBlank @field:Pattern(regexp = "^(main|support)$")
    @field:JsonSetter(nulls = Nulls.FAIL) val kind: String,
    @field:NotBlank @field:Size(max = 256)
    @field:JsonSetter(nulls = Nulls.FAIL) val name: String,
    @field:NotBlank @field:Pattern(regexp = "^(orange|purple|blue|green|white)$")
    @field:JsonSetter(nulls = Nulls.FAIL) val quality: String,
    @field:NotNull @field:Min(1) @field:Max(60)
    @field:JsonSetter(nulls = Nulls.FAIL) val level: Int?,
    // Missing preserves an unchanged instance on PATCH; explicit JSON null clears the fact.
    @field:io.swagger.v3.oas.annotations.media.Schema(
        type = "integer",
        minimum = "0",
        maximum = "5",
        nullable = true,
        description = "实际完成突破次数；省略与显式 null 的语义不同，详见星石突破接入契约",
    )
    val breakthroughStage: JsonNode? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star entry field: $name")
    }
}

data class StarWorkspaceBagRequest(val currentCount: Int? = null, val capacity: Int? = null) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star bag field: $name")
    }
}

data class StarWorkspaceExperienceRequest(val orange: Int? = null, val purple: Int? = null, val white: Int? = null) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star experience field: $name")
    }
}
