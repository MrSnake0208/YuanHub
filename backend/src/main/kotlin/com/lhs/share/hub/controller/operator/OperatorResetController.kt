package com.lhs.share.hub.controller.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.operator.request.OperatorResetExecuteRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetPreviewRequest
import com.lhs.share.hub.controller.operator.request.OperatorResetUndoRequest
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.operator.OperatorResetService
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequireJwt
@RequestMapping("/v1/operator/resets")
class OperatorResetController(private val service: OperatorResetService, private val helper: AuthenticationHelper) {
    @PostMapping("/preview")
    fun preview(@RequestBody body: JsonNode): ResponseEntity<*> {
        fields(body, setOf("account_id", "game", "operator_id", "refunds", "level_breakthrough_stage"))
        val refunds = body.get("refunds")?.let { values ->
            if (!values.isObject || values.size() > 40) invalid()
            values.fields().asSequence().associate { (id, value) ->
                if (!value.isIntegralNumber || !value.canConvertToLong()) invalid()
                id to value.longValue()
            }
        }
        val stage = body.get("level_breakthrough_stage")?.takeUnless { it.isNull }?.let {
            if (!it.isIntegralNumber || !it.canConvertToInt()) invalid()
            it.intValue()
        }
        return response(
            service.preview(
                helper.requireUserId(),
                OperatorResetPreviewRequest(text(body, "account_id"), text(body, "game"), text(body, "operator_id"), refunds, stage),
            ),
        )
    }

    @PostMapping("/execute")
    fun execute(@RequestHeader("Idempotency-Key") key: String, @RequestBody body: JsonNode): ResponseEntity<*> {
        fields(body, setOf("account_id", "game", "preview_token", "confirmed_game_preview"))
        if (!body.path("confirmed_game_preview").isBoolean) invalid()
        return response(
            service.execute(
                helper.requireUserId(),
                key,
                OperatorResetExecuteRequest(
                    text(body, "account_id"),
                    text(body, "game"),
                    text(body, "preview_token"),
                    body.path("confirmed_game_preview").booleanValue(),
                ),
            ),
        )
    }

    @GetMapping
    fun history(
        @RequestParam("account_id") account: String,
        @RequestParam game: String,
        @RequestParam("operator_id") operator: String,
        @RequestParam(required = false) cursor: String?,
    ) = response(service.history(helper.requireUserId(), account, game, operator, cursor?.also { if (it.length > 128) invalid() }))

    @PostMapping("/{id}/undo-preview")
    fun undoPreview(@PathVariable id: String, @RequestBody body: JsonNode): ResponseEntity<*> {
        fields(body, setOf("account_id", "game"))
        return response(service.undoPreview(helper.requireUserId(), text(body, "account_id"), text(body, "game"), id))
    }

    @PostMapping("/{id}/undo")
    fun undo(@PathVariable id: String, @RequestBody body: JsonNode): ResponseEntity<*> {
        fields(body, setOf("account_id", "game", "preview_token"))
        return response(
            service.undo(
                helper.requireUserId(),
                id,
                OperatorResetUndoRequest(text(body, "account_id"), text(body, "game"), text(body, "preview_token")),
            ),
        )
    }

    private fun fields(body: JsonNode, allowed: Set<String>) {
        if (!body.isObject || body.fieldNames().asSequence().any { it !in allowed }) invalid()
    }
    private fun text(body: JsonNode, name: String): String =
        body.path(name).takeIf { it.isTextual && it.textValue().length in 1..128 }?.textValue() ?: invalid()
    private fun invalid(): Nothing = throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_reset", "重置参数无效，请核对后重试")
    private fun <T : Any> response(value: T) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
