package com.lhs.share.hub.controller.star.request

import com.fasterxml.jackson.annotation.JsonAnySetter

data class StarPlanInheritanceRequest(
    val operationId: String,
    val sourceRecoveryPointId: String,
    val expectedGeneration: Long,
    val expectedRevision: Long,
    val planTargets: Map<String, Int>? = null,
) {
    @JsonAnySetter fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unknown plan inheritance field: $name")
    }
}
