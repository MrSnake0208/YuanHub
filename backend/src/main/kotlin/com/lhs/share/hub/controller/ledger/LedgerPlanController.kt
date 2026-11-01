package com.lhs.share.hub.controller.ledger

import com.lhs.share.config.accesslimit.AccessLimit
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.ledger.request.LedgerPlanCreateRequest
import com.lhs.share.hub.controller.ledger.response.LedgerPlanResponse
import com.lhs.share.hub.controller.ledger.response.PlanListItemDto
import com.lhs.share.hub.service.ledger.LedgerPlanService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 广陵账房方案接口(数据存 HubBackend.hub_ledger_plan)
 *
 * 安全:全部接口需登录(路径不在 SecurityConfig 任何放行列表,默认 authenticated),
 * 方案为私有数据,userId 一律取自当前 JWT,绝不由前端传入。
 */
@Tag(name = "广陵账房", description = "广陵账房方案存储(HubBackend.hub_ledger_plan)")
@RequestMapping("/hub/ledger/plan")
@RestController
class LedgerPlanController(
    private val ledgerPlanService: LedgerPlanService,
    private val helper: AuthenticationHelper,
) {
    /**
     * 创建方案(需登录,方案归属当前用户;每用户上限见 share.ledger.max-plans-per-user)
     */
    @Operation(summary = "创建方案")
    @RequireJwt
    @AccessLimit(times = 100, second = 60)
    @PostMapping
    fun create(@Valid @RequestBody request: LedgerPlanCreateRequest): ApiResult<LedgerPlanResponse> =
        success(ledgerPlanService.create(helper.requireUserId(), request))

    /**
     * 整体替换更新方案(需登录,仅本人;不存在/越权统一 404)
     */
    @Operation(summary = "整体替换更新方案")
    @RequireJwt
    @AccessLimit(times = 100, second = 60)
    @PutMapping("/{id}")
    fun update(
        @PathVariable(name = "id") id: String,
        @Valid @RequestBody request: LedgerPlanCreateRequest,
    ): ApiResult<LedgerPlanResponse> = success(ledgerPlanService.update(helper.requireUserId(), id, request))

    /**
     * 方案详情(需登录,仅本人;跨用户 404 不暴露存在性)
     */
    @Operation(summary = "方案详情")
    @RequireJwt
    @GetMapping("/{id}")
    fun getById(@PathVariable(name = "id") id: String): ApiResult<LedgerPlanResponse> =
        success(ledgerPlanService.getById(helper.requireUserId(), id))

    /**
     * 我的方案列表(需登录;可选 version 过滤;轻量摘要,不含大明细)
     */
    @Operation(summary = "我的方案列表")
    @RequireJwt
    @GetMapping
    fun list(@RequestParam(name = "version", required = false) version: String?): ApiResult<List<PlanListItemDto>> =
        success(ledgerPlanService.list(helper.requireUserId(), version))

    /**
     * 删除方案(需登录,仅本人;成功返回 data=true,不存在/越权统一 404)
     */
    @Operation(summary = "删除方案")
    @RequireJwt
    @AccessLimit(times = 100, second = 60)
    @DeleteMapping("/{id}")
    fun delete(@PathVariable(name = "id") id: String): ApiResult<Boolean> {
        ledgerPlanService.delete(helper.requireUserId(), id)
        return success(true)
    }
}
