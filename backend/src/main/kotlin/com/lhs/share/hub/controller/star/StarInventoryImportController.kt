package com.lhs.share.hub.controller.star

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.star.request.StarInventorySyncRequest
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.star.StarInventoryImportScope
import com.lhs.share.hub.service.star.StarInventorySyncService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/** Web imports use the signed-in user's account ownership, never a MaaYuan connection code. */
@RestController
@RequestMapping("/v1/star/inventory-sync")
class StarInventoryImportController(private val syncs: StarInventorySyncService, private val helper: AuthenticationHelper) {
    @RequireJwt
    @PostMapping("/preview")
    fun preview(@RequestParam(name = "account_id") accountId: String, @RequestBody body: JsonNode) =
        parse(body, false).let { (request, scope) ->
            success(syncs.previewImport(userId(), accountId, request, scope))
        }

    @RequireJwt
    @PostMapping
    fun confirm(@RequestParam(name = "account_id") accountId: String, @RequestBody body: JsonNode) =
        parse(body, true).let { (request, scope) ->
            success(syncs.importInventory(userId(), accountId, request, scope))
        }

    // Inventory advice maps generic exceptions to 500. Keep missing-login errors
    // in the domain response instead of letting ResponseStatusException be masked.
    private fun userId(): String = helper.obtainUserId()
        ?: throw InventoryApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "请先登录后补传识别结果")

    private fun parse(body: JsonNode, confirm: Boolean): Pair<StarInventorySyncRequest, StarInventoryImportScope> {
        val fields =
            setOf("document", "game", "source_format") + if (confirm) setOf("expected_generation", "expected_revision") else emptySet()
        fun invalid(): Nothing = throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "star_sync_invalid", "导入请求字段或预览版本无效，请重新选择文件")
        if (!body.isObject || body.fieldNames().asSequence().toSet() != fields || !body.path("game").isTextual ||
            !body.path("source_format").isTextual || body.path("source_format").textValue() !in setOf("local-ocr", "compact")
        ) {
            invalid()
        }
        fun version(name: String): Long? {
            if (!confirm) return null
            val value = body.path(name)
            if (!value.isIntegralNumber || !value.canConvertToLong() || value.longValue() < 0) invalid()
            return value.longValue()
        }
        return StarInventorySyncRequest.fromWire(body.path("document")) to StarInventoryImportScope(
            body.path("game").textValue(),
            version("expected_generation"),
            version("expected_revision"),
            body.path("source_format").textValue() == "local-ocr",
        )
    }
}
