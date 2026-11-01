package com.lhs.share.hub.controller.operator.response

import com.lhs.share.hub.repository.entity.OperatorResetTransaction
import com.lhs.share.hub.repository.entity.ResetGrowth

data class OperatorResetResource(val id: String, val count: Long, val balanceBefore: Long?, val balanceAfter: Long?)
data class OperatorResetPreviewResponse(
    val previewToken: String,
    val before: Map<String, ResetGrowth>,
    val resources: List<OperatorResetResource>,
    val blockers: List<String>,
    val inventoryRevision: Long,
    val money: Long = 0,
    val experience: Long? = null,
    val breakthroughRequired: Boolean = false,
)
data class OperatorResetHistoryResponse(val items: List<OperatorResetTransaction>, val nextCursor: String?)
