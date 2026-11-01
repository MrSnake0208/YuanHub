package com.lhs.share.hub.controller.operator.response

import com.lhs.share.hub.repository.entity.OperatorAnnotation
import com.lhs.share.hub.repository.entity.OperatorGrowthTarget
import java.time.Instant

data class OperatorAnnotationListResponse(val accountId: String, val items: List<OperatorAnnotationResponse>)

data class OperatorAnnotationResponse(
    val operatorId: String,
    val growthState: String,
    val note: String?,
    val revision: Long,
    val updatedAt: Instant,
) {
    companion object {
        fun of(value: OperatorAnnotation) = OperatorAnnotationResponse(
            value.operatorId,
            value.growthState,
            value.note,
            value.revision,
            value.updatedAt,
        )
    }
}

data class OperatorGrowthTargetListResponse(val accountId: String, val items: List<OperatorGrowthTargetResponse>)

data class OperatorGrowthTargetResponse(
    val operatorId: String,
    val level: Int?,
    val elite: Int?,
    val starLevel: Int?,
    val heartPaper: Int?,
    val revision: Long,
    val updatedAt: Instant,
    val huaji: com.lhs.share.hub.repository.entity.OperatorHuaji? = null,
) {
    companion object {
        fun of(value: OperatorGrowthTarget) = OperatorGrowthTargetResponse(
            value.operatorId,
            value.targetLevel,
            value.targetElite,
            value.targetStarLevel,
            value.targetHeartPaper,
            value.revision,
            value.updatedAt,
            value.targetHuaji,
        )
    }
}
