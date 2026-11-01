package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.operator.OperatorPlannerService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/operator", produces = [MediaType.APPLICATION_JSON_VALUE])
class OperatorPlannerController(private val service: OperatorPlannerService, private val helper: AuthenticationHelper) {
    @GetMapping("/training-workspace")
    fun workspace(@RequestParam("account_id") accountId: String) = success(service.workspace(helper.requireUserId(), accountId))

    @PutMapping("/training-workspace")
    fun putWorkspace(@RequestParam("account_id") accountId: String, @RequestBody request: ObjectNode) =
        success(service.putWorkspace(helper.requireUserId(), accountId, request))

    @GetMapping("/training-plans/{planId}/stamina-schedule")
    fun schedule(@RequestParam("account_id") accountId: String, @PathVariable planId: String) =
        success(service.schedule(helper.requireUserId(), accountId, planId))

    @PutMapping("/training-plans/{planId}/stamina-schedule")
    fun putSchedule(@RequestParam("account_id") accountId: String, @PathVariable planId: String, @RequestBody request: ObjectNode) =
        success(service.putSchedule(helper.requireUserId(), accountId, planId, request))

    @PostMapping("/training-plans/{planId}/members/{operatorId}/remove")
    fun removeMember(
        @RequestParam("account_id") accountId: String,
        @PathVariable planId: String,
        @PathVariable operatorId: String,
        @RequestBody request: ObjectNode,
    ) = success(service.removeMember(helper.requireUserId(), accountId, planId, operatorId, request))

    @PostMapping("/training-workspace/import-local")
    fun importLocal(@RequestParam("account_id") accountId: String, @RequestBody request: ObjectNode) =
        success(service.importLocal(helper.requireUserId(), accountId, request))
}
