package com.lhs.share.hub.controller.operator.request

import com.fasterxml.jackson.annotation.JsonAlias
import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class OperatorCatalogWriteRequest(
    @field:NotBlank
    @field:Pattern(regexp = "^char_[A-Za-z0-9_]+$", message = "id 格式无效")
    val id: String,
    @field:NotBlank
    @field:Size(max = 64)
    val name: String,
    @field:Size(max = 512)
    val alias: String? = null,
    @field:Min(3)
    @field:Max(5)
    val rarity: Int,
    @field:JsonAlias("specialOddityName")
    @field:Schema(
        description = "第三项奇闻展示名称；新建必填，更新缺失或 null 时保留旧值",
        example = "免伤值",
        maxLength = 32,
    )
    val specialOddityName: String? = null,
    @field:NotEmpty
    val prof: List<@NotBlank String>,
    @JsonProperty("subProf")
    val subProf: List<@NotBlank String> = emptyList(),
    @field:NotEmpty
    val games: List<@NotBlank String>,
    @field:Valid
    val discs: List<OperatorCatalogDiscRequest> = emptyList(),
    @JsonProperty("starStones")
    @field:Valid
    val starStones: List<OperatorCatalogStarStoneRequest> = emptyList(),
    @JsonProperty("spOf")
    val spOf: String? = null,
)

data class OperatorCatalogDiscRequest(
    @JsonProperty("ot_name")
    @field:NotBlank
    val otName: String,
    val abbreviation: String? = null,
    val color: String? = null,
    val desp: String? = null,
)

data class OperatorCatalogStarStoneRequest(
    @field:NotBlank
    val name: String,
    @field:Pattern(regexp = "^(main|assist)$")
    val type: String,
)
