package com.lhs.share.hub.controller.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportCommitRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentImportPreviewRequest
import com.lhs.share.hub.controller.recruitment.request.RecruitmentRequestDecoder
import com.lhs.share.hub.service.recruitment.RecruitmentExchangeService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/recruitment", produces = [MediaType.APPLICATION_JSON_VALUE])
class RecruitmentExchangeController(
    private val service: RecruitmentExchangeService,
    private val helper: AuthenticationHelper,
    mapper: ObjectMapper,
) {
    private val decoder = RecruitmentRequestDecoder(mapper)

    @RequireJwt
    @GetMapping("/export")
    fun export(@RequestParam(name = "account_id") accountId: String) =
        helper.requireUserId().let { userId -> success(service.export(userId, accountId)) }

    @RequireJwt
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun preview(@RequestBody body: JsonNode) = helper.requireUserId().let { userId ->
        success(service.preview(userId, decoder.read(body, RecruitmentImportPreviewRequest::class.java)))
    }

    @RequireJwt
    @PostMapping("/import/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commit(@RequestBody body: JsonNode) = helper.requireUserId().let { userId ->
        success(service.commit(userId, decoder.read(body, RecruitmentImportCommitRequest::class.java)))
    }
}
