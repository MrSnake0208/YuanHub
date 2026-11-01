package com.lhs.share.hub.controller.operator.request

import com.fasterxml.jackson.annotation.JsonProperty
import com.lhs.share.hub.controller.inventory.request.ProducerDto
import jakarta.validation.Valid
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

data class OperatorImportRequest(
    val format: String,
    val version: Int,
    @JsonProperty("exported_at") val exportedAt: String,
    @field:Valid val producer: ProducerDto,
    @JsonProperty("catalog_version") val catalogVersion: String? = null,
    @field:Valid val accounts: List<OperatorExchangeAccountDto>? = null,
    @field:NotEmpty @field:Size(max = 1000) @field:Valid val records: List<OperatorRecordRequest>,
)

data class OperatorExchangeAccountDto(val id: String, val name: String? = null)

data class OperatorRecordRequest(
    @JsonProperty("account_id") val accountId: String,
    @JsonProperty("record_id") val recordId: String,
    @JsonProperty("record_type") val recordType: String,
    val game: String? = null,
    @JsonProperty("effective_at") val effectiveAt: String,
    @JsonProperty("snapshot_scope") val snapshotScope: String,
    @field:Valid val entries: List<OperatorEntryRequest>,
)

data class OperatorEntryRequest(
    val id: String,
    val name: String? = null,
    val alias: String? = null,
    val rarity: Int? = null,
    val prof: List<String>? = null,
    @JsonProperty("subProf") val subProf: List<String>? = null,
    val games: List<String>? = null,
    @field:NotNull val elite: Int,
    @JsonProperty("starLevel") @field:NotNull val starLevel: Int,
    @field:NotNull val level: Int,
    @field:Valid val discs: List<OperatorDiscRequest> = emptyList(),
    @JsonProperty("starStones") @field:Valid val starStones: List<OperatorStarStoneRequest> = emptyList(),
)

data class OperatorDiscRequest(
    @JsonProperty("ot_name") val otName: String,
    val abbreviation: String? = null,
    val color: String? = null,
    val desp: String? = null,
)

data class OperatorStarStoneRequest(val name: String? = null, val type: String, val level: Int)
