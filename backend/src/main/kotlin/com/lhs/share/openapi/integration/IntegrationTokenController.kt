package com.lhs.share.openapi.integration

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/user/integration-tokens")
@RequireJwt
class IntegrationTokenController(
    private val service: IntegrationTokenService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping("/scopes")
    fun scopes(): ApiResult<List<IntegrationScopeResponse>> = success(IntegrationScope.listAll())

    @PostMapping
    fun create(@Valid @RequestBody request: IntegrationTokenCreateRequest): ApiResult<IntegrationTokenCreatedResponse> = success(
        service.create(
            ownerUserId = helper.requireUserId(),
            name = request.name,
            scopes = request.scopes,
            feedbackAreas = request.feedbackAreas,
            expiresAt = request.expiresAt,
        ),
    )

    @GetMapping
    fun list(): ApiResult<List<IntegrationTokenListItemResponse>> = success(service.list(helper.requireUserId()))

    @DeleteMapping("/{tokenId}")
    fun revoke(@PathVariable tokenId: String): ApiResult<IntegrationTokenListItemResponse> =
        success(service.revoke(helper.requireUserId(), tokenId))
}

data class IntegrationTokenCreateRequest(
    @field:NotBlank
    @field:Size(max = 80)
    val name: String,
    @field:Size(min = 1, max = 8)
    val scopes: List<String>,
    val feedbackAreas: Set<String>? = null,
    val expiresAt: Instant? = null,
)
