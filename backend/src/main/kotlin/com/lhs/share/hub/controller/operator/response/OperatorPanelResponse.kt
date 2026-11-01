package com.lhs.share.hub.controller.operator.response

/** Only final values are public; rule rows, sums and source identifiers never leave the service. */
data class OperatorPanelResponse(
    val status: String,
    val attack: Long? = null,
    val hp: Long? = null,
    val missingFields: List<String> = emptyList(),
    val reason: String? = null,
    val ruleVersion: String? = null,
)
