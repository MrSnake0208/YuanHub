package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.operator.OperatorCustomSpendTemplatesService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/operator/custom-spend-templates")
class OperatorCustomSpendTemplatesController(
    private val service: OperatorCustomSpendTemplatesService,
    private val helper: AuthenticationHelper,
) {
    @GetMapping
    fun get() = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.get(helper.requireUserId())))

    @PutMapping
    fun save(@RequestBody request: ObjectNode) =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(service.save(helper.requireUserId(), request)))
}
