package com.lhs.share.hub.controller.changelog.request

import com.fasterxml.jackson.databind.JsonNode
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

data class ChangelogCreateRequest(
    @field:NotBlank @field:Size(max = 120) val title: String,
    @field:NotBlank @field:Size(max = 40) val versionLabel: String,
    @field:NotNull val body: JsonNode,
)

data class ChangelogDraftRequest(
    @field:NotBlank @field:Size(max = 120) val title: String,
    @field:NotBlank @field:Size(max = 40) val versionLabel: String,
    @field:NotNull val body: JsonNode,
    @field:NotNull val expectedVersion: Long?,
)

data class ChangelogVersionRequest(
    @field:NotNull val expectedVersion: Long?,
)

data class ChangelogRejectRequest(
    @field:NotNull val expectedVersion: Long?,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)
