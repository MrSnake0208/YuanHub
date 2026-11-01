package com.lhs.share.hub.controller.level.request

import com.fasterxml.jackson.annotation.JsonAlias
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode

/** Full replacement payload for create/update; revision is only accepted on update. */
data class LevelCatalogWriteRequest(
    val game: String? = null,
    @JsonProperty("cat_one") val catOne: String? = null,
    @JsonProperty("cat_two") val catTwo: String? = null,
    @JsonProperty("cat_three") val catThree: String? = null,
    val name: String? = null,
    @JsonProperty("level_id") val levelId: String? = null,
    @JsonProperty("stage_id") val stageId: String? = null,
    val status: String? = null,
    @JsonProperty("is_open") val isOpen: Boolean? = null,
    @JsonProperty("end_time") val endTime: JsonNode? = null,
    @JsonProperty("sort_order") val sortOrder: Int? = null,
    @JsonProperty("expected_revision") val expectedRevision: Long? = null,
)

data class LevelCatalogImportEntry(
    @JsonProperty("id")
    @JsonAlias("level_key")
    val levelKey: String? = null,
    val game: String? = null,
    @JsonProperty("cat_one") val catOne: String? = null,
    @JsonProperty("cat_two") val catTwo: String? = null,
    @JsonProperty("cat_three") val catThree: String? = null,
    val name: String? = null,
    @JsonProperty("level_id") val levelId: String? = null,
    @JsonProperty("stage_id") val stageId: String? = null,
    val status: String? = null,
    @JsonProperty("is_open") val isOpen: Boolean? = null,
    @JsonProperty("end_time") val endTime: String? = null,
    @JsonProperty("sort_order") val sortOrder: Int? = null,
)

data class LevelCatalogRevisionRequest(
    @JsonProperty("expected_revision") val expectedRevision: Long? = null,
)
