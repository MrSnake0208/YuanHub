package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarPlanInheritanceRequest
import com.lhs.share.hub.service.star.StarInventorySyncService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class StarPlanInheritanceController(private val syncs: StarInventorySyncService, private val helper: AuthenticationHelper) {
    @RequireJwt
    @PostMapping("/v1/star-state/plan-inheritance/confirm")
    fun confirm(@RequestParam(name = "account_id") accountId: String, @RequestBody request: StarPlanInheritanceRequest) =
        success(syncs.resolveInheritance(helper.requireUserId(), accountId, "confirm", request))

    @RequireJwt
    @PostMapping("/v1/star-state/plan-inheritance/discard")
    fun discard(@RequestParam(name = "account_id") accountId: String, @RequestBody request: StarPlanInheritanceRequest) =
        success(syncs.resolveInheritance(helper.requireUserId(), accountId, "discard", request))

    @RequireJwt
    @GetMapping("/v1/star-state/plan-inheritance/pending")
    fun pending(@RequestParam(name = "account_id") accountId: String) = success(syncs.inheritanceSource(helper.requireUserId(), accountId))
}
