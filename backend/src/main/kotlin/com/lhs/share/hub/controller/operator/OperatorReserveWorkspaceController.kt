package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.operator.OperatorReserveWorkspaceService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/operator/reserve-workspace", produces = [MediaType.APPLICATION_JSON_VALUE])
class OperatorReserveWorkspaceController(private val service: OperatorReserveWorkspaceService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun workspace(@RequestParam("account_id") accountId: String) = success(service.workspace(helper.requireUserId(), accountId))

    @PutMapping
    fun putWorkspace(@RequestParam("account_id") accountId: String, @RequestBody request: ObjectNode) =
        success(service.putWorkspace(helper.requireUserId(), accountId, request))
}
