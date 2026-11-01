package com.lhs.share.hub.controller.level.response

import com.fasterxml.jackson.annotation.JsonInclude

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LevelCatalogError(
    val code: String,
    val message: String,
    val levelKey: String? = null,
    val fieldPath: String? = null,
)

data class LevelCatalogErrorResponse(val error: LevelCatalogError)
