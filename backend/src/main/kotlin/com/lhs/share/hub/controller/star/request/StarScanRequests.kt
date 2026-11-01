package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter
import java.time.Instant

/** A scan is an observation awaiting human review, never a StarState replacement command. */
data class StarScanReportRequest(
    val format: String = "",
    val version: Int? = null,
    val recordId: String = "",
    val expectedAccountId: String = "",
    val game: String = "",
    val capturedAt: Instant? = null,
    val width: Int? = null,
    val height: Int? = null,
    val dpi: Int? = null,
    val sections: Map<String, Boolean> = emptyMap(),
    val entries: List<StarScanObservation> = emptyList(),
    val experience: StarWorkspaceExperienceRequest = StarWorkspaceExperienceRequest(),
    val bag: StarWorkspaceBagRequest = StarWorkspaceBagRequest(),
    val warnings: List<String> = emptyList(),
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star scan field: $name")
    }
}

data class StarScanObservation(
    val observationId: String = "",
    val kind: String = "",
    val name: String? = null,
    val quality: String? = null,
    val level: Int? = null,
    val source: String = "",
    val rawText: String = "",
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star observation field: $name")
    }
}

data class StarScanApplyRequest(
    val expectedGeneration: Long? = null,
    val expectedRevision: Long? = null,
    val expectedLoadoutRevision: Long? = null,
    val entries: List<StarScanSelection> = emptyList(),
    val experience: StarWorkspaceExperienceRequest = StarWorkspaceExperienceRequest(),
    val bag: StarWorkspaceBagRequest = StarWorkspaceBagRequest(),
    val confirmRemovals: Boolean = false,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star scan apply field: $name")
    }
}

data class StarScanSelection(
    val observationId: String = "",
    val existingInstanceId: String? = null,
    val kind: String = "",
    val name: String = "",
    val quality: String = "",
    val level: Int? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown star scan selection field: $name")
    }
}
