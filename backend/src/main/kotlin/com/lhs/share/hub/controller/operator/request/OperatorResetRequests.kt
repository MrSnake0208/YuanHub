package com.lhs.share.hub.controller.operator.request

data class OperatorResetPreviewRequest(
    val accountId: String,
    val game: String,
    val operatorId: String,
    val refunds: Map<String, Long>? = null,
    val levelBreakthroughStage: Int? = null,
)

data class OperatorResetExecuteRequest(
    val accountId: String,
    val game: String,
    val previewToken: String,
    val confirmedGamePreview: Boolean,
)

data class OperatorResetUndoRequest(val accountId: String, val game: String, val previewToken: String)
