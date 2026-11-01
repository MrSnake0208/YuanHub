package com.lhs.share.hub.controller.account

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.account.request.AccountCreateRequest
import com.lhs.share.hub.controller.account.request.AccountPatchRequest
import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * 统一子账号 CRUD(库存 × 密探共用)
 *
 * 替代原 /v1/inventory/accounts 与 /v1/operator/accounts:一个子账号全局可用。
 * 删除 = 整账号级联(库存、密探、特别关注数据 + 全部绑定的 token)。
 */
@Tag(name = "子账号", description = "库存 × 密探共用的统一子账号(HubBackend)")
@RequestMapping("/v1/accounts", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class AccountController(
    private val accountService: SubAccountService,
    private val helper: AuthenticationHelper,
    private val eventService: AccountEventService,
) {
    @Operation(summary = "创建子账号")
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun create(@Valid @RequestBody request: AccountCreateRequest): ApiResult<SubAccountResponse> =
        success(accountService.create(helper.requireUserId(), request.name, request.game))

    @Operation(summary = "子账号列表")
    @GetMapping
    fun list(): ApiResult<List<SubAccountResponse>> = success(accountService.list(helper.requireUserId()))

    @GetMapping("/{accountId}/daily-zhuyu-preference")
    fun dailyZhuyuPreference(@PathVariable accountId: String): ApiResult<Map<String, String?>> =
        success(accountService.dailyZhuyuPreference(helper.requireUserId(), accountId))

    @PutMapping("/{accountId}/daily-zhuyu-preference")
    fun saveDailyZhuyuPreference(@PathVariable accountId: String, @RequestBody body: JsonNode): ApiResult<Map<String, String?>> {
        if (!body.isObject || body.size() != 3 || !body.has("expected") ||
            !(body.path("expected").isNull || body.path("expected").isTextual) ||
            !body.path("game").isTextual || !body.path("preference").isTextual
        ) {
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "茱萸记账设置无效")
        }
        return success(
            accountService.saveDailyZhuyuPreference(
                helper.requireUserId(),
                accountId,
                body.path("game").asText(),
                if (body.path("expected").isNull) null else body.path("expected").asText(),
                body.path("preference").asText(),
            ),
        )
    }

    @Operation(
        summary = "订阅账号自动上报事件",
        description = "JWT 鉴权的瞬时 SSE。推送 operator_scan_import 和 inventory_import，不补发断线历史事件。",
    )
    @GetMapping("/{accountId}/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun events(@PathVariable accountId: String): ResponseEntity<SseEmitter> {
        val userId = helper.requireUserId()
        accountService.requireAccount(userId, accountId)
        return ResponseEntity.ok()
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Accel-Buffering", "no")
            .body(eventService.subscribe(userId, accountId))
    }

    @Operation(summary = "修改子账号")
    @PatchMapping("/{accountId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable accountId: String, @Valid @RequestBody request: AccountPatchRequest): ApiResult<SubAccountResponse> =
        success(accountService.update(helper.requireUserId(), accountId, request.name, request.game, request.operatorPanelAutoFill))

    @Operation(summary = "删除子账号及其全部数据")
    @DeleteMapping("/{accountId}")
    fun delete(@PathVariable accountId: String): ApiResult<Boolean> {
        accountService.delete(helper.requireUserId(), accountId)
        return success(true)
    }
}
