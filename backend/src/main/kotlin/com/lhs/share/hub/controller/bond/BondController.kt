package com.lhs.share.hub.controller.bond

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.bond.request.BondRequests
import com.lhs.share.hub.service.bond.BondCatalogService
import com.lhs.share.hub.service.bond.BondRules
import com.lhs.share.hub.service.bond.BondService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Bond Archive")
@RestController
@RequestMapping("/v1/bonds", produces = [MediaType.APPLICATION_JSON_VALUE])
class BondController(
    private val service: BondService,
    private val catalog: BondCatalogService,
    private val helper: AuthenticationHelper,
    private val mapper: ObjectMapper,
) {
    @RequireJwt
    @GetMapping("/catalog")
    fun catalog(@RequestParam game: String) = result(catalog.catalog(game))

    @RequireJwt
    @GetMapping("/archive")
    fun archive(@RequestParam(name = "account_id") accountId: String) = result(service.archive(user(), accountId))

    @RequireJwt
    @PatchMapping("/records/{id}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable id: String, @RequestBody bytes: ByteArray) = write(bytes, id)

    @RequireJwt
    @PostMapping("/batch", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun batch(@RequestBody bytes: ByteArray) = write(bytes)

    private fun write(bytes: ByteArray, id: String? = null) = BondRequests.write(body(bytes), id).let {
        result(service.update(user(), it.accountId, it.expectedRevision, it.catalogVersion, it.records))
    }

    @RequireJwt
    @GetMapping("/export")
    fun export(@RequestParam(name = "account_id") accountId: String) = result(service.export(user(), accountId))

    @RequireJwt
    @PostMapping("/import/preview", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun preview(@RequestBody bytes: ByteArray) = result(service.preview(user(), BondRequests.exchange(body(bytes), false)))

    @RequireJwt
    @PostMapping("/import/confirm", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun confirm(@RequestBody bytes: ByteArray) = result(service.confirm(user(), BondRequests.exchange(body(bytes), true)))

    private fun body(bytes: ByteArray) = readBondBody(bytes, mapper, BondRules.LEGACY_BYTES + 4096)
    private fun user() = helper.obtainUserId() ?: throw InventoryApiException(HttpStatus.UNAUTHORIZED, "bond_unauthorized", "请先登录")
    private fun result(value: Any) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}

internal fun readBondBody(bytes: ByteArray, mapper: ObjectMapper, maxBytes: Int): com.fasterxml.jackson.databind.JsonNode {
    if (bytes.size > maxBytes) throw InventoryApiException(HttpStatus.PAYLOAD_TOO_LARGE, "bond_request_too_large", "羁绊请求超过大小限制")
    return try {
        mapper.reader().with(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(bytes) ?: BondRules.invalid("JSON 不能为空")
    } catch (_: JsonProcessingException) {
        throw InventoryApiException(HttpStatus.BAD_REQUEST, "invalid_json", "JSON 损坏或包含重复字段")
    }
}
