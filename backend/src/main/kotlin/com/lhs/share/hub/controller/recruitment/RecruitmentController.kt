package com.lhs.share.hub.controller.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCommandRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRequestDecoder
import com.lhs.share.hub.service.recruitment.RecruitmentCatalog
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

@RestController
@RequestMapping("/v1/recruitment", produces = [MediaType.APPLICATION_JSON_VALUE])
class RecruitmentController(
    private val service: RecruitmentService,
    private val catalog: RecruitmentCatalog,
    private val helper: AuthenticationHelper,
    mapper: ObjectMapper,
) {
    private val decoder = RecruitmentRequestDecoder(mapper)

    @GetMapping("/catalog")
    fun catalog(@RequestParam game: String) = success(catalog.catalog(game))

    @RequireJwt
    @GetMapping("/archive")
    fun archive(@RequestParam(name = "account_id") accountId: String) =
        helper.requireUserId().let { userId -> success(service.archive(userId, accountId)) }

    @RequireJwt
    @GetMapping("/events")
    fun events(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(name = "pool_id", required = false) poolId: String?,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(name = "date_from", required = false) dateFrom: LocalDate?,
        @RequestParam(name = "date_to", required = false) dateTo: LocalDate?,
        @RequestParam(defaultValue = "desc") order: String,
    ) = helper.requireUserId().let { userId ->
        success(service.page(userId, accountId, poolId, cursor, limit, dateFrom, dateTo, order))
    }

    @RequireJwt
    @GetMapping("/batches")
    fun batches(
        @RequestParam(name = "account_id") accountId: String,
        @RequestParam(name = "pool_id", required = false) poolId: String?,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "50") limit: Int,
    ) = helper.requireUserId().let { userId -> success(service.batches(userId, accountId, poolId, cursor, limit)) }

    @RequireJwt
    @PostMapping("/commands", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun command(@RequestBody request: JsonNode) = helper.requireUserId().let { userId ->
        success(service.command(userId, decoder.read(request, RecruitmentCommandRequest::class.java)))
    }
}
