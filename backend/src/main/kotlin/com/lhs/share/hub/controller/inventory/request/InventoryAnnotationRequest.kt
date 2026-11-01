package com.lhs.share.hub.controller.inventory.request

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min

data class InventoryAnnotationRequest(
    @field:Valid
    val document: InventoryImportRequest,
    @field:Min(0)
    @field:Max(9007199254740990L)
    @field:JsonSetter(nulls = Nulls.FAIL)
    @param:JsonProperty(value = "expected_inventory_revision", required = true)
    val expectedInventoryRevision: Long,
)
