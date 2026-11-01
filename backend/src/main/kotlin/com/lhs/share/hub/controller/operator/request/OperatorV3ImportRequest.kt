package com.lhs.share.hub.controller.operator.request

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "浏览器 v3/v4/v5 导入请求；来源账号必须逐项映射到当前 JWT 用户拥有的目标账号")
data class OperatorV3BrowserImportRequest(
    val document: OperatorV3ExchangeDocumentRequest,
    @field:Schema(example = "{\"local_default\":\"acc_xxx\"}")
    val accountMapping: Map<String, String>,
    @field:Schema(description = "允许写入 section_status=review 的分区；默认 false")
    val confirmReview: Boolean = false,
)

@Schema(
    description = "myshare-operator-exchange v3/v4/v5 客观养成文档。equipped_star_stones 映射到 current.star_stones；" +
        "star_level、disc_loadouts 和 combat_stats 同名映射。",
)
data class OperatorV3ExchangeDocumentRequest(
    @field:Schema(allowableValues = ["myshare-operator-exchange"])
    val format: String,
    @field:Schema(allowableValues = ["3", "4", "5"])
    val version: Int,
    val exportedAt: String,
    val producer: JsonNode,
    val catalogVersion: String? = null,
    val accounts: List<JsonNode>,
    val records: List<JsonNode>,
)
