package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

/** A complete current-generation business update. It never changes generation. */
data class StarStatePatchRequest(
    @field:NotNull val expectedGeneration: Long?,
    @field:NotNull val expectedRevision: Long?,
    @field:NotNull @field:Valid @field:Size(max = 1000) val inventory: List<StarInventoryEntryRequest>?,
    @field:NotNull @field:Size(max = 1000) val planTargets: Map<String, Int>?,
    @field:NotNull @field:Valid val experience: StarWorkspaceExperienceRequest?,
    @field:NotNull @field:Valid val bag: StarWorkspaceBagRequest?,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star state field: $name")
    }
}

/** OCR and complete JSON replacement share one generation-changing command. */
data class StarStateRebuildRequest(
    @field:NotNull val expectedGeneration: Long?,
    @field:NotNull val expectedRevision: Long?,
    @field:NotNull @field:Valid @field:Size(max = 1000) val inventory: List<StarInventoryEntryRequest>?,
    @field:NotNull @field:Size(max = 1000) val planTargets: Map<String, Int>?,
    @field:NotNull @field:Valid val experience: StarWorkspaceExperienceRequest?,
    @field:NotNull @field:Valid val bag: StarWorkspaceBagRequest?,
    @field:NotNull val reason: String?,
    val recoveryPointId: String? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star rebuild field: $name")
    }
}

data class StarStateRestoreRequest(
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) val expectedGeneration: Long?,
    @field:NotNull @field:JsonSetter(nulls = Nulls.FAIL) val expectedRevision: Long?,
)
